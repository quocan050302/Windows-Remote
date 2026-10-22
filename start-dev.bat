@echo off
title Test IO Agent Studio (Dev Mode)
cd /d "%~dp0"

echo ========================================================
echo   Starting in Live Development Mode (Vite + Node)
echo ========================================================
echo.

:: Start Demo Lab
start "Demo Testing Lab Server" cmd /c "node apps/demo-testing-lab/server.js"

:: Start Desktop Studio Vite Dev Server
start "Desktop Studio UI" cmd /c "pnpm dev:desktop"

timeout /t 2 >nul
start http://localhost:3000
start http://127.0.0.1:4173

exit
