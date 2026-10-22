@echo off
title Test IO Agent Studio (Development Mode)
cd /d "%~dp0"

echo ========================================================
echo   Starting Test IO Agent Studio (Development Mode)
echo ========================================================
echo.

:: 1. Compile Electron main process
echo [1/4] Compiling Electron main process...
call npx tsc -p apps/desktop/tsconfig.main.json

:: 2. Start Demo Testing Lab on Port 4173
echo [2/4] Starting Demo Testing Lab on http://127.0.0.1:4173 ...
start "Demo Testing Lab Server" /min node apps/demo-testing-lab/server.js

:: 3. Start Desktop Backend API on Port 3001
echo [3/4] Starting Desktop Backend API on http://127.0.0.1:3001 ...
start "Test IO Backend API Server" /min npx tsx apps/desktop/src/main/local_server.ts

:: 4. Start Vite Frontend on Port 3000
echo [4/4] Starting Vite Frontend on http://localhost:3000 ...
start "Desktop Studio Dev UI" cmd /c "npm --workspace apps/desktop run dev"

timeout /t 3 /nobreak >nul

:: 5. Launch Electron Desktop Runtime
echo Launching Electron desktop window...
set NODE_ENV=development
set VITE_DEV_SERVER_URL=http://localhost:3000
start "Test IO Agent Studio Electron" cmd /c "npx electron apps/desktop"

echo.
echo ========================================================
echo   Test IO Agent Studio Development Stack Active!
echo   - Electron Desktop App: Active
echo   - Web Browser Fallback: http://localhost:3000
echo   - Backend API: http://127.0.0.1:3001
echo   - Target Lab: http://127.0.0.1:4173
echo ========================================================
timeout /t 3 >nul
exit
