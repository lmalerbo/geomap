# Indicadores de voo — página de KPI e API para o agente de apresentação

Data: 2026-10-01 · Status: design aprovado em conversa, aguardando revisão do spec

## Objetivo

Dar visibilidade ao rendimento dos voos com drone a partir do que já está
registrado no DroneManagement, para dois públicos:

1. **Pilotos (e admin), dentro do GeoMap** — uma página "Indicadores de voo"
   onde o piloto vê o próprio rendimento e o painel geral da equipe.
2. **O agente que monta a apresentação para o gerente** — uma rota de API
   (servidor-a-servidor, chave própria) que devolve os mesmos números em
   JSON, para ele atualizar o slide "Voos com Drone" sem planilha manual.

Referência de formato: slide "Voos com Drone" (S3M8) — cartões Área total /
HA realizado / HA previsto (a voar) / Últimos 15 dias úteis, barra de
progresso geral e barras "realizado × projetado" por tipo de missão.

A página e a API usam **o mesmo módulo de cálculo** — o número da tela
sempre bate com o do PowerPoint.

## Decisões tomadas (com o Leo)

| Tema | Decisão |
|---|---|
| O que é "voo realizado" | Registro do formulário "Agendamento de voo" com **Verificar porte = 9 ("Voado")**. Conferido em 2026-10-01: dá exatamente o mesmo conjunto que `controlStatus` 4–10 (4.419 registros) |
| "A voar" (projetado restante) | **Mesmo critério do mapa de Voos** (`/voos/pendentes`): `controlStatus` "A voar" + porte 5/6, Falhas Soca só 2º/3º corte e sem fornecedor. É a fila de **agora**, não depende do período |
| Período | **Intervalo de datas livre** (de/até), filtrando o realizado pela data do voo (`startDateFlight`). Padrão: safra atual, **01/04 a 31/03** |
| Total | Realizado no período + a voar hoje |
| Fornecedor | Propriedade (`layerDetails.transferProperty`) contendo **"FORNEC"** (pega FORNECEDOR, FORNEC. SUBPARCERIA, FORNECEDOR TROCA). Falhas Plantio é dividido em "Falhas Plantio" e "Falhas Plantio Forn." |
| Tipos de voo | Os do DroneManagement (`flightProjectDetails.description`). Tipos principais nominais; os demais agrupados em **"Outros"** (lista numa constante do backend, sem tela de admin). Categorias combinadas do slide ("Falhas Plantio + Ervas" etc.) **fora** |
| Metas manuais | **Fora do GeoMap** (meta de Ervas Daninhas do ano-safra, 250 ha/dia). O agente da apresentação aplica |
| Quem vê a página | **Admin** (tudo, filtra por piloto) e **pilotos** (quem tem linha em `pilotos_dronemgmt`): "meu rendimento" + painel da equipe, **sem** lista por piloto. Demais usuários: sem acesso |
| Onde calcula | **Backend**, sobre um cache no Postgres dos registros do DroneManagement (opção A da conversa) |
| Chave da API do agente | **Variável nova `INDICADORES_TOKEN`**, separada de `HUB_INTEGRACAO_TOKEN` (a do Hub também libera agendar voo; o agente de slides só precisa ler) |
| Gráficos | SVG/CSS próprios, sem biblioteca nova |

## Fora de escopo

- Metas/projetado manual dentro do GeoMap.
- Área de fornecedor fora do agendamento formal (não está no DroneManagement).
- Categorias combinadas de missão.
- Comparação/ranking entre pilotos visível ao piloto.
- Tela de admin pra configurar o agrupamento "Outros".
- Feriados no cálculo de dias úteis (só segunda a sexta).
- Exportar a página como PDF/imagem.

## Dados observados (sonda só leitura, 2026-10-01)

- 40.120 registros na unidade; 4.419 voados; busca completa dos voados ~9s
  localmente (com sessão já logada), mais lenta no Render.
- Todos os voados têm `startDateFlight`, `pilotUserADId` e
  `layerDetails.totalArea`.
- Safra atual (voos desde 01/04/2026): 1.733 talhões, 24.723 ha, 4 pilotos.
  Por tipo: Falhas Soca 9.673 · Falhas Plantio 6.470 · Ervas Daninhas 3.754
  · Sistematização 3.225 · Levantamento Topográfico 755 · Expansões 214 ·
  Sinistro 207 · Projeto Plantio 185 · Projeto Colheita 170 · Ambiental 40
  · Drone Aplicação 21 · Experimentação Agrícola 8.
- Propriedades na safra: PARCERIA/ARREND, PROPRIA, FORNECEDOR,
  FORNEC. SUBPARCERIA, FORNECEDOR TROCA.
- O DroneManagement **não** devolve nome do piloto, só o UUID de AD.

## Arquitetura

```
DroneManagement ──(sessão de serviço, lib/dronemgmt.js)──┐
                                                         ▼
                      lib/fonteIndicadoresVoo.js  (busca + cache no Postgres)
                       ├─ realizados: verifyFlightSize = 9
                       └─ pendentes: mesma regra do mapa (lib/pendentesVoo.js)
                                                         ▼
                      lib/indicadoresVoo.js  (função pura de cálculo)
                         ▲                                   ▲
   GET /voos/indicadores (JWT, admin/piloto)    GET /integracao/voos/indicadores
            ▼                                     (x-indicadores-token)
   pages/Indicadores.jsx                                  ▼
                                             agente da apresentação
```

### Unidades

**`backend/src/lib/pendentesVoo.js` (extraído de `routes/voos.js`)**
A regra de "pendente de voo" (filtro do DroneManagement, travas de Falhas
Soca, `mapearRegistro`, paginação com concorrência 5) sai da rota
`/voos/pendentes/:mapaId` para uma função `buscarPendentes()` reutilizável.
A rota do mapa passa a chamá-la e mantém o próprio cache
(`voos_pendentes_cache`) exatamente como hoje — **comportamento do mapa não
muda**. Os testes existentes de `regras-apontamento` continuam passando.

**`backend/src/lib/fonteIndicadoresVoo.js`**
Entrega `{ realizados, pendentes, atualizadoEm }` com cache:
- Tabela nova `indicadores_voo_cache` (migration 017): `chave TEXT PRIMARY
  KEY` (`'realizados'` | `'pendentes'`), `count_dronemgmt INTEGER`,
  `registros JSONB`, `atualizado_em TIMESTAMPTZ`. Tabela própria em vez de
  reusar `voos_pendentes_cache` (que é por `mapa_id`, com FK).
- Reuso do cache só se **o `count` atual bater** (consulta barata com
  `pageSize: 1`) **e** o cache tiver menos de **1 hora**. O limite de tempo
  cobre edição de registro que não muda a contagem (ex.: data de voo
  corrigida). `forcar` ignora o cache.
- Registro enxuto guardado por voo realizado: `id`, `dataVoo`
  (`startDateFlight`), `pilotoId` (`pilotUserADId`), `tipo`
  (`flightProjectDetails.description`), `secao`, `talhao`, `fazenda`
  (`layerDetails.descriptionSection`), `areaHa` (`layerDetails.totalArea`),
  `propriedade` (`layerDetails.transferProperty`).
- Pendentes guardam o mesmo formato de `buscarPendentes()` mais
  `propriedade` (necessária pra dividir Falhas Plantio Forn.).
- Duas buscas simultâneas não disparam duas idas ao DroneManagement: uma
  promessa em andamento é compartilhada no processo.

**`backend/src/lib/indicadoresVoo.js` (função pura)**
`calcularIndicadores({ realizados, pendentes, de, ate, pilotoId, nomesPilotos })`
→ objeto de indicadores (formato na seção "Contrato"). Sem rede, sem banco.
Regras:
- Realizado = voos com `dataVoo` entre `de` 00:00 e `ate` 23:59:59 no fuso
  `America/Sao_Paulo` (a data do voo vem em UTC).
- `pilotoId` informado → filtra realizados por piloto (bloco "meu
  rendimento"); o painel da equipe é sempre calculado sem esse filtro.
- Últimos 15 dias úteis: 15 dias de segunda a sexta terminando em
  `min(ate, hoje)`; soma de ha e número de dias com voo nessa janela.
- Por tipo: tipo do DroneManagement; Falhas Plantio com propriedade
  contendo "FORNEC" vira "Falhas Plantio Forn."; tipos fora de
  `TIPOS_PRINCIPAIS` viram "Outros". Cada tipo traz `realizadoHa`,
  `realizadoTalhoes`, `aVoarHa`, `aVoarTalhoes`. Ordenado por
  `realizadoHa + aVoarHa` decrescente, "Outros" sempre por último.
- `TIPOS_PRINCIPAIS` (constante): Falhas Soca, Falhas Plantio, Ervas
  Daninhas, Sistematização, Levantamento Topográfico, Projeto Plantio,
  Projeto Colheita. (Expansões, Sinistro, Ambiental, Drone Aplicação,
  Experimentação Agrícola e tipos novos → "Outros".)
- Por semana: semana ISO (segunda a domingo) com ha e talhões; semanas sem
  voo dentro do período aparecem com zero.
- Por piloto: ha, talhões, dias voados (datas distintas), média de ha por
  dia voado. Nome via `nomesPilotos` (mapa UUID → nome); sem cadastro →
  `"Piloto não cadastrado (xxxxxxxx)"` (8 primeiros caracteres do UUID).
- Áreas arredondadas a 2 casas no JSON; `progresso` entre 0 e 1.

**`backend/src/lib/nomesPilotos.js`**
Lê `pilotos_dronemgmt JOIN usuarios` → `{ [pilot_user_ad_id]: nome }`.

### Contrato do JSON (página e API)

```json
{
  "periodo": { "de": "2026-04-01", "ate": "2027-03-31" },
  "atualizadoEm": "2026-10-01T14:02:00Z",
  "resumo": {
    "realizadoHa": 24723.0, "realizadoTalhoes": 1733,
    "aVoarHa": 0, "aVoarTalhoes": 0,
    "totalHa": 0, "progresso": 0.0
  },
  "ultimos15DiasUteis": { "de": "2026-09-11", "ate": "2026-10-01", "ha": 0, "talhoes": 0, "diasComVoo": 0 },
  "porTipo": [
    { "tipo": "Falhas Plantio Forn.", "realizadoHa": 0, "realizadoTalhoes": 0, "aVoarHa": 0, "aVoarTalhoes": 0 }
  ],
  "porSemana": [ { "semana": "2026-W14", "inicio": "2026-03-30", "ha": 0, "talhoes": 0 } ],
  "porPiloto": [
    { "pilotoId": "uuid", "piloto": "Nome", "ha": 0, "talhoes": 0, "diasVoados": 0, "mediaHaPorDia": 0 }
  ],
  "meuRendimento": {
    "pilotoId": "uuid", "piloto": "Nome", "ha": 0, "talhoes": 0, "diasVoados": 0,
    "mediaHaPorDia": 0, "porSemana": [ { "semana": "2026-W14", "inicio": "2026-03-30", "ha": 0, "talhoes": 0 } ]
  }
}
```

`meuRendimento` só existe quando há piloto selecionado; `porPiloto` só
existe para admin e para a API do agente.

### Rotas

**`GET /voos/indicadores?de=&ate=&piloto=&forcar=`** (em `routes/voos.js`,
JWT normal)
- Admin: tudo; `piloto=<uuid>` preenche `meuRendimento`.
- Piloto (linha em `pilotos_dronemgmt`): `meuRendimento` sempre dele,
  `piloto` ignorado, **sem `porPiloto`**.
- Outros: `403`.
- `de`/`ate` inválidos ou `de > ate` → `400`. Ausentes → safra atual.

**`GET /integracao/voos/indicadores?de=&ate=`** (em `routes/integracao.js`)
- Cabeçalho `x-indicadores-token` comparado com `INDICADORES_TOKEN`
  (`timingSafeEqual`, mesmo padrão de `exigirTokenHub`). Sem a variável
  configurada → sempre `401`.
- Hoje o roteador aplica `exigirTokenHub` a todo `/integracao`; a rota de
  indicadores tem de ficar **fora** desse middleware (prefixo próprio
  `/integracao/voos` registrado antes do `use("/integracao", ...)`, ou o
  middleware do Hub restrito a `/integracao/dronemgmt`). A chave do Hub
  **não** dá acesso aos indicadores e vice-versa.
- Resposta: o contrato completo com `porPiloto`, sem `meuRendimento`.

**`GET /voos/indicadores/acesso`** (JWT) devolve `{ podeVer, ehAdmin,
ehPiloto }` para o frontend decidir se mostra o link no menu. (Em vez de
um campo novo na resposta do `/login`: as sessões salvas duram 30 dias e
só ganhariam o campo no próximo login.) O frontend guarda a última
resposta no `localStorage` por usuário, pra o link continuar aparecendo
offline.

### Erros

- DroneManagement fora/lento: se houver cache (mesmo vencido), devolve o
  cache com `"desatualizado": true` e `atualizadoEm` antigo; sem cache,
  `502 { erro: "Não foi possível consultar o DroneManagement agora." }`.
- Erro de login do DroneManagement já sai com mensagem amigável de
  `lib/dronemgmt.js`.

## Frontend — `pages/Indicadores.jsx` (`/indicadores`)

Rota lazy em `App.jsx`, protegida por login; se o backend responder `403`
(nem admin nem piloto), a página mostra "Indicadores disponíveis só para
pilotos e administradores" com o botão Voltar. Link "Indicadores de voo" no `MenuLateral`, visível só para
admin e pilotos. Visual do redesenho (Figtree, tokens `--cartao-*`, verde do
projeto para realizado).

De cima para baixo:
1. **Cabeçalho**: "← Voltar", título, período (dois `<input type="date">`
   com safra atual por padrão + atalhos "Safra atual", "Últimos 30 dias",
   "Mês atual"); admin tem seletor de piloto ("Equipe toda" + nomes vindos
   de `porPiloto`).
2. **Meu rendimento** (piloto; admin com piloto escolhido): ha, talhões,
   média ha/dia voado + barras semanais.
3. **Painel da equipe**: 4 cartões (Área total; HA realizado + % do total;
   A voar com "situação atual"; Últimos 15 dias úteis), barra de progresso
   geral, barras horizontais realizado × a voar por tipo (valores escritos
   nas barras), colunas da evolução semanal.
4. **Por piloto** (só admin): tabela ordenada por ha.
5. **Rodapé**: "Dados do DroneManagement · atualizados às HH:MM" + botão
   atualizar (`forcar=1`); aviso quando `desatualizado`.

Estados: carregando (spinner + "Buscando voos no DroneManagement…", a
primeira busca pode levar ~30s), erro com "Tentar de novo", período sem
voos, offline (último resultado salvo em `localStorage` por período/piloto,
com "sem conexão · dados de DD/MM HH:MM").

Celular (≤640px): cartões 2×2, barras em largura total, tabela com rolagem
horizontal.

Componentes de gráfico pequenos e próprios em
`components/indicadores/` (`BarrasPorTipo.jsx`, `ColunasSemanais.jsx`,
`CartaoKpi.jsx`), com stories no Storybook (mesmo padrão de
`MenuLateral.stories.jsx`).

## Documentação

- Seção nova em `docs/INTEGRACAO_DRONEMANAGEMENT.md`: "API de indicadores
  para o agente de apresentação" — URL, cabeçalho, parâmetros, contrato,
  significado de cada número (e o que **não** inclui: metas, fornecedor
  fora do agendamento). É o texto a entregar ao agente.
- `backend/.env.example`: `INDICADORES_TOKEN=`.
- `docs/SCHEMA_BANCO.md`: tabela `indicadores_voo_cache`.
- Entrada no `CLAUDE.md` (Estado atual) ao final.

## Testes

- **Unitários (`backend/test/indicadores-voo.test.js`)** sobre
  `calcularIndicadores`: limites do período e fuso; 15 dias úteis
  (atravessando fim de semana, `ate` no futuro); divisão de fornecedor
  (três variações); "Outros"; ordenação; semanas vazias com zero; piloto
  sem cadastro; `meuRendimento` só do piloto; arredondamento.
- **Rotas** (Postgres local, `fonteIndicadoresVoo` substituída por dados
  fixos — nunca DroneManagement real nos testes): piloto não recebe
  `porPiloto` e não consegue ver outro piloto; usuário comum `403`; admin
  filtra piloto; API do agente exige `x-indicadores-token` e rejeita a
  chave do Hub; datas inválidas `400`.
- **Regressão**: `/voos/pendentes/:mapaId` devolve o mesmo resultado depois
  da extração para `pendentesVoo.js`.
- **Navegador (Playwright)**: página em 1440×900, 768×1024 e 390×844
  contra backend local, como admin e como piloto; zero erro de console.
- **Conferência com dado real**: uma chamada à rota do agente com a safra
  atual comparada com os números da sonda de 2026-10-01 (só leitura).

## Implantação

- Branch `feat/indicadores-voo`, criado a partir de `feat/redesenho-mapa`
  (usa os tokens visuais do redesenho). Vai para `master` depois do
  redesenho.
- No Render: criar `INDICADORES_TOKEN` (valor gerado, entregue ao agente
  por fora do repositório).
- **Não dar push durante o horário da automação de Talhões/Limites** (o
  auto-deploy do Render mata jobs em andamento — ver CLAUDE.md).
