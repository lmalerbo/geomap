# Schema do Banco — GeoMap (v1 / MVP)

Baseado no desenho original do estudo de viabilidade, adaptado pro fluxo
web/PWA (sem CarryMap Viewer, sem login/logout de app desktop).

`migrate.js` controla quais migrations já rodaram numa tabela própria
(`schema_migrations`, arquivo + data) — só aplica os `.sql` novos a
cada execução, em vez de rodar tudo de novo sempre.

## usuarios

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| nome | text | |
| email | text unique | usado como login |
| senha_hash | text | bcrypt, nunca senha em texto puro |
| departamento | text | opcional, informativo |
| status | text | 'ativo' / 'inativo' — inativo = login bloqueado |
| papel | text | 'admin' / 'usuario' (default) — 'admin' vê o painel de administração (migration 002) |
| criado_em | timestamp | |
| precisa_trocar_senha | boolean | default false — true logo após criar o usuário ou o admin redefinir a senha (sempre pra uma constante fixa, `SENHA_TEMPORARIA_PADRAO`, nunca escolhida pelo admin); `POST /login` devolve isso pro frontend forçar a tela de definir senha antes de liberar o app; `PUT /senha` (auto-atendido) zera de volta (migration 009) |

## grupos

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| nome | text | ex: Agronomia, Diretoria, Comercial |

## usuarios_grupos

| Campo | Tipo | Observação |
|---|---|---|
| usuario_id | FK usuarios | |
| grupo_id | FK grupos | |

Um usuário pode pertencer a mais de um grupo (tabela de associação N:N).

## mapas

O agrupamento que aparece na tela inicial — cada mapa é uma
fazenda/projeto, com um conjunto próprio de camadas (migration 006;
antes desta migration, esta tabela se chamava `mapas` mas representava
o que hoje é `camadas` — ver abaixo).

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| nome | text | ex: "Usina da Pedra" |
| descricao | text | opcional |
| criado_em | timestamp | |

## camadas

Uma camada individual (um `.pmtiles`) dentro de um mapa — ex: Talhões,
Limites. Renomeada de `mapas` na migration 006, quando o conceito de
"mapa" (projeto) passou a existir por cima dela.

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| mapa_id | FK mapas | a qual mapa/projeto essa camada pertence (migration 006) |
| nome | text | ex: "Talhões — Pedra" |
| versao | text | ex: "1.2" |
| categoria | text | ex: Agronomia, Infraestrutura |
| arquivo_path | text | caminho do .pmtiles no servidor |
| atributos_config | jsonb | `[{campo, visivel, ordem, rotulo}]` — editável no painel de admin (migration 003; `rotulo` sem migration, 2026-07-17 — config salva sem esse campo cai pro próprio `campo` como rótulo, `mesclarConfigAtributos` no frontend); NULL = mostra tudo, ordem bruta do vector tile, rótulo = nome do campo |
| estilo_config | jsonb | Formato novo (2026-07-11, sem migration — ver `frontend/src/lib/estiloCamada.js`, `normalizarEstiloConfig`): `{preenchimento: {modo: "simples"\|"categorizado"\|"graduado", cor, opacidade, campo, categorias: [{valor,cor}], corSemCategoria, campoNumerico, classes: [{ate,cor}], corAbaixoDoMinimo}, contorno: {cor,largura,opacidade}, rotulo: {mostrar,origem:"pipeline"\|"atributo",campo,tamanhoFonte,cor,zoomMinimo}, visibilidade: {zoomMinimo,zoomMaximo}}`. Camadas salvas antes disso ficam no formato antigo flat (`{cor, opacidadePreenchimento, mostrarRotulo, zoomRotulo}`, migration 004) — `normalizarEstiloConfig` lê os dois formatos e sempre devolve o novo completo, então **não precisou de migração de banco**; NULL/vazio = heurística padrão (presença do campo TALHAO) |
| publicado_em | timestamp | |

## permissoes

| Campo | Tipo | Observação |
|---|---|---|
| mapa_id | FK mapas | desde a migration 006, a permissão vale pro **mapa inteiro** (todas as camadas dele), não mais por camada individual |
| grupo_id | FK grupos | |
| pode_editar | boolean | default `false` (migration 014) — além de **ver** o mapa, o grupo também pode criar/editar/remover anotações (`pins`) nele. Toda permissão criada antes desta migration ficou só-leitura. Admin sempre pode editar, em qualquer mapa, independente de grupo (`usuarioPodeEditarMapa` em `backend/src/lib/permissoes.js`) |

Define quais grupos enxergam quais mapas na tela inicial. O usuário
nunca escolhe permissão — o sistema decide, com base no(s) grupo(s) dele.

## pins

Anotações (pins) do "Mapa do Preparo" — pontos com ícone, cor, título e
nota que usuários de grupos com `pode_editar` marcam no mapa, inclusive
offline; compartilhados com todos que veem o mapa (só leitura pra quem
não pode editar). Migration 014. Ver
`docs/superpowers/specs/2026-09-24-mapa-preparo-anotacoes-design.md`.

| Campo | Tipo | Observação |
|---|---|---|
| id | UUID PK | gerado no aparelho (`crypto.randomUUID()`), não no banco — o pin precisa existir offline antes de qualquer contato com o servidor; reenviar a mesma escrita nunca duplica (upsert por id) |
| mapa_id | FK mapas, `ON DELETE CASCADE` | |
| icone | text | chave do catálogo fixo de 15 ícones (`frontend/src/lib/iconesPreparo.js`, espelhado em `backend/src/lib/iconesPreparo.js` só com as chaves válidas pra validação) |
| cor | text | `#rrggbb`, validado por regex no backend |
| titulo | text | até 120 caracteres |
| nota | text | default `''`, até 2000 caracteres |
| lng, lat | double precision | graus decimais, validados (-180..180 / -90..90) |
| criado_por, atualizado_por | FK usuarios, `ON DELETE SET NULL` | |
| criado_em, atualizado_em | timestamptz | hora **do aparelho** no momento da ação — base da regra "última edição vence" (sem merge campo a campo; risco aceito de relógio errado do aparelho) |
| removido_em | timestamptz nullable | remoção lógica (nunca `DELETE` de verdade) — um pin removido não ressuscita mesmo que chegue uma edição mais antiga depois |
| recebido_em | timestamptz, default `now()` | hora do **servidor** da última escrita aceita — base do sync incremental (`GET /mapas/:id/pins?desde=`); índice em `(mapa_id, recebido_em)` |

Rotas (`backend/src/routes/pins.js`, sempre autenticadas): `GET
/mapas/:id/pins?desde=` (exige só leitura do mapa; devolve pins alterados
desde o cursor, **incluindo removidos**, pro cliente apagar a cópia
local; o cursor recua 1 minuto pra nunca perder uma escrita que comita
depois da leitura — reentregar um pin de novo é inofensivo, o cliente
faz upsert); `PUT /mapas/:id/pins/:uuid` (exige `pode_editar`; upsert
idempotente, última edição vence, pin já removido não ressuscita, `409`
se o UUID já pertence a outro mapa); `DELETE /mapas/:id/pins/:uuid`
(exige `pode_editar`; idempotente, preenche `removido_em`). Toda escrita
aplicada de fato grava um log `acao = 'anotacao'`.

Sincronização offline (frontend, `frontend/src/lib/syncPins.js` +
`lib/db.js`): fila local (outbox) no IndexedDB, `pendente:
null|"salvar"|"remover"` por registro — criar/editar/remover grava e
reflete no mapa na hora, mesmo sem rede, e dispara o envio em segundo
plano assim que houver conexão (evento `online`, ou junto do sync geral
de camadas em `sync.js`). Recebimento nunca sobrescreve um registro
local ainda `pendente`. Ver também a entrada "Mapa do Preparo —
anotações" na seção "Estado atual" de `CLAUDE.md` pro resumo funcional
completo.

## logs

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| usuario_id | FK usuarios | quem executou a ação (login/download do próprio usuário, ou o admin que fez a ação administrativa) |
| camada_id | FK camadas | qual arquivo foi baixado (renomeado de `mapa_id` na migration 006 — sempre foi isso na prática); NULL pra ações que não são download |
| acao | text | 'login' / 'download' / 'admin' / 'anotacao' (migration 007 acrescentou 'admin' — cobre qualquer ação sensível feita no painel: criar/editar usuário, redefinir senha, criar/remover grupo, remover mapa; migration 014 acrescentou 'anotacao' — criar/editar/remover um pin, com `detalhe` descrevendo a operação: `criar\|editar\|remover pin <uuid> "<título>" (mapa <id>)`) |
| detalhe | text | texto livre com o que aconteceu (ex: "criar_usuario: usuário 11 (fulano@...)"), só preenchido quando `acao = 'admin'` (migration 007) |
| data_hora | timestamp | |
| ip | text | capturado no momento da ação online |

Na v1, só registrávamos `login` e `download` — os únicos momentos em que
existe conexão com o servidor. Ações feitas offline em campo (abrir o mapa,
clicar num talhão) não passam pelo backend, então não há como logar em tempo
real; se isso vier a ser necessário, é um item de fase 2 (fila local que
sincroniza quando a conexão volta). Desde a migration 007, `acao = 'admin'`
também é registrado — auditoria de ações administrativas sensíveis feitas
pelo painel (ver `routes/admin.js`, função `registrarAuditoria`).
