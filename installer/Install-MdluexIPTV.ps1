<#
  Mdluex IPTV - one-click installer for Samsung Smart TVs (Tizen, 2017 and newer)
  by Mahmoud Salah / Mdluex Industries - https://github.com/mdluex/mdluex-iptv

  What it does:
    1. Finds your Samsung TV on the network
    2. Installs Samsung's free Tizen tools if they are missing (official download from tizen.org)
    3. Helps you create your Samsung signing certificate (you sign in with YOUR Samsung account)
    4. Signs Mdluex IPTV for YOUR TV, installs it and opens it

  Before running: on the TV open Apps, press 1 2 3 4 5 on the remote, switch Developer Mode ON,
  type this PC's IP address, then restart the TV.

  Optional parameters (for advanced users):
    -TvIp 192.168.1.20      skip the network search
    -CertProfile Name       use an existing certificate profile
    -TizenHome C:\tizen-studio
#>
param(
  [string]$TvIp = '',
  [string]$CertProfile = '',
  [string]$TizenHome = 'C:\tizen-studio',
  [switch]$Unattended          # no "press Enter" pauses (for testing / scripts)
)
$ErrorActionPreference = 'Stop'
try { $Host.UI.RawUI.WindowTitle = 'Mdluex IPTV Installer' } catch {}
$here   = Split-Path -Parent $MyInvocation.MyCommand.Path
$appSrc = Join-Path $here 'app'
$appId  = 'MdlxIPTV01.MdluexIPTV'
$pkgId  = 'MdlxIPTV01'
$tizen  = Join-Path $TizenHome 'tools\ide\bin\tizen.bat'
$sdb    = Join-Path $TizenHome 'tools\sdb.exe'
$pm     = Join-Path $TizenHome 'package-manager\package-manager-cli.exe'

function Say($t, $c = 'Gray') { Write-Host $t -ForegroundColor $c }
function Step($n, $t) { Write-Host ''; Write-Host "[$n/6] $t" -ForegroundColor Cyan }
function Pause-Here($t) { if (-not $Unattended) { Read-Host $t | Out-Null } }
function Fail($t) { Write-Host ''; Write-Host "X  $t" -ForegroundColor Red; Write-Host ''; Pause-Here 'Press Enter to close'; exit 1 }
function Ask($q) { (Read-Host "$q [Y/n]") -notmatch '^(n|no)$' }

if (-not $Unattended) { Clear-Host }
Say '==============================================' Red
Say '          Mdluex IPTV  -  TV installer' White
Say '==============================================' Red
if (-not (Test-Path (Join-Path $appSrc 'config.xml'))) { Fail "The 'app' folder is missing. Extract the whole zip first, then run the installer from it." }
$version = ([xml](Get-Content (Join-Path $appSrc 'config.xml') -Raw)).widget.version
Say "Version $version"

# ---------------------------------------------------------------- 1. TV
Step 1 'Looking for your Samsung TV...'
$myIps = @(Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.IPAddress -notmatch '^(127|169\.254)\.' } | Select-Object -ExpandProperty IPAddress)
function Get-TvInfo($ip) {
  try { (Invoke-RestMethod -TimeoutSec 2 "http://${ip}:8001/api/v2/").device } catch { $null }
}
$tvs = @()
if ($TvIp) { $d = Get-TvInfo $TvIp; if ($d) { $tvs += [pscustomobject]@{ Ip = $TvIp; Info = $d } } }
else {
  foreach ($ip in $myIps) {
    $prefix = ($ip -split '\.')[0..2] -join '.'
    $pings = 1..254 | ForEach-Object { $t = "$prefix.$_"; [pscustomobject]@{ Ip = $t; Task = (New-Object Net.Sockets.TcpClient).ConnectAsync($t, 8001) } }
    Start-Sleep -Milliseconds 1500
    foreach ($p in $pings) {
      if ($p.Task.Status -eq 'RanToCompletion') { $d = Get-TvInfo $p.Ip; if ($d -and $d.OS -eq 'Tizen') { $tvs += [pscustomobject]@{ Ip = $p.Ip; Info = $d } } }
    }
  }
}
$tvs = @($tvs | Sort-Object Ip -Unique)
if (-not $tvs.Count) { Fail 'No Samsung TV found. Make sure the TV is ON and on the same network as this PC (or run with -TvIp <address>).' }
$tv = $tvs[0]
if ($tvs.Count -gt 1) {
  for ($i = 0; $i -lt $tvs.Count; $i++) { Say ("  {0}) {1}  ({2})" -f ($i + 1), $tvs[$i].Info.name, $tvs[$i].Ip) White }
  $tv = $tvs[[int](Read-Host 'Which TV? (number)') - 1]
}
$tvIp = $tv.Ip
Say ("Found: {0} ({1}) at {2}" -f $tv.Info.name, $tv.Info.modelName, $tvIp) Green
if ($tv.Info.developerMode -ne '1') {
  Fail ("Developer Mode is OFF on the TV.`n   On the TV: Apps -> press 1 2 3 4 5 -> Developer Mode ON -> Host PC IP = " + ($myIps -join ' or ') + "`n   Then restart the TV (hold the power button) and run this installer again.")
}
if ($myIps -notcontains $tv.Info.developerIP) {
  Fail ("The TV trusts the PC at " + $tv.Info.developerIP + ", but this PC is " + ($myIps -join ' / ') + ".`n   On the TV: Apps -> 1 2 3 4 5 -> change Host PC IP to " + $myIps[0] + " -> restart the TV, then run this again.")
}
Say 'Developer Mode is ON and trusts this PC.' Green

# ---------------------------------------------------------------- 2. Tizen tools
Step 2 "Checking Samsung's Tizen tools..."
$certMgr = Join-Path $TizenHome 'tools\certificate-manager'
if (-not (Test-Path $tizen) -or -not (Test-Path $sdb) -or -not (Test-Path (Join-Path $certMgr 'plugins'))) {
  Say 'Samsung Tizen Studio (command-line tools) is needed - a free, official download (~300 MB, plus ~400 MB of TV add-ons).'
  Say 'By installing you accept the Tizen SDK and Samsung SDK license agreements.' Yellow
  if (-not (Ask 'Download and install it now?')) { Fail 'Tizen tools are required to install apps on Samsung TVs.' }
  $dl = Join-Path $env:TEMP 'mdluex-tizen'; New-Item -ItemType Directory -Force $dl | Out-Null
  $base = 'https://download.tizen.org/sdk/Installer/'
  $ver = ((Invoke-WebRequest -UseBasicParsing $base).Links.href | Where-Object { $_ -match '^tizen-studio_[\d.]+/$' } |
    Sort-Object { [version](($_ -replace 'tizen-studio_', '' -replace '/', '')) } | Select-Object -Last 1)
  $file = ((Invoke-WebRequest -UseBasicParsing ($base + $ver)).Links.href | Where-Object { $_ -match '^web-cli_.*windows-64\.exe$' } | Select-Object -First 1)
  $exe = Join-Path $dl $file
  Say "Downloading $file ..."
  $ProgressPreference = 'SilentlyContinue'
  Invoke-WebRequest -UseBasicParsing ($base + $ver + $file) -OutFile $exe
  $sig = Get-AuthenticodeSignature $exe
  if ($sig.Status -ne 'Valid' -or $sig.SignerCertificate.Subject -notmatch 'Samsung Electronics') { Fail 'The downloaded installer is not signed by Samsung - stopping for safety.' }
  Say 'Installer verified (signed by Samsung Electronics). Windows will ask for permission - click Yes.' Green
  Start-Process -FilePath $exe -ArgumentList '--accept-license', $TizenHome -Verb RunAs -Wait
  if (-not (Test-Path $pm)) { Fail 'Tizen Studio did not install.' }
  Say 'Adding the Samsung TV certificate tools (Windows will ask again - click Yes)...'
  $log = Join-Path $env:TEMP 'mdluex-tizen-pm.log'
  $cmd = "`"$pm`" install --accept-license cert-add-on Certificate-Manager TV-SAMSUNG-Extension-Tools TV-SAMSUNG-Extension-Resources > `"$log`" 2>&1"
  Start-Process cmd -ArgumentList '/c', $cmd -Verb RunAs -Wait -WindowStyle Hidden
  if (-not (Test-Path (Join-Path $certMgr 'plugins'))) { Fail "Samsung certificate tools did not install. See $log" }
}
Say 'Tizen tools are ready.' Green

# ---------------------------------------------------------------- 3. connect
Step 3 'Connecting to the TV...'
& $sdb connect "${tvIp}:26101" | Out-Null
$devLine = (& $sdb devices) | Where-Object { $_ -match [regex]::Escape($tvIp) } | Select-Object -First 1
if (-not $devLine) { Fail 'The TV refused the connection. Restart the TV (hold power) with Developer Mode ON, then try again.' }
$duid = ((& $sdb -s "${tvIp}:26101" shell 0 getduid) | Where-Object { $_ -match '^\s*[A-Z0-9]{10,}\s*$' } | Select-Object -First 1)
$duid = if ($duid) { $duid.Trim() } else { '' }
Say "Connected. TV device ID (DUID): $duid" Green

# ---------------------------------------------------------------- 4. certificate
Step 4 'Checking your Samsung signing certificate...'
function Get-Profiles {
  $out = & $tizen security-profiles list 2>$null
  @($out | Where-Object { $_ -match '^\S+\s+[O\-X ]' -and $_ -notmatch '^\[|Loaded in' } | ForEach-Object { ($_ -split '\s+')[0] } | Where-Object { $_ })
}
function Test-ProfileHasDuid($name) {
  $xml = Join-Path ($env:SystemDrive + '\tizen-studio-data\profile') 'profiles.xml'
  if (-not (Test-Path $xml)) { return $false }
  $p = ([xml](Get-Content $xml -Raw)).profiles.profile | Where-Object { $_.name -eq $name }
  if (-not $p) { return $false }
  foreach ($item in $p.profileitem) {
    if ($item.distributor -eq '1' -and $item.key) {
      $dp = Join-Path (Split-Path $item.key) 'device-profile.xml'
      if ((Test-Path $dp) -and (Select-String -Path $dp -Pattern $duid -Quiet)) { return $true }
    }
  }
  return $false
}
$profiles = Get-Profiles
if (-not $CertProfile) {
  $CertProfile = $profiles | Where-Object { $duid -and (Test-ProfileHasDuid $_) } | Select-Object -First 1
}
if (-not $CertProfile) {
  Say 'You need a free Samsung certificate for this TV (one time only).' Yellow
  Say 'The Samsung Certificate Manager will open. In it:' White
  Say '   1. Click the + button'
  Say '   2. Choose  Samsung  then  TV  -> Next'
  Say '   3. Profile name:  MdluexIPTV  -> Next'
  Say '   4. Create a new author certificate: any name + a password you choose -> Next'
  Say '   5. Sign in with your Samsung account when the page appears'
  Say "   6. Create a new distributor certificate - Privilege: Public - make sure the DUID list shows $duid"
  Say '   7. Finish, then close the Certificate Manager'
  Read-Host 'Press Enter to open the Certificate Manager'
  # the normal launcher can fail silently on some PCs; start it through Tizen's bundled Java instead
  $jar = Get-ChildItem (Join-Path $certMgr 'plugins') -Filter 'org.eclipse.equinox.launcher_*.jar' | Select-Object -First 1
  $java = Join-Path $TizenHome 'jdk\bin\javaw.exe'
  if ($jar -and (Test-Path $java)) { Start-Process $java -ArgumentList '-jar', "`"$($jar.FullName)`"", '-nl', 'en' -WorkingDirectory $certMgr }
  else { Start-Process (Join-Path $certMgr 'certificate-manager.exe') -WorkingDirectory $certMgr }
  Read-Host 'When the certificate profile is created, press Enter here'
  $CertProfile = Get-Profiles | Where-Object { $duid -and (Test-ProfileHasDuid $_) } | Select-Object -First 1
  if (-not $CertProfile) { Fail "No certificate profile includes this TV ($duid). Open the Certificate Manager again and create a Samsung TV profile with this DUID." }
}
& $tizen security-profiles set-active -n $CertProfile 2>$null | Out-Null
Say "Using certificate profile: $CertProfile" Green

# ---------------------------------------------------------------- 5. build + sign
Step 5 'Signing Mdluex IPTV for your TV...'
$work = Join-Path $env:TEMP ('mdluex-iptv-' + [guid]::NewGuid().ToString('N').Substring(0, 8))
Copy-Item $appSrc $work -Recurse
& $tizen build-web -- "$work" | Out-Null
$build = Join-Path $work '.buildResult'
& $tizen package -t wgt -s $CertProfile -- "$build" | Out-Null
$wgt = Get-ChildItem $build -Filter *.wgt | Select-Object -First 1
if (-not $wgt) { Fail 'Signing failed. If the certificate password changed, open the Certificate Manager and re-enter it.' }
Say 'Signed.' Green

# ---------------------------------------------------------------- 6. install
Step 6 'Installing on the TV...'
$tmp = Join-Path $env:TEMP 'mdluex.wgt'
Copy-Item $wgt.FullName $tmp -Force
$remote = '/home/owner/share/tmp/sdk_tools/tmp/mdluex.wgt'
& $sdb -s "${tvIp}:26101" push $tmp $remote | Out-Null
function Install-OnTv { (& $sdb -s "${tvIp}:26101" shell 0 vd_appinstall $pkgId $remote) -join "`n" }
$res = Install-OnTv
if ($res -notmatch 'install completed' -and $res -match '118') {
  # 118012: some TVs (often Tizen 4/5) first need permission to install apps signed with this certificate
  # (Tizen Studio's "Permit to install applications"). Give it, then try again.
  Say 'The TV needs permission for your certificate first. Giving it...' Yellow
  & $tizen install-permit -s "${tvIp}:26101" 2>&1 | Out-Null
  & $sdb -s "${tvIp}:26101" push $tmp $remote | Out-Null
  $res = Install-OnTv
}
if ($res -notmatch 'install completed' -and $res -match '118') {
  # an older copy signed by a different certificate can't be replaced: remove it, then install fresh
  $old = (& $sdb -s "${tvIp}:26101" shell 0 vd_applist 2>$null) -join "`n"
  if ($old -match $pkgId) {
    Say 'Removing an older copy of Mdluex IPTV that was signed differently...' Yellow
    & $sdb -s "${tvIp}:26101" shell 0 vd_appuninstall $pkgId 2>&1 | Out-Null
    & $sdb -s "${tvIp}:26101" push $tmp $remote | Out-Null
    $res = Install-OnTv
  }
}
if ($res -notmatch 'install completed') {
  Say $res
  if ($res -match '118') {
    Fail ("The TV refused the app's signature (error 118012). Check that the certificate profile '$CertProfile' is a Samsung TV certificate " +
          "(privilege level Public) made for this TV's DUID $duid. If it was made before for another TV, create a new one in the Certificate Manager and run this again.")
  }
  Fail 'The TV refused the install (see the message above).'
}
& $sdb -s "${tvIp}:26101" shell 0 was_execute $appId | Out-Null
Remove-Item $work -Recurse -Force -ErrorAction SilentlyContinue

Write-Host ''
Say '==============================================' Green
Say "  Mdluex IPTV $version is installed and open on your TV!" White
Say '  You will find it in the TV''s Apps list.' White
Say '==============================================' Green
Say 'To update later: download the new release and run this installer again.'
Pause-Here 'Press Enter to close'
