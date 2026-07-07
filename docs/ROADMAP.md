# Roadmap — GeoPortal

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
- [x] Frontend: tela de catálogo (lista de mapas permitidos)
- [x] Frontend: botão "baixar mapa" → salva `.pmtiles` no IndexedDB
- [x] Frontend: visualizador MapLibre GL JS lendo o `.pmtiles` do IndexedDB
- [x] Frontend: clique num talhão mostra atributos (painel ou popup)
- [x] PWA: service worker cacheando o app shell (funciona offline pra abrir)
- [x] Teste real: baixar o mapa com internet, desligar o Wi-Fi/dados, reabrir
      o app e confirmar que o mapa e os atributos funcionam normalmente —
      validado via Playwright (`context.setOffline`, que bloqueia toda
      rede a nível de browser); vale repetir manualmente em modo avião
      num dispositivo real antes de considerar produção-ready

## Fase 2 — Funcionalidades de uso (depois do MVP validado)

- [ ] Medição de distância/área (Turf.js)
- [ ] Busca por atributo (nome do talhão, fazenda)
- [ ] Legenda dinâmica por camada
- [ ] Bookmarks de extensão do mapa
- [ ] "Minha localização" (Geolocation API) — funciona offline também

## Fase 3 — Administração

- [ ] Painel de upload de novos `.pmtiles` (substitui upload manual)
- [ ] Controle de versão de mapas (manter histórico / só última versão)
- [ ] Dashboard de estatísticas (mapas mais baixados, usuários ativos)

## Fase 4 — Ideias futuras (não compromissadas)

- [ ] Exportar/imprimir área selecionada como PDF
- [ ] Fila local de eventos offline sincronizando quando a conexão volta
- [ ] Migrar filtragem de permissão pra nível de geometria (PostGIS), não só
      por arquivo/mapa inteiro
