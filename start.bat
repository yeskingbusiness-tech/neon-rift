@echo off
title NEON RIFT BLACKOUT server
cd /d "%~dp0"
where node >nul 2>nul
if errorlevel 1 (
  echo Node.js is not installed. Get it free at https://nodejs.org then run this again.
  pause
  exit /b 1
)
if not exist node_modules (
  echo Installing dependencies...
  call npm install --no-audit --no-fund
)
echo.
echo  Server starting — open  http://localhost:8000  in your browser.
echo  Friends on your network join via  http://YOUR-IP:8000
echo  (find your IP with:  ipconfig)
echo.
start http://localhost:8000
node server.js
pause
