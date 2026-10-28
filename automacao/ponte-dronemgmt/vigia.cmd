@echo off
cd /d "%~dp0"
set NODE_EXTRA_CA_CERTS=%~dp0..\vigiar-talhoes-limites\fortinet-ca.pem
node vigia.mjs