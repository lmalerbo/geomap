# CLAUDE.md — GeoMap

## O que é este projeto

Visualizador web (PWA) de mapas geoespaciais das fazendas — talhões, sulcação,
frentes de colheita — que substitui o modelo atual baseado em arquivos CarryMap
(.cmf2) distribuídos com senha compartilhada.

Funciona com login próprio e funcionamento **100% offline em campo** depois
da sincronização inicial autenticada. Não é um "portal de download de
arquivos" — é um mapa interativo único, com os dados permitidos pro grupo
do usuário aparecendo como camadas (liga/desliga), sincronizadas sozinhas
em segundo plano sempre que há internet. O controle de permissão por grupo
existe no backend (decide o que cada usuário pode sincronizar), mas não
aparece como uma tela de "catálogo" pro usuário escolher/baixar.

## Problema que resolve

Fluxo atual:
```
ArcGIS Pro → CarryMap Builder → .cmf2 → e-mail/WhatsApp/pendrive
→ senha compartilhada → zero controle, zero auditoria, revogação impossível
```

Fluxo novo:
```
ArcGIS Pro → .shp (já gerado hoje, antes do CarryMap)
→ tippecanoe → .pmtiles
→ Portal Web (login JWT, permissão por grupo)
→ app sincroniza sozinho os .pmtiles permitidos pro navegador (IndexedDB),
  sem botão de download visível
→ PWA renderiza tudo como camadas de um único mapa, funciona offline a
  partir daí, sem depender de nenhum app nativo
```

Importante: isso **não é DRM**. Uma vez baixado, o arquivo pode em tese ser
extraído do armazenamento do navegador — igual hoje um .cmf2 pode ser copiado.
O ganho real é: nada é baixado sem login válido + permissão de grupo, todo
download é registrado (usuário, mapa, data/hora), e revogar acesso impede
novos downloads imediatamente.

## Escopo do MVP (v1) — o que construir primeiro

1. **Pipeline de publicação**: script que pega um `.shp` existente, roda
   `tippecanoe`, gera um `.pmtiles` por área/talhão.
2. **Backend mínimo**: login (JWT + bcrypt), tabelas
   usuários/grupos/mapas/permissões/logs (ver `docs/SCHEMA_BANCO.md`),
   endpoint de catálogo (só retorna mapas que o grupo do usuário pode ver),
   endpoint de download (registra log no momento do download).
3. **PWA**: login → mapa único (sem tela de catálogo). Sincronização
   automática em segundo plano (sem botão "baixar") salva os `.pmtiles`
   permitidos no IndexedDB; cada um vira uma camada do mesmo
   `MapLibre.Map`, com controle de liga/desliga; clique num talhão mostra
   os atributos da camada correspondente.
4. **Offline de verdade**: service worker cacheia o app shell; uma vez que o
   mapa foi baixado, tudo funciona sem rede nenhuma (sem chamada ao backend).

## Fora do escopo do MVP (fica pra fase 2+)

- Medição de distância/área (Turf.js)
- Busca por atributo
- Bookmarks de extensão do mapa
- Exportar/imprimir como PDF
- Dashboard administrativo / estatísticas de uso
- Fotos/anotações coletadas em campo
- PostGIS (fase 1 não precisa — filtragem por permissão é por arquivo/mapa
  inteiro, não por geometria)

## Stack

- **Frontend**: React + Vite (decidido em 2026-07-07) + MapLibre GL JS +
  biblioteca `pmtiles` (leitura via IndexedDB/Blob, offline) + `vite-plugin-pwa`
  (Workbox) para o service worker
- **Backend**: Node.js/Express (decidido em 2026-07-07)
- **Banco**: PostgreSQL (schema simples, sem PostGIS na v1)
- **Pipeline**: `tippecanoe` (CLI) + `ogr2ogr`/GDAL + script de empacotamento em
  Python (decidido em 2026-07-07 — `pyshp` facilita gerar o shapefile
  sintético sem depender de GDAL local). Dado **sintético** roda via GitHub
  Actions (runner Linux) — só isso, nunca dado real, porque o repositório é
  público e artefato de workflow em repo público fica baixável por
  qualquer um. Dado **real** roda localmente via Cygwin instalado sem
  admin em `C:\Users\lmalerbo\cygwin-portable` (`gcc`, `make`, `gdal`,
  `proj` via pacotes Cygwin + `tippecanoe` compilado do source com
  `-D_GNU_SOURCE` no CFLAGS/CXXFLAGS, necessário pro Cygwin expor
  `fdopen`/`pwrite`/`fileno`/`M_PI`/`O_CLOEXEC` em modo C++17 estrito).
  GitHub Codespaces foi cogitado mas está bloqueado por guardrail de
  segurança do Claude Code (classificado como exfiltração de dado
  confidencial) — não tentar de novo sem o usuário liberar isso
  explicitamente nas configurações.

## Convenções do projeto

- Git como fonte da verdade entre as duas máquinas (mesmo padrão dos outros
  projetos do Leo — home/trabalho sincronizados via Git, nunca estado local
  não commitado).
- Commits pequenos e descritivos.
- **Nenhum dado real de fazenda vai para o repositório** — usar um `.shp` de
  exemplo/sintético para todo o desenvolvimento e para os testes do pipeline.
- Toda decisão de arquitetura relevante é registrada em `docs/` antes de
  implementar — não decidir arquitetura "no meio do código".
- Sem autenticação de terceiros (Microsoft/Google) na v1 — auth é 100%
  própria, conforme decidido no estudo de viabilidade.

## Estado atual

MVP da Fase 1 completo e testado de ponta a ponta; desde 2026-07-10 o app
suporta **múltiplos mapas** (projetos/fazendas), não só um mapa único —
ver a entrada "Múltiplos mapas" mais abaixo pro detalhe da migração.
Terminologia atual (importante pra não confundir com entradas antigas
deste arquivo, escritas quando só existia um mapa): **mapa** = projeto/
fazenda que aparece na tela inicial (ex: "Usina da Pedra"); **camada** =
um `.pmtiles` individual dentro de um mapa (ex: Talhões, Limites) — era
chamada de "mapa" nas entradas anteriores a 2026-07-10.

- **Repositório**: github.com/lmalerbo/geomap.
- **Pipeline**: `.shp` sintético → `ogr2ogr` → `tippecanoe` → `.pmtiles`,
  validado via GitHub Actions (runner Linux, já que `tippecanoe` não
  compila no Windows).
- **Backend**: tabelas do `docs/SCHEMA_BANCO.md`, `POST /login`
  (JWT/bcrypt), `GET /mapas` (mapas permitidos com as camadas já
  aninhadas, filtrado por grupo) e `GET /camadas/:id/download` (confere
  permissão de novo via o mapa da camada, grava log). Testado localmente
  contra PostgreSQL real, incluindo mapa fora de permissão (404).
- **Frontend/PWA**: React + Vite. Login → tela inicial (`Inicio.jsx`,
  `/inicio`) lista os mapas permitidos como cards — **sem catálogo de
  camadas visível**, só os mapas — clique abre `/mapa/:mapaId`.
  `src/lib/sync.js` sincroniza **todos** os mapas permitidos (todas as
  camadas deles) em segundo plano de uma vez só (sem botão "baixar"),
  comparando `versao` local x remota por camada. Dentro de um mapa, cada
  camada vira uma camada do mesmo `MapLibre.Map` (fonte + fill + linha),
  com painel de liga/desliga; clique consolidado
  (`queryRenderedFeatures` em todas as camadas visíveis) identifica de
  qual camada veio a feição clicada; botão "Trocar mapa" volta pra
  `/inicio`. MapLibre lê `.pmtiles` do IndexedDB via `Source`
  customizado (`BlobSource`, sem range request HTTP), nome da camada
  vetorial lido do metadata (`vector_layers[0].id`, nunca hardcoded),
  service worker (Workbox) cacheando o app shell. Testado no navegador
  via Playwright, **incluindo offline real** (rede desligada de
  verdade: tela inicial, sincronização, camadas e clique com atributos
  todos funcionando sem nenhuma chamada de rede).

Pipeline também validado com **dado real de produção** (rodado localmente
via Cygwin, nunca via GitHub — ver seção Pipeline em Stack acima), inclusive
renderizado no visualizador como duas camadas simultâneas (Talhões +
Limites) sobre o mesmo mapa.

**UX inspirada no CarryMap (2026-07-08)**: controles nativos do MapLibre
(zoom, bússola, geolocalização com rastreamento automático ao carregar),
botão "Home" (volta pra extensão de todas as camadas), barra de escala,
marcador no ponto clicado com paginação entre feições sobrepostas (ex:
Talhão + Limite no mesmo lugar), painel de camadas recolhível. Estilo por
camada decidido pela presença do campo `TALHAO` no metadata do `.pmtiles`
(sem coluna de estilo no schema ainda — se um painel de admin publicar
mapas no futuro, aí sim vale formalizar isso como campo explícito em
`mapas`): havendo `TALHAO`, a camada ganha preenchimento + rótulo com o
número do talhão (aparece só a partir do zoom 13); não havendo, fica só
contorno (é o caso de "Limites").

**Correções pós-CarryMap (2026-07-08)**: Limites virou camada só-visual
(contorno + nome da fazenda) — clique nela não abre mais painel de
atributos, só Talhões é consultável (`consultavel: ehTalhao` em
`Mapa.jsx`). Rótulos (número do talhão / nome da fazenda) agora usam
`pipeline/rotulos/` (`gerar_rotulos.py`, `gerar_rotulos_por_atributo.py`
e `polylabel.py`) em vez de centroide simples: cada rótulo é 1 ponto na
maior parte (por área) de cada talhão/grupo, posicionado pelo algoritmo
*pole of inaccessibility* (mesma técnica da Mapbox) — garante que o
ponto sempre cai dentro do polígono e fica visualmente centralizado
mesmo em formas côncavas (o centroide antigo colocava ~8% dos rótulos
fora do próprio polígono, até 174 m de distância). Além disso, o
`.pmtiles` da camada de rótulos precisa ser gerado **separado** da
camada de polígonos com a flag `-r1` do tippecanoe (desliga o
"drop-rate" padrão de 2.5, que enxuga pontos densos em zooms baixos
achando que são POIs redundantes — como cada rótulo aqui é único e
obrigatório, isso apagava a maioria dos números em zooms intermediários)
e depois juntado com `tile-join`. Ver `pipeline/rotulos/README.md`.

Pendente do pedido do CarryMap (fica pra próxima sessão, exige mexer no
pipeline de novo): busca por talhão/seção — precisa de um índice leve
(json com id + centróide + atributos-chave) gerado no pipeline e
baixado junto com o `.pmtiles`, já que o vector tile só carrega
features do viewport atual, não o dataset inteiro (índices já gerados
como prova de conceito em sessão anterior, falta a UI de busca no
frontend).

**Base do painel de administração (2026-07-08)**: usuário ganhou coluna
`papel` ('admin' / 'usuario', migration 002). JWT carrega o papel;
middleware `exigirAdmin` protege rotas administrativas no backend (só
`GET /admin/ping` por enquanto, placeholder). Frontend tem rota
`/admin` protegida (`RotaAdmin` em `App.jsx`, redireciona pra `/mapa`
se não for admin) e um link "Admin" no header do mapa, visível só pra
quem tem o papel. `Admin.jsx` é só o shell/navegação por enquanto — as
4 seções (adicionar/remover camadas = upload da Fase 3, editar
camadas: simbologia/rótulo/nomenclatura, editar atributos de
Limites/Talhões: quais aparecem + ordem) ficam "em breve", a implementar
uma de cada vez nas próximas sessões. Seed cria `admin@geoportal.local`
/ `senha123` além do usuário comum de teste.

**Editar atributos, primeira seção implementada (2026-07-08)**: coluna
`atributos_config` (jsonb) em `mapas` (migration 003) guarda
`[{campo, visivel, ordem}]` por mapa. Rotas admin: `GET /admin/mapas`
(todos os mapas, sem filtro de grupo — admin gerencia qualquer camada,
não só as dos grupos dele), `GET /admin/mapas/:id/arquivo` (baixa o
.pmtiles de qualquer mapa sem checar permissão, não loga como
download), `GET/PUT /admin/mapas/:id/atributos`. Tela
`AdminAtributos.jsx` (`/admin/atributos`, uma seção única com seletor
de mapa — não duas telas fixas Limites/Talhões — pra não fixar id de
mapa no código) baixa o `.pmtiles` do mapa escolhido, lê os campos
disponíveis via `PMTiles.getMetadata()` (mesma técnica de
`adicionarCamada` em `Mapa.jsx`), mescla com a config já salva
(campo novo entra visível no fim; campo removido do dado é
descartado), e deixa marcar visível/oculto + reordenar (botões
↑/↓, sem lib de drag-and-drop). Importante: salvar a config **não**
bumpa a `versao` do mapa — é só metadado de exibição, não teria
sentido forçar reduzir 100% dos clientes a rebaixar um `.pmtiles` de
dezenas de MB só por causa disso. Por isso o sync (`sync.js`) agora
sempre atualiza nome + `atributos_config` no IndexedDB local mesmo
quando a versão não mudou (`atualizarMetadadosMapa` em `db.js`), só
baixa o blob de novo quando a versão realmente muda. `Mapa.jsx` aplica
a config no painel de atributos via `aplicarConfigAtributos()` — sem
config salva (mapa ainda não configurado), comportamento é o de
sempre (mostra tudo, ordem bruta do vector tile).

**Editar camadas, segunda seção implementada (2026-07-08)**: coluna
`estilo_config` (jsonb) em `mapas` (migration 004) guarda
`{cor, opacidadePreenchimento, mostrarRotulo, zoomRotulo}`. Rotas
`GET/PUT /admin/mapas/:id/estilo` e `PUT /admin/mapas/:id` (só nome —
nomenclatura). Tela `AdminCamadas.jsx` (`/admin/camadas`) reusa o
mesmo padrão de seletor de mapa da tela de atributos; lê `ehTalhao` e
`temRotulos` do metadata do `.pmtiles` (mesma técnica) só pra
pré-preencher o formulário com os valores padrão atuais quando o mapa
ainda não tem `estilo_config` salvo. `corDaCamada`/`PALETA_HEX` saíram
de `Mapa.jsx` pra `lib/paleta.js` (módulo compartilhado, sem puxar as
dependências de mapa/maplibre pro bundle do admin). Mesmo princípio do
`atributos_config`: salvar não bumpa `versao`.

Bug encontrado e corrigido no meio do caminho, importante registrar:
o efeito que aplica `mapasLocais` como layers do MapLibre (`Mapa.jsx`)
tinha uma otimização "só reconstrói a camada se a `versao` mudou" —
que ficou **errada** assim que atributos/estilo passaram a poder mudar
sem bumpar `versao`: o admin salvava, o `sync.js`/IndexedDB
atualizavam certinho, mas a camada já carregada na sessão continuava
com o estilo antigo até um reload que por acaso batesse a config nova
logo na primeira carga. Corrigido trocando a comparação de `versao`
por uma `assinatura` (`versao + atributosConfig + estiloConfig`
serializados) — vale lembrar que esse tipo de bug tende a voltar se
qualquer config nova for adicionada no futuro sem entrar na
assinatura.

**Adicionar/remover camadas, terceira e última seção implementada
(2026-07-08)**: painel de upload de mapas da Fase 3, antecipado. Rota
`POST /admin/mapas` recebe multipart (`multer`, disco em `storage/`,
nome de arquivo `crypto.randomUUID().pmtiles` — nunca o nome original
do upload, evita colisão/path traversal), confere a assinatura
`"PMTiles"` nos primeiros bytes do arquivo antes de aceitar (extensão
`.pmtiles` sozinha não garante conteúdo válido), cria o registro em
`mapas` e a permissão pros grupos escolhidos. `DELETE /admin/mapas/:id`
apaga o registro (permissões em cascata) e o arquivo físico. Precisou
de uma migration (005) pra trocar a FK de `logs.mapa_id` de `NO ACTION`
pra `ON DELETE SET NULL` — sem isso, apagar um mapa que já tinha log de
download quebraria por violação de FK; o log em si é mantido (só perde
a referência) porque auditoria de download é um valor central do
projeto. Tela `AdminMapas.jsx` (`/admin/mapas`) tem o formulário de
upload (nome, versão, categoria, checkboxes de grupo, arquivo) e a
lista de camadas existentes com botão remover (confirmação via
`window.confirm`, aceitável pra uma ferramenta interna de admin).

Lição registrada por segurança: strings com acento/travessão passando
por comandos de shell neste ambiente (Bash em Windows) correm risco
real de corromper encoding — já aconteceu 2x nesta sessão (nome de
mapa truncado no meio do trabalho de "editar camadas" e de novo aqui).
Prefira sempre editar via arquivo (Write/Edit) ou Node com a string
inteira dentro do próprio código, e sempre que mexer em texto
acentuado via comando de shell, revalidar depois com
`length()`/`octet_length()` no Postgres — não confiar só na
inspeção visual do terminal.

**Busca por talhão/fazenda (2026-07-08, Fase 2 antecipada)**: sem
nenhuma mudança de pipeline/backend — reaproveita o que já está no
`.pmtiles` baixado. `querySourceFeatures` do MapLibre só enxerga tiles
que o mapa já carregou pro viewport/zoom atual (não serve pra indexar
o dataset inteiro), então o índice é montado lendo os tiles direto da
lib `pmtiles` (`PMTiles.getZxy(z,x,y)`, decodificados com
`@mapbox/vector-tile` + `pbf`) no **menor zoom do próprio tileset**
(`header.minZoom`) — a área inteira cabe em poucos tiles nesse zoom, e
como os rótulos foram gerados com `-r1` (sem thinning por densidade,
ver seção de rótulos acima) cada talhão/fazenda aparece garantido.
Enriquece o texto de busca dos talhões com `DESC_SECAO` (lido da
camada de polígono, cruzado por `SECAO+TALHAO`) — sem isso a busca só
acharia o número do talhão, inútil sem saber de qual fazenda/seção.
Busca também por `SECAO` (código numérico), adicionado depois do
primeiro teste: em Talhões aparece no próprio texto exibido ("Talhão N
— Fazenda (cód. 12345)"); em Limites o rótulo é só o nome (um nome
pode ter vários códigos SECAO — mesma fazenda com registros em seções
diferentes), então os códigos entram só no campo de busca, sem poluir
o texto exibido. Resultado ordenado por tamanho do texto (mais curto
primeiro): buscar
"Santa Lydia" deve achar a fazenda em si antes dos 20+ talhões que têm
esse nome no texto. Índice remontado só quando alguma camada muda de
verdade (assinatura), não a cada render. Testado offline real (build
de produção + `vite preview`, sem nenhuma chamada de rede) — funciona
igual, já que tudo vem do `.pmtiles` já baixado.

Nota de dependência: `pbf` v5 (puxado pelo `@mapbox/vector-tile`)
exporta `PbfReader` como named export, não mais um `Pbf` default como
em versões antigas — `new Protobuf(...)` (import default) quebra o
build; usar `import { PbfReader } from "pbf"`.

**Leva de Fase 2/3 + polimento (2026-07-10)**: legenda dinâmica (swatch
preenchido vs contorno, lido de `opacidadePreenchimento` já calculado
em `camadasCarregadasRef`); medição de distância/área (`@turf/length` +
`@turf/area`, fonte/camadas próprias no mapa, clique desviado do
painel de atributos enquanto o modo medição está ativo); telas de
erro/loading (spinner no carregamento inicial do mapa, mensagem
diferenciada pra erro de rede vs credenciais no login, `ErrorBoundary`
novo envolvendo `<App/>`); ícone on-brand + PNGs do manifest (o
`favicon.svg` antigo era um placeholder roxo sem relação com a marca,
gerados via Playwright renderizando o SVG, sem lib nova); controle de
versão de mapas (`PUT /admin/mapas/:id/arquivo`, arquivo antigo vira
backup `.bak-<timestamp>` em vez de apagado); dashboard de
estatísticas (`GET /admin/estatisticas`, agrega a tabela `logs` que já
existia, sem schema novo). "Minha localização" já estava pronto desde
2026-07-08 (só faltava marcar no roadmap). Bookmarks de extensão do
mapa foi avaliado e propositalmente **não implementado** — sem caso de
uso validado, ver `docs/ROADMAP.md`.

**Múltiplos mapas (2026-07-10)**: a empresa vai ter mais de uma fazenda/
projeto, cada um com seu próprio conjunto de camadas (Talhões + Limites
sempre como base, mais outras específicas por mapa) — o app deixou de
ser "um mapa único" e virou "tela inicial com vários mapas". Mudança de
schema: a tabela `mapas` de antes (que na prática sempre guardou camadas
individuais) foi renomeada pra `camadas`; uma tabela `mapas` nova existe
por cima dela (id, nome, descricao) — é o agrupamento que aparece na
tela inicial. Permissão por grupo subiu de nível: passa a valer pro
**mapa inteiro** (todas as camadas dele), não mais por camada individual
(confirmado com o usuário — simplifica o modelo mental, "um grupo vê a
fazenda inteira ou não vê"). Migration 006 fez a transformação inteira
num único `DO $$ ... END $$` idempotente (renomeia, cria a tabela nova,
faz backfill dos mapas a partir do nome das camadas antigas, recria
`permissoes` agrupada por mapa, renomeia `logs.mapa_id` → `camada_id`).

Bug de infraestrutura encontrado e corrigido no processo, vale registrar
porque pode voltar: `migrate.js` rodava **todos** os `.sql` de
`migrations/` sempre, do zero, sem tabela de controle — funcionava
enquanto toda migration era escrita pra tolerar rodar de novo (idempotente
sozinha), mas quebrou na prática porque a migration 005 (antiga) faz
`ALTER TABLE logs ADD CONSTRAINT ... FOREIGN KEY (mapa_id) ...`
incondicionalmente, e a migration 006 (nova, rodando *depois* dela na
mesma leva) renomeia essa mesma coluna pra `camada_id` — ao rodar tudo
de novo do zero, a migration 005 falhava porque a coluna `mapa_id` já
não existia mais. Corrigido criando `schema_migrations` (arquivo + data), que só aplica os
`.sql` ainda não registrados — ver `docs/SCHEMA_BANCO.md`.

Backend: `GET /mapas` retorna os mapas permitidos já com as camadas
aninhadas (uma chamada só, sem N+1, pra sincronizar tudo de uma vez).
Admin dividido em dois grupos de rotas: `/admin/mapas*` (CRUD de
projetos — nome, descrição, quais grupos têm acesso) e `/admin/camadas*`
(upload/edição de camadas, renomeado do que antes era `/admin/mapas*`;
`POST /admin/camadas` agora exige `mapaId` em vez de `grupoIds`, que
saiu do formulário de camada e foi pro formulário de mapa). Frontend:
`Inicio.jsx` (`/inicio`) é a tela pós-login, cards dos mapas permitidos;
`Mapa.jsx` passou a ler `mapaId` via `useParams()` e filtrar as camadas
baixadas por esse id (componente remonta a cada troca de mapa via
`key={mapaId}` em `App.jsx`, pra não vazar refs do MapLibre/IndexedDB de
um mapa pro outro); `AdminMapas.jsx` reescrito pra gerenciar projetos.
Testado via Playwright: catálogo filtrado por permissão (mapa restrito
não aparece pro grupo errado), troca de mapa, todas as seções do admin
daquele momento, e o fluxo inteiro funcionando 100% offline contra o
build de produção (`vite preview` + `context.setOffline`). (A divisão
de `/admin/camadas` em telas separadas de upload/estilo/atributos
descrita aqui foi consolidada de novo numa tela só na reorganização de
admin logo abaixo — ver essa entrada pro estado atual das rotas.)

Lição de processo registrada nesta sessão, importante pra não repetir:
depois da migração de múltiplos mapas, rodei `npm run seed` pra validar
o schema novo — isso recriou os mapas/camadas fake de teste ("Sem
projeto", "Projeto restrito (teste)", "Fazenda Fictícia (teste)") no
mesmo banco de dev que o usuário usa pra olhar o app de verdade, e eu
não limpei depois. O usuário reparou que a tela inicial parecia
"bagunçada" com dado real (Usina da Pedra) misturado a fixtures de
teste. Apaguei os fake (autorizado pelo usuário) e o banco de dev ficou
só com o dado real. Daqui pra frente: depois de qualquer teste que
insere dado (seed, curl, Playwright), limpar explicitamente antes de
considerar a tarefa concluída — não só os artefatos manuais, lembrar
que `npm run seed` também recria fixtures conhecidas.

**Reorganização do painel de admin (2026-07-10)**: o painel tinha 5
telas soltas, sendo 3 delas a mesma tarefa (configurar uma camada)
espalhada em lugares diferentes, cada uma com seu próprio seletor de
camada — e nenhuma UI pra gerenciar usuários/grupos (só seed/SQL
direto, a raiz do problema acima). Consolidado em 4 seções:

- **Gerenciar camadas** (`AdminCamadas.jsx`, `/admin/camadas`,
  substituiu as antigas `AdminCamadasUpload.jsx`/`AdminAtributos.jsx` +
  a própria `AdminCamadas.jsx` de estilo): workspace de duas colunas —
  lista de camadas à esquerda (com filtro por mapa e botão "+ Nova
  camada"), painel de detalhe à direita com 3 seções empilhadas
  (Arquivo, Estilo, Atributos) pra camada selecionada, cada uma com seu
  próprio "Salvar" independente (mesmo comportamento de sempre — salvar
  estilo/atributos não bumpa `versao`). Baixa o `.pmtiles` **uma vez só**
  por seleção de camada (as 3 telas antigas baixavam o mesmo arquivo 3
  vezes). Aceita `?mapaId=` na URL pra abrir com o formulário de upload
  pré-preenchido — usado pelo botão novo em Gerenciar mapas. Trocar de
  camada selecionada com edição não salva em qualquer seção pede
  confirmação (`window.confirm`) antes de descartar.
- **Gerenciar mapas** (`AdminMapas.jsx`) ganhou contagem de camadas por
  mapa (`GET /admin/mapas` agora retorna `camadaCount`), botão
  "Adicionar camada" (linka pra `/admin/camadas?mapaId=X`) e remover
  mapa (`DELETE /admin/mapas/:id`, novo — só permite se o mapa não tiver
  camadas, senão `400` pedindo pra remover as camadas primeiro).
- **Gerenciar usuários** (`AdminUsuarios.jsx`, novo, `/admin/usuarios`):
  primeira UI pra usuários/grupos — antes só existia via `seed.js`/SQL
  direto. Criar/editar usuário (nome, departamento, papel, status,
  grupos), redefinir senha, e uma sub-seção de grupos
  (criar/renomear/remover). Backend ganhou `/admin/usuarios*` e
  `/admin/grupos*` completo (POST/PUT/DELETE, antes só tinha GET).
  Duas proteções no **backend** (não só na UI, que só desabilita os
  controles pra evitar o clique acidental): não dá pra alterar o
  próprio papel/status, e não dá pra zerar os admins ativos restantes.
  Sem `DELETE /admin/usuarios` — `logs.usuario_id` não tem `ON DELETE
  CASCADE`, apagar um usuário que já logou quebraria por FK; "remover"
  usuário é `status = 'inativo'`, que já existia desde a migration 002.
- **Auditoria**: ações administrativas sensíveis (criar/editar usuário,
  redefinir senha, criar/remover grupo, remover mapa) gravam em `logs`
  agora — precisou da migration 007 porque `logs.acao` tinha `CHECK
  (acao IN ('login', 'download'))` desde o schema original; adicionado
  `'admin'` à lista permitida + coluna `detalhe` (texto livre) pra
  guardar o que mudou, sem criar uma `acao` por tipo de operação
  administrativa.

Testado via Playwright: hub com 4 cards, contagem de camadas em
Gerenciar mapas, botão "Adicionar camada" abrindo o upload já
pré-preenchido, as 3 seções de uma camada na mesma tela, aviso de
edição não salva ao trocar de camada, criar/editar usuário/redefinir
senha em Gerenciar usuários, e confirmado que os controles de
papel/status da própria linha do admin logado ficam desabilitados.

**Upload de `.shp` direto no admin (2026-07-10)**: a equipe de GIS do Leo
trabalha com `.shp` exportado do ArcGIS Pro, não com `.pmtiles` — até
aqui, gerar o `.pmtiles` era sempre um passo manual fora do app
(`pipeline/shp_para_pmtiles.sh`, rodado localmente por mim/Leo via
Cygwin). `POST /admin/camadas` e `PUT /admin/camadas/:id/arquivo`
(`routes/admin.js`) passam a aceitar também um `.zip` do shapefile
(`.shp`+`.dbf`+`.shx`+`.prj`, extraído com `adm-zip`) além do `.pmtiles`
já pronto — decide pela extensão real do upload
(`path.extname(file.originalname)`, não mais fixada em `.pmtiles` no
`multer.diskStorage`, que antes forçava esse sufixo em qualquer arquivo
recebido). `converterShapefileParaPmtiles()` roda exatamente os mesmos
dois comandos do script manual (`ogr2ogr` → GeoJSON, depois
`tippecanoe` → `.pmtiles`) via `execFile` (nunca `exec`, evita injeção
de shell), com timeout de 5 min. **V1 cobre só geometria** — decisão
consciente (`AskUserQuestion`) de não automatizar também os rótulos
(número do talhão no mapa), que dependem de um pipeline Python à parte
(pyshp/shapely/polylabel + 2ª passada do tippecanoe + tile-join, ver
`pipeline/rotulos/README.md`) bem mais caro de orquestrar a partir do
Node; rótulo continua manual por enquanto.

Detalhe de ambiente importante: `tippecanoe` não compila nativamente no
Windows. Localizei nesta sessão os binários já compilados que o Leo tem
nesta máquina — `C:\Users\lmalerbo\tippecanoe\tippecanoe.exe`
(compilado via Cygwin, depende de `cygwin1.dll`) e
`C:\Users\lmalerbo\cygwin-portable\root\bin\ogr2ogr.exe`. Pra não
hardcodar caminho de máquina no código (e deixar migrável pra um Linux
de produção no futuro, onde bastaria estarem no `PATH`), os caminhos
entram via `.env`: `OGR2OGR_PATH`, `TIPPECANOE_PATH` (default:
`"ogr2ogr"`/`"tippecanoe"`, assume `PATH` normal) e `CYGWIN_BIN_DIR`
(opcional — prependado no `PATH` do processo filho, só necessário nesta
máquina Windows pros `.exe` Cygwin acharem as DLLs do runtime). Testado
via `curl`: zip válido converte em ~2,5s pro fixture sintético de 3
talhões e gera um `.pmtiles` com assinatura válida; zip sem `.dbf`,
arquivo que não é nem `.zip` nem `.pmtiles`, e zip corrompido voltam
`400` com mensagem clara, sem derrubar o servidor. Testado via
Playwright: upload do `.zip` pela tela de Gerenciar camadas cria a
camada e carrega estilo/atributos normalmente.

Corrigido no mesmo lote: `Mapa.jsx` presa em "Nenhum mapa disponível
ainda. Conecte-se à internet pra sincronizar." pra sempre quando o
`mapaId` da rota já não existe mais (mapa removido durante os testes
desta sessão, aba antiga ainda apontando pra ele) — mensagem errada
(usuário estava online) e sem saída a não ser clicar manualmente em
"Trocar mapa". Depois de uma sincronização online, confere se o
`mapaId` ainda está em `listarMapasDisponiveis()` (`lib/db.js`); se não
estiver, `navigate("/inicio", { replace: true })`. Mapa válido mas
genuinamente sem camadas publicadas ainda mostra uma mensagem diferente
("Este mapa ainda não tem camadas publicadas") em vez da mensagem de
offline, que só aparece quando `offline` é de fato `true`.

Esse fix revelou um bug de verdade, não só uma mensagem errada: com ele
em produção, "Usina da Pedra" (mapa válido, 2 camadas reais no banco)
continuava mostrando "sem camadas publicadas" pro Leo. Causa: campo
`mapaId` foi adicionado aos registros de `mapas_baixados` (IndexedDB)
na migração de múltiplos mapas desta sessão, mas `atualizarMetadadosMapa`
(`lib/db.js`) — chamada pelo `sync.js` quando a `versao` de uma camada
não muda — nunca escrevia esse campo, só nome/atributos/estilo. Registro
salvo antes dessa migração ficava com `mapaId: undefined` **pra
sempre**, porque a `versao` das camadas reais não muda com frequência
(nunca teria outra chance de ganhar o campo). Corrigido passando
`mapaId` também nesse caminho — `atualizarMetadadosMapa` agora
reconcilia o campo a cada sync, mesmo sem mudança de versão. Reproduzido
via Playwright forçando `mapaId: undefined` num registro existente do
IndexedDB e confirmando que o próximo sync (automático, sem ação do
usuário) corrige sozinho. Lição: campo novo num objeto persistido tem
que ter um caminho de backfill em **todo** fluxo de escrita, não só no
de criação — "só grava quando muda" facilmente vira "nunca grava" pra
dado estável.

**Simbologia de camadas estilo QGIS (2026-07-11)**: o editor de estilo
só tinha 1 cor pra preenchimento+contorno, opacidade e liga/desliga de
rótulo — pedido do usuário, priorizado (contorno separado, categorizado/
graduado por atributo, rótulo mais completo, zoom de visibilidade da
camada). Schema novo de `estilo_config` documentado em
`docs/SCHEMA_BANCO.md`; `normalizarEstiloConfig()`
(`frontend/src/lib/estiloCamada.js`, módulo novo sem dependência de
React/MapLibre) é a única fonte de verdade dos defaults — lê tanto o
formato antigo (flat) quanto o novo e sempre devolve o novo completo,
então nenhuma camada já publicada precisou de migração. `Mapa.jsx`
(`adicionarCamada`) monta `fill-color` como expressão MapLibre
(`match` pra categorizado, `step` pra graduado) via
`expressaoCorPreenchimento()`; contorno ganhou `line-color`/`line-width`/
`line-opacity` próprios (antes fixos/herdados do preenchimento); rótulo
ganhou uma segunda origem — `"atributo"` lê `["get", campo]` direto da
camada principal (o polígono se rotula sozinho via MapLibre), ao lado da
`"pipeline"` de sempre (camada `rotulos` pré-gerada, melhor
posicionamento mas exige rodar o pipeline Python). Novo
`AdminCamadas.jsx`: modo de preenchimento com botões "Gerar categorias"/
"Calcular faixas" que leem os valores direto dos tiles já baixados
(`lib/pmtilesValores.js`, novo — mesma técnica de ler tiles no menor
zoom já usada pro índice de busca, mas **sem tocar** no código de busca
que já funciona, pra não arriscar quebrar algo testado).

Dois bugs de verdade encontrados e corrigidos ao testar (com dado real
do Leo, não só o fixture sintético — ele já estava usando o painel
reorganizado em paralelo, inclusive adicionou suporte a geometria de
**ponto** em `Mapa.jsx` por conta própria nesse meio-tempo, camadas tipo
"Unidades"/"Municipios" — compatível com o sistema de estilo novo sem
precisar de nada extra, a cor categorizada/graduada já se aplica a
`circle-color` também):

1. Inputs numéricos do React (`<input type="range"/"number">`) sempre
   mandam string no `onChange`, e o MapLibre valida estritamente que
   `fill-opacity`/`line-width`/`minzoom`/etc sejam `number` — uma
   camada salva com esses campos como string (qualquer uma editada
   pelos novos controles) travava `addLayer()` com exceção, e como o
   loop que aplica as camadas em `Mapa.jsx` não tinha try/catch por
   camada, isso abortava a aplicação de **todas as camadas seguintes**
   no mesmo carregamento — via de regra, sumiam camadas que nem tinham
   sido tocadas. Corrigido em duas frentes: `normalizarEstiloConfig`
   força `Number(...)` em todo campo numérico ao ler (conserta na hora
   até config já salva errada, sem precisar resalvar) e os `onChange`
   dos sliders/números no admin já convertem na origem. `Mapa.jsx`
   ganhou try/catch por camada no loop de `aplicar()` — daqui pra
   frente, um dado problemático numa camada derruba só ela, nunca as
   outras.
2. `.item-selecionavel-camada` (lista de camadas em Gerenciar camadas)
   renderizava com texto branco quase invisível — é um `<button>` sem
   `color` próprio, herdando o `color: #fff` do estilo global de botão
   (pensado pra botão de ação colorido, não pra item de lista).

**Rótulos/busca sumidos de Talhões e Limites (2026-07-11)**: o Leo
reportou que, logado com um usuário próprio (não admin), os rótulos de
Talhões/Limites e a busca tinham parado de funcionar. Causa: em algum
momento os arquivos `.pmtiles` dessas duas camadas foram republicados
(provavelmente durante os próprios testes do upload de `.shp`) com uma
versão só-geometria, sem a camada `rotulos` que o pipeline Python
(`pipeline/rotulos/`) gera à parte — confirmado inspecionando o
metadata do arquivo publicado direto (`vector_layers` só tinha o
polígono). Rótulo e busca dependem exatamente dessa camada
(`temRotulosPipeline` em `Mapa.jsx`), por isso os dois sumiram juntos —
não foi bug de código, foi o dado publicado que mudou.

Corrigido rodando o pipeline completo de novo com o `.shp` original
(achado na raiz do projeto — `Talhoes_da_Pedra_06_07_2026_fme.zip` e
`limites_da_Pedra_06_07_2026_fme.zip`, ambos gitignored, nunca
versionados): `gerar_rotulos.py` (Talhões, por SECAO+TALHAO) e
`gerar_rotulos_por_atributo.py DESC_SECAO` (Limites) geram os pontos de
rótulo; `ogr2ogr` converte o `.shp` original pra GeoJSON; `tippecanoe`
gera um `.pmtiles` pra geometria e outro pra rótulos (`-r1`, ver
`pipeline/rotulos/README.md`); `tile-join` junta os dois; upload via
`PUT /admin/camadas/:id/arquivo`. Confirmado depois: `vector_layers`
agora tem `["Talhões — Pedra", "rotulos"]` e `["Limites", "rotulos"]`,
e testado no navegador (rótulo aparece, busca por "talh" retorna
resultados).

Detalhe de ambiente: rodar `tippecanoe`/`tile-join` direto do Git Bash
falhou com `cygstdc++-6.dll: cannot open shared object file` mesmo com
`CYGWIN_BIN_DIR` no `PATH` do processo — a mesma DLL existe no lugar
certo, então é uma particularidade de como o Git Bash resolve
dependências de `.exe` Cygwin (o backend, via `child_process.execFile`
do Node, não tem esse problema — só invocação direta pelo Bash). Rodar
via PowerShell (`$env:PATH = "...;" + $env:PATH`) contornou sem
problema.

Achado no processo, sem relação com o bug acima: os grupos antigos
(Agronomia/Diretoria) foram removidos durante os testes de "Gerenciar
usuários" desta sessão, substituídos por um grupo novo ("Padrão") — os
usuários de teste (`admin@geoportal.local`, `teste@geoportal.local`)
ficaram sem nenhum grupo, então nenhum dos dois vê mais "Usina da
Pedra" pelo catálogo normal (`GET /mapas`). Não é bug — é só reflexo do
próprio teste de gerenciamento de usuários — mas registrado aqui pra
não confundir uma próxima sessão que for testar algo de permissão com
esses usuários antigos.

Falta: decidir hospedagem de produção (backend rodando no PC de
alguém não é sustentável — avaliado Oracle Cloud Always Free como
opção, adiado; decisão de infra, não entra no mesmo fluxo de código
das outras pendências). Ver `docs/ROADMAP.md` para o checklist
completo.

**Responsividade mobile (2026-07-11)**: painel de camadas recolhido por
padrão em telas ≤640px (`useState` com inicializador preguiçoso lendo
`window.matchMedia("(min-width: 641px)")` — decide só uma vez, no
mount, não reage a resize depois); barra de busca com `right: 60px` em
vez de largura cheia, pra não colidir com os botões +/- de zoom; painel
de atributos com `max-height: 34vh` (era maior) e sem override de
1-coluna — usa a mesma grade de 2 colunas do desktop
(`.atributos-grid`) em qualquer largura de tela; cabeçalho compactado
pra caber numa linha só (`.status-sync` deixou de forçar quebra de
linha, textos/botões menores via `@media (max-width:640px)`). Corrigido
também um bug de sobreposição encontrado no processo: `.painel-busca`
e `.painel-camadas` tinham offsets `top` fixos assumindo o painel de
camadas sempre baixo/recolhido — com o painel de busca (altura fixa) e
o de camadas (altura variável) nessa ordem, o de busca tem que vir
**antes** (topo da tela) e o de camadas depois, nunca o contrário, pra
não haver sobreposição não importa o quanto o painel de camadas
cresça.

**Bug de zoom próximo — camadas somem ao aproximar (2026-07-11)**: ao
dar zoom bem perto (a partir de ~z15/16), Talhões/Limites
desapareciam do mapa. Causa raiz: `map.addSource()` (`Mapa.jsx`,
`adicionarCamada()`) usava `header.maxZoom` (do header geral do
`.pmtiles`) como `maxzoom` da fonte vetorial — mas esse header reflete
o **maior** valor entre todas as camadas do arquivo, inflado pela
camada `rotulos` (gerada com `-z17`, bem acima do
`--maximum-zoom=g` automático do tippecanoe pra geometria, que ficou
em 14). Com `maxzoom: 17` declarado, o MapLibre acreditava que existia
tile real de polígono até z17 e pedia esses tiles direto — voltavam
vazios de verdade (a lib `pmtiles` não faz overzoom sozinha, só
devolve tile vazio fora do range do header), fazendo a camada sumir em
vez de ampliar o último tile realmente detalhado. Corrigido usando o
`maxzoom`/`minzoom` **da camada principal** (`vector_layers[].maxzoom`
no metadata do `.pmtiles`, granularidade por camada, não o header geral
do arquivo) — com isso o MapLibre para de pedir tile além de z14 e
faz overzoom (reaproveita/amplia o tile de z14) corretamente. A camada
`rotulos`, mesmo tendo tiles próprios até z17, funciona igual limitada
a esse mesmo `maxzoom` — é só um ponto, sem perda de precisão ao ser
overzoomed. Verificado via Playwright: `queryRenderedFeatures` num
ponto confirmado sobre um talhão retornava 1 feição em z14 e 0 em
z16/18/20 antes da correção; 1 feição em todos depois.

**Fundo satélite (2026-07-11)**: botão novo no grupo de controles do
MapLibre (`FundoControl`, mesmo padrão do `HomeControl`/`MedicaoControl`
em `Mapa.jsx`) alterna entre o fundo padrão (cor sólida) e imagem de
satélite (Esri World Imagery — `server.arcgisonline.com`, tiles
públicos, sem API key). Decisão explícita do usuário
(`AskUserQuestion`): o fundo satélite **só funciona online** — não
entra no modelo offline-first de baixar tudo pro IndexedDB (seria
dezenas/centenas de MB a mais por fazenda); o botão fica desabilitado
(`offline && !satelite`) impedindo LIGAR sem internet, mas sempre
permite DESLIGAR. Fonte/camada raster são adicionadas/removidas
dinamicamente (`FUNDO_SATELITE_SOURCE_ID`/`FUNDO_SATELITE_LAYER_ID`) só
quando o toggle está ativo, inseridas com `beforeId` = a primeira
camada vetorial já carregada (nunca um `addLayer` simples, que
acrescentaria no topo da pilha e tampararia talhões/limites) — assim
funciona tanto ligando antes quanto depois das camadas vetoriais
carregarem. Preferência persistida em `localStorage`
(`geomap_fundo_satelite`), não no backend — é só ajuste visual do
navegador, não dado do mapa. Verificado via Playwright: fonte/camada
aparecem na ordem certa (`fundo`, `fundo-satelite`, depois todas as
`camada-N-*`), tiles retornam HTTP 200 com imagem real da região da
fazenda, liga/desliga limpo sem vazar fonte/camada, sem erro de
console. (Um primeiro screenshot tirado logo após o clique mostrou só
o fundo sólido — não é bug, é só o tempo normal de carregamento da
imagem; esperar `map.once("idle")` confirma o render correto.)

**Bug de precisão — pontos de "Unidades" caindo em lugar errado
(2026-07-12)**: o Leo conferiu a camada "Unidades" (pontos de sede de
fazenda) no QGIS contra o `.shp` original e viu que o ponto aparecia
numa fazenda completamente diferente no visualizador. Causa raiz: tanto
`converterShapefileParaPmtiles` (`backend/src/routes/admin.js`, upload
de `.zip` no admin) quanto `pipeline/shp_para_pmtiles.sh` chamavam
`tippecanoe --maximum-zoom=g` — o "g" (guess) escolhe o maxzoom com
base no espaçamento entre as features, pra elas ficarem visualmente
distinguíveis; pra um dado **pouco denso** (poucos pontos bem
espaçados, ex: 2 sedes de unidade a ~80km uma da outra), o guess
escolheu maxzoom **0** (confirmado no log real do tippecanoe: "Choosing
a maxzoom of -z0 for features typically 271196 feet apart"). Isso não é
só "zoom baixo pra exibir" — o formato vector tile quantiza coordenadas
num grid inteiro por tile, e no zoom 0 esse grid tem ~9,7km de lado;
qualquer ponto dentro da mesma célula desse grid gigante é gravado com
a MESMA coordenada arredondada, literalmente perdendo a posição real
dentro do `.pmtiles` (não é bug de exibição do visualizador — o dado já
sai errado do tippecanoe). Confirmado isolando o problema: reconvertendo
os mesmos 2 pontos com `--maximum-zoom=16` (fixo, sem guess) em vez de
`g`, a coordenada de saída bateu com a de entrada na casa do metro;
`Talhões`/`Limites`/`Municipios`/`Malhas Viárias` não tiveram esse
sintoma extremo porque são mais densos (o guess escolheu 14/10 pra
eles, quantização de poucos metros, aceitável) — só a camada bem
esparsa (`Unidades`, maxzoom 0) ficou catastroficamente errada.
Corrigido trocando `--maximum-zoom=g` por `--maximum-zoom=16` fixo nos
dois lugares (admin.js e o script manual) — precisão de poucos metros
garantida não importa a densidade da feição (ponto/linha/polígono).
**Importante**: isso não conserta o arquivo já publicado — a
"Unidades" já enviada tem a posição errada permanentemente gravada no
`.pmtiles` (a informação original já foi perdida na conversão), então
precisa ser reenviada (mesmo `.zip` de origem) pela tela Gerenciar
camadas → Atualizar arquivo pra ser reconvertida com o maxzoom corrigido.
Backend precisou reiniciar pra pegar a mudança (`node src/server.js`
direto, sem `--watch`).

**Camadas de ponto ignoravam contorno por completo (2026-07-12)**: o Leo
reportou que "contorno" configurado no admin não tinha efeito nenhum
visível, e que desligar o preenchimento deveria deixar só o contorno
representando a feição — o que não acontecia. Causa: em
`adicionarCamada` (`Mapa.jsx`), camadas de **ponto** (`ehPonto`, ex:
"Unidades") só geravam um layer `circle` com `circle-color`/
`circle-radius` — `contorno.*` nunca era lido pra elas (só as camadas
de polígono, via `fillLayerId`/`lineLayerId` separados, já respeitavam
contorno). Corrigido adicionando `circle-stroke-color`/
`circle-stroke-width`/`circle-stroke-opacity` a partir de
`contorno.cor`/`largura`/`opacidade`, e usando `preenchimento.opacidade`
direto em `circle-opacity` (antes forçado a um mínimo de 0.75, o que
também impedia zerar o preenchimento). Como `circle-opacity` e
`circle-stroke-opacity` são propriedades independentes no MapLibre,
isso já basta pra zerar preenchimento e mostrar só o contorno (ou
vice-versa) num ponto.

Bug relacionado encontrado no mesmo lugar, no efeito "liga/desliga
camadas" (checkbox do painel CAMADAS, item 5 dos efeitos de `Mapa()`):
tinha um `if (!map.getLayer(info.fillLayerId)) continue` que pulava a
camada **inteira** quando ela não tinha `fillLayerId` — ou seja, o
checkbox de qualquer camada de ponto não fazia **nada** (bug
pré-existente, não só desta sessão). E pras camadas de polígono, a
linha do contorno tinha o "ligado" hardcoded em `line-opacity: 1`,
ignorando `contorno.opacidade` configurado (voltava sempre pra opacidade
máxima ao religar, nunca o valor real salvo). Corrigido tratando
fill/linha/círculo como três blocos independentes (só mexe no que
existe pra aquela camada) e guardando `opacidadeContorno` no retorno de
`adicionarCamada` (mesmo padrão de `opacidadePreenchimento` já
existente) pra usar como valor "ligado" real em vez de `1` fixo — vale
tanto pra `line-opacity` (polígono) quanto pra `circle-stroke-opacity`
(ponto). Verificado via Playwright: círculo com preenchimento
zerado/contorno vermelho configurado rendeu como anel vazado (não
sólido) sobre "Usina da Pedra"; desmarcar o checkbox de "Unidades"
agora zera `circle-opacity`/`circle-stroke-opacity` de verdade (antes
não fazia nada); remarcar restaura os valores configurados (não um "1"
genérico).

**Formas diferentes por categoria em camadas de ponto (2026-07-12)**:
implementado logo depois do bug acima, mesmo pedido do Leo. Decisão
(`AskUserQuestion`): só formas geométricas (círculo/quadrado/triângulo/
estrela — desenhadas em runtime via canvas, sem upload de ícone/sprite)
e por categoria de atributo (mesmo espírito do preenchimento
categorizado). Schema novo `simbolo` em `estilo_config`
(`{modo: "fixo"|"categorizado", forma, campo, categorias: [{valor,
forma}], formaSemCategoria}`), normalizado em `normalizarEstiloConfig`
com default `{modo:"fixo", forma:"circulo"}` — toda camada de ponto já
publicada continua exatamente como um círculo, sem precisar resalvar.

Trade-off técnico confirmado com o Leo antes de implementar: formas
diferentes de círculo só existem como ícone SDF (`symbol` + `icon-
image`, registrado em runtime via `desenharBitmapForma`/`map.addImage`
em `Mapa.jsx`, recolorido por feição com `icon-color`/`icon-halo-
color`) — e um ícone SDF só tem **uma** opacidade pro símbolo inteiro
(`icon-opacity`), diferente do círculo que tem `circle-opacity`/
`circle-stroke-opacity` independentes (ver bug de contorno acima).
Decisão aceita: só o círculo (modo fixo + forma "circulo", o default)
mantém fill/contorno 100% independentes; qualquer forma diferente ou
modo categorizado sempre aparece preenchida (contorno vira halo por
cima, com a opacidade do contorno embutida no próprio alpha da cor do
halo via `corHaloIcone` — não é totalmente independente, mas não é
"tudo ou nada" também). `usaIconeSimbolo(simbolo)` decide em
`adicionarCamada` qual dos dois caminhos usar; `tipoPonto` ("circle" |
"symbol") guardado no retorno da função pro efeito de liga/desliga
(item 5) saber qual nome de paint property chamar — `setPaintProperty`
com o nome errado pro tipo do layer lança exceção.

Bug de default encontrado ao implementar, corrigido antes de virar
regressão: remover o `Math.max(0.75, ...)` do bug de contorno acima
tirou também o "piso" que fazia qualquer ponto sem estilo configurado
aparecer como bolinha sólida — sem esse piso, a heurística de opacidade
compartilhada (`ehTalhao ? 0.35 : 0`) fazia QUALQUER ponto default
(`ehPonto` mas não `ehTalhao`) nascer com preenchimento 0 (só um
aneizinho fino, não mais a bolinha cheia de sempre). Corrigido
estendendo a própria heurística em vez de reintroduzir o floor:
`ehTalhao ? 0.35 : ehPonto ? 0.85 : 0` — precisou passar `ehPonto`
também pra `normalizarEstiloConfig` (novo parâmetro, os dois call sites
em `Mapa.jsx` e `AdminCamadas.jsx` atualizados).

`AdminCamadas.jsx` ganhou a seção "Símbolo (forma do ponto)" (só
aparece quando a camada selecionada é de ponto, detectado via
`detectarTipoGeometria` novo em `pmtilesValores.js` — mesma técnica de
tile-reading já usada por `lerValoresUnicos`/`lerMinMax`, com
escalonamento de zoom; `Mapa.jsx` mantém a própria versão já testada,
sem tocar nela) com seletor fixo/categorizado, botão "Gerar formas a
partir dos dados" (reaproveita `lerValoresUnicos`, mesmo padrão de
"Gerar categorias" de cor) e aviso inline quando a limitação de
opacidade combinada se aplica.

Lição de encoding reincidente (já registrada antes nesta sessão pro
pipeline de rótulos, aconteceu de novo aqui): testar com
`categorias: [{valor: "Usina Ibirá", ...}]` via heredoc/curl direto no
Bash corrompeu o "á" antes de chegar no banco — o `match` expression
salvo não batia com o valor real da feição (lido certinho do
`.pmtiles`), então caía sempre no fallback (`formaSemCategoria`).
**Não era bug de código** — confirmado gravando o payload de teste com
a tool `Write` (grava UTF-8 correto) e enviando com
`curl --data-binary @arquivo` (bytes crus, sem o Bash reinterpretar a
string) em vez de `-d '...'` inline; o quadrado apareceu certinho pra
"Usina Ibirá" depois disso. Vale repetir a regra já registrada: nunca
digitar acento/travessão direto num argumento de shell neste ambiente —
sempre passar por arquivo.

Bug relacionado encontrado ao testar zoom próximo com o satélite ligado
(mesma família do bug de overzoom do `.pmtiles` documentado acima, só
que do lado raster): tinha declarado `maxzoom: 19` na fonte da Esri
(o teto que a Esri anuncia globalmente), mas isso só existe de verdade
em áreas urbanas de alta resolução — em zona rural (fazenda), a
imagem real geralmente para bem antes disso. Pedir um z acima do que
existe não dá erro: a Esri devolve HTTP 200 com um tile-aviso "Map
data not yet available" desenhado como se fosse a própria imagem, e o
MapLibre não tem como saber que aquilo é só um placeholder — exibe
igual, achando que é foto de verdade, em vez de fazer overzoom
(ampliar o último tile que tinha imagem real). Corrigido baixando
`maxzoom` da fonte pra 17 (teto confiável pra a maioria das áreas
rurais globais); além dele o MapLibre amplia o último tile real
(mais desfocado, mas nunca o aviso). Verificado via Playwright: z20
antes mostrava o texto do aviso da Esri; depois, imagem real
(desfocada) do último zoom disponível.

**Menu lateral, busca por teclado, track log e importação temporária
(2026-07-12)**: leva de 5 melhorias pedidas pelo Leo, em ordem de
menor pro maior risco/escopo. Plano completo em
`docs/ROADMAP.md` (Fase 3.9); resumo técnico:

1. **Painel de camadas sempre recolhido**: `painelCamadasAberto` era
   `useState(() => matchMedia("(min-width: 641px)").matches)` (aberto
   no desktop, fechado no mobile) — virou `useState(false)` fixo, sem
   depender de viewport.
2. **Busca com teclado**: novo state `indiceDestacadoBusca` (default 0,
   resetado a cada tecla no campo). `onKeyDown` no input: `↑`/`↓` movem
   o destaque dentro dos limites de `resultadosBusca` (clamped a cada
   render, já que a lista recalcula a cada tecla e pode encolher);
   `Enter` confirma o destacado — sem nunca mexer nas setas, já
   seleciona o índice 0 (primeiro resultado) direto. Busca por
   código/nome de fazenda em si **já existia** desde 2026-07-08 (campo
   `buscavel` do índice já inclui `SECAO`) — não foi tocada.
3. **Menu lateral** (`frontend/src/components/MenuLateral.jsx`, novo):
   substitui os botões-texto Admin/Sair por um único botão circular
   (`.botao-circular`, novo) de Menu — abre uma sidebar
   (`position:fixed`, `translateX` + backdrop, mesmo idioma de
   fade/transform de `.painel-atributos`) com as 4 seções
   administrativas (só se `sessao.usuario.papel === "admin"`, reaproveita
   literalmente o array `SECOES`/ícones que moravam em `Admin.jsx`) e
   Sair fixo no rodapé. Decisão confirmada com o Leo: a sidebar só lista
   links — cada seção continua sendo a tela dedicada de sempre, não
   embutiu formulário nenhum dentro dela. `Admin.jsx` foi **removido**
   (tela-grade não existe mais); rota `/admin` em `App.jsx` agora
   redireciona pra `/admin/mapas`. As 4 telas de seção trocaram o link
   "← Admin" (apontava pra tela removida) por um botão "← Voltar"
   (`navigate(-1)` — funciona não importa se a sidebar foi aberta de
   `Inicio.jsx` ou de `Mapa.jsx`). `Mapa.jsx` também trocou o link-texto
   "Trocar mapa" por um botão circular (reaproveita o mesmo ícone de
   "mapas" do antigo `Admin.jsx`).
4. **Importação temporária de KML/Shapefile**
   (`frontend/src/lib/importadorTemporario.js`, novo — `@tmcw/togeojson`
   pra KML, `shpjs` pra zip de shapefile): nunca toca
   IndexedDB/backend, vive só em `useState` (`arquivoTemporario`) +
   uma fonte/3 layers do MapLibre (`fonte-temporaria`, filtradas por
   `["match", ["geometry-type"], [...], true, false]` — precisa de 3
   porque o arquivo importado pode ter qualquer tipo de geometria,
   diferente das camadas reais que já sabem o próprio tipo). Cor
   magenta fixa (sem editor de simbologia) sinaliza "isso é temporário".
   Entry própria em itálico na lista do painel de camadas, com botão
   remover — some completo ao dar reload na página (comportamento
   testado e confirmado).
5. **Track log** (`frontend/src/lib/trackLog.js`, novo): grava percurso
   via `navigator.geolocation.watchPosition` **independente** do
   `GeolocateControl` nativo (que só desenha o ponto azul sozinho, não
   expõe a posição como dado em nenhum lugar do código) — `watchId`
   guardado em ref, `clearWatch` ao parar ou ao desmontar o componente.
   Desenha uma `LineString` (fonte/camada próprias, vermelho sólido —
   distinto da medição laranja-tracejada e da importação magenta) via
   o mesmo idioma de "criar/destruir quando ganha ≥2 pontos" +
   "resync via `setData()` a cada ponto novo" já usado pela medição.
   Painel novo (`.painel-track`, canto inferior-esquerdo — medição e
   atributos já ocupam o direito) com distância ao vivo (reaproveita
   `@turf/length`, já era dependência) e, depois de parar, "Exportar
   KML"/"Limpar". Decisões confirmadas com o Leo antes de implementar:
   só exporta arquivo (sem tabela nova no banco, sem rota de backend,
   sem tela de admin pra ver percursos de todo mundo — usuário
   compartilha o KML por fora); só KML por agora (Shapefile fica pra
   depois); GPS só funciona com o app em primeiro plano (limitação de
   qualquer PWA, aceita).

   Duas descobertas de implementação, ambas resolvidas antes de fechar
   o item:
   - A lib óbvia pra exportar KML seria `tokml`, mas ela arrasta uma
     cadeia de dependências de **teste** abandonadas (`tap`,
     `uglify-js`, `minimist`, `burrito`, `bunker`, `runforcover`) com
     **3 vulnerabilidades críticas e 7 altas** no `npm audit` — mesmo
     não rodando no navegador (são devDependencies transitivas da lib,
     nunca entram no bundle), é lixo real de dependência num repo
     público. Como o caso de uso é só 1 `LineString`, o XML foi escrito
     à mão em `lib/trackLog.js` (templating simples, sem lib nenhuma) —
     `npm audit` volta pra 0 vulnerabilidades depois de remover `tokml`.
   - Testando com geolocalização mockada via Playwright
     (`context.setGeolocation`), um erro **transitório** de GPS
     (`POSITION_UNAVAILABLE`/`TIMEOUT` — comum em campo de verdade, ex:
     sob cobertura ruim) encerrava a gravação **por completo** na UI
     (`setGravandoPercurso(false)` incondicional no callback de erro),
     mas o `watchPosition` nativo **continuava rodando** por baixo
     (nunca chamava `clearWatch`) e seguia acumulando pontos escondido
     — usuário via "gravação parada", clicava em "Iniciar" de novo, e
     criava um **segundo** `watch` concorrente sem saber. Corrigido:
     só `erro.code === PERMISSION_DENIED` de fato para a gravação;
     `POSITION_UNAVAILABLE`/`TIMEOUT` só atualizam a mensagem de erro
     (auto-limpa no próximo ponto bem-sucedido) e a gravação continua
     normalmente.

Testado via Playwright, incluindo a suíte offline de sempre (build de
produção + `vite preview` + `context.setOffline`): painel recolhido,
sidebar (com as 4 seções pro admin) e busca com Enter funcionando
100% sem rede.

**Deploy de produção 100% em nuvem (2026-07-12)**: fecha o pendente
registrado desde a Fase 1 ("decidir hospedagem de produção — backend
rodando no PC de alguém não é sustentável"). Chegou aqui por eliminação
ao longo da conversa: sem acesso admin no PC que seria servidor, sem
acesso ao roteador (sem porta 80/443 aberta), e por fim confirmado que
nem dá pra rodar programa nenhum não aprovado pelo TI ali — nenhuma
alternativa sem-admin (Scoop, executável portátil, Cloudflare Tunnel)
sobrevive a esse último bloqueio. Oracle Cloud Always Free também foi
descartado (Leo relatou que não é mais uma oferta confiável). Decisão
final: **serviços gerenciados free-tier desacoplados**, cada um
substituível independentemente:

- **Frontend**: GitHub Pages (grátis, HTTPS automático, repo já é
  público). Build via `.github/workflows/deploy-frontend.yml` (novo),
  dispara em push em `frontend/**` ou manual.
- **Backend**: Render (free Web Service) — sem Docker, buildpack Node
  puro.
- **Banco**: Neon (free tier Postgres) — ao contrário do free tier do
  Render, não expira/apaga o banco.
- **Arquivos publicados (`.pmtiles`)**: Cloudflare R2 (free tier,
  10GB, sem custo de egress).

Trade-off aceito: o backend no Render "dorme" depois de ~15min sem
uso — primeiro acesso do dia demora uns 30-60s pra acordar.

**Mudança de código real, a única desta leva**: armazenamento trocou de
disco local (`STORAGE_DIR`, `multer.diskStorage`) pra R2 — um host
free-tier não garante disco persistente entre deploys/restarts. Novo
`backend/src/lib/storage.js` (wrapper fino sobre `@aws-sdk/client-s3` +
`@aws-sdk/s3-request-presigner`, R2 é compatível com a API S3).
`admin.js`/`mapas.js` passam a usar `multer.memoryStorage()` (arquivo
só existe em `req.file.buffer`, nunca toca disco) — download deixou de
ser `res.sendFile`/`res.download` e virou `res.redirect` pra uma URL
assinada do R2 (expira em minutos), **mantendo o registro do log de
download antes do redirect** (é o núcleo do valor do projeto). Backup
leve de versão anterior (antes um `fs.rename` local) virou uma cópia
server-side no R2 (`CopyObjectCommand`) antes de sobrescrever — mesma
garantia de não perder o arquivo anterior de imediato.
`converterShapefileParaPmtiles` (conversão de `.zip` via
`ogr2ogr`/`tippecanoe`) continua escrevendo num diretório temporário
local (`os.tmpdir()`) — os binários exigem um caminho de disco de
verdade pra rodar via `execFile` — só o resultado final sobe pro R2 em
vez de ficar em `STORAGE_DIR` (que não existe mais).

**Fora do escopo desta leva**: upload de `.zip` (conversão shapefile
no próprio backend) não funciona no Render sem uma imagem Docker
customizada com `tippecanoe`/`ogr2ogr` instalados (buildpack Node puro
não tem esses binários) — falha com mensagem clara (`ENOENT`), não
derruba o servidor. Fluxo recomendado por agora: continuar convertendo
`.shp`→`.pmtiles` localmente (Cygwin, já estabelecido o resto da
sessão) e publicar o `.pmtiles` pronto pela tela de Gerenciar Camadas.
Dockerizar pra suportar isso em produção fica pra uma sessão futura.

**Bug real encontrado testando (não relacionado a R2 propriamente, mas
só ficou óbvio por causa dele)**: o Express 4 não captura sozinho uma
Promise rejeitada dentro de um handler `async` — vira uma "unhandled
rejection" e **derruba o processo Node inteiro**, não só aquela
requisição. Confirmado batendo numa rota de download sem `R2_*`
configurado ainda: o servidor caiu de verdade (não voltou um erro
HTTP). Essa lacuna já existia pra **qualquer** rota (uma falha
transitória do Postgres já causaria o mesmo crash antes desta sessão),
só ficou muito mais provável de acontecer agora que toda rota de
arquivo depende de uma chamada de rede externa (R2) — e importa de
verdade numa cloud de produção, onde uma falha transitória vai
acontecer mais cedo ou mais tarde. Corrigido com `express-async-errors`
(zero dependências — é só um monkey-patch de ~50 linhas no Router do
Express, sem risco de cadeia vulnerável) importado no topo de
`app.js`, mais um error-handler final na `app` (antes só existia um
específico dentro de `adminRouter`, cobrindo só as rotas dele) —
devolve um 500 JSON limpo e loga no servidor, em vez de um crash.
Verificado: a mesma requisição que antes derrubava o processo agora
volta um erro HTTP normal, e o `/health` continua respondendo depois.

**GitHub Pages é uma "project page"** (`usuário.github.io/geomap/`,
sem domínio próprio) — precisou de dois ajustes que não seriam
necessários com um domínio dedicado: `vite.config.js` ganhou um `base`
condicional (`/geomap/` só quando `GITHUB_PAGES=true`, setado só pelo
workflow — dev/build/preview local continuam em `/`, sem mudar nada do
fluxo já testado) aplicado também ao `start_url`/`scope` do manifest
PWA; `App.jsx` ganhou `basename={import.meta.env.BASE_URL}` no
`BrowserRouter` (sem isso as rotas não bateriam com a URL real).
GitHub Pages não faz rewrite de servidor pra SPA — F5 (ou link direto)
numa rota profunda como `/mapa/3` viraria um 404 de verdade; resolvido
copiando `index.html` pra `404.html` no workflow (GitHub serve esse
conteúdo pra qualquer path não encontrado, com status 404 mas o app
shell carrega igual e o React Router assume a partir daí) — mais
simples que o truque clássico de redirect via querystring
(spa-github-pages), suficiente pro caso de uso real desta PWA
(relançar pelo ícone sempre cai no `start_url` raiz; só o F5 numa rota
profunda ou link compartilhado dependia disso).

Testado localmente ponta a ponta antes do deploy de verdade: build com
`GITHUB_PAGES=true` gera asset paths e manifest corretos sob
`/geomap/`; `vite preview` servindo esse build confirma via Playwright
que a tela de login carrega em `/geomap/login`, o service worker
registra com `scope: "http://localhost:4173/geomap/"` (não `/`), e
navegação direta pra uma rota profunda funciona — sem erro de console.
Backend testado contra o Postgres local de sempre (sem SSL, `PGSSL`
vazio) confirmando que o `pool.js` novo não quebrou nada; a chamada
real ao R2 só pôde ser testada quanto ao **tratamento de erro**
(credenciais ainda não configuradas nesta sessão — Neon/R2/Render
ficam pro Leo criar as contas, não dá pra automatizar) — falta testar
upload/download de verdade assim que as credenciais existirem.

**Deploy de verdade executado (2026-07-13)**: a leva acima era só o
código pronto — o deploy de fato (contas criadas pelo Leo, testado
ponta a ponta) rolou numa sessão seguinte e revelou vários problemas
reais que só aparecem em produção de verdade, nenhum previsível só
testando local:

- **`origin/master` estava muito mais atrasado do que a máquina
  local** — 16 commits de sessões anteriores nunca tinham sido
  publicados (todo o painel de admin, busca, medição, etc.), então o
  Render ficou rodando código antigo o suficiente pra crashar com
  `error: column m.versao does not exist` (schema de antes da migração
  de múltiplos mapas). Lição: antes de configurar qualquer serviço de
  deploy contínuo (Render, GitHub Pages), confirmar que `git log
  origin/master..HEAD` está vazio — senão o deploy "funciona" mas roda
  uma versão desatualizada sem nenhum aviso claro.
- **Push rejeitado por escopo de OAuth**: o token do `gh` usado pra
  autenticar o `git push` não tinha o escopo `workflow` — GitHub
  bloqueia push de qualquer app OAuth que crie/altere arquivo em
  `.github/workflows/*` sem esse escopo específico (proteção contra
  apps com acesso só ao código mexerem sozinhos em CI/CD). Resolvido
  com `gh auth refresh -h github.com -s workflow` (fluxo de aprovação
  pelo navegador — na prática precisou de duas tentativas, a primeira
  travou o terminal sem completar). Workaround usado enquanto isso não
  tava resolvido: removeu o arquivo do commit (`git rm --cached`),
  publicou o resto, e subiu o workflow numa leva separada depois.
- **Workflow nunca disparava**: `deploy-frontend.yml` tinha
  `branches: [main]`, mas o repositório usa `master` como branch
  principal — erro meu, só percebido checando `gh run list` e vendo
  zero execuções apesar do arquivo estar publicado. `gh workflow
  list`/`gh run list --workflow=<nome>` é o jeito rápido de confirmar
  se um workflow novo disparou ou não, em vez de assumir que disparou
  só por ter feito push.
- **Migration 006 cria mapas fixos mesmo num banco vazio**: ela foi
  escrita assumindo que ia rodar sobre um banco de dev já populado
  (fazendo backfill de dado existente), então tem um `INSERT INTO
  mapas` incondicional com nomes hardcoded ("Usina da Pedra", "Projeto
  restrito (teste)", "Sem projeto") — rodando num Neon vazio do zero,
  esses 3 registros nascem mesmo sem nenhuma camada real. Não é bug
  (não atrapalha nada, `camadaCount` fica 0), mas registrado aqui pra
  não confundir uma sessão futura vendo mapas "fantasma" — na prática
  ajudou (o mapa "Usina da Pedra" já nasceu com o nome certo, sem
  precisar criar na mão).
- **CORS por método**: `curl -I` (HEAD) contra uma URL assinada do S3/R2
  retorna 403 — a assinatura da URL é específica pro método HTTP usado
  em `getSignedUrl`, então testar com um método diferente do que foi
  assinado (GET) sempre falha, não é erro de configuração.
- **Redirect (302) pra URL assinada do R2 não sobreviveu no navegador
  real, mesmo com CORS do bucket configurado e confirmado via `curl`**
  — o Chromium bloqueava consistentemente com "No
  Access-Control-Allow-Origin header" numa cadeia de redirect
  envolvendo 3 domínios diferentes (`lmalerbo.github.io` →
  `geomap-vr68.onrender.com` → `r2.cloudflarestorage.com`), mesmo
  depois de configurar `PutBucketCorsCommand` no bucket e confirmar via
  `curl -H "Origin: ..."` que o header vinha certo. Causa raiz exata
  não isolada (suspeita forte: alguma interceptação de TLS/rede local
  da máquina de teste mexendo em headers de resposta só pro tráfego do
  Chromium, não pro `curl`) — mas em vez de insistir em diagnosticar
  isso, a solução foi trocar de arquitetura: `GET
  /admin/camadas/:id/arquivo` e `GET /camadas/:id/download` agora
  fazem **streaming direto do R2** (`GetObjectCommand` +
  `objeto.Body.pipe(res)`) em vez de redirecionar — o navegador só fala
  com o próprio domínio do backend (que já tem CORS aberto,
  `app.use(cors())`), eliminando a dependência de CORS de terceiro por
  completo. `s3-request-presigner` removido do `package.json` (não é
  mais usado). Mais simples e mais robusto do que insistir em fazer o
  redirect funcionar, ao custo de mais tráfego passando pelo Render
  (aceitável pro volume de uso real do projeto).
- **Corrupção de encoding reincidente, de novo** (mesma lição já
  registrada duas vezes antes nesta sessão pra rótulos e formas de
  ponto): um script bash usado pra reenviar as camadas pra produção
  passava o nome de cada camada por uma variável de shell (array +
  `IFS='|' read`) antes de mandar via `curl -F "nome=$nome"` — 3 nomes
  acentuados ("Malhas Viárias", "Talhões", "Pontos de Captação")
  chegaram no banco de produção com o caractere de substituição Unicode
  (`�`, bytes `ef bf bd`) no lugar do acento. Confirmado
  inspecionando os bytes crus (`Buffer.from(nome, 'utf8')`), não só a
  exibição no terminal. Corrigido re-enviando cada nome via `PUT
  /admin/camadas/:id` com `--data-binary @arquivo.json` (arquivo escrito
  pela tool `Write`, nunca pelo bash) — o mesmo padrão seguro já
  estabelecido, e a mesma regra: **nunca deixar acento passar por
  variável de shell**, nem dentro de um array bash, mesmo quando o
  arquivo-fonte do script foi salvo em UTF-8 correto.
- **Segredos em `.env` merecem cuidado mesmo fora do git**: durante o
  processo, um token de acesso pessoal do GitHub foi colado por engano
  na variável errada dentro de `backend/.env` (nunca commitado — `.env`
  está no `.gitignore`, confirmado via `git log --all -- backend/.env`
  vazio — mas removido mesmo assim). Também: nunca passar senha/token
  como argumento de linha de comando (fica visível pra outros processos
  via `ps`/listagem de processos) — usado um arquivo temporário
  (apagado logo depois) como canal seguro pra um script de automação
  ler a senha de admin sem expô-la no comando em si.

**Storybook (2026-07-13)**: adicionado em `frontend/` pra isolar
componentes visuais (estados, transições) sem precisar logar/rodar
backend+PostgreSQL — pedido do Leo especificamente pra poder testar
estados e animações isoladas. `npx storybook@latest init` detectou
sozinho o projeto como `react-vite` e configurou tudo; boilerplate de
exemplo (`src/stories/Button|Header|Page.*`) foi removido, mantendo só
a estrutura real do projeto. `npm run storybook` sobe em
`localhost:6006`.

Duas coisas exigem atenção em qualquer story nova:

1. `.storybook/preview.jsx` importa `../src/index.css` (o único CSS
   global do projeto, sem CSS Modules/styled-components) — sem isso
   todo componente renderiza sem nenhum estilo.
2. Componentes que usam `<Link>`/`useNavigate` (`react-router-dom`)
   precisam de um decorator com `<MemoryRouter>` por baixo, senão
   quebram ao montar — ver `decorators: [ComRouter]` em
   `MenuLateral.stories.jsx` (primeira story criada, serve de modelo).
   Pro mesmo motivo, componentes que dependem de `AuthContext`
   (`useAuth()`) vão precisar de um decorator equivalente envolvendo
   com `<AuthContext.Provider value={...}>` quando ganharem story.

Story de exemplo (`MenuLateral.stories.jsx`) cobre os 3 estados fixos
(fechado, aberto usuário comum, aberto admin) mais uma story
interativa (`TransicaoAoVivo`) com um botão fora do componente que liga/
desliga `aberto` de verdade — é o jeito de ver a transição de
slide+fade (`transform`/`opacity` com `transition`, `index.css`) rodar
de ponta a ponta, não só o estado final congelado. Verificado via
Playwright direto contra `iframe.html?id=<story-id>` (mais confiável
pra screenshot que a UI do Storybook em si) — as 4 stories aparecem no
`index.json`, o `.aberto`/os 4 itens de admin renderizam certo, zero
erro de console.

Detalhe de ambiente: o Storybook 10 exige Node 20.19+/22.12+, mas o
Node global desta máquina é 22.11.0 (instalado direto do instalador,
não via Scoop) — atualizar ele afetaria todos os outros projetos.
Resolvido instalando `fnm` via Scoop (mesmo padrão sem-admin já usado
pra Postgres/Cygwin) + Node 22.12.0 isolado, fixado em
`frontend/.nvmrc`. Rodar `fnm use` (ou deixar o shell pegar via
`.nvmrc`, se tiver o hook do `fnm` no profile) antes de `npm run
storybook`/`npm run dev`/etc nesta máquina — o Node global (v22.11.0)
continua sendo o default fora desse diretório.

**Duplicar mapa (2026-07-13)**: o Leo não tinha os `.pmtiles` reais à mão
pra reenviar todos os mapas de teste/produção depois do deploy, e pediu
uma função pra facilitar criar um mapa novo a partir de um existente.
`POST /admin/mapas/:id/duplicar` (`backend/src/routes/admin.js`) copia o
registro de `mapas` (nome vira `"<nome original> (cópia)"`, mesma
`descricao`), as `permissoes` (mesmos grupos) e cada `camada` do mapa
origem (mesmo nome/versao/categoria/atributos_config/estilo_config, só
o `arquivo_path` muda pra uma chave nova) — o arquivo em si é duplicado
no R2 via cópia server-side (`CopyObjectCommand`, sem baixar/reenviar),
nova função `duplicarArquivo` em `storage.js` que **não** engole erro
(diferente de `copiarArquivo`, usada pro backup `.bak-`, que é
tolerante a arquivo ausente — aqui o arquivo de origem tem que existir
de verdade, senão é um 500 claro em vez de criar uma camada órfã
apontando pra uma chave inexistente no bucket). Botão "Duplicar" novo
em `AdminMapas.jsx`, ao lado de "Editar"/"Remover".

Testado em produção com o padrão seguro já estabelecido nesta sessão
(nunca testar contra dado real): criado um mapa descartável vazio
(`__teste_duplicar__`), duplicado com sucesso (cópia saiu com nome/
descrição/grupos corretos), depois os dois apagados. Achado no
processo: a primeira tentativa de teste bateu 404 genérico do Express
("Cannot POST") — não era bug da rota em si, era o **Render não ter
auto-implantado o commit ainda** (confirmado comparando os logs do
serviço: o último deploy real era de um commit anterior, sem nenhum
evento "Deploying..." novo apesar do push já estar no `origin/master`
há vários minutos). Resolvido desligando/religando o Auto-Deploy no
dashboard do Render + disparo manual — depois disso o teste passou
normalmente. Lição: um 404 novo em produção logo depois de um push nem
sempre é bug de código — vale checar os logs do serviço antes de
assumir isso, principalmente no plano free do Render, onde o
auto-deploy pode não disparar de forma confiável.

**Auditoria de frontend + correções via Lighthouse (2026-07-13)**: o Leo
pediu uma auditoria estruturada (`RELATORIO_AUDITORIA_FRONTEND.md`, só
leitura — UX/estados, CSS, animações, performance/estado) e depois
rodou o Lighthouse (desktop+mobile, snapshot+timespan+navegação) contra
a produção real (`/mapa/1`) e pediu pra aplicar as correções.

Achado mais sério, só visível rodando Lighthouse contra a URL real de
produção (não aparecia testando local): **rótulos do mapa (número do
talhão, nome da fazenda) provavelmente não renderizavam em produção
nenhuma**. Causa: `glyphs: "/fonts/{fontstack}/{range}.pbf"` em
`Mapa.jsx` era um caminho absoluto sem o prefixo `/geomap/` do GitHub
Pages (project page) — o arquivo existe (`public/fonts/Noto Sans
Regular/0-255.pbf`), mas o navegador pedia
`lmalerbo.github.io/fonts/...` (404) em vez de
`lmalerbo.github.io/geomap/fonts/...`. Mesma classe de bug já resolvida
em outros lugares (`base` do `vite.config.js`, `basename` do
`BrowserRouter`) — essa string específica dentro de `Mapa.jsx` tinha
ficado de fora por ser montada em runtime, não em config de build.
Corrigido trocando pro template `` `${import.meta.env.BASE_URL}fonts/...` ``.

Outras correções aplicadas a partir dos dois relatórios:

- `index.html`: `lang="en"` → `lang="pt-BR"` (app inteiro é em
  português, só não tinha sido setado desde o `create-vite` inicial),
  `<meta name="description">` (SEO), e um `Content-Security-Policy` via
  `<meta http-equiv>` cobrindo script/style/img/connect/worker-src.
- `vite.config.js`: `build.sourcemap: true` (Lighthouse reclamou de
  "Missing source maps" — não custa nada em produção, só carrega se o
  devtools estiver aberto).
- `Mapa.jsx`: `aria-label` nos 3 botões "fechar" (medição, track,
  atributos) que não tinham — achado do próprio
  `RELATORIO_AUDITORIA_FRONTEND.md`, não do Lighthouse (o Lighthouse só
  lista isso como item "verificar manualmente", não reprova
  automaticamente, porque os painéis não estavam abertos no momento do
  scan).

**Limitação de hosting registrada, não corrigível nesta leva**: os
itens "High" de Trust & Safety do Lighthouse (sem CSP em modo
enforcement — parcialmente mitigado pelo meta tag acima —, sem COOP,
sem X-Frame-Options/frame-ancestors, sem HSTS com
`includeSubDomains`/`preload`) exigem **cabeçalho HTTP de verdade**, e
GitHub Pages não permite configurar cabeçalhos customizados (sem
servidor próprio ou um CDN na frente, ex: Cloudflare, fora do escopo
atual). Um `<meta http-equiv="Content-Security-Policy">` cobre boa
parte do valor de CSP mas não pode usar `frame-ancestors` nem
`report-uri`/`sandbox` (só válidos via header) — então clickjacking
(XFO/frame-ancestors) e COOP continuam sem mitigação possível enquanto
o front for GitHub Pages puro. Também não corrigido (maior escopo,
risco maior): o achado de performance "Reduce unused JavaScript" (~230
KiB do bundle de 443 KiB não usados no primeiro load, majoritariamente
MapLibre GL) — precisaria de code-splitting via `import()` dinâmico,
não uma correção pontual segura de aplicar sem testar a fundo.

Testado via Playwright contra o build real de produção
(`GITHUB_PAGES=true`, `VITE_API_URL` apontando pro backend real) — mas
**não** via `vite preview` (ver detalhe de ambiente abaixo), e sim via
um servidor estático mínimo escrito em Node (`http` puro, sem lib), pra
bater mais fiel com o GitHub Pages de verdade. Confirmado: `.js`/`.css`/
`.pbf` (fonte) carregam com 200 sob `/geomap/`, zero erro de CSP no
console, e o CSP novo não bloqueia a chamada real pro backend (a
requisição chegou no Render de verdade — voltou 401 porque a senha
temporária gerada mais cedo nesta sessão já não era mais válida, não
por causa do CSP). Não foi possível validar o fluxo autenticado
completo (sync + mapa renderizando) por falta de credencial válida —
fica pro Leo confirmar depois do deploy.

Detalhe de ambiente descoberto no processo: `vite preview` (Vite
6.4.3) devolve **404 pra qualquer requisição com o header
`Sec-Fetch-Dest: script`** — exatamente o que todo `<script
type="module" src="...">` real manda — mesmo o arquivo existindo em
disco (confirmado: `curl` sem esse header pega 200 no mesmo arquivo).
Não é bug deste projeto nem tem relação com o CSP novo — é um
middleware de segurança do próprio `vite preview` (não existe no
GitHub Pages, que é um servidor estático burro) — por isso o teste
final usou um servidor estático próprio em vez de `vite preview`. Vale
lembrar disso numa sessão futura antes de gastar tempo debugando "por
que só o bundle JS dá 404 e o CSS não".

**Segunda leva da auditoria, itens Médio/Baixo do relatório
(2026-07-13)**: o Leo pediu pra fazer "tudo, até o refactor maior" —
essa entrada cobre a parte de UX/CSS (a parte de performance/arquitetura
de `Mapa.jsx` fica em entradas seguintes). CDN pra COOP/XFO/HSTS
completo ficou de fora por decisão do Leo (`AskUserQuestion` — exige
domínio próprio, que ele não tem hoje; fica documentado como pendência
de infra).

- Cores de ferramenta (medição/track/temporária/destaque de grupo/
  marcador de seleção/fundo padrão do mapa) centralizadas em
  `lib/coresFerramentas.js` — antes espalhadas em literais hex direto
  no meio de `Mapa.jsx`.
- Novo `.painel-flutuante` (classe CSS base) compartilhado pelos 3
  painéis flutuantes do mapa (atributos/medição/track), que antes
  duplicavam a mesma declaração de posição/fundo/borda/sombra cada um.
  Os 3 agora ficam sempre montados no DOM (antes medição/track eram
  `{condição && (...)}`) e alternam a classe `.aberto`, mesmo padrão
  que só o painel de atributos tinha — os outros dois ganharam
  transição de **fechamento** de verdade (antes só abriam com fade,
  somiam instantâneo).
- Bug real encontrado nesse meio-tempo: o botão "fechar" do painel de
  track nunca teve estilo próprio (`.painel-track .fechar` não
  existia) — renderizava como o botão verde cheio padrão (`button,
  .botao` global) em vez do "×" discreto no canto que os outros dois
  painéis sempre tiveram. Resolvido de graça pela extração de
  `.painel-flutuante .fechar` compartilhado.
- `.form-login` com `width: min(320px, calc(100vw - 32px))` em vez de
  `320px` fixo (evitava overflow em telas muito estreitas).
- Spinner de carregamento inicial (`<span className="spinner">`, mesmo
  padrão de `Mapa.jsx`/`Inicio.jsx`) adicionado nas 3 telas
  administrativas que não tinham (`AdminMapas`, `AdminUsuarios`,
  `AdminEstatisticas`).
- `.linha-camada` ganhou `:hover`, consistente com os outros itens de
  lista clicáveis do painel de camadas.
- Botão "gravando" do track log ganhou uma pulsação sutil
  (`box-shadow` em `@keyframes`) — antes era estático, sem nenhuma
  pista visual de "isso está ao vivo" além do texto.
- **Falha de camada surfaceada pro usuário** (item Alto do relatório):
  novo state `errosCamada` (`{ [id]: mensagem }`) em `Mapa.jsx` —
  quando `adicionarCamada` lança exceção (estilo malformado, metadata
  inesperada), a linha da camada no painel ganha um ícone `⚠` com
  `title`/`aria-label` explicando, em vez de só sumir do mapa sem
  nenhuma pista (o `try/catch` que evita derrubar as outras camadas já
  existia; só faltava mostrar o erro em algum lugar visível).
- Breakpoint de tablet (641–899px, item Médio do relatório) **verificado,
  não corrigido** — testado via Playwright em viewport 768×1024 (tela
  inicial, mapa, as 4 telas de admin): zero overflow horizontal em
  qualquer uma. Era uma suspeita registrada sem evidência concreta no
  relatório original; confirmado que o layout flexível já resolve
  sozinho, sem precisar de breakpoint novo.

**Bug real que eu mesmo introduzi com a CSP da leva anterior, achado
testando esta leva**: a CSP (meta tag) tinha `connect-src` hardcoded só
com o domínio de produção (`geomap-vr68.onrender.com`) — funcionava em
produção mas **quebrava o login em dev local** (`localhost:3000`
bloqueado pela própria CSP). E mesmo corrigindo isso, sobrou um segundo
problema: `script-src 'self'` (sem `unsafe-inline`) bloqueia o próprio
`<script type="module">` inline que o Vite injeta no `index.html` em
modo dev pro Fast Refresh — isso não existe no build de produção (que
só gera `<script src>` externo), então só quebra em dev. Corrigido
movendo a CSP de um `<meta>` estático em `index.html` pra um plugin
Vite (`injetarCsp` em `vite.config.js`) que monta o `connect-src` a
partir do `VITE_API_URL` de verdade (`localhost:3000` por padrão,
sobrescrito em produção) e libera `'unsafe-inline'` em `script-src`
**só** quando `command === "serve"` (dev), nunca no build. Lição: CSP
tem que ser testada tanto em build de produção quanto em dev local
antes de considerar "pronta" — os dois ambientes têm necessidades
diferentes o bastante pra uma CSP estática só servir um dos dois.

**Refactor de `Mapa.jsx` em hooks (2026-07-13)**: item Médio do
relatório (componente de 1684 linhas, sem `useMemo`/`useCallback`).
Extraídas 3 ferramentas independentes pra `frontend/src/hooks/`:
`useMedicao.js`, `useTrackLog.js`, `useImportacaoTemporaria.js` — cada
uma leva consigo o próprio state, efeitos (criar/destruir source+layers
no MapLibre) e funções, recebendo só `mapRef`/`mapaPronto` de fora (o
mapa em si continua sendo criado uma única vez em `Mapa.jsx`, os hooks
só desenham em cima dele). `Mapa.jsx` caiu de 1684 pra 1428 linhas;
`useMedicao` precisou de um callback `aoIniciar` (fecha o painel de
atributos quando a medição liga — única dependência cruzada de verdade
entre essas ferramentas e o resto do componente).

**`useBuscaMapa` deliberadamente NÃO extraído** — ao contrário das
outras três, o índice de busca é construído dentro do próprio efeito
que carrega as camadas (`aplicar()`, o antigo efeito 4), lendo os
`.pmtiles` já baixados assim que uma camada muda de verdade. Extrair
isso limpo exigiria também mexer nesse efeito (o mais crítico e mais
testado do arquivo, com histórico de bugs sutis documentado nesta
sessão inteira) — risco maior que o benefício por agora. Fica pra uma
sessão futura, com mais tempo pra validar a fundo.

Testado localmente contra produção real (login com o usuário do Leo,
autorizado por ele — `Usina da Pedra`, 6 camadas de verdade): mapa
carrega, medição abre/fecha e calcula distância corretamente (`44.97
km` num teste com 3 pontos clicados), track log grava/para (botão
pulsando durante a gravação, confirmando que a animação da leva
anterior sobreviveu à extração), painel de camadas e atributos sem
regressão, zero erro de console. Não foi testado o fluxo de importação
de arquivo (KML/Shapefile) de ponta a ponta — exigiria construir um
arquivo sintético só pra isso; o código é uma extração literal (mesma
lógica, só movida de lugar), risco residual baixo.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
