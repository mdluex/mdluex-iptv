<#
  Build the LG webOS package (.ipk) from the shared app.
  Needs Python and ffmpeg (no LG tools needed to build).
  Output: dist\com.mdluex.iptv_<version>_all.ipk
  Install on an LG TV: see tools\install_webos.ps1
#>
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$out = Join-Path $root 'dist'
$stage = Join-Path $root 'build\webos\com.mdluex.iptv'
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage, $out | Out-Null

# shared app (everything except Samsung-only files)
Copy-Item (Join-Path $root 'app\*') $stage -Recurse -Exclude 'config.xml', '.buildResult', '.sign', '*.wgt'
Copy-Item (Join-Path $root 'platforms\webos\appinfo.json') $stage
# LG-only: drop the Samsung script, write CSS variables out for older LG engines
python -I (Join-Path $PSScriptRoot 'webos_prepare.py') $stage
# the version follows the shared app
$version = ([xml](Get-Content (Join-Path $root 'app\config.xml') -Raw)).widget.version
$info = Get-Content (Join-Path $stage 'appinfo.json') -Raw | ConvertFrom-Json
$info.version = $version
$info | ConvertTo-Json | Set-Content -Encoding ascii (Join-Path $stage 'appinfo.json')

# icons from the app icon
$icon = Join-Path $root 'app\icon-v2.png'
ffmpeg -hide_banner -loglevel error -y -i $icon -vf scale=80:80 (Join-Path $stage 'webos-icon.png')
ffmpeg -hide_banner -loglevel error -y -i $icon -vf scale=130:130 (Join-Path $stage 'webos-largeIcon.png')
ffmpeg -hide_banner -loglevel error -y -f lavfi -i color=c=0x0a0a0c:s=1920x1080 -i $icon -filter_complex "[1]scale=360:360[l];[0][l]overlay=(W-w)/2:(H-h)/2" -frames:v 1 (Join-Path $stage 'webos-bg.png')

# pack the .ipk with our own packer (same layout as LG's ares-package)
python -I (Join-Path $PSScriptRoot 'pack_ipk.py') $stage $out
