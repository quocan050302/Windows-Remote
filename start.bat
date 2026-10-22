@echo off
title Test IO Agent Studio Launcher
cd /d "%~dp0"

echo ========================================================
echo   Starting Test IO Agent Studio System...
echo ========================================================
echo.

:: 1. Start Demo Testing Lab in the background
echo [1/2] Starting Demo Testing Lab on http://127.0.0.1:4173 ...
start "Demo Testing Lab Server" /min node apps/demo-testing-lab/server.js

:: 2. Short pause to ensure server is bound
timeout /t 1 /nobreak >nul

:: 3. Launch Desktop Studio Application
echo [2/2] Launching Test IO Agent Studio Desktop App...
if exist "apps\desktop\release\win-unpacked\Test IO Agent Studio.exe" (
    start "" "apps\desktop\release\win-unpacked\Test IO Agent Studio.exe"
) else (
    start "Desktop Studio Dev Server" cmd /c "pnpm dev:desktop"
)

echo.
echo ========================================================
echo   System launched successfully!
echo   - Target Lab: http://127.0.0.1:4173
echo   - Desktop Studio: Active
echo ========================================================
timeout /t 3 >nul
exit
