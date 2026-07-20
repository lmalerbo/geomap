# Vigiar Talhões/Limites (unidade Pedra)

Observa a pasta de exportação FME (`\\lnxfs3\work3\Projetos\SHAPES_RPA` ou
equivalente) e atualiza sozinho as camadas Talhões/Limites da unidade Pedra
no GeoMap sempre que a exportação diária deixa um shapefile novo — sem
precisar de ninguém fazer upload manual pela tela de admin.

**Escopo desta leva**: só a unidade Pedra (`da_Pedra`). Outras unidades
(ex: "Ipê") não são processadas ainda — ver `docs/ROADMAP.md`.

## Como funciona, resumido

1. A exportação (FME) deixa um conjunto de arquivos por dia na pasta,
   nomeados `Talhoes_da_Pedra_DD_MM_YYYY_fme.shp` (e `.shx`/`.dbf`/`.prj`/
   `.cpg`) ou `limites_da_Pedra_DD_MM_YYYY_fme.*`.
2. Este script fica de olho na pasta. Quando um conjunto novo termina de
   chegar, confere se a data é mais nova que a última já processada.
3. Se for, envia os arquivos pra API do GeoMap (`PUT
   /admin/camadas/:id/arquivo`, a mesma rota que o upload manual pela tela
   de admin usa) — **em todos os mapas que têm essa camada** (hoje,
   Talhões existe duplicado em 2 mapas — "Geral" e "Temático").
4. Espera a conversão terminar (pode levar minutos pra Talhões grande) e
   registra o resultado em `log.txt`.

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
$destino = "fortinet-ca.pem"
$certs = Get-ChildItem Cert:\LocalMachine\Root | Where-Object { $_.Subject -match "uspedra.com.br" }
$conteudo = ""
foreach ($cert in $certs) {
    $b64 = [System.Convert]::ToBase64String($cert.RawData, [System.Base64FormattingOptions]::InsertLineBreaks)
    $conteudo += "-----BEGIN CERTIFICATE-----`n$b64`n-----END CERTIFICATE-----`n"
}
[System.IO.File]::WriteAllText($destino, $conteudo)
```

Isso cria `fortinet-ca.pem` nesta pasta (gitignored — é específico desta
rede, não faz sentido versionar). `iniciar.cmd`/`listar-camadas.cmd` (e
os scripts `npm run vigiar`/`npm run listar-camadas`) já apontam pra ele
via `NODE_EXTRA_CA_CERTS` sozinhos — só rodar direto `node vigiar.mjs`
sem passar por esses `.cmd` que o erro volta. Se um dia isso rodar fora
dessa rede (sem o FortiGate no meio), esse passo simplesmente não é
necessário.

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
    "talhoesCamadaIds": [5, 25],
    "limitesCamadaIds": [/* preencha com os ids do passo 4 */]
  }
}
```

`talhoesCamadaIds` já vem com `[5, 25]` (ids conhecidos de uma sessão
anterior — confirme que ainda estão certos com o `listar-camadas.mjs`
antes de rodar de verdade). `limitesCamadaIds` está vazio — a automação
loga e ignora arquivos de Limites até isso ser preenchido.

## Rodando

```
npm run vigiar
```

(ou clique duas vezes em `iniciar.cmd`). Fica rodando indefinidamente
(Ctrl+C pra parar). Na primeira execução, varre a pasta e processa só o
arquivo mais recente de cada tipo (não reprocessa o histórico
acumulado); depois disso, reage a arquivos novos em tempo real.

### Manter no ar

Este processo precisa continuar rodando pra funcionar — não é uma tarefa
que roda e termina. Opções (escolha uma, não implementado aqui):

- **Agendador de Tarefas do Windows**: criar uma tarefa que roda
  `iniciar.cmd` na inicialização, com "reiniciar em caso de falha".
- **PM2** (`npm install -g pm2` — fora do escopo deste pacote): `pm2
  start iniciar.cmd`, sobrevive a reinício e reinicia sozinho se cair.
- **Terminal aberto**: mais simples, mas para se o terminal fechar ou o
  PC reiniciar.

## Conferindo se está funcionando

`log.txt` (na mesma pasta deste README) registra cada passo com
timestamp — arquivo detectado, camadas atualizadas, ou por que algo foi
ignorado (unidade fora do escopo, sem mapeamento configurado, arquivo
incompleto). Um teste seguro pra confirmar que está tudo certo: soltar um
`.shp` de teste (cópia de um dia já processado, renomeado com uma data
mais nova) na pasta e acompanhar o `log.txt` — só depois de ver "todas as
camadas atualizadas" é que o arquivo realmente foi pra produção.

## O que NÃO está coberto (de propósito)

- Notificação de falha por e-mail/Slack — só o log local por enquanto.
- Outras unidades além de "da_Pedra" — adicionar depois é só uma entrada
  nova em `mapeamento-camadas.json`, sem mexer no código.
- Rodar como serviço/tarefa agendada — fica a critério de quem for
  manter isso no ar.
