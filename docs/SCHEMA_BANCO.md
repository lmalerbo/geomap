# Schema do Banco — GeoMap (v1 / MVP)

Baseado no desenho original do estudo de viabilidade, adaptado pro fluxo
web/PWA (sem CarryMap Viewer, sem login/logout de app desktop).

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

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| nome | text | ex: "Talhões — Fazenda Santa Rita" |
| versao | text | ex: "1.2" |
| categoria | text | ex: Agronomia, Infraestrutura |
| arquivo_path | text | caminho do .pmtiles no servidor |
| atributos_config | jsonb | `[{campo, visivel, ordem}]` — editável no painel de admin (migration 003); NULL = mostra tudo, ordem bruta do vector tile |
| estilo_config | jsonb | `{cor, opacidadePreenchimento, mostrarRotulo, zoomRotulo}` — editável no painel de admin (migration 004); NULL/campo ausente = heurística padrão (presença do campo TALHAO) |
| publicado_em | timestamp | |

## permissoes

| Campo | Tipo | Observação |
|---|---|---|
| mapa_id | FK mapas | |
| grupo_id | FK grupos | |

Define quais grupos enxergam quais mapas no catálogo. O usuário nunca
escolhe permissão — o sistema decide, com base no(s) grupo(s) dele.

## logs

| Campo | Tipo | Observação |
|---|---|---|
| id | serial PK | |
| usuario_id | FK usuarios | |
| mapa_id | FK mapas | |
| acao | text | 'login' / 'download' |
| data_hora | timestamp | |
| ip | text | capturado no momento da ação online |

Na v1, só registramos `login` e `download` — são os únicos momentos em que
existe conexão com o servidor. Ações feitas offline em campo (abrir o mapa,
clicar num talhão) não passam pelo backend, então não há como logar em tempo
real; se isso vier a ser necessário, é um item de fase 2 (fila local que
sincroniza quando a conexão volta).
