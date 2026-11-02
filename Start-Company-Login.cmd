@echo off
setlocal
title BTW Visa Operations - Company Login
cd /d "%~dp0"
where node >nul 2>&1
if errorlevel 1 (
  echo Install Node.js 24 or later, then reopen this launcher.
  pause
  exit /b 1
)
echo Company login: http://127.0.0.1:3000
echo Keep this window open while using the app.
echo If port 3000 is busy, stop the previous local server with Ctrl+C first.
node server/server.mjs
pause
