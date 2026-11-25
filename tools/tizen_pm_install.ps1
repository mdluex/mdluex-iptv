# Elevated helper: install Samsung certificate + TV extension packages (licenses accepted by the user).
$log = Join-Path $env:TEMP 'tizen_pm_install.log'
$pm = 'C:\tizen-studio\package-manager\package-manager-cli.exe'
cmd /c "`"$pm`" install --accept-license cert-add-on Certificate-Manager TV-SAMSUNG-Extension-Tools TV-SAMSUNG-Extension-Resources > `"$log`" 2>&1"
"EXIT:$LASTEXITCODE" | Out-File $log -Append -Encoding ascii
