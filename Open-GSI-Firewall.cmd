@echo off
setlocal
title Observer - Open GSI Firewall Port

net session >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Administrator rights are required.
    echo Right-click this file and choose "Run as administrator".
    pause
    exit /b 1
)

echo [OBSERVER] Opening inbound TCP port 3194...
netsh advfirewall firewall delete rule name="Observer GSI 3194" >nul 2>&1
netsh advfirewall firewall add rule name="Observer GSI 3194" dir=in action=allow protocol=TCP localport=3194 profile=any

if errorlevel 1 (
    echo [ERROR] Could not create firewall rule.
    pause
    exit /b 1
)

echo.
echo [OK] TCP port 3194 is open for Observer GSI.
pause
