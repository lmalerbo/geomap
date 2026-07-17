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

Define quais grupos enxergam quais mapas na tela inicial. O usuário
nunca escolhe permissão — o sistema decide, com base no(s) grupo(s) dele.

## logs

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| usuario_id | FK usuarios | quem executou a ação (login/download do próprio usuário, ou o admin que fez a ação administrativa) |
| camada_id | FK camadas | qual arquivo foi baixado (renomeado de `mapa_id` na migration 006 — sempre foi isso na prática); NULL pra ações que não são download |
| acao | text | 'login' / 'download' / 'admin' (migration 007 — 'admin' cobre qualquer ação sensível feita no painel: criar/editar usuário, redefinir senha, criar/remover grupo, remover mapa) |
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
