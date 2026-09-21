@echo off
setlocal
title Observer - Development
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found in PATH.
    echo Install Node.js and run this file again.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [OBSERVER] Installing dependencies...
    call npm install --no-package-lock
    if errorlevel 1 (
        echo [ERROR] npm install failed.
        pause
        exit /b 1
    )
)

echo [OBSERVER] Starting local development environment...
echo [OBSERVER] Control Room: http://localhost:5173
echo [OBSERVER] API/GSI:      http://localhost:3194
echo.
call npm run dev
