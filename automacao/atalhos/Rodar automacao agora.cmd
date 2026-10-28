@echo off
REM Executa a tarefa agendada 'GeoMap - Sincronizar Talhoes Limites' agora.
schtasks /run /tn "GeoMap - Sincronizar Talhoes Limites"
pause