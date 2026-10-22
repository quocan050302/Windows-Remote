@echo off
title Test IO Agent Studio (Development Mode)
cd /d "%~dp0"

echo ========================================================
echo   Starting Test IO Agent Studio (Development Mode)
echo ========================================================
echo.

:: 1. Start Demo Testing Lab on Port 4173
echo [1/3] Starting Demo Testing Lab on http://127.0.0.1:4173 ...
start "Demo Testing Lab Server" /min node apps/demo-testing-lab/server.js

:: 2. Start Desktop Backend API on Port 3001
echo [2/3] Starting Desktop Backend API on http://127.0.0.1:3001 ...
start "Test IO Backend API Server" /min npx tsx apps/desktop/src/main/local_server.ts

:: 3. Start Vite Frontend on Port 3000
echo [3/3] Starting Vite Frontend on http://localhost:3000 ...
start "Desktop Studio Dev UI" /min cmd /c "pnpm --filter @test-io-agent/desktop run dev"

timeout /t 3 /nobreak >nul

echo Opening Studio in browser...
start http://localhost:3000

echo.
echo ========================================================
echo   Test IO Agent Studio Development Stack Active!
echo   - Web Browser UI: http://localhost:3000 (Opened in browser)
echo   - Backend API: http://127.0.0.1:3001
echo   - Target Lab: http://127.0.0.1:4173
echo ========================================================
timeout /t 4 >nul
exit
