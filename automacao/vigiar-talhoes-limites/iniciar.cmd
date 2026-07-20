@echo off
REM Roda vigiar.mjs com o certificado do firewall da empresa (FortiGate,
REM faz inspecao de trafego HTTPS) marcado como confiavel pro Node -- sem
REM isso o Node rejeita a conexao com a API (Node nao usa o repositorio de
REM certificados do Windows por padrao, so o proprio, diferente do curl).
REM Ver README.md ("Certificado do firewall da empresa") se fortinet-ca.pem
REM nao existir ainda.
cd /d "%~dp0"
set NODE_EXTRA_CA_CERTS=%~dp0fortinet-ca.pem
node vigiar.mjs
