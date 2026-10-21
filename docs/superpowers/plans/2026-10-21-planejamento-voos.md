# Planejamento de voos no mapa — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** admin desenha polígonos datados no mapa de voos; todos veem o polígono com o rótulo do dia e, ao clicar, o resumo dos talhões pendentes de dentro.

**Architecture:** tabela `planejamentos_voo` + rotas Express (leitura para quem vê o mapa, escrita só admin). No frontend, módulo puro (geometria, resumo, rótulos), hook `usePlanejamentos` (busca com cópia no IndexedDB, camadas MapLibre, clique) e ferramenta de desenho só para admin. A lista de talhões de cada polígono é calculada no aparelho ao salvar, lendo os pontos da camada `rotulos` do `.pmtiles` da camada de voos.

**Tech Stack:** Node/Express + `pg` (testes com `node:test` contra Postgres local); React + Vite, MapLibre GL, `pmtiles`, `@mapbox/vector-tile`, `pbf`, `idb` (testes com vitest).

**Spec:** `docs/superpowers/specs/2026-10-16-planejamento-voos-design.md`

## Global Constraints

- Nenhuma dependência npm nova (backend ou frontend).
- Textos de interface em português; comentários em português, curtos, no estilo do arquivo vizinho.
- Arquivos do repositório usam CRLF: manter CRLF ao editar.
- "Hoje" sempre no fuso `America/Sao_Paulo`.
- Só admin cria/altera/apaga (`papel === "admin"`); quem pode ver o mapa lê.
- Testes do backend rodam com: `cd backend && DOTENV_CONFIG_PATH=../../geomap/backend/.env DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" node --test test/<arquivo>.test.js` (nunca contra o banco de produção).
- Testes do frontend: `cd frontend && fnm exec --using=22.12.0 node node_modules/vitest/vitest.mjs run --project unit`.
- A migration 019 só roda em produção na publicação (passo do gerente, não de executor).

## Review Focus

1. Polígono cruzando o antimeridiano ou com coordenadas fora do Brasil: validação aceita qualquer lon/lat válido; o resumo simplesmente fica vazio. (Coberto pelo teste de `validarPlanejamento` com limites.)
2. Mesmo talhão aparecendo em mais de um tile (borda de tile): `talhoesDentro` não pode repetir a chave. (Teste na Tarefa 3.)
3. Data passada vinda de cópia antiga do aparelho (offline há dias): polígono não pode aparecer. (Teste de `filtrarDeHojeEmDiante` na Tarefa 3.)
4. Clique sobre um talhão pendente dentro de um polígono: abre o talhão, não o resumo. (Checagem no Playwright da Parte 2.)
5. Admin sem internet tentando salvar: mensagem clara, desenho não se perde. (Checagem no Playwright da Parte 3.)

---

# Parte 1 — servidor e dados

### Tarefa 1: validação pura no backend

**Files:**
- Create: `backend/src/lib/planejamentoVoo.js`
- Test: `backend/test/planejamento-voo.test.js`

**Interfaces:**
- Produces: `validarPlanejamento(corpo) -> string | null` (mensagem de erro ou `null`); `dataValida(texto) -> boolean`; `hojeEmSaoPaulo(agora = new Date()) -> "AAAA-MM-DD"`.

- [ ] **Step 1: Escrever o teste**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { validarPlanejamento, hojeEmSaoPaulo } from "../src/lib/planejamentoVoo.js";

const anel = [[-47.6, -21.1], [-47.5, -21.1], [-47.5, -21.0], [-47.6, -21.1]];
const ok = { data: "2026-10-19", poligono: { type: "Polygon", coordinates: [anel] }, talhoes: [{ secao: "10324", talhao: "1", fazenda: "PEDRA" }] };

test("planejamento válido passa", () => {
  assert.equal(validarPlanejamento(ok), null);
  assert.equal(validarPlanejamento({ ...ok, talhoes: [] }), null);
});

test("recusa data, polígono e talhões inválidos", () => {
  assert.match(validarPlanejamento({ ...ok, data: "19/10/2026" }), /data/);
  assert.match(validarPlanejamento({ ...ok, data: "2026-02-30" }), /data/);
  assert.match(validarPlanejamento({ ...ok, poligono: { type: "Point", coordinates: [0, 0] } }), /polígono/);
  assert.match(validarPlanejamento({ ...ok, poligono: { type: "Polygon", coordinates: [anel.slice(0, 3)] } }), /polígono/);
  assert.match(validarPlanejamento({ ...ok, poligono: { type: "Polygon", coordinates: [[[-200, 0], [1, 1], [2, 2], [-200, 0]]] } }), /polígono/);
  assert.match(validarPlanejamento({ ...ok, poligono: { type: "Polygon", coordinates: [[[0, 0], [1, 1], [2, 2], [3, 3]]] } }), /polígono/); // não fechado
  assert.match(validarPlanejamento({ ...ok, talhoes: "x" }), /talhões/);
  assert.match(validarPlanejamento({ ...ok, talhoes: [{ secao: "1" }] }), /talhões/);
  assert.match(validarPlanejamento({ ...ok, talhoes: new Array(2001).fill(ok.talhoes[0]) }), /talhões/);
  assert.match(validarPlanejamento(null), /corpo/);
});

test("hoje em São Paulo vira o dia certo perto da meia-noite UTC", () => {
  assert.equal(hojeEmSaoPaulo(new Date("2026-10-20T02:30:00Z")), "2026-10-19");
  assert.equal(hojeEmSaoPaulo(new Date("2026-10-20T03:30:00Z")), "2026-10-20");
});
```

- [ ] **Step 2: Rodar e ver falhar** — `node --test test/planejamento-voo.test.js` → falha por módulo inexistente.

- [ ] **Step 3: Implementar**

```js
// Validação do planejamento de voos (ver
// docs/superpowers/specs/2026-10-16-planejamento-voos-design.md).
const MAX_TALHOES = 2000;
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

export function dataValida(texto) {
  if (typeof texto !== "string" || !REGEX_DATA.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

function posicaoValida(p) {
  return Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
    p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90;
}

function poligonoValido(g) {
  if (!g || g.type !== "Polygon" || !Array.isArray(g.coordinates)) return false;
  const anel = g.coordinates[0];
  if (!Array.isArray(anel) || anel.length < 4 || !anel.every(posicaoValida)) return false;
  const [a, b] = [anel[0], anel[anel.length - 1]];
  return a[0] === b[0] && a[1] === b[1];
}

function talhaoValido(t) {
  return t && typeof t === "object" && ["secao", "talhao", "fazenda"].every((k) => typeof t[k] === "string" && t[k].length > 0);
}

export function validarPlanejamento(corpo) {
  if (!corpo || typeof corpo !== "object") return "corpo inválido";
  if (!dataValida(corpo.data)) return "data inválida (use AAAA-MM-DD)";
  if (!poligonoValido(corpo.poligono)) return "polígono inválido";
  const t = corpo.talhoes;
  if (!Array.isArray(t) || t.length > MAX_TALHOES || !t.every(talhaoValido)) return "lista de talhões inválida";
  return null;
}

export function hojeEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}
```

- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `git add backend/src/lib/planejamentoVoo.js backend/test/planejamento-voo.test.js && git commit -m "Planejamento de voos: validação"`

### Tarefa 2: migration, rotas e testes de rota

**Files:**
- Create: `backend/src/db/migrations/019_planejamentos_voo.sql`
- Create: `backend/src/routes/planejamentos.js`
- Modify: `backend/src/app.js` (montar `planejamentosRouter` logo depois de `app.use(pinsRouter);` e **antes** de `app.use(adminRouter);` — o `adminRouter` aplica `exigirAutenticacao, exigirAdmin` sem prefixo e interceptaria a rota de leitura)
- Test: `backend/test/planejamentos-rotas.test.js`

**Interfaces:**
- Consumes: `validarPlanejamento`, `dataValida`, `hojeEmSaoPaulo` (Tarefa 1); `exigirAutenticacao`, `exigirAdmin` (`src/middleware/auth.js`); `usuarioPodeVerMapa(usuarioId, mapaId, papel)` (`src/lib/permissoes.js`; `req.usuarioId`, `req.usuarioPapel`); helpers de teste `criarCenario, limparCenario, iniciarServidor, tokenPara, req, pool` (`test/helpers.js`; cenário tem `mapa`, `mapaOutro`, `editor`, `leitor`, `semGrupo`, `admin`; `leitor` vê `mapa`, `semGrupo` não vê).
- Produces (API): `GET /mapas/:mapaId/planejamentos` → `{ planejamentos: [Planejamento] }`; `POST /admin/mapas/:mapaId/planejamentos` → 201 `{ planejamento }`; `PUT /admin/planejamentos/:id` (corpo `{ data }`) → `{ planejamento }`; `DELETE /admin/planejamentos/:id` → `{ ok: true }`. `Planejamento = { id, mapaId, data: "AAAA-MM-DD", poligono, talhoes, criadoPorNome, criadoEm, atualizadoEm }`.

- [ ] **Step 1: Migration**

```sql
-- Planejamento de voos no mapa (2026-10-16): polígono datado desenhado pelo
-- admin, com a lista de talhões de dentro calculada no aparelho ao salvar.
CREATE TABLE IF NOT EXISTS planejamentos_voo (
  id UUID PRIMARY KEY,
  mapa_id INTEGER NOT NULL REFERENCES mapas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  poligono JSONB NOT NULL,
  talhoes JSONB NOT NULL DEFAULT '[]'::jsonb,
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS planejamentos_voo_mapa_data ON planejamentos_voo (mapa_id, data);
```

Aplicar no Postgres local: `cd backend && DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" npm run migrate`.

- [ ] **Step 2: Teste das rotas**

```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { criarCenario, limparCenario, iniciarServidor, tokenPara, req, pool } from "./helpers.js";
import { hojeEmSaoPaulo } from "../src/lib/planejamentoVoo.js";

let c, srv, tAdmin, tLeitor, tSemGrupo;
before(async () => {
  c = await criarCenario();
  srv = await iniciarServidor();
  tAdmin = tokenPara(c.admin);
  tLeitor = tokenPara(c.leitor);
  tSemGrupo = tokenPara(c.semGrupo);
});
after(async () => {
  await srv.fechar();
  await limparCenario(c);
  await pool.end();
});

const anel = [[-47.6, -21.1], [-47.5, -21.1], [-47.5, -21.0], [-47.6, -21.1]];
function diaMais(n) {
  const d = new Date(`${hojeEmSaoPaulo()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const corpo = (data) => ({ data, poligono: { type: "Polygon", coordinates: [anel] }, talhoes: [{ secao: "10324", talhao: "1", fazenda: "PEDRA" }] });

test("admin cria; leitor vê só de hoje em diante; auditoria registra", async () => {
  const futuro = await req(`${srv.url}/admin/mapas/${c.mapa.id}/planejamentos`, tAdmin, { method: "POST", body: corpo(diaMais(1)) });
  assert.equal(futuro.status, 201);
  const hoje = await req(`${srv.url}/admin/mapas/${c.mapa.id}/planejamentos`, tAdmin, { method: "POST", body: corpo(diaMais(0)) });
  assert.equal(hoje.status, 201);
  const passado = await req(`${srv.url}/admin/mapas/${c.mapa.id}/planejamentos`, tAdmin, { method: "POST", body: corpo(diaMais(-1)) });
  assert.equal(passado.status, 201);

  const lista = await req(`${srv.url}/mapas/${c.mapa.id}/planejamentos`, tLeitor);
  assert.equal(lista.status, 200);
  const datas = lista.corpo.planejamentos.map((p) => p.data);
  assert.deepEqual(datas, [diaMais(0), diaMais(1)]);
  assert.equal(lista.corpo.planejamentos[0].talhoes[0].fazenda, "PEDRA");

  const log = await pool.query(`SELECT detalhe FROM logs WHERE usuario_id = $1 AND acao = 'admin'`, [c.admin.id]);
  assert.ok(log.rows.some((l) => l.detalhe.includes("planejamento")));
});

test("não admin não escreve; sem acesso ao mapa recebe 404", async () => {
  const r = await req(`${srv.url}/admin/mapas/${c.mapa.id}/planejamentos`, tLeitor, { method: "POST", body: corpo(diaMais(1)) });
  assert.equal(r.status, 403);
  const semAcesso = await req(`${srv.url}/mapas/${c.mapa.id}/planejamentos`, tSemGrupo);
  assert.equal(semAcesso.status, 404);
});

test("validação, alterar data e apagar", async () => {
  const ruim = await req(`${srv.url}/admin/mapas/${c.mapa.id}/planejamentos`, tAdmin, { method: "POST", body: { ...corpo(diaMais(1)), data: "x" } });
  assert.equal(ruim.status, 400);
  const criado = await req(`${srv.url}/admin/mapas/${c.mapa.id}/planejamentos`, tAdmin, { method: "POST", body: corpo(diaMais(2)) });
  const id = criado.corpo.planejamento.id;
  const alterado = await req(`${srv.url}/admin/planejamentos/${id}`, tAdmin, { method: "PUT", body: { data: diaMais(3) } });
  assert.equal(alterado.status, 200);
  assert.equal(alterado.corpo.planejamento.data, diaMais(3));
  const proibido = await req(`${srv.url}/admin/planejamentos/${id}`, tLeitor, { method: "DELETE" });
  assert.equal(proibido.status, 403);
  const apagado = await req(`${srv.url}/admin/planejamentos/${id}`, tAdmin, { method: "DELETE" });
  assert.equal(apagado.status, 200);
  const inexistente = await req(`${srv.url}/admin/planejamentos/${id}`, tAdmin, { method: "DELETE" });
  assert.equal(inexistente.status, 404);
});
```

- [ ] **Step 3: Rodar e ver falhar** (rotas inexistentes → 404).

- [ ] **Step 4: Implementar `routes/planejamentos.js`**

```js
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { exigirAutenticacao, exigirAdmin } from "../middleware/auth.js";
import { usuarioPodeVerMapa, mapaExiste } from "../lib/permissoes.js";
import { validarPlanejamento, dataValida, hojeEmSaoPaulo } from "../lib/planejamentoVoo.js";

// Planejamento de voos no mapa — ver
// docs/superpowers/specs/2026-10-16-planejamento-voos-design.md.
// Montado antes do adminRouter (que intercepta tudo sem prefixo).
export const planejamentosRouter = Router();

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELECT = `
  SELECT p.*, to_char(p.data, 'YYYY-MM-DD') AS data_texto, u.nome AS criado_por_nome
  FROM planejamentos_voo p LEFT JOIN usuarios u ON u.id = p.criado_por`;

function mapear(r) {
  return {
    id: r.id,
    mapaId: r.mapa_id,
    data: r.data_texto,
    poligono: r.poligono,
    talhoes: r.talhoes,
    criadoPorNome: r.criado_por_nome,
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
  };
}

async function auditar(usuarioId, detalhe, ip) {
  await pool.query("INSERT INTO logs (usuario_id, acao, detalhe, ip) VALUES ($1, 'admin', $2, $3)", [usuarioId, detalhe, ip]);
}

planejamentosRouter.get("/mapas/:mapaId/planejamentos", exigirAutenticacao, async (req, res) => {
  const mapaId = Number(req.params.mapaId);
  if (!Number.isInteger(mapaId) || !(await usuarioPodeVerMapa(req.usuarioId, mapaId, req.usuarioPapel))) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }
  const { rows } = await pool.query(`${SELECT} WHERE p.mapa_id = $1 AND p.data >= $2::date ORDER BY p.data, p.criado_em`, [mapaId, hojeEmSaoPaulo()]);
  res.json({ planejamentos: rows.map(mapear) });
});

planejamentosRouter.post("/admin/mapas/:mapaId/planejamentos", exigirAutenticacao, exigirAdmin, async (req, res) => {
  const mapaId = Number(req.params.mapaId);
  if (!Number.isInteger(mapaId) || !(await mapaExiste(mapaId))) return res.status(404).json({ erro: "mapa não encontrado" });
  const erro = validarPlanejamento(req.body);
  if (erro) return res.status(400).json({ erro });
  const { data, poligono, talhoes } = req.body;
  const id = randomUUID();
  await pool.query(
    "INSERT INTO planejamentos_voo (id, mapa_id, data, poligono, talhoes, criado_por) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, mapaId, data, JSON.stringify(poligono), JSON.stringify(talhoes), req.usuarioId]
  );
  await auditar(req.usuarioId, `planejamento criado: mapa ${mapaId}, ${data}, ${talhoes.length} talhões`, req.ip);
  const { rows } = await pool.query(`${SELECT} WHERE p.id = $1`, [id]);
  res.status(201).json({ planejamento: mapear(rows[0]) });
});

planejamentosRouter.put("/admin/planejamentos/:id", exigirAutenticacao, exigirAdmin, async (req, res) => {
  if (!REGEX_UUID.test(req.params.id)) return res.status(404).json({ erro: "planejamento não encontrado" });
  const data = req.body?.data;
  if (!dataValida(data)) {
    return res.status(400).json({ erro: "data inválida (use AAAA-MM-DD)" });
  }
  const r = await pool.query("UPDATE planejamentos_voo SET data = $2, atualizado_em = now() WHERE id = $1", [req.params.id, data]);
  if (r.rowCount === 0) return res.status(404).json({ erro: "planejamento não encontrado" });
  await auditar(req.usuarioId, `planejamento ${req.params.id} mudou para ${data}`, req.ip);
  const { rows } = await pool.query(`${SELECT} WHERE p.id = $1`, [req.params.id]);
  res.json({ planejamento: mapear(rows[0]) });
});

planejamentosRouter.delete("/admin/planejamentos/:id", exigirAutenticacao, exigirAdmin, async (req, res) => {
  if (!REGEX_UUID.test(req.params.id)) return res.status(404).json({ erro: "planejamento não encontrado" });
  const r = await pool.query("DELETE FROM planejamentos_voo WHERE id = $1 RETURNING mapa_id, to_char(data, 'YYYY-MM-DD') AS data", [req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ erro: "planejamento não encontrado" });
  await auditar(req.usuarioId, `planejamento apagado: mapa ${r.rows[0].mapa_id}, ${r.rows[0].data}`, req.ip);
  res.json({ ok: true });
});
```

E em `app.js`: `import { planejamentosRouter } from "./routes/planejamentos.js";` + `app.use(planejamentosRouter);` entre `app.use(pinsRouter);` e `app.use(adminRouter);`.

- [ ] **Step 5: Rodar o teste novo e a suíte inteira** (`node --test test/*.test.js`) → tudo passa.
- [ ] **Step 6: Commit** — `git commit -m "Planejamento de voos: tabela e rotas"`

**Fim da Parte 1** (publicável: só API nova, nada muda na tela).

---

# Parte 2 — visualização

### Tarefa 3: módulo puro do frontend

**Files:**
- Create: `frontend/src/lib/planejamentoVoo.js`
- Test: `frontend/src/lib/planejamentoVoo.test.js`

**Interfaces:**
- Consumes: `NOME`s de tipo de voo iguais a `TIPOS_VOO_PADRAO` em `lib/coresTiposVoo.js`.
- Produces: `pontoNoPoligono([lon, lat], anel) -> boolean`; `talhoesDentro(pontos, poligono) -> [{secao, talhao, fazenda}]` (entrada `[{ secao, talhao, fazenda, lon, lat }]`); `resumirPlanejamento(talhoesDoPlano, pendentes) -> { hectares, qtdTalhoes, porTipo: [{sigla, nome, hectares}], porFazenda: [{fazenda, secao, hectares, siglas}] }`; `siglaTipoVoo(nome) -> string`; `rotuloDia("AAAA-MM-DD") -> "Seg 19/10"`; `tituloDia("AAAA-MM-DD") -> "Segunda-feira, 19/10"`; `corDoDia("AAAA-MM-DD") -> "#rrggbb"`; `filtrarDeHojeEmDiante(planejamentos, hoje) -> planejamentos`; `hojeLocal(agora = new Date()) -> "AAAA-MM-DD"`.

- [ ] **Step 1: Teste**

```js
import { describe, it, expect } from "vitest";
import {
  pontoNoPoligono, talhoesDentro, resumirPlanejamento, siglaTipoVoo,
  rotuloDia, tituloDia, corDoDia, filtrarDeHojeEmDiante,
} from "./planejamentoVoo.js";

const quadrado = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const emU = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10], [0, 0]];
const poligono = { type: "Polygon", coordinates: [quadrado] };

describe("pontoNoPoligono", () => {
  it("dentro, fora e no vão de um polígono côncavo", () => {
    expect(pontoNoPoligono([5, 5], quadrado)).toBe(true);
    expect(pontoNoPoligono([15, 5], quadrado)).toBe(false);
    expect(pontoNoPoligono([1, 8], emU)).toBe(true);
    expect(pontoNoPoligono([5, 8], emU)).toBe(false);
  });
});

describe("talhoesDentro", () => {
  it("pega os de dentro sem repetir a mesma chave", () => {
    const pontos = [
      { secao: "1", talhao: "1", fazenda: "A", lon: 5, lat: 5 },
      { secao: "1", talhao: "1", fazenda: "A", lon: 5.1, lat: 5 },
      { secao: "1", talhao: "2", fazenda: "A", lon: 50, lat: 5 },
    ];
    expect(talhoesDentro(pontos, poligono)).toEqual([{ secao: "1", talhao: "1", fazenda: "A" }]);
  });
});

describe("resumirPlanejamento", () => {
  it("soma por tipo e fazenda só o que está pendente", () => {
    const talhoes = [
      { secao: "10", talhao: "1", fazenda: "PEDRA" },
      { secao: "10", talhao: "2", fazenda: "PEDRA" },
      { secao: "20", talhao: "5", fazenda: "SAPE" },
      { secao: "30", talhao: "9", fazenda: "JA VOADO" },
    ];
    const pendentes = [
      { secao: "10", talhao: "1", projeto: "Falhas Plantio", areaHa: 10 },
      { secao: "10", talhao: "1", projeto: "Falhas Soca", areaHa: 10 },
      { secao: "10", talhao: "2", projeto: "Falhas Plantio", areaHa: 5.5 },
      { secao: "20", talhao: "5", projeto: "Levantamento Topográfico", areaHa: 4 },
      { secao: "99", talhao: "1", projeto: "Falhas Plantio", areaHa: 100 },
    ];
    const r = resumirPlanejamento(talhoes, pendentes);
    expect(r.hectares).toBeCloseTo(29.5);
    expect(r.qtdTalhoes).toBe(3);
    expect(r.porTipo).toEqual([
      { sigla: "FP", nome: "Falhas Plantio", hectares: 15.5 },
      { sigla: "FS", nome: "Falhas Soca", hectares: 10 },
      { sigla: "LT", nome: "Levantamento Topográfico", hectares: 4 },
    ]);
    expect(r.porFazenda).toEqual([
      { fazenda: "PEDRA", secao: "10", hectares: 25.5, siglas: ["FP", "FS"] },
      { fazenda: "SAPE", secao: "20", hectares: 4, siglas: ["LT"] },
    ]);
  });
});

describe("rótulos, cores e datas", () => {
  it("siglas fixas e iniciais para desconhecido", () => {
    expect(siglaTipoVoo("Sistematização")).toBe("SIS");
    expect(siglaTipoVoo("Tipo Novo Aqui")).toBe("TNA");
  });
  it("dia da semana em português", () => {
    expect(rotuloDia("2026-10-19")).toBe("Seg 19/10");
    expect(tituloDia("2026-10-25")).toBe("Domingo, 25/10");
  });
  it("cor fixa por dia da semana", () => {
    expect(corDoDia("2026-10-19")).toBe(corDoDia("2026-10-26"));
    expect(corDoDia("2026-10-19")).not.toBe(corDoDia("2026-10-20"));
  });
  it("tira os dias que já passaram", () => {
    const lista = [{ data: "2026-10-18" }, { data: "2026-10-19" }, { data: "2026-10-20" }];
    expect(filtrarDeHojeEmDiante(lista, "2026-10-19").map((p) => p.data)).toEqual(["2026-10-19", "2026-10-20"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar.**

- [ ] **Step 3: Implementar**

```js
// Planejamento de voos (ver docs/superpowers/specs/2026-10-16-planejamento-voos-design.md):
// geometria, resumo e rótulos — sem React/MapLibre, testável sozinho.
import { ordemTipoVoo } from "./coresTiposVoo.js";

const SIGLAS = new Map([
  ["Falhas Plantio", "FP"],
  ["Falhas Soca", "FS"],
  ["Sistematização", "SIS"],
  ["Ervas Daninhas", "ED"],
  ["Drone Aplicação", "DA"],
  ["Ambiental", "AMB"],
  ["Experimentação Agrícola", "EA"],
  ["Levantamento Topográfico", "LT"],
  ["Projeto Plantio", "PP"],
]);
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_LONGOS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
// Dom..Sáb — fortes no satélite e distintas das cores dos tipos de voo.
const CORES_DIAS = ["#94a3b8", "#22d3ee", "#facc15", "#f472b6", "#a78bfa", "#fb923c", "#e2e8f0"];

export function pontoNoPoligono([x, y], anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

export function talhoesDentro(pontos, poligono) {
  const anel = poligono.coordinates[0];
  const vistos = new Map();
  for (const p of pontos) {
    const chave = `${p.secao}-${p.talhao}`;
    if (vistos.has(chave) || !pontoNoPoligono([p.lon, p.lat], anel)) continue;
    vistos.set(chave, { secao: String(p.secao), talhao: String(p.talhao), fazenda: p.fazenda });
  }
  return [...vistos.values()];
}

export function siglaTipoVoo(nome) {
  if (SIGLAS.has(nome)) return SIGLAS.get(nome);
  return String(nome).split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase()).join("");
}

function arredondar(n) {
  return Math.round(n * 10) / 10;
}

export function resumirPlanejamento(talhoesDoPlano, pendentes) {
  const fazendaPorChave = new Map(talhoesDoPlano.map((t) => [`${t.secao}-${t.talhao}`, t]));
  const porTipo = new Map();
  const porFazenda = new Map();
  const talhoesComPendencia = new Set();
  let hectares = 0;
  for (const r of pendentes) {
    const chave = `${r.secao}-${r.talhao}`;
    const t = fazendaPorChave.get(chave);
    if (!t) continue;
    const ha = r.areaHa || 0;
    hectares += ha;
    talhoesComPendencia.add(chave);
    porTipo.set(r.projeto, (porTipo.get(r.projeto) || 0) + ha);
    const f = porFazenda.get(t.secao) || { fazenda: t.fazenda, secao: t.secao, hectares: 0, siglas: new Set() };
    f.hectares += ha;
    f.siglas.add(siglaTipoVoo(r.projeto));
    porFazenda.set(t.secao, f);
  }
  return {
    hectares: arredondar(hectares),
    qtdTalhoes: talhoesComPendencia.size,
    porTipo: [...porTipo.entries()]
      .sort(([a], [b]) => ordemTipoVoo(a) - ordemTipoVoo(b) || a.localeCompare(b))
      .map(([nome, ha]) => ({ sigla: siglaTipoVoo(nome), nome, hectares: arredondar(ha) })),
    porFazenda: [...porFazenda.values()]
      .sort((a, b) => b.hectares - a.hectares)
      .map((f) => ({ ...f, hectares: arredondar(f.hectares), siglas: [...f.siglas].sort() })),
  };
}

function diaDaSemana(dataIso) {
  return new Date(`${dataIso}T12:00:00Z`).getUTCDay();
}

function ddmm(dataIso) {
  const [, m, d] = dataIso.split("-");
  return `${d}/${m}`;
}

export function rotuloDia(dataIso) {
  return `${DIAS_CURTOS[diaDaSemana(dataIso)]} ${ddmm(dataIso)}`;
}

export function tituloDia(dataIso) {
  return `${DIAS_LONGOS[diaDaSemana(dataIso)]}, ${ddmm(dataIso)}`;
}

export function corDoDia(dataIso) {
  return CORES_DIAS[diaDaSemana(dataIso)];
}

export function hojeLocal(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export function filtrarDeHojeEmDiante(planejamentos, hoje = hojeLocal()) {
  return planejamentos.filter((p) => p.data >= hoje);
}
```

(Ordem em `porFazenda`: maior hectare primeiro. No teste, PEDRA 25,5 vem antes de SAPE 4. Ordem das siglas: alfabética.)

- [ ] **Step 4: Rodar e ver passar.**
- [ ] **Step 5: Commit** — `git commit -m "Planejamento de voos: módulo puro do frontend"`

### Tarefa 4: visualização no mapa (hook, cartão, cópia offline)

**Files:**
- Modify: `frontend/src/lib/api.js` (adicionar `buscarPlanejamentos(token, mapaId)`, `criarPlanejamento(token, mapaId, corpo)`, `alterarDataPlanejamento(token, id, data)`, `apagarPlanejamento(token, id)`, no mesmo padrão de `buscarVoosPendentes`/`apontarVoos`: `fetch` + `await tratarResposta(resp)` + `resp.json()`; devolvem `.planejamentos` / `.planejamento` / `true`)
- Modify: `frontend/src/lib/db.js` (versão 5 → 6; store `planejamentos_voo` com `keyPath: "mapaId"`, criado no bloco `if (oldVersion < 6)`; funções `salvarPlanejamentosLocal(mapaId, itens)` e `buscarPlanejamentosLocal(mapaId)` iguais às de pendências; incluir o store no `clear()` de `limparApontamentosLocais`)
- Create: `frontend/src/hooks/usePlanejamentos.js`
- Create: `frontend/src/components/CartaoPlanejamento.jsx`
- Modify: `frontend/src/pages/Mapa.jsx` (usar o hook, mostrar o cartão, item no painel de camadas)
- Modify: `frontend/src/index.css` (só se o cartão precisar de classe nova; reaproveitar as do painel de atributos)

**Interfaces:**
- Consumes: Tarefa 3 inteira; `voosInfo` (de `Mapa.jsx`, `null` fora do mapa de voos; tem `sourceId`, `pmtiles`, `header`, `assinatura`); `apontamento.pendentes` (lista do `useApontamentoVoo`, itens `{ secao, talhao, projeto, areaHa }`); API da Parte 1.
- Produces: `usePlanejamentos(mapRef, mapaPronto, voosInfo, mapaId, token) -> { planejamentos, selecionado, setSelecionado, visivel, setVisivel, recarregar, adicionarLocal(planejamento), atualizarLocal(planejamento), removerLocal(id) }`. Camadas MapLibre: fonte `planejamento-voo` (GeoJSON, `properties: { id, data, rotulo, cor }`); camadas `planejamento-preenchimento` (fill, `fill-color` = `["get","cor"]`, opacidade 0.12), `planejamento-contorno` (line, `line-color` = `["get","cor"]`, largura 2.5, `line-dasharray` [2,1.5]) e `planejamento-rotulo` (symbol, `text-field` = `["get","rotulo"]`, tamanho 15, texto escuro com contorno branco, `symbol-placement: "point"`), inseridas **abaixo** da primeira camada de voos (`beforeId` = `voosInfo.fillLayerId` quando existir).

Passos:

- [ ] **Step 1:** `api.js` e `db.js` como descrito em Files. Rodar `vitest` (nada deve quebrar).
- [ ] **Step 2: Hook.** No estilo de `useApontamentoVoo` (efeito de busca com cópia do aparelho primeiro):
  - sem `voosInfo` ou sem `mapaId`, não faz nada;
  - ao montar, lê `buscarPlanejamentosLocal`, aplica `filtrarDeHojeEmDiante` e mostra; depois chama `buscarPlanejamentos`, guarda com `salvarPlanejamentosLocal` e mostra; erro de rede mantém a cópia;
  - um efeito sincroniza a fonte GeoJSON com `planejamentos` (cria fonte/camadas na primeira vez; `setData` depois; remove no cleanup);
  - liga/desliga mexe só em `visibility` das 3 camadas;
  - clique: `map.on("click", ...)` com `queryRenderedFeatures(e.point, { layers: ["planejamento-preenchimento", "planejamento-rotulo"] })`; se o mesmo ponto tiver feição em alguma camada de voos (`voosInfo.fillLayerId`) com pendência, **não** seleciona (o talhão tem prioridade); senão `setSelecionado(planejamento)`.
- [ ] **Step 3: Cartão.** `CartaoPlanejamento({ planejamento, pendentes, ehAdmin, aoFechar, aoAlterarData, aoApagar })`: usa `resumirPlanejamento(planejamento.talhoes, pendentes)` e mostra:
  - título `tituloDia(data)`;
  - linha "86,4 ha · 23 talhões pendentes" (`toLocaleString("pt-BR", { maximumFractionDigits: 1 })`);
  - linha por tipo "FP 52 ha · FS 30 ha";
  - lista por fazenda "PEDRA — 40 ha — FP FS";
  - sem pendência: "Nenhum talhão pendente nesta área".
  
  Usa a mesma moldura do painel de atributos (`painel-flutuante painel-atributos aberto`, botão fechar com `aria-label`). As ações de admin entram na Tarefa 6.
- [ ] **Step 4: Mapa.jsx.** Chamar o hook logo depois de `useApontamentoVoo`. Mostrar o cartão quando `planejamentos.selecionado`, fechando os outros cartões de informação, no mesmo padrão de `pins.pinSelecionado`. Incluir "Planejamento" como uma linha no painel de camadas (desktop e gaveta), só quando `voosInfo` existe, com checkbox ligado a `visivel`. `mostrarGaveta` também esconde quando há planejamento selecionado.
- [ ] **Step 5:** `vitest` e `vite build` passam. Commit — `git commit -m "Planejamento de voos: polígonos e resumo no mapa"`.

**Verificação da Parte 2 (gerente, Playwright no dev local):** banco local preparado (camada 3 como voos, admin no grupo 14). Criar 2 planejamentos via API (`POST` com token de admin; um hoje, um amanhã) e um ontem direto no SQL. Pendências simuladas via `page.route`. Conferir:
- os 2 polígonos de hoje e amanhã aparecem com rótulo;
- o de ontem não aparece;
- clique fora de talhão abre o resumo com os números certos;
- clique sobre um talhão pendente abre o talhão;
- offline (`context.setOffline(true)` + reload) os polígonos continuam;
- o item "Planejamento" do painel de camadas esconde e mostra.

Restaurar o banco ao final.

**Fim da Parte 2** (publicável; precisa da migration 019 em produção antes).

---

# Parte 3 — ferramenta Planejar (só admin)

### Tarefa 5: talhões dentro do polígono, lidos do `.pmtiles`

**Files:**
- Create: `frontend/src/lib/talhoesNoPoligono.js`

**Interfaces:**
- Consumes: `talhoesDentro` (Tarefa 3); `voosInfo.pmtiles` (instância `PMTiles`), `voosInfo.header` (`minZoom`, `maxZoom`), `voosInfo.sourceLayerPrincipal`.
- Produces: `async lerTalhoesNoPoligono(voosInfo, poligono) -> { talhoes: [{secao, talhao, fazenda}], semRotulos: boolean }`.

- [ ] **Step 1: Implementar** (técnica do índice de busca em `Mapa.jsx`, sem tocar nele):
  - `z = Math.min(voosInfo.header.maxZoom, 13)`;
  - calcula o retângulo do polígono e os tiles `x0..x1`, `y0..y1` com a mesma fórmula de `lonLatParaTile` (copiar a função, 6 linhas, de `lib/pmtilesValores.js`);
  - para cada tile, `const resp = await pmtiles.getZxy(z, x, y)` → `new VectorTile(new PbfReader(new Uint8Array(resp.data)))`;
  - da camada `rotulos`, pega cada ponto `feature.toGeoJSON(x, y, z)` → `{ secao, talhao, lon, lat }`;
  - da camada principal (`sourceLayerPrincipal`), monta `SECAO-TALHAO -> DESC_SECAO`;
  - devolve `talhoesDentro(pontos com fazenda, poligono)`; fazenda sem nome usa o código da seção;
  - se nenhum tile tiver a camada `rotulos`, `semRotulos: true`.
- [ ] **Step 2:** `vite build` passa. Commit — `git commit -m "Planejamento de voos: leitura dos talhões no polígono"`.

### Tarefa 6: ferramenta de desenho, prévia, salvar, alterar e apagar

**Files:**
- Create: `frontend/src/components/BarraPlanejamento.jsx` (barra no rodapé, no padrão de `BarraAcaoMedicao.jsx`)
- Modify: `frontend/src/hooks/usePlanejamentos.js` (modo desenho: `desenhando`, `pontosDesenho`, `iniciarDesenho()`, `desfazerPonto()`, `cancelarDesenho()`, `concluirDesenho()` → abre o rascunho com `{ poligono, data: amanhã, previa }`, `salvarRascunho(data)`; camadas próprias do desenho, cor magenta como a importação temporária)
- Modify: `frontend/src/components/CartaoPlanejamento.jsx` (modo rascunho: campo `<input type="date">`, prévia via `resumirPlanejamento`, botão "Salvar"; modo admin em existente: "Alterar data" e "Apagar" com `window.confirm`)
- Modify: `frontend/src/components/DockFerramentas.jsx` e `frontend/src/pages/Mapa.jsx` (item "Planejar" só para `sessao.usuario.papel === "admin"` e só com `voosInfo`; também na aba Ferramentas da gaveta do celular; clique no mapa vai para o desenho enquanto `desenhando`, como a medição faz)

**Interfaces:**
- Consumes: Tarefas 3, 4 e 5; API `criarPlanejamento`, `alterarDataPlanejamento`, `apagarPlanejamento`.

- [ ] **Step 1:** implementar conforme Files:
  - "Concluir" fica desativado com menos de 3 cantos;
  - o polígono é fechado repetindo o primeiro canto;
  - "Salvar" sem internet (`!navigator.onLine` ou erro de rede) mostra "Precisa de internet para salvar o planejamento" e mantém o rascunho;
  - `semRotulos` mostra "Esta camada de voos não tem rótulos; publique de novo pelo pipeline" e desativa "Salvar";
  - depois de salvar, `adicionarLocal` e seleciona o novo.
- [ ] **Step 2:** `vitest` e `vite build` passam. Commit — `git commit -m "Planejamento de voos: ferramenta Planejar"`.

**Verificação da Parte 3 (gerente, Playwright):**
- admin desenha 4 cantos em volta de talhões conhecidos, vê a prévia com hectares, salva, e o polígono aparece;
- outro usuário (`teste@geoportal.local`, colocado no grupo do mapa) vê o polígono e não vê "Planejar";
- admin altera a data e apaga;
- offline, salvar mostra a mensagem e o rascunho continua.

Restaurar o banco ao final.

---

## Execução e publicação (gerente)

- Delegação por tarefa:
  - Tarefas 1, 3 e 5 (código dado no plano): camada 1, executor gratuito;
  - Tarefas 2, 4 e 6: camada 2, Haiku, porque precisam de banco local, de vários arquivos e do contexto do mapa.
- Em toda tarefa: revisar o diff e rodar a verificação.
- Publicação por parte:
  1. conferir `jobs_conversao` em `processando`;
  2. rodar `npm run migrate` com o `.env` de produção (só na primeira publicação, que traz a 019);
  3. push com a conta `lmalerbo`;
  4. nunca entre 8h05 e ~9h15;
  5. registrar no `CLAUDE.md`.
