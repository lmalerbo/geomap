# Vigiar Talhões/Limites (unidade Pedra)

Roda **uma vez por dia, agendado às 8:05** (Windows Task Scheduler) e
atualiza sozinho as camadas Talhões/Limites da unidade Pedra no GeoMap a
partir da exportação diária do Data Lake (FME) — sem precisar de ninguém
fazer upload manual pela tela de admin.

**Escopo desta leva**: só a unidade Pedra (`da_Pedra`). Outras unidades
que passam pela mesma pasta (ex: Buriti, Cedro, Ipê, São Luiz) não são
processadas ainda — ver `docs/ROADMAP.md`.

## Como funciona, resumido

1. Todo dia, a exportação (FME) deixa um conjunto de arquivos novo na
   pasta, nomeados `Talhoes_da_Pedra_DD_MM_YYYY_fme.shp` (e `.shx`/`.dbf`/
   `.prj`/`.cpg`) e `limites_da_Pedra_DD_MM_YYYY_fme.*`.
2. Às 8:05, o Task Scheduler roda este script uma vez. Ele varre a pasta,
   acha o arquivo **mais recente** de cada tipo (Talhões/Limites) e
   confere se a data é mais nova que a última já processada
   (`estado.json`).
3. Se for, **converte o `.shp` em `.pmtiles` aqui mesmo** (ver seção
   "Conversão local" abaixo — desde 2026-09-28, antes o Render fazia essa
   conversão) e envia o resultado pronto pra API do GeoMap (`PUT
   /admin/camadas/:id/arquivo`, a mesma rota que o upload manual pela tela
   de admin usa, só que com o arquivo já convertido em vez do `.shp`) —
   **em todos os mapas que têm essa camada** (hoje, Talhões existe em 4
   mapas — "Geral", "Temático", "Irrigação" e "ICOL" —, e Limites também).
   Converte uma vez só por nome de camada, mesmo que ele apareça em vários
   mapas.
4. Espera cada envio terminar antes de passar pro próximo — nunca dois ao
   mesmo tempo.
5. Registra tudo em `log.txt` e termina (não fica rodando o resto do
   dia).

Não é mais um processo que fica de olho na pasta em tempo real (era
assim numa versão anterior, baseada em `chokidar`) — trocado por
execução diária agendada: mais simples de manter (não precisa de
processo nenhum rodando 24h) e evita a instabilidade do watch nativo do
Windows em compartilhamento de rede SMB, que chegou a quebrar o modelo
anterior em produção real (falhava na hora com centenas de erros
`ECONNRESET`, nunca chegava a vigiar nada). Como a exportação só solta
um conjunto novo por dia mesmo, rodar uma vez por dia cobre o caso de
uso real sem essa complexidade.

## Configuração (primeira vez)

### 1. Instalar dependências

```
cd automacao/vigiar-talhoes-limites
npm install
```

### 2. Criar a conta de serviço

Pela tela **Gerenciar Usuários** do GeoMap (logado como admin), crie um
usuário dedicado só pra essa automação (ex: `automacao@geoportal.local`),
papel **admin**. Não reuse sua conta pessoal — assim fica registrado nos
logs quem fez cada atualização, e a automação não quebra se sua senha
pessoal mudar.

### 3. Configurar o `.env`

```
copy .env.example .env
```

Edite `.env` e preencha `PASTA_MONITORADA`, `GEOMAP_API_URL` (produção:
`https://geomap-docker.onrender.com`), `GEOMAP_EMAIL`/`GEOMAP_SENHA` (a
conta criada no passo 2).

### 4. Certificado do firewall da empresa (só nesta rede)

A rede da Pedra Agroindustrial inspeciona tráfego HTTPS por trás de um
firewall FortiGate — o Windows já confia no certificado dele (instalado
via TI), mas o Node **não usa o repositório de certificados do
Windows por padrão**, só o dele próprio. Sem isso, qualquer chamada à
API de produção falha com `SELF_SIGNED_CERT_IN_CHAIN`/`fetch failed`,
mesmo com internet normal (`curl`/navegador funcionam, porque esses
usam o certificado do Windows).

Exportar o certificado uma vez (PowerShell, no Windows desta rede):

```powershell
$destino = Join-Path (Get-Location) "fortinet-ca.pem"
$certs = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match "uspedra.com.br" }
$conteudo = ""
foreach ($cert in $certs) {
    $b64 = [System.Convert]::ToBase64String($cert.RawData, [System.Base64FormattingOptions]::InsertLineBreaks)
    $conteudo += "-----BEGIN CERTIFICATE-----`n$b64`n-----END CERTIFICATE-----`n"
}
[System.IO.File]::WriteAllText($destino, $conteudo)
```

`$destino` precisa ser um caminho **absoluto** (`Join-Path (Get-Location)
...`, não só `"fortinet-ca.pem"`) — `[System.IO.File]::WriteAllText`
resolve caminho relativo pelo diretório atual do **processo .NET**, que
pode divergir do `$PWD` do PowerShell (já aconteceu: o arquivo foi parar
em `C:\Users\<usuario>\` em vez da pasta da automação, mesmo com
`cd` já feito certinho antes — confirmado configurando isto numa máquina
nova em 2026-08-18, ver entrada "Segundo PC" no `CLAUDE.md` da raiz do
projeto).

Isso cria `fortinet-ca.pem` nesta pasta (gitignored — é específico desta
rede, não faz sentido versionar). `iniciar.cmd`/`listar-camadas.cmd` já
apontam pra ele via `NODE_EXTRA_CA_CERTS` sozinhos — só rodar direto
`node vigiar.mjs` sem passar por esses `.cmd` que o erro volta. Se um
dia isso rodar fora dessa rede (sem o FortiGate no meio), esse passo
simplesmente não é necessário.

### Rede exige autenticação por portal antes de liberar internet externa

Além do FortiGate inspecionando HTTPS (passo acima), a rede da Pedra
também pode exigir uma autenticação **por portal cativo** antes de
liberar tráfego pra domínios externos — sintoma: qualquer chamada HTTP
(`curl`, `Invoke-RestMethod`, instalador de pacote) volta um HTML
redirecionando pra `https://fwpedra.uspedra.com.br:1003/fgtauth?...`
em vez do conteúdo esperado, mesmo com DNS/rede interna funcionando
normalmente. Isso não passa por script/linha de comando — abrir um
navegador de verdade nessa máquina e completar a autenticação que
aparecer (uma vez) libera a rede pro resto da sessão, inclusive pra
chamadas feitas depois via terminal.

### 4.5. Conversão local (ogr2ogr/tippecanoe/Python) — pré-requisito novo

Desde 2026-09-28 a conversão `.shp` → `.pmtiles` (geometria + rótulos)
roda **aqui**, não mais no Render — converter Talhões (o mais pesado) lá
estourava o limite de memória do plano gratuito (512MB) e derrubava o
processo no meio do job (aconteceu de verdade em 20/09, 22/09 e 26/09).
Esta máquina agora precisa dos mesmos binários que a máquina de
desenvolvimento do Leo já usa — mais fácil **copiar** do que reinstalar
do zero, já que são binários prontos:

1. **Copiar as pastas** (de `C:\Users\lmalerbo\` na máquina do Leo, via
   RDP/pasta de rede/pendrive) pra um lugar fixo nesta máquina, ex.
   `C:\ferramentas\`:
   - `cygwin-portable\` inteira (~1,6GB — tem `ogr2ogr.exe` +
     dependências, dentro de `root\bin\`).
   - De `tippecanoe\`, só precisa de `tippecanoe.exe` e `tile-join.exe`
     (~330MB a pasta toda, mas só esses 2 arquivos importam).
2. **Python** (roda os scripts de rótulo — `pipeline/rotulos/*.py`, no
   repositório clonado, não em `automacao/`): instalar via Scoop, mesmo
   padrão sem-admin já usado nesta máquina pra Node/git —
   `scoop install python` — depois `pip install -r
   ..\..\pipeline\requirements.txt` (caminho relativo a esta pasta;
   `pyshp`/`pyproj`/`shapely`, poucos MB).
3. **`git pull`** neste clone do repositório — traz o módulo de conversão
   novo (`backend/src/lib/conversaoShapefile.js`, só módulos nativos do
   Node, não precisa de `npm install` dentro de `backend/`) e o
   `vigiar.mjs` atualizado. Confirmar que a pasta `backend/` existe do
   lado de `automacao/` (clone completo do repositório, não só esta
   subpasta).
4. Acrescentar ao `.env` desta pasta (ver `.env.example` — variáveis
   novas, mesmo padrão de sempre — ajustar os caminhos pra onde as pastas
   foram copiadas no passo 1):
   ```
   OGR2OGR_PATH=C:\ferramentas\cygwin-portable\root\bin\ogr2ogr.exe
   TIPPECANOE_PATH=C:\ferramentas\tippecanoe\tippecanoe.exe
   TILEJOIN_PATH=C:\ferramentas\tippecanoe\tile-join.exe
   CYGWIN_BIN_DIR=C:\ferramentas\cygwin-portable\root\bin
   PYTHON_PATH=python
   ```
5. Testar a conversão isolada antes de rodar `npm run vigiar` de
   verdade — copie um `.shp`+`.dbf`+`.shx`+`.prj` de teste pra uma pasta
   qualquer e rode (dentro de `automacao/vigiar-talhoes-limites/`):
   ```powershell
   node -e "import('../../backend/src/lib/conversaoShapefile.js').then(async m => { const nome = await m.validarShapefileNaPasta('CAMINHO_DA_PASTA_DE_TESTE'); const buf = await m.converterPastaShapefileParaPmtiles('CAMINHO_DA_PASTA_DE_TESTE', nome, 'teste'); console.log(buf.length, 'bytes', buf.subarray(0,7).toString()); })"
   ```
   Sucesso: imprime um tamanho em bytes e `PMTiles` (a assinatura do
   arquivo). Qualquer binário não encontrado aponta exatamente qual
   variável de `.env` conferir (mensagem de erro já nomeia a variável).

### 5. Descobrir os ids de camada

```
npm run listar-camadas
```

Loga com a conta de serviço (ou digite outra credencial só pra essa
consulta, se preferir) e mostra uma tabela `mapa | camada | id`. Anote os
ids de **todo mapa** que tiver uma camada "Talhões" ou "Limites" da
unidade Pedra.

### 6. Preencher `mapeamento-camadas.json`

```json
{
  "da_pedra": {
    "talhoesCamadaIds": [5, 25, 48],
    "limitesCamadaIds": [1, 21, 43]
  }
}
```

Já vem preenchido com os ids conhecidos em produção (confirme com
`listar-camadas.mjs` se mudou algo antes de confiar nisso — mapas podem
ser criados/removidos).

### 7. Agendar no Windows Task Scheduler (roda todo dia às 8:05)

Cria a tarefa (não precisa de admin — roda sob o seu próprio usuário):

```powershell
schtasks /create /sc daily /st 08:05 /tn "GeoMap - Sincronizar Talhoes Limites" /tr "\"C:\Users\lmalerbo\Documents\GitHub\geomap\automacao\vigiar-talhoes-limites\iniciar.cmd\"" /f
```

Conferir que foi criada:

```powershell
schtasks /query /tn "GeoMap - Sincronizar Talhoes Limites" /v /fo list
```

Rodar manualmente uma vez pra testar sem esperar até amanhã:

```powershell
schtasks /run /tn "GeoMap - Sincronizar Talhoes Limites"
```

Remover a tarefa (se precisar desfazer):

```powershell
schtasks /delete /tn "GeoMap - Sincronizar Talhoes Limites" /f
```

## Rodando manualmente (fora do agendamento)

```
npm run vigiar
```

(ou clique duas vezes em `iniciar.cmd`, ou `npm run listar-camadas` /
`listar-camadas.cmd` pra só consultar os ids). Faz uma varredura, processa
o que houver de novo, e termina — mesmo comportamento da execução
agendada.

## Conferindo se está funcionando

`log.txt` (na mesma pasta deste README) registra cada execução com
timestamp — arquivo(s) encontrado(s), camadas atualizadas, ou por que
algo foi ignorado (já processado, unidade fora do escopo, sem
mapeamento configurado, conjunto de arquivos incompleto). Um teste
seguro pra confirmar que está tudo certo: soltar um `.shp` de teste
(cópia de um dia já processado, renomeado com uma data mais nova) na
pasta e rodar `npm run vigiar` na mão — só depois de ver "todas as
camadas atualizadas" é que o arquivo realmente foi pra produção.

## Se der erro de binário não encontrado

`ENOENT`/"não encontrado" ao converter aponta um caminho de `.env`
errado ou a pasta copiada (passo 4.5) incompleta — a mensagem sempre
nomeia a variável (`OGR2OGR_PATH`/`TIPPECANOE_PATH`/`TILEJOIN_PATH`/
`PYTHON_PATH`). Testar o binário isolado direto no PowerShell (ex: `&
"C:\ferramentas\cygwin-portable\root\bin\ogr2ogr.exe" --version`) reproduz
o erro fora do Node, mais fácil de depurar.

## O que NÃO está coberto (de propósito)

- Notificação de falha por e-mail/Slack — só o log local por enquanto.
- Outras unidades além de "da_Pedra" — adicionar depois é só uma entrada
  nova em `mapeamento-camadas.json`, sem mexer no código.
