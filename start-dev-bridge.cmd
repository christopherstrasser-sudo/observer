@echo off
setlocal
title Observer Dev Bridge

cd /d "%~dp0"

powershell.exe -NoLogo -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev-bridge\observer-dev-bridge.ps1"
set "EXIT_CODE=%ERRORLEVEL%"

echo.
if not "%EXIT_CODE%"=="0" (
    echo Observer Dev Bridge exited with code %EXIT_CODE%.
    pause
)

exit /b %EXIT_CODE%
