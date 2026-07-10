# Roadmap — GeoMap

## Fase 0 — Preparação (antes de codar)

- [x] Decidir stack do backend definitivamente (Node/Express vs FastAPI) —
      Node/Express
- [x] Escolher 1 `.shp` real (ou sintético) de um talhão pra usar como dado
      de desenvolvimento — nunca dado sensível de verdade no repositório
- [x] Instalar `tippecanoe` no ambiente de desenvolvimento — via GitHub
      Actions (runner Linux), não compila no Windows
- [x] Criar repositório Git (mesmo padrão dos outros projetos do Leo)

## Fase 1 — MVP (visualizar + identificar atributos, offline)

- [x] Pipeline: script que roda `tippecanoe` sobre o `.shp` de teste e gera
      um `.pmtiles`
- [x] Backend: tabelas do `docs/SCHEMA_BANCO.md` criadas no PostgreSQL
- [x] Backend: endpoint de login (JWT + bcrypt)
- [x] Backend: endpoint de catálogo (retorna só mapas do grupo do usuário)
- [x] Backend: endpoint de download do `.pmtiles` (registra log)
- [x] Frontend: tela de login
- [x] Frontend: ~~tela de catálogo~~ — revisado: sem tela de catálogo,
      login leva direto pro mapa (ver CLAUDE.md, decisão de 2026-07-08)
- [x] Frontend: ~~botão "baixar mapa"~~ — revisado: sincronização
      automática em segundo plano (`src/lib/sync.js`), salva `.pmtiles`
      no IndexedDB sem interação do usuário
- [x] Frontend: visualizador MapLibre GL JS lendo o `.pmtiles` do IndexedDB,
      cada mapa permitido como uma camada com controle de liga/desliga
- [x] Frontend: clique num talhão mostra atributos (painel), identifica a
      camada de origem quando há múltiplas camadas sobrepostas
- [x] PWA: service worker cacheando o app shell (funciona offline pra abrir)
- [x] Teste real: baixar o mapa com internet, desligar o Wi-Fi/dados, reabrir
      o app e confirmar que o mapa e os atributos funcionam normalmente —
      validado via Playwright (`context.setOffline`, que bloqueia toda
      rede a nível de browser); vale repetir manualmente em modo avião
      num dispositivo real antes de considerar produção-ready

## Fase 2 — Funcionalidades de uso (depois do MVP validado)

- [x] Medição de distância/área (Turf.js) (2026-07-10)
- [x] Busca por atributo (nome do talhão, fazenda) (2026-07-08)
- [x] Legenda dinâmica por camada (2026-07-10)
- [x] "Minha localização" (Geolocation API) — funciona offline também
      (já estava pronto desde a leva de UX inspirada no CarryMap,
      2026-07-08 — só faltava marcar aqui)
- [~] Bookmarks de extensão do mapa — avaliado e **não implementado**
      (2026-07-10): sem um caso de uso concreto validado (o próprio Leo
      questionou o valor do recurso), não fazia sentido construir. Fica
      registrado aqui pra não reaparecer como pendência esquecida — se
      surgir uma necessidade real de campo, volta pra discussão.

## Fase 3 — Administração

- [x] Papel admin/usuario + painel protegido (2026-07-08)
- [x] Editar quais atributos aparecem por camada e em que ordem (2026-07-08)
- [x] Editar camadas: simbologia, rótulo, nomenclatura (2026-07-08)
- [x] Painel de upload de novos `.pmtiles` (substitui upload manual) (2026-07-08)
- [x] Controle de versão de mapas — atualizar o arquivo de um mapa já
      existente, com backup leve do anterior (2026-07-10)
- [x] Dashboard de estatísticas (mapas mais baixados, usuários ativos) (2026-07-10)

## Fase 4 — Ideias futuras (não compromissadas)

- [ ] Exportar/imprimir área selecionada como PDF
- [ ] Fila local de eventos offline sincronizando quando a conexão volta
- [ ] Migrar filtragem de permissão pra nível de geometria (PostGIS), não só
      por arquivo/mapa inteiro
