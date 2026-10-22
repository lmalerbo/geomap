@echo off
REM Reinicia a ponte do DroneManagement: encerra a ponte atual (e o laco do
REM iniciar.cmd) e abre uma nova, minimizada. Use quando a ponte travar.
cd /d "%~dp0..\ponte-dronemgmt"
set NODE_EXTRA_CA_CERTS=%~dp0..\vigiar-talhoes-limites\fortinet-ca.pem
node vigia.mjs --reiniciar
echo Ponte reiniciada. Confira a janela "GeoMap - Ponte DroneManagement".
pause
