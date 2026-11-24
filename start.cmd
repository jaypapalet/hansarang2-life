@echo off
cd /d "%~dp0"
where node >nul 2>&1 || (echo Node.js 22 or newer required. & pause & exit /b 1)
node build.mjs || (pause & exit /b 1)
start "" "http://127.0.0.1:4189/"
node local.mjs
pause
