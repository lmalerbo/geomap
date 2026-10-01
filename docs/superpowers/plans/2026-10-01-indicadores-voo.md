# Indicadores de voo — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Página "Indicadores de voo" no GeoMap (piloto vê o próprio rendimento + painel da equipe; admin vê tudo) e rota de API só-leitura para o agente que monta a apresentação do gerente, ambas calculadas a partir dos voos "Voado" do DroneManagement.

**Architecture:** O backend busca no DroneManagement (sessão de serviço já existente) os registros voados e os pendentes, guarda uma versão enxuta numa tabela de cache no Postgres e calcula os indicadores com uma função pura (`calcularIndicadores`) compartilhada pela rota da página (JWT) e pela rota do agente (chave `x-indicadores-token`). O frontend é uma página React lazy com gráficos em SVG/CSS próprios.

**Tech Stack:** Node 20 + Express 4 (ESM), PostgreSQL (`pg`), `node:test`; React 19 + Vite, Vitest (projeto `unit`), Storybook 10, Playwright para verificação.

**Spec:** `docs/superpowers/specs/2026-10-01-indicadores-voo-design.md` — leia antes de começar.

## Global Constraints

- "Voo realizado" = registro com `verifyFlightSize === 9`. Data do voo = `startDateFlight`, convertida para data local de `America/Sao_Paulo` antes de qualquer comparação.
- "A voar" = **exatamente** a regra de pendentes do mapa de Voos (extraída para `lib/pendentesVoo.js`), sem filtro de período.
- Fornecedor = `layerDetails.transferProperty` contendo `FORNEC` (sem diferenciar maiúsculas).
- Safra padrão: 01/04 a 31/03 (`AAAA-04-01` a `(AAAA+1)-03-31`).
- `TIPOS_PRINCIPAIS` = Falhas Soca, Falhas Plantio, Ervas Daninhas, Sistematização, Levantamento Topográfico, Projeto Plantio, Projeto Colheita. Qualquer outro tipo (ou tipo ausente) → "Outros". Falhas Plantio + fornecedor → "Falhas Plantio Forn.".
- Piloto nunca recebe `porPiloto` nem dados de outro piloto; usuário que não é admin nem piloto recebe `403`.
- API do agente: cabeçalho `x-indicadores-token` = env `INDICADORES_TOKEN`. A chave do Hub (`HUB_INTEGRACAO_TOKEN`) **não** abre essa rota e a chave de indicadores não abre as rotas do Hub.
- Nunca chamar o DroneManagement em teste automatizado. Testes de rota usam `definirFonteParaTestes`.
- Testes de backend só contra Postgres local: `cd backend && DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" npm test` (o Postgres local precisa estar ligado: `pg_ctl` do Scoop; ver skill `verify`).
- Sem biblioteca nova (nem de gráfico, nem de data). Datas como strings `"AAAA-MM-DD"`.
- Nunca passar texto acentuado por argumento de shell (ver CLAUDE.md) — escreva arquivos com o editor.
- Não dar `git push` sem o Leo pedir (auto-deploy do Render mata jobs em andamento).
- Comentários e nomes em português, no mesmo estilo dos arquivos vizinhos.

## Review Focus

1. **Período que termina no futuro (o padrão, safra até 31/03/2027)** — esperado: a evolução semanal vai só até a semana de hoje (sem ~26 semanas vazias no futuro) e "últimos 15 dias úteis" termina hoje. Teste no Task 2.
2. **Voo à noite (ex.: 22h em Brasília = 01h UTC do dia seguinte)** — esperado: conta no dia local, inclusive no corte do período. Teste no Task 2.
3. **Piloto tentando `?piloto=<uuid de outro>`** — esperado: ignorado, recebe só os próprios dados, sem `porPiloto`. Teste no Task 4.
4. **DroneManagement fora do ar com cache já existente** — esperado: devolve o cache com `desatualizado: true` (não `502`). Teste no Task 3.
5. **Registro com área nula, tipo nulo ou piloto sem cadastro** — esperado: área conta como 0, tipo vai para "Outros", piloto aparece como "Piloto não cadastrado (xxxxxxxx)", sem quebrar e sem `NaN`. Teste no Task 2.

---

## File Structure

**Backend (criar)**
- `backend/src/lib/consultaDroneMgmt.js` — paginação genérica de `formdata/query` (contar, buscar tudo).
- `backend/src/lib/pendentesVoo.js` — regra de pendentes extraída de `routes/voos.js`.
- `backend/src/lib/indicadoresVoo.js` — cálculo puro + datas + período.
- `backend/src/lib/fonteIndicadoresVoo.js` — busca + cache dos realizados/pendentes.
- `backend/src/lib/nomesPilotos.js` — nome/uuid dos pilotos a partir de `pilotos_dronemgmt`.
- `backend/src/db/migrations/017_indicadores_voo_cache.sql`
- `backend/test/pendentes-voo.test.js`, `backend/test/indicadores-voo.test.js`, `backend/test/fonte-indicadores-voo.test.js`, `backend/test/indicadores-rotas.test.js`

**Backend (modificar)**
- `backend/src/routes/voos.js` — usar `pendentesVoo.js`; rotas `/voos/indicadores` e `/voos/indicadores/acesso`.
- `backend/src/routes/integracao.js` — middleware do Hub restrito a `/integracao/dronemgmt`; rota `/integracao/voos/indicadores`.
- `backend/.env.example`

**Frontend (criar)**
- `frontend/src/lib/periodoIndicadores.js` (+ `.test.js`) — datas/atalhos/formatação/cache local.
- `frontend/src/hooks/usePodeVerIndicadores.js`
- `frontend/src/components/indicadores/CartaoKpi.jsx`, `BarraProgresso.jsx`, `BarrasPorTipo.jsx`, `ColunasSemanais.jsx`, `Indicadores.stories.jsx`
- `frontend/src/pages/Indicadores.jsx`

**Frontend (modificar)**
- `frontend/src/lib/api.js`, `frontend/src/App.jsx`, `frontend/src/components/MenuLateral.jsx`, `frontend/src/pages/Inicio.jsx`, `frontend/src/pages/Mapa.jsx`, `frontend/src/index.css`

**Docs (modificar)**: `docs/INTEGRACAO_DRONEMANAGEMENT.md`, `docs/SCHEMA_BANCO.md`, `CLAUDE.md`.

---

### Task 1: Extrair a regra de pendentes e a paginação do DroneManagement

**Files:**
- Create: `backend/src/lib/consultaDroneMgmt.js`
- Create: `backend/src/lib/pendentesVoo.js`
- Modify: `backend/src/routes/voos.js` (constantes das linhas ~19-74 e corpo de `GET /voos/pendentes/:mapaId`, linhas ~89-175)
- Test: `backend/test/pendentes-voo.test.js`

**Interfaces:**
- Produces:
  - `contarRegistros(filtro: string): Promise<number>` e `buscarTodosRegistros(filtro: string): Promise<{ count: number, registros: object[] }>` em `consultaDroneMgmt.js` (sempre com `expand=layer,flightProject`).
  - `filtroPendentesDroneMgmt(unitId: string): string` (JSON do filtro), `filtrarEMapearPendentes(brutos: object[]): PendenteMapeado[]`, `mapearRegistroPendente(r): PendenteMapeado` em `pendentesVoo.js`.
  - `PendenteMapeado = { id, projeto, secao, talhao, controlStatus, verifyFlightSize, areaHa, fornecedor, propriedade }` (`propriedade` é campo novo; o resto é idêntico ao de hoje).

- [ ] **Step 1: Write the failing test**

`backend/test/pendentes-voo.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrarEMapearPendentes, filtroPendentesDroneMgmt } from "../src/lib/pendentesVoo.js";
import { ESTAGIO } from "../src/lib/regrasApontamento.js";

function bruto({ projeto, propriedade = "PROPRIA", internship = ESTAGIO.CORTE_02, harvest = 2026, area = 10 } = {}) {
  return {
    id: `id-${Math.random()}`,
    section: "10001",
    landPlot: "1",
    controlStatus: 2,
    verifyFlightSize: 5,
    flightProjectDetails: projeto ? { description: projeto } : undefined,
    layerDetails: { totalArea: area, transferProperty: propriedade, internship, harvest },
  };
}

test("Falhas Soca fora do estágio ou em fornecedor não é pendente; outras finalidades passam", () => {
  const itens = filtrarEMapearPendentes([
    bruto({ projeto: "Falhas Soca" }),
    bruto({ projeto: "Falhas Soca", propriedade: "FORNECEDOR" }),
    bruto({ projeto: "Falhas Soca", internship: ESTAGIO.CORTE_03 }),
    bruto({ projeto: "Falhas Plantio", propriedade: "FORNEC. SUBPARCERIA" }),
    bruto({ projeto: "Ervas Daninhas" }),
  ]);
  assert.deepEqual(itens.map((i) => i.projeto), ["Falhas Soca", "Falhas Plantio", "Ervas Daninhas"]);
});

test("registro mapeado mantém os campos do mapa de Voos e ganha a propriedade", () => {
  const [item] = filtrarEMapearPendentes([bruto({ projeto: "Falhas Plantio", propriedade: "FORNECEDOR", area: 12.5 })]);
  assert.deepEqual(Object.keys(item).sort(), [
    "areaHa", "controlStatus", "fornecedor", "id", "projeto", "propriedade", "secao", "talhao", "verifyFlightSize",
  ]);
  assert.equal(item.areaHa, 12.5);
  assert.equal(item.fornecedor, true);
  assert.equal(item.propriedade, "FORNECEDOR");
});

test("filtro de pendentes pede A voar com porte 5/6 da unidade", () => {
  const filtro = JSON.parse(filtroPendentesDroneMgmt("u-1"));
  assert.deepEqual(filtro, {
    $and: [
      { unitId: "UUID('u-1')" },
      { controlStatus: 2 },
      { $or: [{ verifyFlightSize: 5 }, { verifyFlightSize: 6 }] },
    ],
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/pendentes-voo.test.js`
Expected: FAIL — `Cannot find module '.../src/lib/pendentesVoo.js'`.

- [ ] **Step 3: Create `consultaDroneMgmt.js`**

```js
import { chamarApi } from "./dronemgmt.js";

// Paginação genérica do formdata/query do DroneManagement — antes vivia
// dentro da rota /voos/pendentes; agora também serve os indicadores de voo
// (lib/fonteIndicadoresVoo.js). Concorrência 5 nas páginas seguintes, mesma
// técnica dos scripts de limpeza (o DroneManagement aguentou 8 sem erro).

const CAMINHO_QUERY = "/portal/api/v1/gateway/formbuilder/formdata/query";
const TAMANHO_PAGINA = 500;
const CONCORRENCIA = 5;

async function buscarPagina(filtro, pagina, tamanhoPagina = TAMANHO_PAGINA) {
  const resp = await chamarApi(CAMINHO_QUERY, {
    params: { pageNumber: pagina, pageSize: tamanhoPagina, filter: filtro, expand: "layer,flightProject" },
  });
  if (!resp.ok) throw new Error(`DroneManagement respondeu ${resp.status}`);
  return resp.json();
}

// Checagem barata (pageSize 1) — só o total, pra decidir se um cache vale.
export async function contarRegistros(filtro) {
  const dados = await buscarPagina(filtro, 1, 1);
  return dados.count || 0;
}

export async function buscarTodosRegistros(filtro) {
  const primeira = await buscarPagina(filtro, 1);
  const registros = primeira.value || [];
  const count = primeira.count || 0;
  const totalPaginas = Math.ceil(count / TAMANHO_PAGINA);
  for (let inicio = 2; inicio <= totalPaginas; inicio += CONCORRENCIA) {
    const lote = [];
    for (let p = inicio; p < inicio + CONCORRENCIA && p <= totalPaginas; p++) lote.push(buscarPagina(filtro, p));
    for (const dados of await Promise.all(lote)) registros.push(...(dados.value || []));
  }
  return { count, registros };
}
```

- [ ] **Step 4: Create `pendentesVoo.js`**

Mova para cá, **com os comentários originais**, as constantes `VERIFY_FLIGHT_SIZE_PRONTOS`, `FINALIDADE_FALHAS_SOCA`, `PROPRIEDADES_FORNECEDOR` e a função `mapearRegistro` de `routes/voos.js` (linhas ~19-74), e o filtro de Falhas Soca (linhas ~153-166). Resultado:

```js
import { CONTROL_STATUS_A_VOAR, estagioValidoParaFalhasSoca } from "./regrasApontamento.js";

// Regra de "pendente de voo" — extraída de routes/voos.js (2026-10-01) pra
// ser a mesma no mapa de Voos e nos indicadores de voo ("a voar").

// <comentário original de VERIFY_FLIGHT_SIZE_PRONTOS>
export const VERIFY_FLIGHT_SIZE_PRONTOS = [5, 6]; // "Verificar Porte" = Voo liberado, Voar urgente

// <comentário original de FINALIDADE_FALHAS_SOCA>
const FINALIDADE_FALHAS_SOCA = "Falhas Soca";

// <comentário original de PROPRIEDADES_FORNECEDOR>
export const PROPRIEDADES_FORNECEDOR = new Set(["FORNECEDOR", "FORNEC. SUBPARCERIA", "FORNECEDOR TROCA"]);

export function filtroPendentesDroneMgmt(unitId) {
  return JSON.stringify({
    $and: [
      { unitId: `UUID('${unitId}')` },
      { controlStatus: CONTROL_STATUS_A_VOAR },
      { $or: VERIFY_FLIGHT_SIZE_PRONTOS.map((v) => ({ verifyFlightSize: v })) },
    ],
  });
}

export function mapearRegistroPendente(r) {
  return {
    // <corpo e comentários originais de mapearRegistro>
    id: r.id,
    projeto: r.flightProjectDetails?.description || null,
    secao: r.section,
    talhao: r.landPlot,
    controlStatus: r.controlStatus,
    verifyFlightSize: r.verifyFlightSize,
    areaHa: r.layerDetails?.totalArea ?? null,
    fornecedor: PROPRIEDADES_FORNECEDOR.has(r.layerDetails?.transferProperty),
    // Propriedade crua — os indicadores de voo dividem Falhas Plantio em
    // próprio/fornecedor por ela (qualquer valor com "FORNEC").
    propriedade: r.layerDetails?.transferProperty ?? null,
  };
}

// <comentário original do filtro de Falhas Soca>
export function filtrarEMapearPendentes(brutos) {
  return brutos
    .filter((r) => {
      if (r.flightProjectDetails?.description === FINALIDADE_FALHAS_SOCA) {
        return estagioValidoParaFalhasSoca(r.layerDetails) && !PROPRIEDADES_FORNECEDOR.has(r.layerDetails?.transferProperty);
      }
      return true;
    })
    .map(mapearRegistroPendente);
}
```

(Substitua cada `<comentário original ...>` pelo texto que já existe em `voos.js` — não invente comentário novo.)

- [ ] **Step 5: Use os módulos em `routes/voos.js`**

Apague as constantes/funções movidas. No handler `GET /voos/pendentes/:mapaId`, troque a montagem do filtro, `buscarPagina`, o laço de páginas e o filtro de Falhas Soca por:

```js
  const filtro = filtroPendentesDroneMgmt(UNIT_ID);
  const forcar = req.query.forcar === "1";

  try {
    const countAtual = await contarRegistros(filtro);

    if (!forcar) {
      // (bloco do cache voos_pendentes_cache exatamente como hoje)
    }

    const { count, registros: registrosBrutos } = await buscarTodosRegistros(filtro);
    const registros = filtrarEMapearPendentes(registrosBrutos);
    // (INSERT ... ON CONFLICT em voos_pendentes_cache e res.json(registros) como hoje)
  } catch (err) {
    return res.status(502).json({ erro: err.message });
  }
```

Imports novos no topo:

```js
import { contarRegistros, buscarTodosRegistros } from "../lib/consultaDroneMgmt.js";
import { filtroPendentesDroneMgmt, filtrarEMapearPendentes } from "../lib/pendentesVoo.js";
```

Remova imports que ficaram sem uso. Confira com:
Run: `cd backend && grep -n "CONTROL_STATUS_A_VOAR\|estagioValidoParaFalhasSoca\|PROPRIEDADES_FORNECEDOR\|VERIFY_FLIGHT_SIZE_PRONTOS\|TAMANHO_PAGINA\|buscarPagina\|chamarApi" src/routes/voos.js`
Expected: só aparecem os usos que ainda existem de verdade (ex.: `chamarApi` em `/voos/apontamentos`); nenhum import morto.

- [ ] **Step 6: Run tests**

Run: `cd backend && node --test test/pendentes-voo.test.js test/regras-apontamento.test.js`
Expected: PASS (todos).

Run: `cd backend && node -e "import('./src/routes/voos.js').then(() => console.log('ok'))"`
Expected: `ok` (sem erro de import/sintaxe).

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/consultaDroneMgmt.js backend/src/lib/pendentesVoo.js backend/src/routes/voos.js backend/test/pendentes-voo.test.js
git commit -m "Extrai regra de pendentes e paginação do DroneManagement para módulos próprios"
```

---

### Task 2: Cálculo puro dos indicadores

**Files:**
- Create: `backend/src/lib/indicadoresVoo.js`
- Test: `backend/test/indicadores-voo.test.js`

**Interfaces:**
- Consumes: `PendenteMapeado` (Task 1) — usa `projeto`, `areaHa`, `propriedade`.
- Produces (todas exportadas):
  - `Realizado = { id, dataVoo: string ISO UTC, pilotoId: string, tipo: string|null, secao, talhao, fazenda, areaHa: number|null, propriedade: string|null }`
  - `dataLocal(iso: string): "AAAA-MM-DD"`, `hojeLocal(agora?: Date): "AAAA-MM-DD"`
  - `safraDe(hoje: string): { de, ate }`
  - `lerPeriodo(query: {de?, ate?}, hoje: string): { de, ate } | { erro: string }`
  - `categoriaDoTipo(tipo, propriedade): string`
  - `TIPOS_PRINCIPAIS`, `TIPO_OUTROS = "Outros"`, `TIPO_FALHAS_PLANTIO_FORN = "Falhas Plantio Forn."`
  - `calcularIndicadores({ realizados, pendentes, de, ate, hoje, pilotoId?, nomesPilotos?, incluirPorPiloto? })` → objeto do contrato do spec **sem** `atualizadoEm`/`desatualizado` (as rotas acrescentam).

- [ ] **Step 1: Write the failing tests**

`backend/test/indicadores-voo.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  calcularIndicadores, dataLocal, safraDe, lerPeriodo, categoriaDoTipo,
} from "../src/lib/indicadoresVoo.js";

const P1 = "aaaaaaaa-1111-1111-1111-111111111111";
const P2 = "bbbbbbbb-2222-2222-2222-222222222222";
let seq = 0;
function voo(dataVoo, { tipo = "Falhas Soca", areaHa = 10, pilotoId = P1, propriedade = "PROPRIA" } = {}) {
  seq += 1;
  return { id: `r${seq}`, dataVoo, pilotoId, tipo, secao: "10001", talhao: String(seq), fazenda: "X", areaHa, propriedade };
}
function pendente(projeto, areaHa, propriedade = "PROPRIA") {
  return { id: `p${Math.random()}`, projeto, areaHa, propriedade };
}
const base = { de: "2026-04-01", ate: "2027-03-31", hoje: "2026-10-01" };

test("data do voo usa o dia de Brasília, não o de UTC", () => {
  assert.equal(dataLocal("2026-04-02T01:00:00Z"), "2026-04-01"); // 22h do dia 1 em Brasília
  const r = calcularIndicadores({
    ...base, de: "2026-04-02", ate: "2026-04-02",
    realizados: [voo("2026-04-02T01:00:00Z"), voo("2026-04-02T15:00:00Z")], pendentes: [],
  });
  assert.equal(r.resumo.realizadoTalhoes, 1);
});

test("resumo soma realizado no período + a voar atual e calcula progresso", () => {
  const r = calcularIndicadores({
    ...base,
    realizados: [voo("2026-05-04T15:00:00Z", { areaHa: 30 }), voo("2026-03-31T15:00:00Z", { areaHa: 999 })],
    pendentes: [pendente("Falhas Soca", 10)],
  });
  assert.deepEqual(r.resumo, {
    realizadoHa: 30, realizadoTalhoes: 1, aVoarHa: 10, aVoarTalhoes: 1, totalHa: 40, progresso: 0.75,
  });
  assert.deepEqual(r.periodo, { de: "2026-04-01", ate: "2027-03-31" });
});

test("período vazio não gera NaN", () => {
  const r = calcularIndicadores({ ...base, realizados: [], pendentes: [] });
  assert.equal(r.resumo.progresso, 0);
  assert.equal(r.resumo.totalHa, 0);
  assert.deepEqual(r.porTipo, []);
});

test("área nula conta 0, tipo nulo e tipo não principal vão para Outros (sempre por último)", () => {
  const r = calcularIndicadores({
    ...base,
    realizados: [
      voo("2026-05-04T15:00:00Z", { tipo: null, areaHa: null }),
      voo("2026-05-04T15:00:00Z", { tipo: "Sinistro", areaHa: 500 }),
      voo("2026-05-04T15:00:00Z", { tipo: "Ervas Daninhas", areaHa: 5 }),
    ],
    pendentes: [pendente(null, null)],
  });
  assert.deepEqual(r.porTipo.map((t) => t.tipo), ["Ervas Daninhas", "Outros"]);
  const outros = r.porTipo.find((t) => t.tipo === "Outros");
  assert.equal(outros.realizadoHa, 500);
  assert.equal(outros.realizadoTalhoes, 2);
  assert.equal(outros.aVoarHa, 0);
  assert.equal(outros.aVoarTalhoes, 1);
  assert.ok(!Number.isNaN(r.resumo.realizadoHa));
});

test("Falhas Plantio de fornecedor (as três variações) vira Falhas Plantio Forn.; Falhas Soca não divide", () => {
  assert.equal(categoriaDoTipo("Falhas Plantio", "FORNECEDOR"), "Falhas Plantio Forn.");
  assert.equal(categoriaDoTipo("Falhas Plantio", "FORNEC. SUBPARCERIA"), "Falhas Plantio Forn.");
  assert.equal(categoriaDoTipo("Falhas Plantio", "fornecedor troca"), "Falhas Plantio Forn.");
  assert.equal(categoriaDoTipo("Falhas Plantio", "PARCERIA/ARREND"), "Falhas Plantio");
  assert.equal(categoriaDoTipo("Falhas Soca", "FORNECEDOR"), "Falhas Soca");
  assert.equal(categoriaDoTipo("Expansões", null), "Outros");
});

test("porTipo ordena por realizado + a voar, decrescente, e arredonda a 2 casas", () => {
  const r = calcularIndicadores({
    ...base,
    realizados: [
      voo("2026-05-04T15:00:00Z", { tipo: "Ervas Daninhas", areaHa: 1.111 }),
      voo("2026-05-04T15:00:00Z", { tipo: "Falhas Soca", areaHa: 2 }),
    ],
    pendentes: [pendente("Ervas Daninhas", 5)],
  });
  assert.deepEqual(r.porTipo.map((t) => [t.tipo, t.realizadoHa, t.aVoarHa]), [
    ["Ervas Daninhas", 1.11, 5],
    ["Falhas Soca", 2, 0],
  ]);
});

test("últimos 15 dias úteis terminam em min(ate, hoje) e pulam fim de semana", () => {
  // hoje = quinta 2026-10-01; 15 dias úteis para trás começam na sexta 2026-09-11
  const r = calcularIndicadores({
    ...base,
    realizados: [
      voo("2026-09-11T15:00:00Z", { areaHa: 1 }),
      voo("2026-09-12T15:00:00Z", { areaHa: 2 }), // sábado dentro da janela: conta
      voo("2026-09-10T15:00:00Z", { areaHa: 100 }), // antes da janela
      voo("2026-10-01T15:00:00Z", { areaHa: 4 }),
    ],
    pendentes: [],
  });
  assert.deepEqual(r.ultimos15DiasUteis, { de: "2026-09-11", ate: "2026-10-01", ha: 7, talhoes: 3, diasComVoo: 3 });
});

test("período no passado: janela de 15 dias úteis termina no fim do período", () => {
  const r = calcularIndicadores({ ...base, de: "2026-05-01", ate: "2026-05-31", realizados: [], pendentes: [] });
  assert.equal(r.ultimos15DiasUteis.ate, "2026-05-29"); // 31/05 é domingo → última sexta
});

test("evolução semanal vai até a semana de hoje, com zero nas semanas sem voo", () => {
  const r = calcularIndicadores({
    ...base, de: "2026-09-14", ate: "2027-03-31",
    realizados: [voo("2026-09-16T15:00:00Z", { areaHa: 3 })],
    pendentes: [],
  });
  assert.deepEqual(r.porSemana, [
    { semana: "2026-W38", inicio: "2026-09-14", ha: 3, talhoes: 1 },
    { semana: "2026-W39", inicio: "2026-09-21", ha: 0, talhoes: 0 },
    { semana: "2026-W40", inicio: "2026-09-28", ha: 0, talhoes: 0 },
  ]);
});

test("semana ISO no começo do ano usa o ano da quinta-feira", () => {
  const r = calcularIndicadores({
    ...base, de: "2026-12-28", ate: "2027-01-03", hoje: "2027-01-10",
    realizados: [voo("2026-12-29T15:00:00Z")], pendentes: [],
  });
  assert.deepEqual(r.porSemana.map((s) => s.semana), ["2026-W53"]);
});

test("por piloto: nome do cadastro, ou 'Piloto não cadastrado (8 chars)'; média por dia voado", () => {
  const r = calcularIndicadores({
    ...base, incluirPorPiloto: true, nomesPilotos: { [P1]: "Ana" },
    realizados: [
      voo("2026-05-04T15:00:00Z", { pilotoId: P1, areaHa: 10 }),
      voo("2026-05-04T18:00:00Z", { pilotoId: P1, areaHa: 20 }),
      voo("2026-05-05T15:00:00Z", { pilotoId: P1, areaHa: 30 }),
      voo("2026-05-05T15:00:00Z", { pilotoId: P2, areaHa: 5 }),
    ],
    pendentes: [],
  });
  assert.deepEqual(r.porPiloto, [
    { pilotoId: P1, piloto: "Ana", ha: 60, talhoes: 3, diasVoados: 2, mediaHaPorDia: 30 },
    { pilotoId: P2, piloto: "Piloto não cadastrado (bbbbbbbb)", ha: 5, talhoes: 1, diasVoados: 1, mediaHaPorDia: 5 },
  ]);
});

test("meuRendimento só com os voos do piloto; painel da equipe continua com todos; sem porPiloto por padrão", () => {
  const r = calcularIndicadores({
    ...base, pilotoId: P2, nomesPilotos: {},
    realizados: [voo("2026-09-16T15:00:00Z", { pilotoId: P1, areaHa: 10 }), voo("2026-09-16T15:00:00Z", { pilotoId: P2, areaHa: 4 })],
    pendentes: [],
  });
  assert.equal(r.resumo.realizadoHa, 14);
  assert.equal(r.meuRendimento.ha, 4);
  assert.equal(r.meuRendimento.pilotoId, P2);
  assert.equal(r.meuRendimento.porSemana.find((s) => s.inicio === "2026-09-14").ha, 4);
  assert.equal(r.porPiloto, undefined);
});

test("safra: de abril a março", () => {
  assert.deepEqual(safraDe("2026-10-01"), { de: "2026-04-01", ate: "2027-03-31" });
  assert.deepEqual(safraDe("2027-03-31"), { de: "2026-04-01", ate: "2027-03-31" });
  assert.deepEqual(safraDe("2027-04-01"), { de: "2027-04-01", ate: "2028-03-31" });
});

test("lerPeriodo: padrão safra, valida formato, data inexistente e de > ate", () => {
  assert.deepEqual(lerPeriodo({}, "2026-10-01"), { de: "2026-04-01", ate: "2027-03-31" });
  assert.deepEqual(lerPeriodo({ de: "2026-05-01", ate: "2026-05-31" }, "2026-10-01"), { de: "2026-05-01", ate: "2026-05-31" });
  assert.ok(lerPeriodo({ de: "01/05/2026", ate: "2026-05-31" }, "2026-10-01").erro);
  assert.ok(lerPeriodo({ de: "2026-02-30", ate: "2026-05-31" }, "2026-10-01").erro);
  assert.ok(lerPeriodo({ de: "2026-06-01", ate: "2026-05-31" }, "2026-10-01").erro);
  assert.ok(lerPeriodo({ de: "2026-05-01" }, "2026-10-01").erro); // só um dos dois
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/indicadores-voo.test.js`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implement `indicadoresVoo.js`**

```js
// Cálculo dos indicadores de voo (página /indicadores e API do agente de
// apresentação) — função pura, sem rede nem banco. Ver
// docs/superpowers/specs/2026-10-01-indicadores-voo-design.md.
//
// Datas sempre como "AAAA-MM-DD" no fuso de Brasília: o DroneManagement
// grava startDateFlight em UTC, e um voo às 22h cairia no dia seguinte.

export const TIPOS_PRINCIPAIS = [
  "Falhas Soca",
  "Falhas Plantio",
  "Ervas Daninhas",
  "Sistematização",
  "Levantamento Topográfico",
  "Projeto Plantio",
  "Projeto Colheita",
];
export const TIPO_OUTROS = "Outros";
export const TIPO_FALHAS_PLANTIO_FORN = "Falhas Plantio Forn.";

const DIAS_UTEIS_JANELA = 15;

const formatadorDataLocal = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dataLocal(iso) {
  return formatadorDataLocal.format(new Date(iso));
}

export function hojeLocal(agora = new Date()) {
  return formatadorDataLocal.format(agora);
}

function paraData(dia) {
  return new Date(`${dia}T00:00:00Z`);
}

function somarDias(dia, n) {
  const d = paraData(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diaDaSemana(dia) {
  return paraData(dia).getUTCDay(); // 0 = domingo
}

function segundaDaSemana(dia) {
  return somarDias(dia, -((diaDaSemana(dia) + 6) % 7));
}

// Semana ISO: pertence ao ano da sua quinta-feira.
function rotuloSemana(segunda) {
  const quinta = somarDias(segunda, 3);
  const ano = quinta.slice(0, 4);
  const diaDoAno = Math.round((paraData(quinta) - paraData(`${ano}-01-01`)) / 86_400_000) + 1;
  const numero = Math.floor((diaDoAno - 1) / 7) + 1;
  return `${ano}-W${String(numero).padStart(2, "0")}`;
}

function arredondar(n, casas = 2) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

function area(registro) {
  return Number(registro.areaHa) || 0;
}

export function safraDe(hoje) {
  const [ano, mes] = hoje.split("-").map(Number);
  const inicio = mes >= 4 ? ano : ano - 1;
  return { de: `${inicio}-04-01`, ate: `${inicio + 1}-03-31` };
}

function dataValida(dia) {
  return typeof dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dia) && !Number.isNaN(paraData(dia).getTime()) &&
    paraData(dia).toISOString().slice(0, 10) === dia;
}

export function lerPeriodo({ de, ate } = {}, hoje) {
  if (!de && !ate) return safraDe(hoje);
  if (!dataValida(de) || !dataValida(ate)) return { erro: "de e ate precisam estar no formato AAAA-MM-DD" };
  if (de > ate) return { erro: "de não pode ser depois de ate" };
  return { de, ate };
}

export function ehFornecedor(propriedade) {
  return /FORNEC/i.test(propriedade || "");
}

export function categoriaDoTipo(tipo, propriedade) {
  if (tipo === "Falhas Plantio" && ehFornecedor(propriedade)) return TIPO_FALHAS_PLANTIO_FORN;
  return TIPOS_PRINCIPAIS.includes(tipo) ? tipo : TIPO_OUTROS;
}

function nomeDoPiloto(pilotoId, nomesPilotos) {
  return nomesPilotos[pilotoId] ?? `Piloto não cadastrado (${String(pilotoId).slice(0, 8)})`;
}

// Semanas (segunda a domingo) de `de` até `fim`; vazio se fim < de.
function semanasDoPeriodo(de, fim) {
  const semanas = [];
  if (fim < de) return semanas;
  for (let s = segundaDaSemana(de); s <= fim; s = somarDias(s, 7)) semanas.push(s);
  return semanas;
}

function agruparPorSemana(voos, segundas) {
  const porSegunda = new Map(segundas.map((s) => [s, { semana: rotuloSemana(s), inicio: s, ha: 0, talhoes: 0 }]));
  for (const v of voos) {
    const item = porSegunda.get(segundaDaSemana(v.dia));
    if (!item) continue;
    item.ha += area(v);
    item.talhoes += 1;
  }
  return [...porSegunda.values()].map((s) => ({ ...s, ha: arredondar(s.ha) }));
}

function estatisticasPiloto(voos) {
  const ha = voos.reduce((s, v) => s + area(v), 0);
  const diasVoados = new Set(voos.map((v) => v.dia)).size;
  return {
    ha: arredondar(ha),
    talhoes: voos.length,
    diasVoados,
    mediaHaPorDia: diasVoados ? arredondar(ha / diasVoados) : 0,
  };
}

function ultimosDiasUteis(fim, quantidade) {
  const dias = [];
  for (let d = fim; dias.length < quantidade; d = somarDias(d, -1)) {
    const dow = diaDaSemana(d);
    if (dow !== 0 && dow !== 6) dias.push(d);
  }
  return { de: dias[dias.length - 1], ate: dias[0] };
}

export function calcularIndicadores({
  realizados,
  pendentes,
  de,
  ate,
  hoje,
  pilotoId = null,
  nomesPilotos = {},
  incluirPorPiloto = false,
}) {
  const todos = realizados.map((r) => ({ ...r, dia: dataLocal(r.dataVoo) }));
  const noPeriodo = todos.filter((r) => r.dia >= de && r.dia <= ate);
  const fimAteHoje = ate < hoje ? ate : hoje;

  const realizadoHa = noPeriodo.reduce((s, r) => s + area(r), 0);
  const aVoarHa = pendentes.reduce((s, p) => s + area(p), 0);
  const totalHa = realizadoHa + aVoarHa;

  // Janela dos 15 dias úteis: conta todo voo entre o 1º e o último dia útil
  // (inclusive fim de semana no meio), independente do início do período.
  const janela = ultimosDiasUteis(fimAteHoje, DIAS_UTEIS_JANELA);
  const naJanela = todos.filter((r) => r.dia >= janela.de && r.dia <= janela.ate);

  const tipos = new Map();
  const doTipo = (nome) => {
    if (!tipos.has(nome)) tipos.set(nome, { tipo: nome, realizadoHa: 0, realizadoTalhoes: 0, aVoarHa: 0, aVoarTalhoes: 0 });
    return tipos.get(nome);
  };
  for (const r of noPeriodo) {
    const t = doTipo(categoriaDoTipo(r.tipo, r.propriedade));
    t.realizadoHa += area(r);
    t.realizadoTalhoes += 1;
  }
  for (const p of pendentes) {
    const t = doTipo(categoriaDoTipo(p.projeto, p.propriedade));
    t.aVoarHa += area(p);
    t.aVoarTalhoes += 1;
  }
  const porTipo = [...tipos.values()]
    .map((t) => ({ ...t, realizadoHa: arredondar(t.realizadoHa), aVoarHa: arredondar(t.aVoarHa) }))
    .sort((a, b) => {
      if (a.tipo === TIPO_OUTROS) return 1;
      if (b.tipo === TIPO_OUTROS) return -1;
      return b.realizadoHa + b.aVoarHa - (a.realizadoHa + a.aVoarHa);
    });

  const segundas = semanasDoPeriodo(de, fimAteHoje);

  const resultado = {
    periodo: { de, ate },
    resumo: {
      realizadoHa: arredondar(realizadoHa),
      realizadoTalhoes: noPeriodo.length,
      aVoarHa: arredondar(aVoarHa),
      aVoarTalhoes: pendentes.length,
      totalHa: arredondar(totalHa),
      progresso: totalHa > 0 ? arredondar(realizadoHa / totalHa, 4) : 0,
    },
    ultimos15DiasUteis: {
      ...janela,
      ha: arredondar(naJanela.reduce((s, r) => s + area(r), 0)),
      talhoes: naJanela.length,
      diasComVoo: new Set(naJanela.map((r) => r.dia)).size,
    },
    porTipo,
    porSemana: agruparPorSemana(noPeriodo, segundas),
  };

  if (incluirPorPiloto) {
    const porId = new Map();
    for (const r of noPeriodo) {
      if (!porId.has(r.pilotoId)) porId.set(r.pilotoId, []);
      porId.get(r.pilotoId).push(r);
    }
    resultado.porPiloto = [...porId.entries()]
      .map(([id, voos]) => ({ pilotoId: id, piloto: nomeDoPiloto(id, nomesPilotos), ...estatisticasPiloto(voos) }))
      .sort((a, b) => b.ha - a.ha);
  }

  if (pilotoId) {
    const meus = noPeriodo.filter((r) => r.pilotoId === pilotoId);
    resultado.meuRendimento = {
      pilotoId,
      piloto: nomeDoPiloto(pilotoId, nomesPilotos),
      ...estatisticasPiloto(meus),
      porSemana: agruparPorSemana(meus, segundas),
    };
  }

  return resultado;
}
```

- [ ] **Step 4: Run tests**

Run: `cd backend && node --test test/indicadores-voo.test.js`
Expected: PASS (13 testes). Se a semana ISO falhar, confira o teste `2026-W53` (28/12/2026 é segunda; 2026 tem 53 semanas ISO).

- [ ] **Step 5: Commit**

```bash
git add backend/src/lib/indicadoresVoo.js backend/test/indicadores-voo.test.js
git commit -m "Cálculo puro dos indicadores de voo (período, tipos, semanas, pilotos)"
```

---

### Task 3: Fonte dos dados com cache no Postgres

**Files:**
- Create: `backend/src/db/migrations/017_indicadores_voo_cache.sql`
- Create: `backend/src/lib/fonteIndicadoresVoo.js`
- Create: `backend/src/lib/nomesPilotos.js`
- Test: `backend/test/fonte-indicadores-voo.test.js`

**Interfaces:**
- Consumes: `contarRegistros`, `buscarTodosRegistros` (Task 1); `filtroPendentesDroneMgmt`, `filtrarEMapearPendentes` (Task 1); `VERSAO_REGRA_PENDENTES` de `regrasApontamento.js`.
- Produces:
  - `obterDadosIndicadores({ forcar?: boolean }): Promise<{ realizados: Realizado[], pendentes: PendenteMapeado[], atualizadoEm: string ISO, desatualizado: boolean }>`
  - `definirFonteParaTestes(fn | null)` — quando definido, `obterDadosIndicadores` devolve `fn({ forcar })` sem tocar rede/banco.
  - `mapearRegistroRealizado(r): Realizado`, `filtroRealizadosDroneMgmt(unitId): string`, `cacheAindaValido(cache, countAtual, agoraMs): boolean`, `obterConjunto({ chave, filtro, transformar, forcar, consulta, armazenamento })`, `VALIDADE_CACHE_MS`, `VERSAO_CACHE`.
  - `lerNomesPilotos(): Promise<Record<uuid, nome>>`, `pilotoDoUsuario(usuarioId): Promise<uuid|null>` (uuids em minúsculas).

- [ ] **Step 1: Write the failing test**

`backend/test/fonte-indicadores-voo.test.js`:

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapearRegistroRealizado, cacheAindaValido, obterConjunto, VALIDADE_CACHE_MS, VERSAO_CACHE, filtroRealizadosDroneMgmt,
} from "../src/lib/fonteIndicadoresVoo.js";

test("registro voado vira o formato enxuto", () => {
  const r = mapearRegistroRealizado({
    id: "x", startDateFlight: "2026-05-04T15:00:00Z", pilotUserADId: "ABC-1", section: "10001", landPlot: "2",
    flightProjectDetails: { description: "Falhas Plantio" },
    layerDetails: { descriptionSection: "LAGOINHA [10001]", totalArea: 21.4, transferProperty: "FORNECEDOR" },
  });
  assert.deepEqual(r, {
    id: "x", dataVoo: "2026-05-04T15:00:00Z", pilotoId: "abc-1", tipo: "Falhas Plantio", secao: "10001", talhao: "2",
    fazenda: "LAGOINHA [10001]", areaHa: 21.4, propriedade: "FORNECEDOR",
  });
});

test("filtro de realizados pede Verificar porte = Voado da unidade", () => {
  assert.deepEqual(JSON.parse(filtroRealizadosDroneMgmt("u-1")), { $and: [{ unitId: "UUID('u-1')" }, { verifyFlightSize: 9 }] });
});

test("cache vale só com mesma contagem, mesma versão e menos de 1h", () => {
  const agora = 10_000_000;
  const cache = { versao: VERSAO_CACHE, count: 5, atualizadoEmMs: agora - 1000 };
  assert.equal(cacheAindaValido(cache, 5, agora), true);
  assert.equal(cacheAindaValido(cache, 6, agora), false);
  assert.equal(cacheAindaValido({ ...cache, versao: "velha" }, 5, agora), false);
  assert.equal(cacheAindaValido({ ...cache, atualizadoEmMs: agora - VALIDADE_CACHE_MS - 1 }, 5, agora), false);
  assert.equal(cacheAindaValido(null, 5, agora), false);
});

function armazenamentoFalso(inicial) {
  let cache = inicial;
  const gravacoes = [];
  return {
    gravacoes,
    lerCache: async () => cache,
    gravarCache: async (chave, count, itens) => {
      gravacoes.push({ chave, count, itens });
      cache = { versao: VERSAO_CACHE, count, itens, atualizadoEmMs: Date.now(), atualizadoEm: "2026-10-01T12:00:00Z" };
      return cache.atualizadoEm;
    },
  };
}

test("DroneManagement fora do ar com cache existente devolve o cache marcado como desatualizado", async () => {
  const armazenamento = armazenamentoFalso({
    versao: VERSAO_CACHE, count: 1, itens: [{ id: "velho" }], atualizadoEmMs: 0, atualizadoEm: "2026-09-30T10:00:00Z",
  });
  const consulta = {
    contarRegistros: async () => { throw new Error("fora do ar"); },
    buscarTodosRegistros: async () => { throw new Error("fora do ar"); },
  };
  const r = await obterConjunto({ chave: "realizados", filtro: "{}", transformar: (x) => x, forcar: false, consulta, armazenamento });
  assert.deepEqual(r, { itens: [{ id: "velho" }], atualizadoEm: "2026-09-30T10:00:00Z", desatualizado: true });
});

test("DroneManagement fora do ar sem cache propaga o erro", async () => {
  const consulta = { contarRegistros: async () => { throw new Error("fora do ar"); }, buscarTodosRegistros: async () => [] };
  await assert.rejects(
    obterConjunto({ chave: "realizados", filtro: "{}", transformar: (x) => x, forcar: false, consulta, armazenamento: armazenamentoFalso(null) }),
    /fora do ar/
  );
});

test("contagem diferente rebusca, transforma e grava; contagem igual reusa sem buscar", async () => {
  const armazenamento = armazenamentoFalso(null);
  let buscas = 0;
  const consulta = {
    contarRegistros: async () => 2,
    buscarTodosRegistros: async () => { buscas += 1; return { count: 2, registros: [{ id: 1 }, { id: 2 }] }; },
  };
  const args = { chave: "realizados", filtro: "{}", transformar: (rs) => rs.map((r) => ({ id: `m${r.id}` })), forcar: false, consulta, armazenamento };
  const primeira = await obterConjunto(args);
  assert.deepEqual(primeira.itens, [{ id: "m1" }, { id: "m2" }]);
  assert.equal(primeira.desatualizado, false);
  await obterConjunto(args);
  assert.equal(buscas, 1);
  await obterConjunto({ ...args, forcar: true });
  assert.equal(buscas, 2);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && node --test test/fonte-indicadores-voo.test.js`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Migration**

`backend/src/db/migrations/017_indicadores_voo_cache.sql`:

```sql
-- Cache dos registros do DroneManagement usados pelos indicadores de voo
-- (página /indicadores e API do agente de apresentação — ver
-- docs/superpowers/specs/2026-10-01-indicadores-voo-design.md). Uma linha
-- por conjunto: 'realizados' (Verificar porte = Voado) e 'pendentes'
-- (mesma regra do mapa de Voos). Tabela própria em vez de reusar
-- voos_pendentes_cache, que é por mapa_id (com FK).
--
-- registros = { versao, itens } — versao muda quando o formato enxuto ou a
-- regra de pendentes muda, e aí o cache conta como vencido.
CREATE TABLE IF NOT EXISTS indicadores_voo_cache (
  chave TEXT PRIMARY KEY,
  count_dronemgmt INTEGER NOT NULL,
  registros JSONB NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
```

Run: `cd backend && DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" npm run migrate`
Expected: aplica `017_indicadores_voo_cache.sql` sem erro.

- [ ] **Step 4: Implement `fonteIndicadoresVoo.js`**

```js
import { pool } from "../db/pool.js";
import { contarRegistros, buscarTodosRegistros } from "./consultaDroneMgmt.js";
import { filtroPendentesDroneMgmt, filtrarEMapearPendentes } from "./pendentesVoo.js";
import { VERSAO_REGRA_PENDENTES } from "./regrasApontamento.js";

// Dados crus dos indicadores de voo: voos realizados (Verificar porte =
// Voado) e pendentes (regra do mapa de Voos), com cache no Postgres
// (indicadores_voo_cache, migration 017). Buscar os ~4.400 voados leva ~9s
// local e bem mais no Render; o cache é reusado se a contagem do
// DroneManagement não mudou E tem menos de 1h — o limite de tempo pega
// edição de registro que não muda a contagem (ex.: data do voo corrigida).

export const VALIDADE_CACHE_MS = 60 * 60 * 1000;
export const VERSAO_CACHE = `indicadores-v1+${VERSAO_REGRA_PENDENTES}`;
const VERIFY_FLIGHT_SIZE_VOADO = 9;

export function filtroRealizadosDroneMgmt(unitId) {
  return JSON.stringify({ $and: [{ unitId: `UUID('${unitId}')` }, { verifyFlightSize: VERIFY_FLIGHT_SIZE_VOADO }] });
}

export function mapearRegistroRealizado(r) {
  return {
    id: r.id,
    dataVoo: r.startDateFlight,
    pilotoId: String(r.pilotUserADId || "").toLowerCase(),
    tipo: r.flightProjectDetails?.description || null,
    secao: r.section,
    talhao: r.landPlot,
    fazenda: r.layerDetails?.descriptionSection ?? null,
    areaHa: r.layerDetails?.totalArea ?? null,
    propriedade: r.layerDetails?.transferProperty ?? null,
  };
}

export function cacheAindaValido(cache, countAtual, agoraMs) {
  return (
    !!cache &&
    cache.versao === VERSAO_CACHE &&
    cache.count === countAtual &&
    agoraMs - cache.atualizadoEmMs < VALIDADE_CACHE_MS
  );
}

async function lerCache(chave) {
  const { rows } = await pool.query(
    "SELECT count_dronemgmt, registros, atualizado_em FROM indicadores_voo_cache WHERE chave = $1",
    [chave]
  );
  if (!rows[0]) return null;
  const { count_dronemgmt, registros, atualizado_em } = rows[0];
  return {
    count: count_dronemgmt,
    versao: registros?.versao,
    itens: registros?.itens || [],
    atualizadoEmMs: atualizado_em.getTime(),
    atualizadoEm: atualizado_em.toISOString(),
  };
}

async function gravarCache(chave, count, itens) {
  const { rows } = await pool.query(
    `INSERT INTO indicadores_voo_cache (chave, count_dronemgmt, registros, atualizado_em)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (chave) DO UPDATE SET count_dronemgmt = $2, registros = $3, atualizado_em = now()
     RETURNING atualizado_em`,
    [chave, count, JSON.stringify({ versao: VERSAO_CACHE, itens })]
  );
  return rows[0].atualizado_em.toISOString();
}

// `consulta`/`armazenamento` injetáveis só pra teste (sem rede nem banco).
export async function obterConjunto({
  chave,
  filtro,
  transformar,
  forcar,
  consulta = { contarRegistros, buscarTodosRegistros },
  armazenamento = { lerCache, gravarCache },
}) {
  const cache = await armazenamento.lerCache(chave);
  try {
    const countAtual = await consulta.contarRegistros(filtro);
    if (!forcar && cacheAindaValido(cache, countAtual, Date.now())) {
      return { itens: cache.itens, atualizadoEm: cache.atualizadoEm, desatualizado: false };
    }
    const { count, registros } = await consulta.buscarTodosRegistros(filtro);
    const itens = transformar(registros);
    const atualizadoEm = await armazenamento.gravarCache(chave, count, itens);
    return { itens, atualizadoEm, desatualizado: false };
  } catch (err) {
    if (!cache) throw err;
    console.error(`Indicadores de voo: usando cache antigo de '${chave}':`, err);
    return { itens: cache.itens, atualizadoEm: cache.atualizadoEm, desatualizado: true };
  }
}

let emAndamento = null;
let fonteDeTeste = null;

export function definirFonteParaTestes(fn) {
  fonteDeTeste = fn;
}

// Sequencial de propósito (não Promise.all): sem sessão em cache, duas
// buscas em paralelo abririam dois Chromium pra logar no DroneManagement —
// o container do Render tem só 512MB (ver lib/dronemgmt.js).
// Pedidos simultâneos compartilham a mesma busca em andamento.
export function obterDadosIndicadores({ forcar = false } = {}) {
  if (fonteDeTeste) return Promise.resolve(fonteDeTeste({ forcar }));
  if (emAndamento) return emAndamento;
  const unitId = process.env.DRONEMGMT_UNIT_ID || "";
  emAndamento = (async () => {
    const realizados = await obterConjunto({
      chave: "realizados",
      filtro: filtroRealizadosDroneMgmt(unitId),
      transformar: (rs) => rs.map(mapearRegistroRealizado),
      forcar,
    });
    const pendentes = await obterConjunto({
      chave: "pendentes",
      filtro: filtroPendentesDroneMgmt(unitId),
      transformar: filtrarEMapearPendentes,
      forcar,
    });
    return {
      realizados: realizados.itens,
      pendentes: pendentes.itens,
      // o mais antigo dos dois — é o que limita o quão atual o painel está
      atualizadoEm: realizados.atualizadoEm < pendentes.atualizadoEm ? realizados.atualizadoEm : pendentes.atualizadoEm,
      desatualizado: realizados.desatualizado || pendentes.desatualizado,
    };
  })().finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}
```

- [ ] **Step 5: Implement `nomesPilotos.js`**

```js
import { pool } from "../db/pool.js";

// Pilotos = usuários do GeoMap com linha em pilotos_dronemgmt (migration
// 011). O DroneManagement só devolve o UUID de AD do piloto, sem nome.

export async function lerNomesPilotos() {
  const { rows } = await pool.query(
    `SELECT p.pilot_user_ad_id::text AS id, u.nome
     FROM pilotos_dronemgmt p JOIN usuarios u ON u.id = p.usuario_id`
  );
  return Object.fromEntries(rows.map((r) => [r.id.toLowerCase(), r.nome]));
}

export async function pilotoDoUsuario(usuarioId) {
  const { rows } = await pool.query(
    "SELECT pilot_user_ad_id::text AS id FROM pilotos_dronemgmt WHERE usuario_id = $1",
    [usuarioId]
  );
  return rows[0]?.id.toLowerCase() ?? null;
}
```

- [ ] **Step 6: Run tests**

Run: `cd backend && node --test test/fonte-indicadores-voo.test.js`
Expected: PASS (6 testes). (O processo pode esperar o pool encerrar; se ficar pendurado, os testes não usam o pool — confira que nenhum teste chama `obterDadosIndicadores` sem fonte de teste.)

- [ ] **Step 7: Commit**

```bash
git add backend/src/db/migrations/017_indicadores_voo_cache.sql backend/src/lib/fonteIndicadoresVoo.js backend/src/lib/nomesPilotos.js backend/test/fonte-indicadores-voo.test.js
git commit -m "Fonte dos indicadores de voo com cache no Postgres"
```

---

### Task 4: Rotas da página e do agente

**Files:**
- Modify: `backend/src/routes/voos.js` (rotas novas no fim do arquivo)
- Modify: `backend/src/routes/integracao.js` (middleware e rota nova)
- Modify: `backend/.env.example`
- Test: `backend/test/indicadores-rotas.test.js`

**Interfaces:**
- Consumes: `calcularIndicadores`, `lerPeriodo`, `hojeLocal` (Task 2); `obterDadosIndicadores`, `definirFonteParaTestes` (Task 3); `lerNomesPilotos`, `pilotoDoUsuario` (Task 3).
- Produces (HTTP):
  - `GET /voos/indicadores/acesso` → `200 { podeVer, ehAdmin, ehPiloto }`
  - `GET /voos/indicadores?de&ate&piloto&forcar` → `200` contrato + `atualizadoEm` + `desatualizado`; `400` período/piloto inválido; `403` sem acesso; `502` DroneManagement sem cache.
  - `GET /integracao/voos/indicadores?de&ate&forcar` (cabeçalho `x-indicadores-token`) → `200` contrato com `porPiloto`, sem `meuRendimento`; `401` chave errada/ausente.

- [ ] **Step 1: Write the failing test**

`backend/test/indicadores-rotas.test.js`:

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarCenario, limparCenario, iniciarServidor, tokenPara, req, pool } from "./helpers.js";
import { definirFonteParaTestes } from "../src/lib/fonteIndicadoresVoo.js";

process.env.INDICADORES_TOKEN = "chave-indicadores-teste";
process.env.HUB_INTEGRACAO_TOKEN = "chave-hub-teste";

const PILOTO_EDITOR = randomUUID();
const PILOTO_OUTRO = randomUUID();
let c, srv, tPiloto, tLeitor, tAdmin;
let falhar = false;

before(async () => {
  c = await criarCenario();
  await pool.query("INSERT INTO pilotos_dronemgmt (usuario_id, pilot_user_ad_id) VALUES ($1, $2)", [c.editor.id, PILOTO_EDITOR]);
  definirFonteParaTestes(() => {
    if (falhar) throw new Error("fora do ar");
    return {
      atualizadoEm: "2026-10-01T12:00:00.000Z",
      desatualizado: false,
      realizados: [
        { id: "1", dataVoo: new Date().toISOString(), pilotoId: PILOTO_EDITOR, tipo: "Falhas Soca", areaHa: 10, propriedade: "PROPRIA" },
        { id: "2", dataVoo: new Date().toISOString(), pilotoId: PILOTO_OUTRO, tipo: "Falhas Soca", areaHa: 30, propriedade: "PROPRIA" },
      ],
      pendentes: [{ id: "p", projeto: "Falhas Soca", areaHa: 60, propriedade: "PROPRIA" }],
    };
  });
  srv = await iniciarServidor();
  tPiloto = tokenPara(c.editor);
  tLeitor = tokenPara(c.leitor);
  tAdmin = tokenPara(c.admin);
});
after(async () => {
  definirFonteParaTestes(null);
  await srv.fechar();
  await pool.query("DELETE FROM pilotos_dronemgmt WHERE usuario_id = $1", [c.editor.id]);
  await limparCenario(c);
  await pool.end();
});

const url = (q = "") => `${srv.url}/voos/indicadores${q}`;

test("acesso: piloto e admin podem ver; usuário comum não", async () => {
  assert.deepEqual((await req(`${srv.url}/voos/indicadores/acesso`, tPiloto)).corpo, { podeVer: true, ehAdmin: false, ehPiloto: true });
  assert.deepEqual((await req(`${srv.url}/voos/indicadores/acesso`, tAdmin)).corpo, { podeVer: true, ehAdmin: true, ehPiloto: false });
  assert.deepEqual((await req(`${srv.url}/voos/indicadores/acesso`, tLeitor)).corpo, { podeVer: false, ehAdmin: false, ehPiloto: false });
});

test("usuário comum recebe 403", async () => {
  assert.equal((await req(url(), tLeitor)).status, 403);
});

test("piloto recebe painel da equipe + o próprio rendimento, sem porPiloto, mesmo pedindo outro piloto", async () => {
  const r = await req(url(`?piloto=${PILOTO_OUTRO}`), tPiloto);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.resumo.realizadoHa, 40);
  assert.equal(r.corpo.meuRendimento.pilotoId, PILOTO_EDITOR);
  assert.equal(r.corpo.meuRendimento.ha, 10);
  assert.equal(r.corpo.meuRendimento.piloto, c.editor.nome);
  assert.equal(r.corpo.porPiloto, undefined);
  assert.equal(r.corpo.atualizadoEm, "2026-10-01T12:00:00.000Z");
});

test("admin recebe porPiloto e pode escolher um piloto", async () => {
  const r = await req(url(`?piloto=${PILOTO_OUTRO}`), tAdmin);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.porPiloto.length, 2);
  assert.equal(r.corpo.meuRendimento.ha, 30);
  const semPiloto = await req(url(), tAdmin);
  assert.equal(semPiloto.corpo.meuRendimento, undefined);
});

test("período e piloto inválidos dão 400", async () => {
  assert.equal((await req(url("?de=2026-06-01&ate=2026-05-01"), tAdmin)).status, 400);
  assert.equal((await req(url("?de=ontem&ate=hoje"), tAdmin)).status, 400);
  assert.equal((await req(url("?piloto=nao-e-uuid"), tAdmin)).status, 400);
});

test("DroneManagement sem cache vira 502 com mensagem amigável", async () => {
  falhar = true;
  try {
    const r = await req(url(), tAdmin);
    assert.equal(r.status, 502);
    assert.match(r.corpo.erro, /DroneManagement/);
  } finally {
    falhar = false;
  }
});

async function reqAgente(token, caminho = "/integracao/voos/indicadores") {
  const resp = await fetch(`${srv.url}${caminho}`, { headers: token ? { "x-indicadores-token": token } : {} });
  return { status: resp.status, corpo: await resp.json() };
}

test("API do agente: exige a chave própria e devolve porPiloto sem meuRendimento", async () => {
  assert.equal((await reqAgente(null)).status, 401);
  assert.equal((await reqAgente("chave-hub-teste")).status, 401);
  const r = await reqAgente("chave-indicadores-teste");
  assert.equal(r.status, 200);
  assert.equal(r.corpo.porPiloto.length, 2);
  assert.equal(r.corpo.meuRendimento, undefined);
  assert.equal(r.corpo.resumo.aVoarHa, 60);
});

test("a chave de indicadores não abre as rotas do Hub", async () => {
  const resp = await fetch(`${srv.url}/integracao/dronemgmt/situacao`, {
    method: "POST",
    headers: { "x-hub-token": "chave-indicadores-teste", "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(resp.status, 401);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd backend && DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" node --test test/indicadores-rotas.test.js`
Expected: FAIL — rotas devolvem 404/401 inesperados.

- [ ] **Step 3: Rotas em `routes/voos.js`**

Imports novos:

```js
import { calcularIndicadores, lerPeriodo, hojeLocal } from "../lib/indicadoresVoo.js";
import { obterDadosIndicadores } from "../lib/fonteIndicadoresVoo.js";
import { lerNomesPilotos, pilotoDoUsuario } from "../lib/nomesPilotos.js";
```

No fim do arquivo:

```js
// --- Indicadores de voo (página /indicadores) ---
// Ver docs/superpowers/specs/2026-10-01-indicadores-voo-design.md. Admin
// vê tudo e escolhe o piloto; piloto (linha em pilotos_dronemgmt) vê o
// painel da equipe + o próprio rendimento, nunca os colegas um a um.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

voosRouter.get("/voos/indicadores/acesso", async (req, res) => {
  const ehAdmin = req.usuarioPapel === "admin";
  const ehPiloto = !!(await pilotoDoUsuario(req.usuarioId));
  res.json({ podeVer: ehAdmin || ehPiloto, ehAdmin, ehPiloto });
});

voosRouter.get("/voos/indicadores", async (req, res) => {
  const hoje = hojeLocal();
  const periodo = lerPeriodo(req.query, hoje);
  if (periodo.erro) return res.status(400).json({ erro: periodo.erro });

  const ehAdmin = req.usuarioPapel === "admin";
  const meuPiloto = await pilotoDoUsuario(req.usuarioId);
  if (!ehAdmin && !meuPiloto) {
    return res.status(403).json({ erro: "indicadores disponíveis só para pilotos e administradores" });
  }

  let pilotoId = meuPiloto;
  if (ehAdmin) {
    const pedido = req.query.piloto;
    if (pedido && !UUID_RE.test(pedido)) return res.status(400).json({ erro: "piloto inválido" });
    pilotoId = pedido ? pedido.toLowerCase() : null;
  }

  let dados;
  try {
    dados = await obterDadosIndicadores({ forcar: req.query.forcar === "1" });
  } catch (err) {
    console.error("Indicadores de voo: falha ao consultar o DroneManagement:", err);
    return res.status(502).json({ erro: "Não foi possível consultar o DroneManagement agora." });
  }

  const nomesPilotos = await lerNomesPilotos();
  res.json({
    ...calcularIndicadores({
      realizados: dados.realizados,
      pendentes: dados.pendentes,
      ...periodo,
      hoje,
      pilotoId,
      nomesPilotos,
      incluirPorPiloto: ehAdmin,
    }),
    atualizadoEm: dados.atualizadoEm,
    desatualizado: dados.desatualizado,
  });
});
```

- [ ] **Step 4: Rota do agente em `routes/integracao.js`**

Troque `TOKEN` (constante lida no carregamento) e `exigirTokenHub` por um gerador que lê a variável na hora do pedido, e restrinja o middleware do Hub ao prefixo das rotas dele:

```js
// Lê a variável a cada pedido (não no carregamento do módulo) e compara em
// tempo constante. Variável vazia = rota fechada.
function exigirChave(cabecalho, variavel) {
  return (req, res, next) => {
    const esperado = Buffer.from(process.env[variavel] || "");
    const recebido = Buffer.from(req.get(cabecalho) || "");
    if (!esperado.length || recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) {
      return res.status(401).json({ erro: "não autorizado" });
    }
    next();
  };
}

// Só as rotas do Hub (agendar/consultar Linhas de Colheita). Antes era
// "/integracao" inteiro; os indicadores de voo usam outra chave.
integracaoRouter.use("/integracao/dronemgmt", exigirChave("x-hub-token", "HUB_INTEGRACAO_TOKEN"));
```

Apague `const TOKEN = ...`, `function exigirTokenHub` e `integracaoRouter.use("/integracao", exigirTokenHub);`. Atualize o comentário do topo do arquivo: o Hub continua com escopo estreito; acrescente um parágrafo dizendo que `/integracao/voos/indicadores` é só leitura, para o agente de apresentação, com `INDICADORES_TOKEN`.

No fim do arquivo:

```js
// --- Indicadores de voo para o agente de apresentação ---
// Só leitura, chave própria (INDICADORES_TOKEN). Mesmo cálculo da página
// /indicadores, sempre com a lista por piloto e sem "meu rendimento".
// Contrato documentado em docs/INTEGRACAO_DRONEMANAGEMENT.md.
integracaoRouter.get(
  "/integracao/voos/indicadores",
  exigirChave("x-indicadores-token", "INDICADORES_TOKEN"),
  async (req, res) => {
    const hoje = hojeLocal();
    const periodo = lerPeriodo(req.query, hoje);
    if (periodo.erro) return res.status(400).json({ erro: periodo.erro });

    let dados;
    try {
      dados = await obterDadosIndicadores({ forcar: req.query.forcar === "1" });
    } catch (err) {
      console.error("Indicadores de voo (agente): falha ao consultar o DroneManagement:", err);
      return res.status(502).json({ erro: "Não foi possível consultar o DroneManagement agora." });
    }

    res.json({
      ...calcularIndicadores({
        realizados: dados.realizados,
        pendentes: dados.pendentes,
        ...periodo,
        hoje,
        nomesPilotos: await lerNomesPilotos(),
        incluirPorPiloto: true,
      }),
      atualizadoEm: dados.atualizadoEm,
      desatualizado: dados.desatualizado,
    });
  }
);
```

Imports no topo de `integracao.js`:

```js
import { calcularIndicadores, lerPeriodo, hojeLocal } from "../lib/indicadoresVoo.js";
import { obterDadosIndicadores } from "../lib/fonteIndicadoresVoo.js";
import { lerNomesPilotos } from "../lib/nomesPilotos.js";
```

- [ ] **Step 5: `.env.example`**

Logo abaixo de `HUB_INTEGRACAO_TOKEN=`:

```
# Chave só-leitura da API de indicadores de voo para o agente que monta a
# apresentação do gerente (GET /integracao/voos/indicadores, cabeçalho
# x-indicadores-token). Diferente da chave do Hub, que também agenda voos.
INDICADORES_TOKEN=
```

- [ ] **Step 6: Run the whole backend suite**

Run: `cd backend && DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" npm test`
Expected: PASS em todos os arquivos (os de antes e os 4 novos).

Confira que nada de teste sobrou no banco:
Run: `cd backend && DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" node -e "import('./src/db/pool.js').then(async ({pool}) => { const r = await pool.query(\"SELECT count(*) FROM usuarios WHERE nome LIKE '\\_\\_%'\"); console.log(r.rows[0]); await pool.end(); })"`
Expected: `{ count: '0' }`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/routes/voos.js backend/src/routes/integracao.js backend/.env.example backend/test/indicadores-rotas.test.js
git commit -m "Rotas de indicadores de voo para a página e para o agente de apresentação"
```

---

### Task 5: Base do frontend (API, período, cache local, acesso)

**Files:**
- Modify: `frontend/src/lib/api.js` (fim do bloco "Integração DroneManagement")
- Create: `frontend/src/lib/periodoIndicadores.js`
- Test: `frontend/src/lib/periodoIndicadores.test.js`
- Create: `frontend/src/hooks/usePodeVerIndicadores.js`

**Interfaces:**
- Consumes: rotas do Task 4.
- Produces:
  - `buscarAcessoIndicadores(token): Promise<{podeVer, ehAdmin, ehPiloto}>`
  - `buscarIndicadoresVoo(token, { de, ate, piloto?, forcar? }): Promise<Indicadores>`
  - `hojeLocal(agora?)`, `safraDe(hoje)`, `ultimos30Dias(hoje)`, `mesAtual(hoje)` → `{de, ate}`
  - `formatarHa(n): string` ("24.723"), `formatarPercentual(x): string` ("67%"), `formatarDataCurta("2026-09-14"): "14/09"`, `formatarDataHora(iso): "01/10 14:02"`
  - `salvarUltimoResultado(chave, dados)`, `lerUltimoResultado(chave): {dados, salvoEm}|null`, `chaveResultado({de, ate, piloto}): string`
  - `usePodeVerIndicadores(sessao): boolean`

- [ ] **Step 1: Write the failing test**

`frontend/src/lib/periodoIndicadores.test.js`:

```js
import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  hojeLocal, safraDe, ultimos30Dias, mesAtual, formatarHa, formatarPercentual, formatarDataCurta,
  salvarUltimoResultado, lerUltimoResultado, chaveResultado,
} from "./periodoIndicadores.js";

// O projeto "unit" do Vitest roda em ambiente node (sem localStorage).
function localStorageEmMemoria() {
  const dados = new Map();
  return {
    getItem: (k) => (dados.has(k) ? dados.get(k) : null),
    setItem: (k, v) => void dados.set(k, String(v)),
    removeItem: (k) => void dados.delete(k),
    clear: () => dados.clear(),
  };
}

describe("períodos", () => {
  it("hoje no fuso de Brasília", () => {
    expect(hojeLocal(new Date("2026-10-02T01:30:00Z"))).toBe("2026-10-01");
  });
  it("safra de abril a março", () => {
    expect(safraDe("2026-10-01")).toEqual({ de: "2026-04-01", ate: "2027-03-31" });
    expect(safraDe("2027-02-10")).toEqual({ de: "2026-04-01", ate: "2027-03-31" });
  });
  it("últimos 30 dias incluem hoje", () => {
    expect(ultimos30Dias("2026-10-01")).toEqual({ de: "2026-09-02", ate: "2026-10-01" });
  });
  it("mês atual vai do dia 1 até hoje", () => {
    expect(mesAtual("2026-10-15")).toEqual({ de: "2026-10-01", ate: "2026-10-15" });
  });
});

describe("formatação", () => {
  it("hectares sem casas decimais, separador pt-BR", () => {
    expect(formatarHa(24723.4)).toBe("24.723");
    expect(formatarHa(0)).toBe("0");
  });
  it("percentual inteiro", () => {
    expect(formatarPercentual(0.6712)).toBe("67%");
  });
  it("data curta", () => {
    expect(formatarDataCurta("2026-09-14")).toBe("14/09");
  });
});

describe("último resultado salvo", () => {
  beforeEach(() => vi.stubGlobal("localStorage", localStorageEmMemoria()));
  it("guarda e lê por período/piloto", () => {
    const chave = chaveResultado({ de: "2026-04-01", ate: "2027-03-31", piloto: "" });
    salvarUltimoResultado(chave, { resumo: { realizadoHa: 1 } });
    const lido = lerUltimoResultado(chave);
    expect(lido.dados.resumo.realizadoHa).toBe(1);
    expect(typeof lido.salvoEm).toBe("string");
    expect(lerUltimoResultado(chaveResultado({ de: "2026-04-01", ate: "2027-03-31", piloto: "x" }))).toBeNull();
  });
  it("não quebra com JSON corrompido", () => {
    localStorage.setItem(chaveResultado({ de: "a", ate: "b", piloto: "" }), "{quebrado");
    expect(lerUltimoResultado(chaveResultado({ de: "a", ate: "b", piloto: "" }))).toBeNull();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd frontend && npx vitest run --project unit src/lib/periodoIndicadores.test.js`
Expected: FAIL — módulo não encontrado.

- [ ] **Step 3: Implement `periodoIndicadores.js`**

```js
// Datas, atalhos de período, formatação e cache local da página
// /indicadores. A safra (abril a março) espelha safraDe() do backend
// (backend/src/lib/indicadoresVoo.js) — mudou lá, muda aqui.

const formatadorDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const formatadorHa = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const formatadorDataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function hojeLocal(agora = new Date()) {
  return formatadorDia.format(agora);
}

function somarDias(dia, n) {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function safraDe(hoje) {
  const [ano, mes] = hoje.split("-").map(Number);
  const inicio = mes >= 4 ? ano : ano - 1;
  return { de: `${inicio}-04-01`, ate: `${inicio + 1}-03-31` };
}

export function ultimos30Dias(hoje) {
  return { de: somarDias(hoje, -29), ate: hoje };
}

export function mesAtual(hoje) {
  return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
}

export function formatarHa(n) {
  return formatadorHa.format(Number(n) || 0);
}

export function formatarPercentual(x) {
  return `${Math.round((Number(x) || 0) * 100)}%`;
}

export function formatarDataCurta(dia) {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

export function formatarDataHora(iso) {
  return formatadorDataHora.format(new Date(iso)).replace(",", "");
}

export function chaveResultado({ de, ate, piloto }) {
  return `geomap_indicadores_${de}_${ate}_${piloto || "equipe"}`;
}

// Último resultado visto neste aparelho, pra mostrar sem internet.
export function salvarUltimoResultado(chave, dados) {
  try {
    localStorage.setItem(chave, JSON.stringify({ dados, salvoEm: new Date().toISOString() }));
  } catch {
    // armazenamento cheio ou bloqueado: só não guarda
  }
}

export function lerUltimoResultado(chave) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}
```

- [ ] **Step 4: Run tests**

Run: `cd frontend && npx vitest run --project unit src/lib/periodoIndicadores.test.js`
Expected: PASS.

- [ ] **Step 5: API em `api.js`**

Logo depois de `apontarVoos`:

```js
// Indicadores de voo (página /indicadores) — ver backend/src/routes/voos.js.
export async function buscarAcessoIndicadores(token) {
  const resp = await fetch(`${API_URL}/voos/indicadores/acesso`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function buscarIndicadoresVoo(token, { de, ate, piloto, forcar }) {
  const qs = new URLSearchParams({ de, ate });
  if (piloto) qs.set("piloto", piloto);
  if (forcar) qs.set("forcar", "1");
  const resp = await fetch(`${API_URL}/voos/indicadores?${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  await tratarResposta(resp);
  return resp.json();
}
```

- [ ] **Step 6: Hook `usePodeVerIndicadores.js`**

```js
import { useEffect, useState } from "react";
import { buscarAcessoIndicadores } from "../lib/api.js";

// Decide se o link "Indicadores de voo" aparece no menu. Admin sempre;
// piloto descoberto pelo backend (pilotos_dronemgmt). A última resposta fica
// salva por usuário pra o link continuar aparecendo offline.
export function usePodeVerIndicadores(sessao) {
  const ehAdmin = sessao?.usuario?.papel === "admin";
  const chave = `geomap_pode_ver_indicadores_${sessao?.usuario?.id ?? ""}`;
  const [podeVer, setPodeVer] = useState(() => {
    if (ehAdmin) return true;
    try {
      return localStorage.getItem(chave) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (ehAdmin || !sessao?.token) return;
    let cancelado = false;
    buscarAcessoIndicadores(sessao.token)
      .then(({ podeVer: pode }) => {
        if (cancelado) return;
        setPodeVer(pode);
        try {
          localStorage.setItem(chave, pode ? "1" : "0");
        } catch {
          // sem armazenamento: só não lembra offline
        }
      })
      .catch(() => {}); // offline: fica com o valor salvo
    return () => {
      cancelado = true;
    };
  }, [ehAdmin, sessao?.token, chave]);

  return ehAdmin || podeVer;
}
```

- [ ] **Step 7: Run unit suite**

Run: `cd frontend && npm run test:unit`
Expected: PASS (todos).

- [ ] **Step 8: Commit**

```bash
git add frontend/src/lib/api.js frontend/src/lib/periodoIndicadores.js frontend/src/lib/periodoIndicadores.test.js frontend/src/hooks/usePodeVerIndicadores.js
git commit -m "Base do frontend dos indicadores de voo: API, períodos e acesso"
```

---

### Task 6: Componentes de gráfico + stories

**Files:**
- Create: `frontend/src/components/indicadores/CartaoKpi.jsx`
- Create: `frontend/src/components/indicadores/BarraProgresso.jsx`
- Create: `frontend/src/components/indicadores/BarrasPorTipo.jsx`
- Create: `frontend/src/components/indicadores/ColunasSemanais.jsx`
- Create: `frontend/src/components/indicadores/Indicadores.stories.jsx`
- Modify: `frontend/src/index.css` (bloco novo no fim, depois do último bloco existente)

**Interfaces:**
- Consumes: `formatarHa`, `formatarPercentual`, `formatarDataCurta` (Task 5); formatos `porTipo` e `porSemana` do contrato.
- Produces:
  - `<CartaoKpi rotulo valor unidade? detalhe? cor="neutra"|"realizado"|"aVoar"|"recente" />`
  - `<BarraProgresso progresso={0..1} />`
  - `<BarrasPorTipo itens={porTipo} />`
  - `<ColunasSemanais semanas={porSemana} />`

- [ ] **Step 1: `CartaoKpi.jsx`**

```jsx
// Cartão de número grande do painel de indicadores (mesmo formato dos
// cartões do slide "Voos com Drone": rótulo, número, linha de detalhe).
export default function CartaoKpi({ rotulo, valor, unidade, detalhe, cor = "neutra" }) {
  return (
    <section className={`ind-kpi ind-kpi--${cor}`}>
      <h3 className="ind-kpi-rotulo">{rotulo}</h3>
      <p className="ind-kpi-valor">
        {valor}
        {unidade && <span className="ind-kpi-unidade"> {unidade}</span>}
      </p>
      {detalhe && <p className="ind-kpi-detalhe">{detalhe}</p>}
    </section>
  );
}
```

- [ ] **Step 2: `BarraProgresso.jsx`**

```jsx
import { formatarPercentual } from "../../lib/periodoIndicadores.js";

export default function BarraProgresso({ progresso }) {
  const pct = Math.max(0, Math.min(1, Number(progresso) || 0));
  return (
    <div className="ind-progresso">
      <span className="ind-progresso-rotulo">Progresso geral</span>
      <div
        className="ind-progresso-trilho"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        aria-label="Progresso geral"
      >
        <div className="ind-progresso-preenchido" style={{ width: `${pct * 100}%` }} />
      </div>
      <strong className="ind-progresso-valor">{formatarPercentual(pct)}</strong>
    </div>
  );
}
```

- [ ] **Step 3: `BarrasPorTipo.jsx`**

```jsx
import { formatarHa } from "../../lib/periodoIndicadores.js";

// Uma barra por tipo de voo: a largura toda é o total do tipo (realizado +
// a voar) e a parte verde é o realizado — mesma leitura do slide do gerente.
// Os números ficam escritos na barra, sem depender de passar o mouse.
export default function BarrasPorTipo({ itens }) {
  if (!itens.length) return <p className="ind-vazio">Nenhum voo nem pendência no período.</p>;
  return (
    <ul className="ind-barras-tipo">
      {itens.map((t) => {
        const total = t.realizadoHa + t.aVoarHa;
        const pct = total > 0 ? (t.realizadoHa / total) * 100 : 0;
        return (
          <li key={t.tipo} className="ind-barra-tipo">
            <span className="ind-barra-tipo-nome">{t.tipo}</span>
            <div
              className="ind-barra-tipo-trilho"
              title={`${t.tipo}: ${formatarHa(t.realizadoHa)} ha realizados, ${formatarHa(t.aVoarHa)} ha a voar`}
            >
              <div className="ind-barra-tipo-realizado" style={{ width: `${pct}%` }} />
              <span className="ind-barra-tipo-valor">{formatarHa(t.realizadoHa)}</span>
            </div>
            <span className="ind-barra-tipo-total">{formatarHa(total)}</span>
          </li>
        );
      })}
    </ul>
  );
}
```

- [ ] **Step 4: `ColunasSemanais.jsx`**

```jsx
import { formatarDataCurta, formatarHa } from "../../lib/periodoIndicadores.js";

const ALTURA = 140;

// Colunas de hectares por semana, em SVG simples. Rótulo de data a cada N
// colunas pra não embolar quando o período é longo (safra inteira = ~27).
export default function ColunasSemanais({ semanas }) {
  if (!semanas.length) return <p className="ind-vazio">Sem semanas no período.</p>;
  const maximo = Math.max(...semanas.map((s) => s.ha), 1);
  const largura = 100 / semanas.length;
  const passoRotulo = Math.ceil(semanas.length / 8);
  return (
    <figure className="ind-colunas">
      <svg viewBox={`0 0 100 ${ALTURA}`} preserveAspectRatio="none" role="img" aria-label="Hectares voados por semana">
        {semanas.map((s, i) => {
          const h = (s.ha / maximo) * (ALTURA - 4);
          return (
            <rect
              key={s.semana}
              className="ind-coluna"
              x={i * largura + largura * 0.15}
              y={ALTURA - h}
              width={largura * 0.7}
              height={h}
            >
              <title>{`Semana de ${formatarDataCurta(s.inicio)}: ${formatarHa(s.ha)} ha, ${s.talhoes} talhões`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="ind-colunas-eixo" style={{ gridTemplateColumns: `repeat(${semanas.length}, 1fr)` }}>
        {semanas.map((s, i) => (
          <span key={s.semana}>{i % passoRotulo === 0 ? formatarDataCurta(s.inicio) : ""}</span>
        ))}
      </div>
      <figcaption className="ind-colunas-legenda">Máximo da semana: {formatarHa(maximo)} ha</figcaption>
    </figure>
  );
}
```

- [ ] **Step 5: CSS (fim de `index.css`)**

```css
/* ---------- Indicadores de voo (pages/Indicadores.jsx) ---------- */
.tela-indicadores {
  min-height: 100vh;
  background: var(--bg);
}
.ind-conteudo {
  max-width: 1120px;
  margin: 0 auto;
  padding: 20px 16px 48px;
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.ind-filtros {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  align-items: end;
}
.ind-filtros label {
  display: flex;
  flex-direction: column;
  gap: 4px;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.ind-atalhos {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.ind-atalhos button {
  background: var(--accent-suave);
  color: var(--accent-escuro);
  border: 1px solid transparent;
  padding: 6px 10px;
  font-size: 0.8rem;
}
.ind-atalhos button[aria-pressed="true"] {
  border-color: var(--accent);
}
.ind-secao {
  background: var(--cartao-fundo);
  border: 1px solid var(--cartao-borda);
  border-radius: var(--cartao-raio);
  box-shadow: var(--cartao-sombra);
  padding: 16px;
}
.ind-secao > h2 {
  margin: 0 0 12px;
  font-size: 0.8rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.ind-kpis {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 12px;
}
.ind-kpis--3 {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}
.ind-kpi {
  background: #fff;
  border: 1px solid var(--cartao-borda);
  border-top: 3px solid var(--text);
  border-radius: 10px;
  padding: 12px 14px;
}
.ind-kpi--realizado { border-top-color: var(--accent); }
.ind-kpi--aVoar { border-top-color: #2f6db5; }
.ind-kpi--recente { border-top-color: #c58a12; }
.ind-kpi-rotulo {
  margin: 0;
  font-size: 0.72rem;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: var(--text-muted);
}
.ind-kpi-valor {
  margin: 6px 0 2px;
  font-size: 1.9rem;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.ind-kpi--realizado .ind-kpi-valor { color: var(--accent); }
.ind-kpi--aVoar .ind-kpi-valor { color: #2f6db5; }
.ind-kpi--recente .ind-kpi-valor { color: #9a6a0c; }
.ind-kpi-unidade {
  font-size: 1rem;
  font-weight: 600;
}
.ind-kpi-detalhe {
  margin: 0;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.ind-progresso {
  display: grid;
  grid-template-columns: auto 1fr auto;
  gap: 12px;
  align-items: center;
  margin-top: 14px;
}
.ind-progresso-rotulo {
  font-size: 0.75rem;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--text-muted);
}
.ind-progresso-trilho,
.ind-barra-tipo-trilho {
  position: relative;
  height: 14px;
  background: var(--accent-suave);
  border-radius: 999px;
  overflow: hidden;
}
.ind-progresso-preenchido,
.ind-barra-tipo-realizado {
  height: 100%;
  background: var(--accent);
  border-radius: 999px;
  transition: width var(--dur-entrada) var(--ease-saida);
}
.ind-progresso-valor {
  color: var(--accent);
  font-variant-numeric: tabular-nums;
}
.ind-barras-tipo {
  list-style: none;
  margin: 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.ind-barra-tipo {
  display: grid;
  grid-template-columns: 170px 1fr 64px;
  gap: 12px;
  align-items: center;
  font-size: 0.85rem;
}
.ind-barra-tipo-trilho {
  height: 20px;
}
.ind-barra-tipo-valor {
  position: absolute;
  inset: 0 auto 0 8px;
  display: flex;
  align-items: center;
  font-size: 0.75rem;
  font-weight: 700;
  color: #fff;
  text-shadow: 0 0 2px rgba(0, 0, 0, 0.35);
  font-variant-numeric: tabular-nums;
}
.ind-barra-tipo-total {
  text-align: right;
  color: #2f6db5;
  font-variant-numeric: tabular-nums;
}
.ind-colunas {
  margin: 0;
}
.ind-colunas svg {
  width: 100%;
  height: 140px;
  display: block;
}
.ind-coluna {
  fill: var(--accent);
}
.ind-colunas-eixo {
  display: grid;
  font-size: 0.7rem;
  color: var(--text-muted);
  margin-top: 4px;
}
.ind-colunas-legenda {
  font-size: 0.75rem;
  color: var(--text-muted);
  margin-top: 4px;
}
.ind-tabela-pilotos {
  overflow-x: auto;
}
.ind-tabela-pilotos table {
  width: 100%;
  border-collapse: collapse;
  font-size: 0.85rem;
}
.ind-tabela-pilotos th,
.ind-tabela-pilotos td {
  padding: 8px 10px;
  border-bottom: 1px solid var(--border);
  text-align: right;
  white-space: nowrap;
  font-variant-numeric: tabular-nums;
}
.ind-tabela-pilotos th:first-child,
.ind-tabela-pilotos td:first-child {
  text-align: left;
}
.ind-rodape {
  display: flex;
  flex-wrap: wrap;
  gap: 10px;
  align-items: center;
  justify-content: space-between;
  font-size: 0.8rem;
  color: var(--text-muted);
}
.ind-aviso {
  background: #fff6e0;
  border: 1px solid #f0d58a;
  border-radius: 10px;
  padding: 10px 12px;
  font-size: 0.85rem;
}
.ind-vazio {
  color: var(--text-muted);
  font-size: 0.9rem;
  margin: 0;
}
.ind-carregando {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 32px 0;
  justify-content: center;
  color: var(--text-muted);
}
@media (max-width: 640px) {
  .ind-kpis,
  .ind-kpis--3 {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .ind-kpi-valor {
    font-size: 1.45rem;
  }
  .ind-barra-tipo {
    grid-template-columns: 1fr 56px;
  }
  .ind-barra-tipo-nome {
    grid-column: 1 / -1;
  }
  .ind-progresso {
    grid-template-columns: 1fr auto;
  }
  .ind-progresso-rotulo {
    grid-column: 1 / -1;
  }
}
```

- [ ] **Step 6: Stories**

`frontend/src/components/indicadores/Indicadores.stories.jsx`:

```jsx
import CartaoKpi from "./CartaoKpi.jsx";
import BarraProgresso from "./BarraProgresso.jsx";
import BarrasPorTipo from "./BarrasPorTipo.jsx";
import ColunasSemanais from "./ColunasSemanais.jsx";

const porTipo = [
  { tipo: "Falhas Soca", realizadoHa: 9673, aVoarHa: 2400, realizadoTalhoes: 600, aVoarTalhoes: 150 },
  { tipo: "Falhas Plantio", realizadoHa: 4841, aVoarHa: 900, realizadoTalhoes: 300, aVoarTalhoes: 60 },
  { tipo: "Falhas Plantio Forn.", realizadoHa: 1628, aVoarHa: 1872, realizadoTalhoes: 100, aVoarTalhoes: 110 },
  { tipo: "Ervas Daninhas", realizadoHa: 3754, aVoarHa: 0, realizadoTalhoes: 250, aVoarTalhoes: 0 },
  { tipo: "Outros", realizadoHa: 489, aVoarHa: 20, realizadoTalhoes: 40, aVoarTalhoes: 2 },
];
const semanas = Array.from({ length: 26 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 2, 30 + i * 7));
  return { semana: `S${i}`, inicio: d.toISOString().slice(0, 10), ha: Math.round(400 + 600 * Math.abs(Math.sin(i))), talhoes: 20 };
});

export default { title: "Indicadores/Componentes" };

export const Cartoes = {
  render: () => (
    <div className="ind-kpis" style={{ maxWidth: 1000 }}>
      <CartaoKpi rotulo="Área total" valor="30.112" unidade="ha" detalhe="1.733 voados + 410 a voar" />
      <CartaoKpi rotulo="HA realizado" valor="24.723" unidade="ha" detalhe="82% do total" cor="realizado" />
      <CartaoKpi rotulo="A voar" valor="5.389" unidade="ha" detalhe="situação atual" cor="aVoar" />
      <CartaoKpi rotulo="Últimos 15 dias úteis" valor="3.668" unidade="ha" detalhe="12 dias com voo" cor="recente" />
    </div>
  ),
};

export const Progresso = { render: () => <BarraProgresso progresso={0.67} /> };
export const PorTipo = { render: () => <BarrasPorTipo itens={porTipo} /> };
export const PorTipoVazio = { render: () => <BarrasPorTipo itens={[]} /> };
export const Semanal = { render: () => <ColunasSemanais semanas={semanas} /> };
```

- [ ] **Step 7: Build check**

Run: `cd frontend && npm run build`
Expected: build sem erro. (Storybook é verificado visualmente no Task 8.)

- [ ] **Step 8: Commit**

```bash
git add frontend/src/components/indicadores frontend/src/index.css
git commit -m "Componentes de gráfico dos indicadores de voo"
```

---

### Task 7: Página, rota e link no menu

**Files:**
- Create: `frontend/src/pages/Indicadores.jsx`
- Modify: `frontend/src/App.jsx` (lazy import + `<Route path="/indicadores">` com `RotaProtegida`, perto de `/ajuda`)
- Modify: `frontend/src/components/MenuLateral.jsx` (prop `mostrarIndicadores`, item novo)
- Modify: `frontend/src/components/MenuLateral.stories.jsx` (arg novo)
- Modify: `frontend/src/pages/Inicio.jsx:117-122`, `frontend/src/pages/Mapa.jsx:2459-2464`

**Interfaces:**
- Consumes: tudo dos Tasks 5 e 6; `useAuth()` de `context/AuthContext.jsx` (`sessao.token`, `sessao.usuario.papel`).

- [ ] **Step 1: `Indicadores.jsx`**

```jsx
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { buscarIndicadoresVoo } from "../lib/api.js";
import {
  hojeLocal, safraDe, ultimos30Dias, mesAtual, formatarHa, formatarPercentual, formatarDataHora,
  chaveResultado, salvarUltimoResultado, lerUltimoResultado,
} from "../lib/periodoIndicadores.js";
import CartaoKpi from "../components/indicadores/CartaoKpi.jsx";
import BarraProgresso from "../components/indicadores/BarraProgresso.jsx";
import BarrasPorTipo from "../components/indicadores/BarrasPorTipo.jsx";
import ColunasSemanais from "../components/indicadores/ColunasSemanais.jsx";

// Indicadores de voo — ver docs/superpowers/specs/2026-10-01-indicadores-voo-design.md.
// O backend decide o que cada um vê: piloto recebe o painel da equipe + o
// próprio rendimento; admin recebe também a lista por piloto e escolhe um.

const ATALHOS = [
  { id: "safra", rotulo: "Safra atual", periodo: safraDe },
  { id: "30d", rotulo: "Últimos 30 dias", periodo: ultimos30Dias },
  { id: "mes", rotulo: "Mês atual", periodo: mesAtual },
];

function MeuRendimento({ dados }) {
  return (
    <section className="ind-secao">
      <h2>Meu rendimento · {dados.piloto}</h2>
      <div className="ind-kpis ind-kpis--3">
        <CartaoKpi rotulo="Hectares voados" valor={formatarHa(dados.ha)} unidade="ha" cor="realizado" />
        <CartaoKpi rotulo="Talhões" valor={formatarHa(dados.talhoes)} detalhe={`${dados.diasVoados} dias com voo`} />
        <CartaoKpi rotulo="Média por dia voado" valor={formatarHa(dados.mediaHaPorDia)} unidade="ha" />
      </div>
      <h2 style={{ marginTop: 16 }}>Por semana</h2>
      <ColunasSemanais semanas={dados.porSemana} />
    </section>
  );
}

export default function Indicadores() {
  const navigate = useNavigate();
  const { sessao } = useAuth();
  const ehAdmin = sessao.usuario.papel === "admin";
  const hoje = hojeLocal();

  const [periodo, setPeriodo] = useState(() => safraDe(hoje));
  const [piloto, setPiloto] = useState("");
  const [pilotosConhecidos, setPilotosConhecidos] = useState([]);
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [erro, setErro] = useState(null);
  const [semAcesso, setSemAcesso] = useState(false);
  const [offlineDesde, setOfflineDesde] = useState(null);

  const carregar = useCallback(
    async ({ forcar = false } = {}) => {
      const chave = chaveResultado({ ...periodo, piloto });
      setCarregando(true);
      setErro(null);
      try {
        const resposta = await buscarIndicadoresVoo(sessao.token, { ...periodo, piloto, forcar });
        setDados(resposta);
        setOfflineDesde(null);
        salvarUltimoResultado(chave, resposta);
        if (resposta.porPiloto) {
          setPilotosConhecidos((atuais) => {
            const mapa = new Map(atuais.map((p) => [p.pilotoId, p.piloto]));
            for (const p of resposta.porPiloto) mapa.set(p.pilotoId, p.piloto);
            return [...mapa].map(([pilotoId, nome]) => ({ pilotoId, piloto: nome }));
          });
        }
      } catch (e) {
        if (e.status === 403) {
          setSemAcesso(true);
        } else {
          const salvo = lerUltimoResultado(chave);
          if (salvo && e.status === undefined) {
            setDados(salvo.dados);
            setOfflineDesde(salvo.salvoEm);
          } else {
            setErro(e.status === undefined ? "Sem conexão e sem dados salvos neste aparelho para esse período." : e.message);
          }
        }
      } finally {
        setCarregando(false);
      }
    },
    [periodo, piloto, sessao.token]
  );

  useEffect(() => {
    carregar();
  }, [carregar]);

  const atalhoAtivo = ATALHOS.find((a) => {
    const p = a.periodo(hoje);
    return p.de === periodo.de && p.ate === periodo.ate;
  })?.id;

  if (semAcesso) {
    return (
      <main className="tela-indicadores">
        <header className="barra-mapa">
          <strong>Indicadores de voo</strong>
          <span className="status-sync" />
          <button type="button" className="botao botao-sair" onClick={() => navigate(-1)}>← Voltar</button>
        </header>
        <div className="ind-conteudo">
          <p className="ind-aviso">Indicadores disponíveis só para pilotos e administradores.</p>
        </div>
      </main>
    );
  }

  const r = dados?.resumo;
  return (
    <main className="tela-indicadores">
      <header className="barra-mapa">
        <strong>Indicadores de voo</strong>
        <span className="status-sync" />
        <button type="button" className="botao botao-sair" onClick={() => navigate(-1)}>← Voltar</button>
      </header>

      <div className="ind-conteudo">
        <div className="ind-filtros">
          <label>
            De
            <input
              type="date"
              value={periodo.de}
              max={periodo.ate}
              onChange={(e) => e.target.value && setPeriodo((p) => ({ ...p, de: e.target.value }))}
            />
          </label>
          <label>
            Até
            <input
              type="date"
              value={periodo.ate}
              min={periodo.de}
              onChange={(e) => e.target.value && setPeriodo((p) => ({ ...p, ate: e.target.value }))}
            />
          </label>
          <div className="ind-atalhos">
            {ATALHOS.map((a) => (
              <button key={a.id} type="button" aria-pressed={atalhoAtivo === a.id} onClick={() => setPeriodo(a.periodo(hoje))}>
                {a.rotulo}
              </button>
            ))}
          </div>
          {ehAdmin && (
            <label>
              Piloto
              <select value={piloto} onChange={(e) => setPiloto(e.target.value)}>
                <option value="">Equipe toda</option>
                {pilotosConhecidos.map((p) => (
                  <option key={p.pilotoId} value={p.pilotoId}>{p.piloto}</option>
                ))}
              </select>
            </label>
          )}
        </div>

        {offlineDesde && <p className="ind-aviso">Sem conexão · dados de {formatarDataHora(offlineDesde)}</p>}
        {dados?.desatualizado && !offlineDesde && (
          <p className="ind-aviso">O DroneManagement não respondeu; mostrando os últimos dados obtidos.</p>
        )}

        {carregando && !dados && (
          <div className="ind-carregando">
            <span className="spinner" aria-hidden="true" /> Buscando voos no DroneManagement…
          </div>
        )}

        {erro && (
          <div className="ind-aviso">
            {erro}{" "}
            <button type="button" className="botao" onClick={() => carregar()}>Tentar de novo</button>
          </div>
        )}

        {dados && (
          <>
            {dados.meuRendimento && <MeuRendimento dados={dados.meuRendimento} />}

            <section className="ind-secao">
              <h2>Equipe</h2>
              <div className="ind-kpis">
                <CartaoKpi
                  rotulo="Área total"
                  valor={formatarHa(r.totalHa)}
                  unidade="ha"
                  detalhe={`${formatarHa(r.realizadoTalhoes)} voados + ${formatarHa(r.aVoarTalhoes)} a voar`}
                />
                <CartaoKpi
                  rotulo="HA realizado"
                  valor={formatarHa(r.realizadoHa)}
                  unidade="ha"
                  detalhe={`${formatarPercentual(r.progresso)} do total`}
                  cor="realizado"
                />
                <CartaoKpi rotulo="A voar" valor={formatarHa(r.aVoarHa)} unidade="ha" detalhe="situação atual" cor="aVoar" />
                <CartaoKpi
                  rotulo="Últimos 15 dias úteis"
                  valor={formatarHa(dados.ultimos15DiasUteis.ha)}
                  unidade="ha"
                  detalhe={`${dados.ultimos15DiasUteis.diasComVoo} dias com voo`}
                  cor="recente"
                />
              </div>
              <BarraProgresso progresso={r.progresso} />
            </section>

            <section className="ind-secao">
              <h2>Realizado × a voar por tipo (ha)</h2>
              <BarrasPorTipo itens={dados.porTipo} />
            </section>

            <section className="ind-secao">
              <h2>Evolução semanal da equipe (ha)</h2>
              <ColunasSemanais semanas={dados.porSemana} />
            </section>

            {dados.porPiloto && (
              <section className="ind-secao">
                <h2>Por piloto</h2>
                {dados.porPiloto.length === 0 ? (
                  <p className="ind-vazio">Nenhum voo no período.</p>
                ) : (
                  <div className="ind-tabela-pilotos">
                    <table>
                      <thead>
                        <tr><th>Piloto</th><th>ha</th><th>Talhões</th><th>Dias voados</th><th>Média ha/dia</th></tr>
                      </thead>
                      <tbody>
                        {dados.porPiloto.map((p) => (
                          <tr key={p.pilotoId}>
                            <td>{p.piloto}</td>
                            <td>{formatarHa(p.ha)}</td>
                            <td>{formatarHa(p.talhoes)}</td>
                            <td>{p.diasVoados}</td>
                            <td>{formatarHa(p.mediaHaPorDia)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            )}

            <footer className="ind-rodape">
              <span>Dados do DroneManagement · atualizados {formatarDataHora(dados.atualizadoEm)}</span>
              <button type="button" className="botao" disabled={carregando} onClick={() => carregar({ forcar: true })}>
                {carregando ? "Atualizando…" : "Atualizar"}
              </button>
            </footer>
          </>
        )}
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Rota em `App.jsx`**

Junto dos outros `lazy`:

```jsx
const Indicadores = lazy(() => import("./pages/Indicadores.jsx"));
```

Antes da rota `/ajuda`:

```jsx
              <Route
                path="/indicadores"
                element={
                  <RotaProtegida>
                    <Indicadores />
                  </RotaProtegida>
                }
              />
```

- [ ] **Step 3: Link no `MenuLateral.jsx`**

Ícone novo (perto de `IconeAjuda`):

```jsx
function IconeIndicadores() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <polyline points="3 17 9 11 13 15 21 7" />
      <polyline points="15 7 21 7 21 13" />
    </svg>
  );
}
```

Assinatura: `export default function MenuLateral({ aberto, aoFechar, ehAdmin, mostrarIndicadores = false, aoSair })`. Dentro de `<nav>`, depois do bloco de admin e antes de Ajuda:

```jsx
          {mostrarIndicadores && (
            <Link to="/indicadores" className="item-menu-lateral" onClick={aoFechar}>
              <span className="icone-item-menu-lateral" aria-hidden="true">
                <IconeIndicadores />
              </span>
              <span className="texto-item-menu-lateral">
                <strong>Indicadores de voo</strong>
                <small>Hectares voados, o que falta voar e o rendimento por piloto.</small>
              </span>
            </Link>
          )}
```

Em `MenuLateral.stories.jsx`, acrescente `mostrarIndicadores: true` aos args das stories abertas (`AbertoUsuarioComum`, `AbertoAdmin`).

- [ ] **Step 4: Callers**

Em `Inicio.jsx` e `Mapa.jsx`:

```jsx
import { usePodeVerIndicadores } from "../hooks/usePodeVerIndicadores.js";
// ...dentro do componente, perto de onde `sessao` é lido:
const podeVerIndicadores = usePodeVerIndicadores(sessao);
// ...no <MenuLateral>:
        mostrarIndicadores={podeVerIndicadores}
```

(Em `Mapa.jsx`, chame o hook no topo do componente junto dos outros hooks — nunca depois de um `return` condicional.)

- [ ] **Step 5: Build e testes**

Run: `cd frontend && npm run build && npm run test:unit`
Expected: build ok, testes ok.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/pages/Indicadores.jsx frontend/src/App.jsx frontend/src/components/MenuLateral.jsx frontend/src/components/MenuLateral.stories.jsx frontend/src/pages/Inicio.jsx frontend/src/pages/Mapa.jsx
git commit -m "Página Indicadores de voo com link no menu para pilotos e admin"
```

---

### Task 8: Verificação no navegador, conferência com dado real e documentação

**Files:**
- Modify: `docs/INTEGRACAO_DRONEMANAGEMENT.md` (seção nova no fim)
- Modify: `docs/SCHEMA_BANCO.md` (tabela nova)
- Modify: `CLAUDE.md` (entrada nova no fim de "Estado atual", antes de `## graphify`)

- [ ] **Step 1: Ambiente local**

Siga a skill `verify` (backend com `DATABASE_URL` local e `PGSSL=""`, frontend `npm run dev`, Postgres local via `pg_ctl`). O backend local usa as credenciais reais do DroneManagement do `backend/.env` — só leitura, é o mesmo que o mapa de Voos já faz. Para testar como piloto, crie um usuário de teste `__piloto_verif` no Postgres local com uma linha em `pilotos_dronemgmt` apontando para o UUID do piloto com mais hectares da safra (`5c050bb9-7ba2-406f-bd31-07412cf4fa94`, da sonda de 2026-10-01). Apague usuário e linha ao final.

- [ ] **Step 2: Conferência com dado real (só leitura)**

Com `INDICADORES_TOKEN=verif-local` no ambiente do backend local:

Run: `curl -s -H "x-indicadores-token: verif-local" "http://localhost:3000/integracao/voos/indicadores?de=2026-04-01&ate=2026-10-01" | node -e "let s='';process.stdin.on('data',d=>s+=d).on('end',()=>{const j=JSON.parse(s);console.log(j.resumo, j.porTipo.map(t=>[t.tipo,t.realizadoHa]), j.porPiloto.length)})"`
Expected: `realizadoTalhoes` ≈ 1.733 e `realizadoHa` ≈ 24.723 (sonda de 2026-10-01; pode ter crescido com voos de hoje); `porTipo` coerente com a tabela do spec, Falhas Plantio + Falhas Plantio Forn. ≈ 6.470; 4 pilotos. Diferença grande = investigar antes de seguir (fuso, filtro, divisão de fornecedor).

Rode de novo e confirme que a 2ª resposta volta rápido (cache).

- [ ] **Step 3: Playwright**

Roteiro (contra `vite dev` ou build + servidor estático, ver skill `verify`), em 1440×900, 768×1024 e 390×844:
1. Admin: menu lateral mostra "Indicadores de voo"; página carrega com spinner e depois os 4 cartões, a barra de progresso, as barras por tipo, a evolução semanal e a tabela por piloto.
2. Admin escolhe um piloto no seletor → aparece "Meu rendimento · <nome>".
3. Atalho "Últimos 30 dias" → cartões mudam; "A voar" não muda.
4. `__piloto_verif`: link aparece no menu; página mostra "Meu rendimento" e o painel da equipe, **sem** tabela por piloto e sem seletor de piloto.
5. Usuário comum (sem piloto): link não aparece; abrir `/indicadores` direto mostra o aviso de acesso restrito.
6. Piloto com `context.setOffline(true)` + reload na mesma rota → página mostra os dados salvos com "Sem conexão · dados de …".
7. Celular (390px): cartões 2×2, sem rolagem horizontal da página (só a tabela, quando admin).
8. Zero erro de console inesperado.

Abra também o Storybook (`npm run storybook`, com `fnm use` — ver CLAUDE.md) e confira as stories `Indicadores/Componentes` via `iframe.html?id=indicadores-componentes--por-tipo`.

Corrija o que aparecer e rode `npm test` (backend) + `npm run test:unit` (frontend) de novo.

- [ ] **Step 4: Limpeza**

Apague `__piloto_verif` e a linha dele em `pilotos_dronemgmt`; desligue servidores e o Postgres local. O cache `indicadores_voo_cache` do banco local pode ficar.

- [ ] **Step 5: Documentação**

`docs/INTEGRACAO_DRONEMANAGEMENT.md`, seção nova "API de indicadores para o agente de apresentação" com:
- URL de produção: `https://geomap-docker.onrender.com/integracao/voos/indicadores?de=AAAA-MM-DD&ate=AAAA-MM-DD` (sem parâmetros = safra atual; `forcar=1` ignora o cache).
- Cabeçalho `x-indicadores-token: <INDICADORES_TOKEN>`; `401` sem a chave; `502` se o DroneManagement não responder e não houver cache; `desatualizado: true` quando veio do cache por falha.
- Primeira chamada do dia pode levar ~1-2 min (Render acordando + login no DroneManagement + busca).
- O contrato JSON do spec e o significado de cada campo: realizado = Verificar porte "Voado" com data do voo no período (fuso de Brasília); a voar = fila liberada de hoje (mesma do mapa de Voos), não depende do período; Falhas Plantio Forn. = propriedade com "FORNEC"; "Outros" = tipos fora da lista principal; últimos 15 dias úteis terminam em min(ate, hoje).
- O que **não** inclui: metas (Ervas Daninhas do ano-safra, 250 ha/dia), área de fornecedor fora do agendamento.

`docs/SCHEMA_BANCO.md`: tabela `indicadores_voo_cache` (colunas e para que serve).

`CLAUDE.md`: entrada "**Indicadores de voo (2026-10-01)**" no padrão das outras — o que foi feito, decisões (Voado = porte 9, a voar = regra do mapa, fornecedor "FORNEC", período livre com safra padrão, chave separada `INDICADORES_TOKEN`, cache 1h + contagem, Chromium sequencial), como foi verificado, e o pendente: criar `INDICADORES_TOKEN` no Render e entregar a chave ao agente por fora do repositório.

- [ ] **Step 6: Commit**

```bash
git add docs/INTEGRACAO_DRONEMANAGEMENT.md docs/SCHEMA_BANCO.md CLAUDE.md
git commit -m "Documenta indicadores de voo e a API para o agente de apresentação"
```

Rode `graphify update .` na raiz depois do commit (CLAUDE.md global).
