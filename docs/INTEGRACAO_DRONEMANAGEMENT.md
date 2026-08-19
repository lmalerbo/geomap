# Integração DroneManagement — apontamento de voo pelo mapa

## Contexto e motivação

A empresa usa um sistema de terceiros ("Torre de Controle", plataforma
DroneManagement, `prd-dronemgmt.pedraagroindustrial.com.br`) pra controlar
voos de drone/avião (pulverização, imageamento). O apontamento de cada voo
(marcar "voei esse talhão agora") hoje só existe via **app mobile
restrito** do piloto — não dá pra interceptar/automatizar esse app (já
tentado com HTTP Toolkit, sem sucesso).

O pedido: um mapa no GeoMap mostrando os talhões **pendentes de voo**
(mesma informação da tela "Agendamento de Voos" do DroneManagement), onde
o piloto clica num talhão e registra o voo ali mesmo — interface visual
alternativa ao app restrito, reaproveitando o mapa que o GeoMap já
renderiza.

Isso é uma integração com um **sistema de terceiros**, não um dado que o
GeoMap publica/possui — foge do fluxo padrão `.shp → .pmtiles` do resto do
projeto (ver `ARQUITETURA.md`). Por isso este documento cobre só essa
integração, separado da arquitetura geral.

## O que já existe: `project-preparo`

Antes de desenhar do zero, vale saber que **já existe um sistema em
produção** (`project-preparo/sistema_preenchimento/`, repo separado) que
lê dados do DroneManagement há tempo, rodando de hora em hora via GitHub
Actions (`atualizar-voos.yml`). Ele resolveu a parte mais difícil (login)
e serviu de base pra tudo abaixo — os endpoints e o fluxo de auth
descritos aqui foram **confirmados batendo com o código real desse
projeto**, não só engenharia reversa isolada.

O que `project-preparo` faz hoje: só **leitura** (popula uma tabela
`voo_status` no Supabase pra outro sistema consultar). Não existe hoje
nenhuma escrita de volta pro DroneManagement em produção — a parte de
criar/atualizar apontamento pelo mapa do GeoMap seria nova.

## O sistema externo: DroneManagement

Plataforma "FormBuilder" genérica (todo formulário/coleção de dados é
modelado como um `formId` + schema dinâmico, não hardcoded por tela).
Autenticação via **SSO corporativo** (não um login simples por
usuário/senha direto na API) — por isso não dá pra fazer um `POST` puro
de login, é preciso simular o fluxo do navegador.

### Autenticação

```
Playwright (headless) abre /portal/flight-consult
        │
        ▼
Preenche e-mail/senha na tela de login → clica "Entrar"
        │
        ▼
Vários redirects (SSO → callback → app) até o cookie ser gravado
        │
        ▼
Extrai os cookies DRONEMANAGEMENT-PORTAL-* do contexto do navegador
        │
        ▼
Cookie completo + DRONEMANAGEMENT-PORTAL-XSRF-TOKEN prontos pra
requisições HTTP normais (fetch/requests), sem precisar mais do navegador
```

O cookie de sessão expira relativamente rápido (minutos/poucas horas,
nunca medido com precisão) — não dá pra logar uma vez e guardar o cookie
pra sempre; é preciso relogar periodicamente.

Implementação de referência: `login_dronemgmt()` em
`project-preparo/sistema_preenchimento/engine/atualizar_voos.py`
(Python + Playwright). O GeoMap backend é Node — se for reaproveitar o
mesmo mecanismo, precisa da lib `playwright` (Node) + `chromium` instalado
na imagem Docker do backend (`backend/Dockerfile`), que já é uma imagem
pesada por causa do `tippecanoe`/GDAL — Chromium adiciona bastante peso.
Alternativa a avaliar: um pequeno serviço/worker separado só pra manter a
sessão viva (ver "Decisões em aberto" abaixo).

### Constantes (unidade "Usina da Pedra")

```
base_url:  https://prd-dronemgmt.pedraagroindustrial.com.br
form_id:   77df7375-daae-4431-9f43-8c1743909c24   (formulário "Agendamento de voo")
unit_id:   1832e51f-b52b-4a28-b66c-803ff0925779
```

Headers obrigatórios em toda chamada autenticada:

```
Cookie: <cookies DRONEMANAGEMENT-PORTAL-* da sessão>
x-xsrf-token: <valor do cookie DRONEMANAGEMENT-PORTAL-XSRF-TOKEN>
x-requested-with: XmlHttpRequest
formid: 77df7375-daae-4431-9f43-8c1743909c24
unitid: 1832e51f-b52b-4a28-b66c-803ff0925779
locale: pt-BR
```

### Endpoints confirmados (testados de verdade, não só lidos do bundle)

Todos sob `{base_url}/portal/api/v1/gateway/formbuilder/formdata`:

| Ação | Método | URL | Observação |
|---|---|---|---|
| Listar/filtrar | `GET` | `.../query?pageNumber=&pageSize=&filter=&expand=layer,flightProject` | `filter` é um JSON (estilo Mongo) urlencoded; `expand` traz os dados relacionados (`layerDetails`, `flightProjectDetails`) já resolvidos |
| Buscar 1 registro | `GET` | `.../formdata/{id}` | devolve o registro completo, sem `expand` — necessário antes de todo `PUT` (ver abaixo) |
| Criar | `POST` | `.../formdata` | body = objeto com os campos do registro; `id` é gerado pelo servidor |
| Atualizar | `PUT` | `.../formdata/{id}` | responde `204` sem corpo; testado e confirmado que persiste |
| Apagar | `DELETE` | `.../formdata/{id}` | responde `200` com o registro apagado (útil pra confirmar o último estado) |

**`PUT` não é PATCH parcial** — confirmado testando: mandar só os campos
que mudaram (ex: `{startDateFlight, endDateFlight, source,
pilotUserADId}`) volta `400` ("Projeto voo deve ser preenchido") porque o
servidor valida o corpo inteiro contra os campos obrigatórios do
formulário, como se fosse substituir o registro inteiro. O fluxo certo é
sempre **`GET /formdata/{id}` → mesclar as mudanças → `PUT` o objeto
inteiro de volta**. E o objeto que o `GET` devolve não pode ir direto pro
`PUT`: precisa remover antes os 5 campos de metadado geridos pelo próprio
servidor (`id`, `isEnabled`, `userId`, `createdUtc`, `modifiedUtc`) —
mandá-los de volta no `PUT` também volta `400` ("campos ... são inválidos
para esse formulário"). Confirmado com o ciclo completo
`GET → PUT → verificar → DELETE` num registro descartável.

Ciclo completo (criar → atualizar → apagar) testado manualmente via
Console do navegador nesta sessão, num registro descartável — os 3 passos
funcionaram exatamente como documentado acima.

### Filtro de "pendente de voo" (tela "Agendamento de Voos")

```json
{
  "$and": [
    { "unitId": "UUID('1832e51f-b52b-4a28-b66c-803ff0925779')" },
    { "$or": [
      { "verifyFlightSize": 2 },
      { "verifyFlightSize": 3 },
      { "verifyFlightSize": 4 },
      { "verifyFlightSize": 5 },
      { "verifyFlightSize": 6 }
    ]}
  ]
}
```

### Campos relevantes do registro (`FlightControl_collection`, form "Agendamento de voo")

| Campo | Tipo | Observação |
|---|---|---|
| `id` | uuid | gerado no create, usado no PUT/DELETE |
| `section` | string | == `SECAO` do GeoMap |
| `landPlot` | string | == `TALHAO` do GeoMap (sem zero-padding) |
| `layerDetails.number` | string | `section` + `landPlot` zero-padded (ex: `"10155001"`) — não precisa ser usado, a correlação já é feita por `section`+`landPlot` direto |
| `layerDetails.descriptionSection` | string | == `DESC_SECAO` (nome da fazenda) |
| `controlStatus` | int | 1 Aguardar plantio · 2 A voar · 3 Voar novamente · 4 Voado/processar imagens · 5-10 pipeline de processamento · 11 Cancelado · 12 Importar falhas |
| `verifyFlightSize` | int | 1 Aguardando plantio · 2 Aguardar porte · 3 Verificar porte · 4 Voar · 5 Voo liberado · 6 Voar urgente · 7 Perdeu porte · 8 Aguardar novo voo · 9 Voado · 10 Cancelado |
| `flightProject` | uuid, obrigatório | categoria do voo (ex: `2b0f620c-4bdf-4409-837b-9e373d91f294` = "Falhas Plantio") |
| `startDateFlight` / `endDateFlight` | ISO datetime | preenchido quando o voo acontece |
| `source` | int | 0 = ainda não voado, 1 = Web, 2 = **Mobile** (é o valor que o app do piloto grava) |
| `pilotUserADId` | uuid | piloto que voou |
| `imageName` | string | nome do arquivo de imagem gerado (fase de processamento, não é o apontamento em si) |

Schema completo (todos os ~45 campos, com `isRequired`/opções de cada
enum) está salvo fora do repositório em
`formstructure_agendamento_voo.json` (gerado via `GET
.../formbuilder/formstructure/{form_id}` — não versionado, é só
referência de trabalho desta sessão).

**Importante**: o app mobile provavelmente **atualiza um registro que já
existe** (criado antes, no planejamento — ver os exemplos reais lidos
nesta sessão, todos com `controlStatus`/`verifyFlightSize` já setados e
`pilotUserADId` zerado até o voo acontecer), em vez de criar um registro
novo a cada voo. O fluxo do mapa deveria seguir o mesmo padrão: `PUT` no
registro pendente existente, não `POST` de um novo.

## Correlação com o mapa do GeoMap

Sem precisar de nenhum campo novo no `.pmtiles` nem mudança de pipeline:

```
registro DroneManagement          talhão no GeoMap (.pmtiles Talhões)
─────────────────────────         ────────────────────────────────────
section          "10155"    ==    SECAO
landPlot         "1"        ==    TALHAO
descriptionSection           ==   DESC_SECAO (nome da fazenda)
```

## Decisão: camada própria, não a Talhões existente

Em vez de sobrepor destaque dinâmico na camada "Talhões" já usada pra
consulta normal (risco de interferir no clique/busca/estilo já testados
dela), a camada de voos é uma **réplica dedicada** — mesma geometria
base, camada própria (`Talhões — Voos` ou dentro de um mapa "Voos"
separado), com seu próprio estilo (cor por status pendente) e seu próprio
comportamento de clique (abre o apontamento, não o painel de atributos
padrão). Mantém a camada "Talhões" oficial intocada.

**Gap a resolver antes de implementar**: hoje "Duplicar" (`POST
/admin/mapas/:id/duplicar`) só existe no nível de **mapa** (projeto
inteiro, todas as camadas) — não existe duplicar uma única camada. Vai
precisar de uma ação nova (`POST /admin/camadas/:id/duplicar` ou
equivalente) que clona só uma camada (arquivo no R2 via
`duplicarArquivo`, já existe; registro em `camadas`), em vez de reusar/
adaptar o fluxo de mapa inteiro.

## Desenho da feature (proposta, ainda não implementada)

```
Backend GeoMap (novo: sessão de serviço com o DroneManagement)
        │  login periódico (Playwright/SSO), cookie em memória,
        │  relogin automático se uma chamada voltar 401
        ▼
Novo endpoint no backend GeoMap, ex: GET /voos/pendentes/:mapaId
  → proxy pro GET .../formdata/query com o filtro de pendente,
    devolve só {section, landPlot, controlStatus, verifyFlightSize, id}
    (não expõe cookie/token pro frontend)
        │
        ▼
Frontend (Mapa.jsx): nova camada visual que colore/destaca os talhões
com registro pendente (correlação SECAO+TALHAO em memória, sem mexer
no .pmtiles em si)
        │
        ▼
Clique num talhão pendente → painel/formulário simples (data do voo,
confirmar) → POST /voos/apontar (novo, backend) → backend faz o PUT
real no DroneManagement usando a sessão de serviço
```

Ponto chave: o frontend **nunca fala direto com o DroneManagement** — só
com o próprio backend do GeoMap, que já tem CORS aberto pro domínio dele
e guarda a sessão de serviço (nunca expõe cookie/token/senha pro
navegador do piloto).

## Decisões em aberto (não decidir "no meio do código" — ver convenção do projeto)

- **Onde roda a sessão Playwright**: dentro do mesmo processo Express
  (mais simples, mas adiciona Chromium à imagem Docker do backend, que já
  carrega GDAL/tippecanoe) vs. um processo/worker separado (mais leve por
  serviço, mas mais peça de infra pra manter).
- **Frequência de relogin**: a cada N minutos por cron interno, ou
  lazy (só realoga quando uma chamada volta 401)? A segunda é mais
  simples mas adiciona latência na primeira chamada depois de expirar.
- **Quem pode apontar pelo mapa (lado GeoMap)**: a checagem de permissão é
  de graça — o backend já sabe, pelo JWT, a quais mapas/grupos o usuário
  logado tem acesso (`permissoes`, já existe). Falta só decidir se "ter
  acesso ao mapa" já é suficiente, ou se vale um flag extra tipo "é
  piloto" (hoje o GeoMap só tem os papéis `admin`/`usuario`, ver
  `CLAUDE.md`).
- **Identidade real no DroneManagement (lado deles)**: a chamada HTTP em
  si é sempre autenticada como a conta de serviço, mas o campo
  `pilotUserADId` do registro é **independente** de quem autenticou —
  os dados reais lidos nesta sessão já mostram usuários identificáveis
  por nome (`"releasedByUserName":"lmalerbo"`, `"igabriel"`) separados de
  quem fez a chamada. Ou seja, dá pra gravar o piloto de verdade mesmo
  usando uma conta de serviço única, desde que exista um mapeamento
  **login do GeoMap → identidade do usuário no DroneManagement**
  (provavelmente um GUID de AD — ver `pilotUserADId`/`releasedByUserId`
  nos registros). Esse mapeamento ainda não existe em lugar nenhum; pode
  ser uma tabelinha simples no Postgres do GeoMap ou um JSON estático
  (mesmo padrão de `mapeamento-camadas.json` da automação de
  Talhões/Limites).
- **Risco real, ainda não testado: permissão de escrita da conta de
  serviço**. O `PUT` que validamos nesta sessão usou a sessão pessoal do
  Leo (que já aparece nos dados reais como `releasedByUserName: lmalerbo`
  em registros de **liberação** de voo — ou seja, uma conta com
  permissão elevada dentro do DroneManagement). Não sabemos se uma conta
  de serviço "comum" (sem papel de liberador/admin lá dentro) também
  consegue gravar nesse formulário — o DroneManagement pode ter seu
  próprio controle de permissão por usuário/papel que ainda não
  esbarramos. **Precisa testar o mesmo ciclo criar→atualizar→apagar com
  as credenciais reais que a conta de serviço vai usar**, antes de
  confiar que o proxy vai funcionar pra qualquer piloto.
- **O que preencher no `PUT`** além de `startDateFlight`/`endDateFlight`/
  `source: 2`/`pilotUserADId`: precisa decidir se o formulário do mapa
  pede piloto/data manualmente ou assume "agora" + o piloto resolvido via
  o mapeamento de identidade acima.
- **Fragilidade**: essa integração inteira depende de engenharia reversa
  de uma API não documentada de terceiros. Qualquer mudança no
  DroneManagement (novo `form_id`, campo renomeado, mudança no SSO) quebra
  isso silenciosamente — não tem contrato/versionamento garantido do lado
  deles. Vale um teste de smoke (ex: 1x por dia, ler 1 página e conferir
  que os campos esperados existem) antes de confiar cegamente nisso em
  produção.

## Credenciais

Conta de serviço do DroneManagement (usuário/senha) — nunca no código,
nunca no repositório. Seguir o mesmo padrão já usado em
`project-preparo` (variável de ambiente / secret do provedor de deploy —
no caso do GeoMap, variável de ambiente no Render, ao lado de
`OGR2OGR_PATH`/`TIPPECANOE_PATH`/etc já documentadas no `CLAUDE.md`).

**Decisão (2026-08-19)**: em vez de uma conta de serviço dedicada, a
integração usa a **conta pessoal do Leo** — já validada nesta sessão com
permissão de escrita real (o teste criar→atualizar→apagar funcionou com
ela). Trade-off aceito conscientemente: se a senha mudar (rotação de
política da empresa) ou a conta for bloqueada por qualquer motivo, o
apontamento pelo mapa para de funcionar silenciosamente até alguém
atualizar `DRONEMGMT_SENHA` no Render. Migrar pra uma conta de serviço
dedicada fica como melhoria futura, não bloqueia o lançamento.

## Estado da implementação

Plano completo de implementação (etapas, arquivos, decisões de UX como o
"modo de apontamento em lote") vive fora do repositório em
`~/.claude/plans/goofy-exploring-stearns.md` — este documento continua
sendo o contrato da API em si, não repete o plano.

- **Etapa 1 (spike de validação)**: `playwright` adicionado
  a `backend/package.json`, Chromium instalado em `backend/Dockerfile`
  (`npx playwright install --with-deps chromium`, depois de `npm ci`),
  `backend/src/lib/dronemgmt.js` criado (porta pra Node do
  `login_dronemgmt()` de `project-preparo`, mais um `chamarApi()`
  genérico com relogin automático em 401/403), rota temporária `GET
  /admin/dronemgmt/teste-login` (`backend/src/routes/admin.js`) só pra
  medir se o login completa dentro do Render free tier — **remover essa
  rota depois de validado**, não é feature. Variáveis novas em
  `backend/.env.example`: `DRONEMGMT_BASE_URL`, `DRONEMGMT_FORM_ID`,
  `DRONEMGMT_UNIT_ID`, `DRONEMGMT_USUARIO`, `DRONEMGMT_SENHA`.
- **Login + leitura validados localmente** (2026-08-19): `testarLogin()`
  completou em ~7.5s, uma chamada real de `formdata/query` (sem filtro de
  status, só `unitId`) voltou `200` com `count: 15072` em ~1.8s.
- **Gotcha real encontrado depurando o login**: o campo de usuário no
  formulário de login (`Plataforma Coorporativa de Governança de
  Contratos`, o SSO por trás do DroneManagement) tem o **placeholder**
  `"Digite seu e-mail"` no HTML, mas o **label visível** é "Usuário" e o
  valor que a plataforma realmente espera é o **username simples** (ex:
  `lmalerbo`), não o e-mail completo — usar o e-mail completo nesse campo
  derruba o login com `401` no `POST .../identity/api/auth/login`, sem
  nenhuma mensagem de erro visível na tela (só visível na aba Rede).
  `DRONEMGMT_USUARIO` deve ser o username, não o e-mail — apesar do
  placeholder sugerir o contrário. Outro gotcha, separado, encontrado no
  caminho: senha com `#` sem aspas no `.env` é cortada ali mesmo pelo
  dotenv (tudo depois do `#` vira comentário) — sempre envolver a senha
  em aspas duplas no `.env` se ela tiver `#`.
- **Etapa 1 concluída — validada em produção real no Render
  (`geomap-docker`, free tier, 0.1 CPU)** (2026-08-19): 3 chamadas
  consecutivas a `GET /admin/dronemgmt/teste-login` (via curl, JWT admin
  do GeoMap) responderam `200 {"ok":true,"duracaoMs":~30500-31100}` — o
  login sozinho leva ~30-31s no Render (vs ~7.5s local), ~4x mais lento
  mas **estável** (sem crash/restart entre tentativas, memória aguentou).
  **Risco #1 do plano (Playwright/Chromium não caber no free tier)
  descartado** — cabe, só é mais lento. Uma primeira tentativa isolada
  voltou `502` (provavelmente o serviço reiniciando logo depois de salvar
  as env vars novas no painel do Render, não falta de recurso — as 3
  tentativas seguintes, já com o serviço estável, funcionaram direto).
  **Ainda não medido**: o cenário de "primeiro acesso do dia" (Render
  dormindo 15min+, cold start do Node ~30-60s **somado** aos ~30s do
  login) — só testamos com o serviço já acordado. Rota temporária de
  diagnóstico continua no ar por enquanto (não removida ainda, pode servir
  pra esse teste de cold start depois).
- **Etapas 2-5 concluídas** (2026-08-19) — leitura (`GET
  /voos/pendentes/:mapaId`), escrita em lote (`POST /voos/apontamentos`),
  `POST /admin/camadas/:id/duplicar`, flag `tipoCamada`, hook
  `useApontamentoVoo.js` + painel em `Mapa.jsx`. Achado real testando a
  escrita: o `PUT` do DroneManagement exige o registro inteiro (não é
  PATCH parcial) e rejeita os campos de metadado geridos pelo servidor —
  ver a seção "Endpoints confirmados" acima.
- **Mapa "Voos" criado de verdade em produção** (id 70, grupo "dept.
  geotecnologia" com permissão, mesmo grupo do Leo) com a camada "Talhões
  — Voos" (id 331, `tipoCamada: "voos"`, duplicada de "Talhões" do mapa
  "Geral") — pronto pra testar interativamente no navegador. `GET
  /voos/pendentes/70` confirmado devolvendo os 3785 registros pendentes
  reais.
- **Pendente, só o Leo consegue fazer**: teste interativo real no
  navegador (abrir o mapa "Voos", conferir a coloração por status, ligar
  o modo de apontamento, selecionar talhões, confirmar um lote) — nunca
  testado clicando de verdade, só validado via chamadas de API isoladas
  e `vite build` limpo.
