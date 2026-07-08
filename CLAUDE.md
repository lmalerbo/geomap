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

MVP da Fase 1 completo e testado de ponta a ponta:

- **Repositório**: github.com/lmalerbo/geomap.
- **Pipeline**: `.shp` sintético → `ogr2ogr` → `tippecanoe` → `.pmtiles`,
  validado via GitHub Actions (runner Linux, já que `tippecanoe` não
  compila no Windows).
- **Backend**: tabelas do `docs/SCHEMA_BANCO.md`, `POST /login`
  (JWT/bcrypt), `GET /mapas` (catálogo filtrado por grupo) e
  `GET /mapas/:id/download` (confere permissão de novo e grava log).
  Testado localmente contra PostgreSQL real, incluindo mapa fora de
  permissão (404).
- **Frontend/PWA**: React + Vite. Só duas telas: login e mapa — **sem
  catálogo visível**. `src/lib/sync.js` sincroniza os mapas permitidos em
  segundo plano (sem botão "baixar"), comparando `versao` local x remota.
  Cada mapa vira uma camada do mesmo `MapLibre.Map` (fonte + fill + linha),
  com painel de liga/desliga por camada; clique consolidado
  (`queryRenderedFeatures` em todas as camadas visíveis) identifica de
  qual camada veio a feição clicada. MapLibre lê `.pmtiles` do IndexedDB
  via `Source` customizado (`BlobSource`, sem range request HTTP), nome
  da camada vetorial lido do metadata (`vector_layers[0].id`, nunca
  hardcoded), service worker (Workbox) cacheando o app shell. Testado no
  navegador via Playwright, **incluindo offline real** (rede desligada de
  verdade: sincronização, camadas e clique com atributos todos
  funcionando sem nenhuma chamada de rede).

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

Falta: painel de upload de mapas (Fase 3), telas de erro/loading mais
refinadas, ícones PNG do manifest (hoje só o favicon SVG), decidir hospedagem
de produção (backend rodando no PC de alguém não é sustentável — avaliado
Oracle Cloud Always Free como opção, adiado). Ver `docs/ROADMAP.md` para o
checklist completo.

## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- For codebase questions, first run `graphify query "<question>"` when graphify-out/graph.json exists. Use `graphify path "<A>" "<B>"` for relationships and `graphify explain "<concept>"` for focused concepts. These return a scoped subgraph, usually much smaller than GRAPH_REPORT.md or raw grep output.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when query/path/explain do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
