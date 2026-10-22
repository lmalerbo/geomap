@echo off
REM Atualiza o repositorio GeoMap: git pull e, se package-lock.json mudou, npm ci no backend.
cd /d "%~dp0..\.."
set "LOCK=backend\package-lock.json"
certutil -hashfile %LOCK% SHA256 > "%TEMP%\hash_antes.txt" 2>nul
git pull
certutil -hashfile %LOCK% SHA256 > "%TEMP%\hash_depois.txt" 2>nul
fc "%TEMP%\hash_antes.txt" "%TEMP%\hash_depois.txt" >nul
if errorlevel 1 (
    echo package-lock.json mudou — rodando npm ci...
    cd backend
    npm ci --omit=dev
    cd ..
) else (
    echo package-lock.json nao mudou.
)
pause