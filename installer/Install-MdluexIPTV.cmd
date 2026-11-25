@echo off
rem Mdluex IPTV - double-click this file to install the app on your Samsung TV.
cd /d "%~dp0"
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0Install-MdluexIPTV.ps1" %*
