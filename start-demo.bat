@echo off
setlocal
cd /d "%~dp0"
if "%PORT%"=="" set "PORT=8787"
if "%LM_STUDIO_URL%"=="" set "LM_STUDIO_URL=http://127.0.0.1:1234"
echo.
echo ECHO LM Studio Demo
echo Interface: http://127.0.0.1:%PORT%
echo LM Studio: %LM_STUDIO_URL%
echo.
node server.js
pause
