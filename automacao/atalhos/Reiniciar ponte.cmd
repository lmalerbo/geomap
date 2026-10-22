@echo off
REM Reinicia a ponte do DroneManagement: mata o processo atual e abre o iniciar.cmd minimizado.
set "ESTADO=%~dp0..\ponte-dronemgmt\estado.json"
for /f "usebackq delims=" %%a in (`powershell -NoProfile -Command "(Get-Content '%ESTADO%' | ConvertFrom-Json).pid" 2^>nul`) do set "PID=%%a"
if defined PID (
    taskkill /PID %PID% /F
)
start "GeoMap - Ponte DroneManagement" /min "%~dp0..\ponte-dronemgmt\iniciar.cmd"
echo Ponte reiniciada.
pause