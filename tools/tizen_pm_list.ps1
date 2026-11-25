# Elevated helper: list Tizen extension repositories and packages into a log.
$log = Join-Path $env:TEMP 'tizen_pm_list.log'
cmd /c "`"C:\tizen-studio\package-manager\package-manager-cli.exe`" extra --list > `"$log`" 2>&1"
cmd /c "`"C:\tizen-studio\package-manager\package-manager-cli.exe`" show-pkgs >> `"$log`" 2>&1"
