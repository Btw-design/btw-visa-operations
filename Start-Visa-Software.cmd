@echo off
setlocal
title BTW Visa Operations - Singapore Form Assistant
cd /d "%~dp0"

if not exist "%~dp0dist\index.html" (
  echo App files were not found. Keep this launcher inside your VISA OPS SOFTWARE folder.
  pause
  exit /b 1
)

where node >nul 2>&1
if errorlevel 1 (
  echo Node.js was not found. Install Node.js, then reopen this launcher.
  pause
  exit /b 1
)

where npx.cmd >nul 2>&1
if errorlevel 1 (
  echo npx was not found. Repair your Node.js installation with npm selected.
  pause
  exit /b 1
)

rem Reuse an already running copy of this app.
powershell.exe -NoProfile -NonInteractive -Command "try { $r = Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:3000/index.html' -TimeoutSec 3; if ($r.Content -like '*<title>Singapore Form Assistant*') { Start-Process 'http://127.0.0.1:3000'; exit 0 } } catch {}; exit 1" >nul 2>&1
if not errorlevel 1 exit /b 0

echo Starting BTW Singapore Form Assistant...
echo The browser will open when the server is ready.
echo Keep this window open while using the app.
echo Press Ctrl+C here to stop the server.
echo The first launch may need internet to download the local server tool.
echo.

call npx.cmd --yes http-server@14.1.1 "%~dp0dist" -a 127.0.0.1 -p 3000 -c-1 -o

echo.
echo The server has stopped. If port 3000 is already in use, close the previous server window and try again.
pause
