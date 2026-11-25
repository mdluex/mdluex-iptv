<#
  Build, sign and install Mdluex IPTV on the Samsung TV.

  Needs (one-time setup, see README.md):
    - Tizen Studio with "Samsung Certificate Extension" + "TV Extensions"
    - A Samsung certificate profile (default name: MdluexTV) that includes this TV's DUID
    - TV in Developer Mode with this PC's IP

  Run:  powershell -ExecutionPolicy Bypass -File tools\install.ps1
#>
param(
  [string]$TvIp = '192.168.1.6',
  [string]$CertProfile = 'MdluexTV',
  [string]$TizenHome = 'C:\tizen-studio'
)
$ErrorActionPreference = 'Stop'
$root  = Split-Path -Parent $PSScriptRoot
$app   = Join-Path $root 'app'
$tizen = Join-Path $TizenHome 'tools\ide\bin\tizen.bat'
$sdb   = Join-Path $TizenHome 'tools\sdb.exe'
$appId = 'MdlxIPTV01.MdluexIPTV'

if (-not (Test-Path $tizen) -or -not (Test-Path $sdb)) {
  Write-Host "Tizen Studio not found at $TizenHome. Install it first (see README.md), or pass -TizenHome <path>." -ForegroundColor Red
  exit 1
}

Write-Host "1/5 Connecting to the TV at $TvIp ..." -ForegroundColor Cyan
& $sdb connect "${TvIp}:26101" | Out-Host
$line = (& $sdb devices) | Where-Object { $_ -match [regex]::Escape($TvIp) } | Select-Object -First 1
if (-not $line) { Write-Host "TV not connected. Check Developer Mode is ON with this PC's IP, then restart the TV." -ForegroundColor Red; exit 1 }
$device = ($line -split '\s+')[-1]
Write-Host "    connected: $device"

Write-Host "2/5 Building ..." -ForegroundColor Cyan
$build = Join-Path $app '.buildResult'
if (Test-Path $build) { Remove-Item -Recurse -Force $build }
& $tizen build-web -e ".*" -e "*.wgt" -- "$app" | Out-Host

Write-Host "3/5 Signing with certificate profile '$CertProfile' ..." -ForegroundColor Cyan
& $tizen package -t wgt -s $CertProfile -- "$build" | Out-Host
$wgt = Get-ChildItem $build -Filter *.wgt | Select-Object -First 1
if (-not $wgt) { Write-Host "Packaging failed. Is the certificate profile '$CertProfile' set up?" -ForegroundColor Red; exit 1 }

Write-Host "4/5 Installing $($wgt.Name) ..." -ForegroundColor Cyan
# Push under a name without spaces and install by package ID (what this TV accepts).
$pkgId = $appId.Split('.')[0]
$tmpWgt = Join-Path $env:TEMP 'mdluex.wgt'
Copy-Item $wgt.FullName $tmpWgt -Force
$remote = '/home/owner/share/tmp/sdk_tools/tmp/mdluex.wgt'
& $sdb -s "${TvIp}:26101" push $tmpWgt $remote | Out-Host
$res = (& $sdb -s "${TvIp}:26101" shell 0 vd_appinstall $pkgId $remote) -join "`n"
if ($res -notmatch 'install completed') {
  Write-Host $res
  Write-Host "Install failed (see the TV's message above)." -ForegroundColor Red
  exit 1
}
Write-Host "    install completed"

Write-Host "5/5 Launching Mdluex IPTV ..." -ForegroundColor Cyan
& $sdb -s "${TvIp}:26101" shell 0 was_execute $appId | Out-Host
Write-Host "Done. Mdluex IPTV is installed and in the TV's Apps list." -ForegroundColor Green
