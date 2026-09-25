@echo off
setlocal
cd /d "%~dp0"
set "CLOUDFLARED=%~dp0cloudflared.exe"
if exist "%CLOUDFLARED%" goto run_tunnel
where cloudflared >nul 2>&1
if not errorlevel 1 (
  set "CLOUDFLARED=cloudflared"
  goto run_tunnel
)
echo.
echo cloudflared nao foi encontrado.
echo Baixe o executavel oficial em:
echo https://developers.cloudflare.com/tunnel/downloads/
echo Renomeie para cloudflared.exe e coloque-o nesta pasta.
pause
exit /b 1
:run_tunnel
echo A expor a demo local em http://127.0.0.1:8787
echo Pressiona Ctrl+C para desligar o tunnel.
echo.
"%CLOUDFLARED%" tunnel --protocol http2 --url http://127.0.0.1:8787
pause
