# CLAUDE.md — GeoPortal (nome provisório, renomeie à vontade)

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

Falta: painel de upload de mapas (Fase 3), telas de erro/loading mais
refinadas, ícones PNG do manifest (hoje só o favicon SVG), decidir hospedagem
de produção (backend rodando no PC de alguém não é sustentável — avaliado
Oracle Cloud Always Free como opção, adiado). Ver `docs/ROADMAP.md` para o
checklist completo.
