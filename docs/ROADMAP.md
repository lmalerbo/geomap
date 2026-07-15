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

## Fase 3.5 — Múltiplos mapas (projetos)

A empresa vai ter mais de uma fazenda/projeto, cada um com seu próprio
conjunto de camadas (Talhões + Limites sempre como base, mais outras
específicas). O que era um mapa único virou uma tela inicial que lista
os mapas permitidos (2026-07-10):

- [x] Migração de schema: tabela antiga `mapas` (camadas individuais)
      renomeada pra `camadas`; nova tabela `mapas` = agrupamento/projeto
      (migration 006)
- [x] Permissão por grupo sobe de nível: agora vale pro mapa inteiro, não
      mais por camada individual
- [x] `migrate.js` ganhou tabela de controle (`schema_migrations`) — bug
      de idempotência encontrado e corrigido durante essa migração
- [x] Backend: `GET /mapas` retorna os mapas permitidos com as camadas já
      aninhadas (sincroniza tudo de uma vez, sem N+1); download movido pra
      `GET /camadas/:id/download`
- [x] Backend admin: `/admin/mapas*` (CRUD de projetos + grupos) separado
      de `/admin/camadas*` (upload/edição de camadas, agora associadas a
      um `mapaId` em vez de grupos diretamente)
- [x] Frontend: tela inicial (`Inicio.jsx`) lista os mapas como cards,
      `/mapa/:mapaId` filtra as camadas daquele projeto, botão "Trocar
      mapa" volta pra tela inicial
- [x] Sincronização continua baixando tudo de uma vez (todos os mapas
      permitidos, todas as camadas) — garantia de offline-first não mudou,
      só a organização visual
- [x] Testado via Playwright: catálogo filtrado por permissão, troca de
      mapa, e o fluxo inteiro (tela inicial + mapa aberto + clique em
      talhão) funcionando 100% offline contra o build de produção

## Fase 3.6 — Reorganização do painel de admin

O painel tinha 5 telas soltas (3 delas eram, na prática, a mesma tarefa —
configurar uma camada — espalhada em 3 lugares diferentes) e nenhuma forma
de gerenciar usuários/grupos pela interface (só via `seed.js`/SQL direto,
o que já causou confusão entre dado de teste e dado real). Reorganizado
(2026-07-10):

- [x] "Gerenciar camadas" consolidado: upload, arquivo/versão, estilo e
      atributos de uma camada tudo na mesma tela (antes eram 3 telas
      separadas, cada uma com seu próprio seletor de camada)
- [x] "Gerenciar mapas" ganhou contagem de camadas por mapa, botão
      "Adicionar camada" (leva direto pra Gerenciar camadas com o mapa e
      o formulário de upload já abertos) e remover mapa (bloqueado
      enquanto tiver camadas vinculadas)
- [x] Novo "Gerenciar usuários": criar/editar usuário (nome, departamento,
      papel, status, grupos), redefinir senha, e uma sub-seção de grupos
      (criar/renomear/remover) — não existia nenhuma UI pra isso antes
- [x] Proteções contra o admin se trancar fora do próprio painel: não
      pode alterar o próprio papel/status (nem pela UI nem por chamada
      direta à API), e não é possível zerar os admins ativos
- [x] Auditoria: ações administrativas sensíveis (criar/editar usuário,
      redefinir senha, criar/remover grupo, remover mapa) passam a gerar
      registro em `logs` (`acao = 'admin'`, coluna `detalhe` nova —
      migration 007)

## Fase 3.7 — Upload de `.shp` direto no admin

A equipe de GIS trabalha com `.shp` (ArcGIS Pro), não com `.pmtiles` — até
aqui, o formato final só existia depois de rodar o pipeline manualmente
fora do app (`pipeline/shp_para_pmtiles.sh`). Painel passou a converter
sozinho (2026-07-10):

- [x] `POST /admin/camadas` e `PUT /admin/camadas/:id/arquivo` aceitam um
      `.zip` do shapefile (`.shp`+`.dbf`+`.shx`+`.prj`) além do `.pmtiles`
      já pronto — roda `ogr2ogr` + `tippecanoe` no servidor e publica
      automaticamente
- [x] **V1 cobre só geometria** — talhões/limites clicáveis com atributos,
      igual ao pipeline manual de hoje. Rótulo (número do talhão no mapa)
      continua manual (pipeline Python à parte, bem mais trabalho de
      automatizar) — decisão consciente pra não inflar o escopo desta vez
- [x] Caminhos dos binários (`ogr2ogr`/`tippecanoe`) configuráveis via
      `.env` (`OGR2OGR_PATH`, `TIPPECANOE_PATH`, `CYGWIN_BIN_DIR`) — sem
      hardcode, portável pra um host Linux de produção no futuro (onde
      bastaria estarem no `PATH`, sem a dança do Cygwin desta máquina)
- [x] Corrigido também: aba presa em `/mapa/:id` de um mapa já removido
      mostrava "conecte-se à internet" pra sempre (mensagem errada,
      mesmo online) — agora redireciona pra `/inicio` automaticamente

## Fase 3.8 — Simbologia de camadas (estilo QGIS)

O editor de estilo só tinha 1 cor pra preenchimento e contorno, opacidade,
liga/desliga de rótulo e zoom mínimo do rótulo — o usuário pediu algo
próximo do que dá pra fazer no QGIS nesse quesito, priorizado nesta ordem
(2026-07-11):

- [x] Contorno com cor/largura/opacidade próprios (antes herdava a cor do
      preenchimento, largura e opacidade fixas)
- [x] Preenchimento categorizado (1 cor por valor único de um campo, ex:
      `VARIEDADE`) e graduado (rampa de cor por faixa numérica, ex:
      `AREA_PROD`) — "Gerar categorias"/"Calcular faixas" lê os valores
      direto dos tiles já baixados (mesma técnica de leitura de tiles no
      menor zoom já usada pro índice de busca, novo módulo
      `lib/pmtilesValores.js`, sem tocar no código de busca que já
      funciona)
- [x] Rótulo com 2 origens: camada `rotulos` do pipeline (como antes,
      melhor posicionamento) ou direto de um atributo do próprio polígono
      (novo — funciona em qualquer camada, sem depender do pipeline de
      rótulos ter rodado), tamanho de fonte e cor do texto configuráveis
- [x] Zoom mínimo/máximo de visibilidade da camada inteira, separado do
      zoom mínimo do rótulo
- [x] Retrocompatibilidade sem migração de banco: `normalizarEstiloConfig`
      (`lib/estiloCamada.js`) lê tanto o formato antigo quanto o novo

Dois bugs de verdade encontrados e corrigidos no processo:

- Inputs numéricos do React (`<input type="range"/"number">`) mandam
  string, e o MapLibre valida estritamente que propriedades como
  `fill-opacity`/`line-width`/`minzoom` sejam number — uma camada salva
  com esses campos como string travava a aplicação de **todas** as
  camadas seguintes no mesmo carregamento (o loop em `Mapa.jsx` não tinha
  try/catch por camada). Corrigido em duas frentes: `normalizarEstiloConfig`
  força `Number(...)` em todo campo numérico (conserta inclusive
  configs já salvas erradas, sem precisar resalvar) e os `onChange` dos
  inputs no admin já convertem na origem. `Mapa.jsx` também ganhou
  try/catch por camada no loop — uma camada com dado problemático não
  pode mais derrubar a exibição de todas as outras.
- Lista de camadas em Gerenciar camadas (`.item-selecionavel-camada`)
  renderizava com texto branco quase invisível — herdava `color: #fff`
  do estilo global de `<button>` sem override próprio.

## Fase 3.9 — Menu lateral, busca por teclado, track log e importação temporária

Leva de 5 melhorias de UX/campo pedidas pelo Leo (2026-07-12):

- [x] Menu lateral (`MenuLateral.jsx`) substitui os botões-texto
      Admin/Sair por um único botão circular de Menu — sidebar lista as
      4 seções administrativas (só pra admin) + Sair no rodapé. Tela
      `/admin` (grade de cards) removida, rota redireciona pra
      `/admin/mapas`; as 4 telas de seção trocaram "← Admin" por
      "← Voltar" (`navigate(-1)`)
- [x] Busca: `Enter` seleciona o primeiro resultado sem precisar clicar
      na lista; `↑`/`↓` navegam os resultados no desktop — busca por
      código/nome de fazenda em si já funcionava desde 2026-07-08, só
      faltava a camada de teclado
- [x] Painel de camadas passa a iniciar sempre recolhido (era só no
      mobile; no desktop abria por padrão) — comportamento consistente
      nas duas plataformas
- [x] Importação temporária de KML/Shapefile pra visualização (nunca
      salva no IndexedDB/backend, some ao recarregar a página) —
      `@tmcw/togeojson` (KML) e `shpjs` (zip de shapefile), 3 layers
      (ponto/linha/polígono) coloridas em magenta pra sinalizar "isso é
      temporário"
- [x] Track log: gravar percurso via GPS (`navigator.geolocation.
      watchPosition`, independente do `GeolocateControl` nativo) com
      distância ao vivo, exportação em KML (serializador próprio, sem
      lib externa — ver nota abaixo). **Shapefile fica pra depois**
      (`shp-write`, a única opção client-side, está sem manutenção há
      quase 10 anos)

Achado durante a implementação: a lib óbvia pra exportar KML seria
`tokml`, mas ela arrasta uma cadeia de dependências de teste abandonadas
(`tap`/`uglify-js`/`minimist`/etc.) com **3 vulnerabilidades críticas e 7
altas** no `npm audit`. Como o caso de uso é só 1 `LineString`, o XML foi
escrito à mão (`lib/trackLog.js`) — `npm audit` volta a zero
vulnerabilidades.

Bug de verdade encontrado testando o track log com geolocalização mockada
(Playwright): um erro **transitório** de GPS (sinal instável,
`POSITION_UNAVAILABLE`/`TIMEOUT`) encerrava a gravação por completo na
UI, mesmo com o `watchPosition` nativo continuando rodando e acumulando
pontos por baixo — usuário via "gravação parada" mas o app seguia
gravando escondido, e clicar em "Iniciar" de novo criaria um segundo
`watch` concorrente. Corrigido: só `PERMISSION_DENIED` de fato encerra a
gravação; erros transitórios só mostram o aviso (auto-limpa no próximo
ponto bem-sucedido) e a gravação continua.

## Fase 3.10 — Deploy de produção 100% em nuvem

Fecha o pendente registrado desde a Fase 1 ("decidir hospedagem de
produção"). Backend rodando no PC de alguém foi descartado por completo
nesta sessão — sem admin, sem acesso ao roteador, e por fim confirmado
que nem dá pra rodar programa não aprovado pelo TI no PC cogitado
(2026-07-12):

- [x] Frontend publicado no GitHub Pages via
      `.github/workflows/deploy-frontend.yml` (novo) — grátis, HTTPS
      automático, repo já é público
- [x] Backend migrado pra rodar no Render (free Web Service) e banco no
      Neon (free tier Postgres, não expira)
- [x] Armazenamento de arquivos publicados (`.pmtiles`) migrado de disco
      local (`STORAGE_DIR`) pra Cloudflare R2 — único código novo de
      verdade desta leva (`backend/src/lib/storage.js`), necessário
      porque hosts free-tier não garantem disco persistente
- [x] `vite.config.js`/`App.jsx` ajustados pro GitHub Pages ser uma
      "project page" (`/geomap/`, não domínio próprio) — `base`
      condicional, `basename` no React Router, `404.html` = `index.html`
      pra deep link sobreviver a F5 (GitHub Pages não faz rewrite de
      servidor)
- [x] Bug real encontrado no processo (não é sobre R2 em si): Express 4
      não captura sozinho uma Promise rejeitada num handler `async` —
      derrubava o processo inteiro em vez de devolver um erro HTTP.
      Corrigido com `express-async-errors` (zero dependências) + um
      error-handler final na app — importa pra produção de verdade,
      onde uma falha transitória de rede vai acontecer mais cedo ou
      mais tarde

**Resolvido (2026-07-14)**: o pendente acima (upload de shapefile não
funcionava no Render sem Docker, e mesmo local nunca gerava rótulo) foi
fechado — `backend/Dockerfile` traz `ogr2ogr`/`tippecanoe`/`tile-join`/
Python pra produção, e a conversão passou a gerar rótulos automaticamente
quando a camada tem os campos certos (TALHAO+SECAO ou DESC_SECAO). A tela
de Gerenciar camadas também parou de pedir `.zip` — agora aceita os
arquivos soltos do shapefile (`.shp`/`.dbf`/`.shx`/`.prj`) selecionados de
uma vez, apontando especificamente qual está faltando se for o caso. Ver
`CLAUDE.md` (entrada "Docker no Render + rótulos automáticos + upload sem
zip") pro relato técnico completo.

**Deploy de verdade concluído (2026-07-13)** — testado ponta a ponta em
produção, com dado real (as 6 camadas de "Usina da Pedra" reenviadas):

- [x] Contas criadas (Neon, R2, Render), migrations rodadas, usuário
      admin real criado, grupo "Padrão" configurado
- [x] Corrigido: `deploy-frontend.yml` disparava em `branches: [main]`
      (repo usa `master`) — workflow nunca executava
- [x] Corrigido: `origin/master` estava 16 commits atrasado da máquina
      local — Render rodava código velho o suficiente pra crashar
      (`column m.versao does not exist`, schema pré-múltiplos-mapas)
- [x] Corrigido: download de camada trocou de redirect (302) pra URL
      assinada do R2 para **streaming direto pelo backend** — o
      redirect não sobrevivia ao CORS entre os 3 domínios envolvidos
      (`github.io` → `onrender.com` → `r2.cloudflarestorage.com`) num
      teste real de navegador, mesmo com o bucket configurado
      corretamente
- [x] Corrigido: 3 nomes de camada acentuados corromperam ao passar por
      variável de shell num script de reenvio (mesma lição de encoding
      já registrada antes nesta sessão, reincidente)

Ver `CLAUDE.md` (entrada "Deploy de verdade executado") para o relato
completo de cada problema e correção.

**URLs de produção**: site em `https://lmalerbo.github.io/geomap/`,
API em `https://geomap-vr68.onrender.com`.

## Fase 4 — Ideias futuras (não compromissadas)

- [ ] Exportar/imprimir área selecionada como PDF
- [ ] Fila local de eventos offline sincronizando quando a conexão volta
- [ ] Migrar filtragem de permissão pra nível de geometria (PostGIS), não só
      por arquivo/mapa inteiro
- [ ] Exportação de track log em Shapefile (.SHP) — adiado, ver Fase 3.9
