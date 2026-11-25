@echo off
cd /d "%~dp0"
where node >nul 2>&1 || (echo Node.js 24 or newer required. & pause & exit /b 1)
call npm ci || (pause & exit /b 1)
call npm run build || (pause & exit /b 1)
start "" "http://127.0.0.1:4189/"
call npm start
pause
