@echo off
title Test IO Agent Studio Launcher
cd /d "%~dp0"

echo ========================================================
echo   Starting Test IO Agent Studio System...
echo ========================================================
echo.

:: 1. Start Demo Testing Lab on Port 4173
echo [1/3] Starting Demo Testing Lab on http://127.0.0.1:4173 ...
start "Demo Testing Lab Server" /min node apps/demo-testing-lab/server.js

:: 2. Start Desktop Backend API on Port 3001
echo [2/3] Starting Local Backend API on http://127.0.0.1:3001 ...
start "Test IO Backend API Server" /min npx tsx apps/desktop/src/main/local_server.ts

:: 3. Launch Desktop Studio Application
echo [3/3] Launching Test IO Agent Studio Desktop App...
if exist "apps\desktop\release\win-unpacked\Test IO Agent Studio.exe" (
    start "" "apps\desktop\release\win-unpacked\Test IO Agent Studio.exe"
) else (
    echo Building main process & starting development launcher...
    call npx tsc -p apps/desktop/tsconfig.main.json
    start "Desktop Studio Dev UI" cmd /c "npm --workspace apps/desktop run dev"
    timeout /t 3 /nobreak >nul
    set NODE_ENV=development
    set VITE_DEV_SERVER_URL=http://localhost:3000
    start "Test IO Agent Studio Electron" cmd /c "npx electron apps/desktop"
)

echo.
echo ========================================================
echo   System launched successfully!
echo   - Desktop Studio: Active
echo   - Web Fallback: http://localhost:3000
echo   - Target Lab: http://127.0.0.1:4173
echo ========================================================
timeout /t 3 >nul
exit
