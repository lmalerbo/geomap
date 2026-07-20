@echo off
REM Ver comentario em iniciar.cmd sobre o certificado do firewall.
cd /d "%~dp0"
set NODE_EXTRA_CA_CERTS=%~dp0fortinet-ca.pem
node listar-camadas.mjs
