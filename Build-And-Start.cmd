@echo off
setlocal
title Observer
cd /d "%~dp0"

where node >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Node.js was not found in PATH.
    pause
    exit /b 1
)

if not exist "node_modules\" (
    echo [OBSERVER] Installing dependencies...
    call npm install --no-package-lock
    if errorlevel 1 exit /b 1
)

echo [OBSERVER] Building web client...
call npm run build
if errorlevel 1 (
    echo [ERROR] Build failed.
    pause
    exit /b 1
)

echo [OBSERVER] Starting on http://localhost:3194
call npm start
