@echo off
REM Ponte do DroneManagement (ver README.md). Fica rodando o tempo todo:
REM se o programa cair, volta sozinho em 10 segundos. Usa o certificado do
REM firewall da empresa (FortiGate) ja exportado pela automacao diaria.
cd /d "%~dp0"
set NODE_EXTRA_CA_CERTS=%~dp0..\vigiar-talhoes-limites\fortinet-ca.pem
:laco
node ponte.mjs
echo Ponte parou. Reiniciando em 10 segundos...
timeout /t 10 /nobreak >nul
goto laco
