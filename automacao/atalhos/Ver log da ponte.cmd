@echo off
REM Mostra as ultimas 40 linhas do log da ponte e fica acompanhando (tail -f).
powershell -NoProfile -Command "Get-Content -Encoding UTF8 -Tail 40 -Wait '%~dp0..\ponte-dronemgmt\log.txt'"