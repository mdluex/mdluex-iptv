# Build the Android TV app (APK) from the shared TV app in app\.
#   powershell -ExecutionPolicy Bypass -File tools\build_android.ps1
# Needs: Android SDK (ANDROID_HOME or %LOCALAPPDATA%\Android\Sdk) and JDK 17+ (JAVA_HOME).
# Release signing: put keystore.properties (storeFile, storePassword, keyAlias, keyPassword) in
# platforms\android\ - it is git-ignored. Without it you get an unsigned release APK; use -Debug to
# build a debug-signed APK you can install right away.
param([switch]$Debug)
$ErrorActionPreference = 'Stop'
$root = Split-Path $PSScriptRoot -Parent
$proj = Join-Path $root 'platforms\android'
$version = ([xml](Get-Content (Join-Path $root 'app\config.xml'))).widget.version

if (-not $env:JAVA_HOME -and (Test-Path 'C:\Tools\jdk21')) {
    $env:JAVA_HOME = (Get-ChildItem 'C:\Tools\jdk21' -Directory | Select-Object -First 1).FullName
}
if (-not (Test-Path (Join-Path $proj 'local.properties'))) {
    $sdk = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { Join-Path $env:LOCALAPPDATA 'Android\Sdk' }
    Set-Content (Join-Path $proj 'local.properties') ('sdk.dir=' + ($sdk -replace '\\', '/')) -Encoding ascii
}

$task = if ($Debug) { 'assembleDebug' } else { 'assembleRelease' }
# Wait for Gradle itself only: Start-Process -Wait would also wait for the Gradle daemon it leaves running.
$p = Start-Process -FilePath (Join-Path $proj 'gradlew.bat') -ArgumentList $task, '-q' -WorkingDirectory $proj -NoNewWindow -PassThru
$null = $p.Handle   # keeps the exit code readable after the process ends
$p.WaitForExit()
if ($p.ExitCode -ne 0) { throw "Gradle $task failed" }

$kind = if ($Debug) { 'debug' } else { 'release' }
$apk = Get-ChildItem (Join-Path $proj "app\build\outputs\apk\$kind\*.apk") | Select-Object -First 1
$dist = Join-Path $root 'dist'
New-Item -ItemType Directory -Force $dist | Out-Null
$out = Join-Path $dist "MdluexIPTV-v$version-android$(if ($Debug) { '-debug' }).apk"
Copy-Item $apk.FullName $out -Force
Write-Host "Built $out"
