@echo off
chcp 65001 >nul
cd /d "%~dp0"
set "PS1=%CD%\fix-excel-doubleclick.ps1"
powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ^
  "Start-Process powershell.exe -Verb RunAs -Wait -ArgumentList '-NoProfile','-ExecutionPolicy','Bypass','-File','%PS1%'"
echo.
pause
