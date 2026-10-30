# Plantio Excedente — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** mapa em que todo talhão voado de Falhas Plantio (desde 01/04/2026) aparece amarelo, o analista aponta vermelho (precisa de ajuste) ou verde (sem ajuste) e o gestor conclui os vermelhos (verde), tudo funcionando também sem internet.

**Architecture:** o backend guarda um "caso" por voo FLP em `analises_excedente`, criado a partir dos voos realizados que os Indicadores já buscam e guardam em cache (`obterDadosIndicadores`). Os apontamentos chegam em lote, com hora do aparelho, e vale o mais recente. O frontend pinta a camada Talhões marcada como `tipoCamada: "excedente"`, guarda uma cópia dos casos no IndexedDB e mantém uma fila offline própria.

**Tech Stack:** Node/Express + PostgreSQL (`node:test`), React + Vite + MapLibre GL, IndexedDB (`idb`), Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-30-plantio-excedente-design.md`

## Ajustes ao spec decididos no plano (avisar o Leo na entrega)

1. **Sem coluna `mapas.tipo`.** O projeto já marca a camada especial pelo estilo (`estilo_config.tipoCamada === "voos"`). O mapa de excedente segue o mesmo padrão: a camada Talhões dele recebe `tipoCamada: "excedente"` em Admin → Camadas → Estilo. O backend recusa `GET/POST .../excedente` (404) em mapa sem uma camada assim.
2. **"Ajustado" se distingue pelo contorno verde-escuro grosso, não por ✓.** A fonte offline (`public/fonts/Noto Sans Regular/0-255.pbf`) só tem os caracteres 0–255. O "✓" (U+2713) sairia como quadrado vazio sem internet.
3. **Trecho desenhado**: preenchimento vermelho translúcido com contorno tracejado enquanto o caso está vermelho, e só o contorno tracejado depois. Não há imagem de hachura.
4. **Atualização dos voos**: reaproveita o cache dos Indicadores. Voo novo muda a contagem e é buscado na hora. Edição que não muda a contagem (ex.: cancelamento trocado por outro voo) aparece em até 1h. Além disso, o próprio excedente só refaz a conferência a cada 2 min por mapa.

## Global Constraints

- Entram só voos com `tipo === "Falhas Plantio"` (próprio e fornecedor), Verificar porte 9, `dataLocal(dataVoo) >= "2026-04-01"`.
- Status: `aguardando` | `precisa_ajuste` | `sem_ajuste` | `ajustado`. Transições: `aguardando → precisa_ajuste | sem_ajuste`; `precisa_ajuste → ajustado`; qualquer status → `aguardando`.
- Escrever exige `usuarioPodeEditarMapa` (admin sempre). Ler exige `usuarioPodeVerMapa`.
- `feito_em` vindo do aparelho é limitado a agora + 5 min (mesma regra de `routes/pins.js`).
- Caso existente nunca é sobrescrito nem apagado pela sincronização.
- Cores: aguardando `#facc15`, precisa_ajuste `#dc2626`, sem_ajuste `#16a34a`, ajustado `#16a34a` com contorno `#14532d` largura 3.
- Testes de backend só contra Postgres local: `cd backend && DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" npm test`. Nunca produção.
- Texto acentuado nunca passa por argumento de shell. Use arquivo (Write/Edit).
- Todo texto de interface em português do Brasil.

## Review Focus

1. **Talhão com 2 casos** (voado de FLP duas vezes): o mapa deve mostrar a cor do caso com `dataVoo` mais recente, e o cartão abre esse caso. Teste em `excedente.test.js` (Tarefa 3).
2. **Relógio do aparelho adiantado**: um `feitoEm` de daqui a 2 dias não pode travar edições futuras. Teste de rota na Tarefa 2.
3. **Resposta perdida e reenvio**: reenviar o mesmo `id` de apontamento não grava histórico duplicado nem conta como substituído. Teste na Tarefa 2.
4. **Mapa comum chamando a rota**: um mapa sem camada `excedente` responde 404 e não cria casos. Teste na Tarefa 2.
5. **Ponte fora no primeiro acesso** (nenhum caso ainda): responde 200 com lista vazia e `atualizacao: "falhou"`, nunca 502. Teste na Tarefa 2.

---

### Task 1: Migration e regras puras do backend

**Files:**
- Create: `backend/src/db/migrations/021_analises_excedente.sql`
- Create: `backend/src/lib/casosExcedente.js`
- Test: `backend/test/casos-excedente.test.js`

**Interfaces:**
- Produces:
  - `INICIO_EXCEDENTE = "2026-04-01"`;
  - `selecionarVoosFLP(realizados) → [{vooId, secao, talhao, fazenda, fornecedor, dataVoo}]`;
  - `transicaoPermitida(de, para) → boolean`;
  - `STATUS_EXCEDENTE` (array);
  - `limitarFeitoEm(date, agora = new Date()) → Date`.

- [ ] **Step 1: Escrever a migration**

```sql
-- Plantio Excedente (2026-10-30): um caso de análise por voo de Falhas
-- Plantio — ver docs/superpowers/specs/2026-10-30-plantio-excedente-design.md.
CREATE TABLE IF NOT EXISTS analises_excedente (
  id UUID PRIMARY KEY,
  mapa_id INTEGER NOT NULL REFERENCES mapas(id) ON DELETE CASCADE,
  voo_id TEXT NOT NULL,
  secao TEXT NOT NULL,
  talhao TEXT NOT NULL,
  fazenda TEXT,
  fornecedor BOOLEAN NOT NULL DEFAULT false,
  data_voo DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando', 'precisa_ajuste', 'sem_ajuste', 'ajustado')),
  area_excedente_ha NUMERIC,
  observacao TEXT,
  poligono_excedente JSONB,
  data_ajuste DATE,
  voo_cancelado BOOLEAN NOT NULL DEFAULT false,
  janela_ajuste JSONB,
  atualizado_em TIMESTAMPTZ,
  atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mapa_id, voo_id)
);
CREATE INDEX IF NOT EXISTS analises_excedente_mapa ON analises_excedente (mapa_id);

-- id = id do apontamento gerado no aparelho: reenvio idempotente.
CREATE TABLE IF NOT EXISTS historico_excedente (
  id UUID PRIMARY KEY,
  analise_id UUID NOT NULL REFERENCES analises_excedente(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  feito_em TIMESTAMPTZ NOT NULL,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  campos JSONB NOT NULL DEFAULT '{}'::jsonb,
  substituido BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS historico_excedente_analise ON historico_excedente (analise_id, feito_em);
```

- [ ] **Step 2: Escrever o teste que falha**

```js
import { test } from "node:test";
import assert from "node:assert/strict";
import { selecionarVoosFLP, transicaoPermitida, limitarFeitoEm } from "../src/lib/casosExcedente.js";

const voo = (extra) => ({
  id: "v1", dataVoo: "2026-05-10T13:00:00Z", tipo: "Falhas Plantio", secao: "10324", talhao: "3",
  fazenda: "PEDRA", propriedade: "PRÓPRIA", ...extra,
});

test("selecionarVoosFLP: só Falhas Plantio da safra 2026 em diante, marca fornecedor", () => {
  const saida = selecionarVoosFLP([
    voo(),
    voo({ id: "v2", tipo: "Falhas Soca" }),
    voo({ id: "v3", dataVoo: "2026-03-31T23:00:00Z" }), // 31/03 20h em Brasília
    voo({ id: "v4", propriedade: "FORNECEDOR" }),
    voo({ id: "v5", dataVoo: null }),
  ]);
  assert.deepEqual(saida.map((v) => v.vooId), ["v1", "v4"]);
  assert.equal(saida[0].dataVoo, "2026-05-10");
  assert.equal(saida[0].fornecedor, false);
  assert.equal(saida[1].fornecedor, true);
  assert.equal(saida[0].secao, "10324");
});

test("transicaoPermitida segue o fluxo combinado", () => {
  assert.equal(transicaoPermitida("aguardando", "precisa_ajuste"), true);
  assert.equal(transicaoPermitida("aguardando", "sem_ajuste"), true);
  assert.equal(transicaoPermitida("precisa_ajuste", "ajustado"), true);
  assert.equal(transicaoPermitida("sem_ajuste", "aguardando"), true);
  assert.equal(transicaoPermitida("ajustado", "aguardando"), true);
  assert.equal(transicaoPermitida("aguardando", "ajustado"), false);
  assert.equal(transicaoPermitida("sem_ajuste", "precisa_ajuste"), false);
  assert.equal(transicaoPermitida("aguardando", "inventado"), false);
});

test("limitarFeitoEm corta datas mais de 5 min no futuro", () => {
  const agora = new Date("2026-10-30T12:00:00Z");
  assert.equal(limitarFeitoEm(new Date("2026-11-01T12:00:00Z"), agora).toISOString(), "2026-10-30T12:05:00.000Z");
  assert.equal(limitarFeitoEm(new Date("2026-10-30T11:00:00Z"), agora).toISOString(), "2026-10-30T11:00:00.000Z");
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run: `cd backend && DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" node --test test/casos-excedente.test.js`
Expected: FAIL, "Cannot find module ... casosExcedente.js".

- [ ] **Step 4: Implementar**

```js
import { dataLocal, ehFornecedor } from "./indicadoresVoo.js";

// Plantio Excedente — regras puras (sem banco nem rede). Ver
// docs/superpowers/specs/2026-10-30-plantio-excedente-design.md.

// Decidido com o Leo: só a safra atual em diante. Fixo (e não safraDe(hoje))
// pra a virada de safra não fazer casos novos pararem de entrar errado — os
// casos já criados ficam no banco de qualquer jeito.
export const INICIO_EXCEDENTE = "2026-04-01";
const TIPO_FLP = "Falhas Plantio";

export const STATUS_EXCEDENTE = ["aguardando", "precisa_ajuste", "sem_ajuste", "ajustado"];

const TRANSICOES = {
  aguardando: ["precisa_ajuste", "sem_ajuste"],
  precisa_ajuste: ["ajustado"],
  sem_ajuste: [],
  ajustado: [],
};

export function transicaoPermitida(de, para) {
  if (!STATUS_EXCEDENTE.includes(para)) return false;
  if (para === "aguardando") return true; // "Reabrir", de qualquer status
  return (TRANSICOES[de] || []).includes(para);
}

// `realizados` = itens de mapearRegistroRealizado (lib/fonteIndicadoresVoo.js).
export function selecionarVoosFLP(realizados) {
  const saida = [];
  for (const r of realizados) {
    if (r.tipo !== TIPO_FLP || !r.dataVoo) continue;
    const dia = dataLocal(r.dataVoo);
    if (!dia || dia < INICIO_EXCEDENTE) continue;
    saida.push({
      vooId: String(r.id),
      secao: String(r.secao),
      talhao: String(r.talhao),
      fazenda: r.fazenda ?? null,
      fornecedor: ehFornecedor(r.propriedade),
      dataVoo: dia,
    });
  }
  return saida;
}

const FOLGA_RELOGIO_MS = 5 * 60 * 1000;
export function limitarFeitoEm(data, agora = new Date()) {
  const limite = new Date(agora.getTime() + FOLGA_RELOGIO_MS);
  return data > limite ? limite : data;
}
```

Antes de implementar, confira em `backend/src/lib/indicadoresVoo.js:29` que `dataLocal(iso)` devolve `"AAAA-MM-DD"` no fuso de Brasília e algo falso para data inválida. Se ele lançar erro com data inválida, envolva a chamada em `try/catch` e pule o registro.

- [ ] **Step 5: Rodar e ver passar**

Run: o mesmo comando do Step 3. Expected: PASS (3 testes).

- [ ] **Step 6: Aplicar a migration no Postgres local e commitar**

Run: `cd backend && DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" npm run migrate`
Expected: aplica `021_analises_excedente.sql`.

```bash
git add backend/src/db/migrations/021_analises_excedente.sql backend/src/lib/casosExcedente.js backend/test/casos-excedente.test.js
git commit -m "Plantio Excedente: tabelas e regras de casos"
```

---

### Task 2: Rotas do backend

**Files:**
- Create: `backend/src/routes/excedente.js`
- Modify: `backend/src/app.js` (montar o router antes do `adminRouter`, junto do `planejamentosRouter`)
- Test: `backend/test/excedente-rotas.test.js`

**Interfaces:**
- Consumes: Task 1 (`selecionarVoosFLP`, `transicaoPermitida`, `limitarFeitoEm`); `obterDadosIndicadores` e `definirFonteParaTestes` de `lib/fonteIndicadoresVoo.js`; `usuarioPodeVerMapa` e `usuarioPodeEditarMapa` de `lib/permissoes.js`.
- Produces:
  - `GET /mapas/:id/excedente` → `{ casos: Caso[], atualizacao: "ok" | "falhou" }`.
  - `Caso = {id, vooId, secao, talhao, fazenda, fornecedor, dataVoo, status, areaExcedenteHa, observacao, poligonoExcedente, dataAjuste, vooCancelado, atualizadoEm, atualizadoPorNome, historico: [{id, usuarioNome, feitoEm, statusAnterior, statusNovo, campos, substituido}]}`.
  - `POST /mapas/:id/excedente/apontamentos`, com corpo `{ apontamentos: [{id, casoId, status, campos, feitoEm}] }` e resposta `{ resultados: [{id, resultado: "aplicado"|"substituido"|"recusado", erro?}] }`.
  - `campos` aceita `areaExcedenteHa` (número ≥ 0 ou null), `observacao` (texto ≤ 2000 ou null), `poligonoExcedente` (GeoJSON `Polygon` ou null) e `dataAjuste` (`AAAA-MM-DD` ou null).
  - `esquecerSincronizacoesParaTestes()`.

- [ ] **Step 1: Escrever os testes que falham**

```js
import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarCenario, limparCenario, iniciarServidor, tokenPara, req, pool } from "./helpers.js";
import { definirFonteParaTestes } from "../src/lib/fonteIndicadoresVoo.js";
import { esquecerSincronizacoesParaTestes } from "../src/routes/excedente.js";

let c, srv, tAdmin, tEditor, tLeitor, tSemGrupo;
let realizados = [];
let falhar = false;

const voo = (id, extra = {}) => ({
  id, dataVoo: "2026-05-10T13:00:00Z", tipo: "Falhas Plantio", secao: "10324", talhao: id.slice(-1),
  fazenda: "PEDRA", propriedade: "PRÓPRIA", ...extra,
});

before(async () => {
  c = await criarCenario();
  // Marca o mapa do cenário como mapa de excedente (camada Talhões com tipoCamada).
  await pool.query(
    `INSERT INTO camadas (mapa_id, nome, versao, arquivo_path, estilo_config) VALUES ($1, 'Talhões', '1', 'x.pmtiles', $2)`,
    [c.mapa.id, JSON.stringify({ tipoCamada: "excedente" })]
  );
  srv = await iniciarServidor();
  tAdmin = tokenPara(c.admin);
  tEditor = tokenPara(c.editor);
  tLeitor = tokenPara(c.leitor);
  tSemGrupo = tokenPara(c.semGrupo);
  definirFonteParaTestes(async () => {
    if (falhar) throw new Error("ponte desligada");
    return { realizados, pendentes: [], atualizadoEm: new Date().toISOString(), desatualizado: false };
  });
});
beforeEach(() => esquecerSincronizacoesParaTestes());
after(async () => {
  definirFonteParaTestes(null);
  await srv.fechar();
  await limparCenario(c);
  await pool.end();
});

const urlCasos = () => `${srv.url}/mapas/${c.mapa.id}/excedente`;
const urlApont = () => `${srv.url}/mapas/${c.mapa.id}/excedente/apontamentos`;
const apont = (casoId, status, extra = {}) => ({
  id: randomUUID(), casoId, status, campos: {}, feitoEm: new Date().toISOString(), ...extra,
});

test("ponte fora no primeiro acesso: 200, lista vazia, atualizacao falhou", async () => {
  falhar = true;
  const r = await req(urlCasos(), tLeitor);
  falhar = false;
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.casos, []);
  assert.equal(r.corpo.atualizacao, "falhou");
});

test("cria casos dos voos FLP sem duplicar; leitor vê; sem grupo não vê", async () => {
  realizados = [voo("v-a1"), voo("v-a2"), voo("v-x9", { tipo: "Falhas Soca" })];
  const r1 = await req(urlCasos(), tLeitor);
  assert.equal(r1.status, 200);
  assert.equal(r1.corpo.atualizacao, "ok");
  assert.deepEqual(r1.corpo.casos.map((x) => x.vooId).sort(), ["v-a1", "v-a2"]);
  assert.ok(r1.corpo.casos.every((x) => x.status === "aguardando"));
  esquecerSincronizacoesParaTestes();
  const r2 = await req(urlCasos(), tLeitor);
  assert.equal(r2.corpo.casos.length, 2);
  assert.equal((await req(urlCasos(), tSemGrupo)).status, 404);
});

test("mapa sem camada excedente: 404 e não cria casos", async () => {
  const r = await req(`${srv.url}/mapas/${c.mapaOutro.id}/excedente`, tAdmin);
  assert.equal(r.status, 404);
  const { rows } = await pool.query("SELECT 1 FROM analises_excedente WHERE mapa_id = $1", [c.mapaOutro.id]);
  assert.equal(rows.length, 0);
});

test("leitor não aponta; editor aponta com campos e histórico", async () => {
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-a1");
  const negado = await req(urlApont(), tLeitor, { method: "POST", body: { apontamentos: [apont(caso.id, "sem_ajuste")] } });
  assert.equal(negado.status, 403);

  const poligono = { type: "Polygon", coordinates: [[[-47.6, -21.1], [-47.5, -21.1], [-47.5, -21.0], [-47.6, -21.1]]] };
  const a = apont(caso.id, "precisa_ajuste", { campos: { areaExcedenteHa: 1.5, observacao: "cabeceira norte", poligonoExcedente: poligono } });
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [a] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.resultados, [{ id: a.id, resultado: "aplicado" }]);

  const depois = (await req(urlCasos(), tLeitor)).corpo.casos.find((x) => x.id === caso.id);
  assert.equal(depois.status, "precisa_ajuste");
  assert.equal(depois.areaExcedenteHa, 1.5);
  assert.equal(depois.observacao, "cabeceira norte");
  assert.deepEqual(depois.poligonoExcedente, poligono);
  assert.equal(depois.historico.length, 1);
  assert.equal(depois.historico[0].statusAnterior, "aguardando");
});

test("transição inválida é recusada com motivo", async () => {
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-a2");
  const a = apont(caso.id, "ajustado");
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [a] } });
  assert.equal(r.corpo.resultados[0].resultado, "recusado");
  assert.match(r.corpo.resultados[0].erro, /aguardando/);
});

test("mais recente vence; mais antigo fica no histórico como substituído", async () => {
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-a1"); // precisa_ajuste
  // `novo` precisa ser posterior ao apontamento do teste anterior (feito "agora" lá).
  const novo = apont(caso.id, "ajustado", { campos: { dataAjuste: "2026-10-29" } });
  const velho = apont(caso.id, "aguardando", { feitoEm: new Date(Date.now() - 3_600_000).toISOString() });
  const r = await req(urlApont(), tAdmin, { method: "POST", body: { apontamentos: [novo, velho] } });
  assert.deepEqual(r.corpo.resultados.map((x) => x.resultado), ["aplicado", "substituido"]);
  const depois = (await req(urlCasos(), tLeitor)).corpo.casos.find((x) => x.id === caso.id);
  assert.equal(depois.status, "ajustado");
  assert.equal(depois.dataAjuste, "2026-10-29");
  assert.ok(depois.historico.some((h) => h.substituido));
});

test("reenvio do mesmo apontamento é idempotente", async () => {
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-a2"); // aguardando
  const a = apont(caso.id, "sem_ajuste");
  await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [a] } });
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [a] } });
  assert.deepEqual(r.corpo.resultados, [{ id: a.id, resultado: "aplicado" }]);
  const depois = (await req(urlCasos(), tLeitor)).corpo.casos.find((x) => x.id === caso.id);
  assert.equal(depois.historico.length, 1);
});

test("relógio adiantado não trava edições seguintes", async () => {
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-a2"); // sem_ajuste
  const futuro = apont(caso.id, "aguardando", { feitoEm: new Date(Date.now() + 2 * 86_400_000).toISOString() });
  await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [futuro] } });
  await new Promise((r) => setTimeout(r, 10));
  // 6 min depois "de verdade" (simulado pelo feitoEm) uma edição normal ainda vence.
  const depois = apont(caso.id, "precisa_ajuste", { feitoEm: new Date(Date.now() + 6 * 60_000).toISOString() });
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [depois] } });
  assert.equal(r.corpo.resultados[0].resultado, "aplicado");
});

test("voo que some dos realizados marca cancelado, sem apagar; volta desmarca", async () => {
  realizados = [voo("v-a2")];
  const r = await req(urlCasos(), tLeitor);
  const a1 = r.corpo.casos.find((x) => x.vooId === "v-a1");
  assert.equal(a1.vooCancelado, true);
  realizados = [voo("v-a1"), voo("v-a2")];
  esquecerSincronizacoesParaTestes();
  const r2 = await req(urlCasos(), tLeitor);
  assert.equal(r2.corpo.casos.find((x) => x.vooId === "v-a1").vooCancelado, false);
});

test("corpo inválido: 400", async () => {
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [{ id: "x" }] } });
  assert.equal(r.status, 400);
});
```

Atenção ao teste "relógio adiantado": o primeiro `feitoEm` é cortado para agora + 5 min. O segundo, de agora + 6 min, também é cortado para agora + 5 min, mas para um instante *posterior* (o `agora` da segunda requisição é mais tarde), então vence. A pausa de 10 ms garante isso. A comparação é `novo > atualizado_em` (estritamente maior).

Antes de rodar, confira as colunas obrigatórias de `camadas` no schema (`grep -n "CREATE TABLE.*camadas" -A 15 backend/src/db/*.sql backend/src/db/migrations/*.sql`) e ajuste o `INSERT` do `before` se houver outra coluna `NOT NULL` sem default.

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd backend && DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" node --test test/excedente-rotas.test.js`
Expected: FAIL, "Cannot find module ... routes/excedente.js".

- [ ] **Step 3: Implementar `backend/src/routes/excedente.js`**

```js
import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { exigirAutenticacao } from "../middleware/auth.js";
import { usuarioPodeVerMapa, usuarioPodeEditarMapa } from "../lib/permissoes.js";
import { obterDadosIndicadores } from "../lib/fonteIndicadoresVoo.js";
import { selecionarVoosFLP, transicaoPermitida, limitarFeitoEm, STATUS_EXCEDENTE } from "../lib/casosExcedente.js";

// Plantio Excedente — ver docs/superpowers/specs/2026-10-30-plantio-excedente-design.md.
// Casos vêm dos voos realizados que os Indicadores já buscam e guardam em
// cache (mesma fonte, nenhuma consulta nova ao DroneManagement).
export const excedenteRouter = Router();
excedenteRouter.use("/mapas/:id/excedente", exigirAutenticacao);

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_DIA = /^\d{4}-\d{2}-\d{2}$/;
const INTERVALO_SINCRONIZACAO_MS = 2 * 60 * 1000;
const ultimaSincronizacao = new Map(); // mapaId -> ms

export function esquecerSincronizacoesParaTestes() {
  ultimaSincronizacao.clear();
}

async function ehMapaExcedente(mapaId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM camadas WHERE mapa_id = $1 AND estilo_config->>'tipoCamada' = 'excedente' LIMIT 1`,
    [mapaId]
  );
  return rows.length > 0;
}

// Devolve "ok" ou "falhou". Nunca lança: ponte fora não impede ver os casos.
async function sincronizarCasos(mapaId) {
  const agora = Date.now();
  if (agora - (ultimaSincronizacao.get(mapaId) || 0) < INTERVALO_SINCRONIZACAO_MS) return "ok";
  let dados;
  try {
    dados = await obterDadosIndicadores();
  } catch (err) {
    console.error("Plantio Excedente: sem voos do DroneManagement:", err.message);
    return "falhou";
  }
  const voos = selecionarVoosFLP(dados.realizados || []);
  for (const v of voos) {
    await pool.query(
      `INSERT INTO analises_excedente (id, mapa_id, voo_id, secao, talhao, fazenda, fornecedor, data_voo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (mapa_id, voo_id) DO NOTHING`,
      [randomUUID(), mapaId, v.vooId, v.secao, v.talhao, v.fazenda, v.fornecedor, v.dataVoo]
    );
  }
  // Cache antigo (desatualizado) pode não ter voo novo nem cancelamento —
  // só marca cancelado com a lista atual de verdade.
  if (!dados.desatualizado) {
    const ids = voos.map((v) => v.vooId);
    await pool.query(
      `UPDATE analises_excedente SET voo_cancelado = NOT (voo_id = ANY($2::text[])) WHERE mapa_id = $1`,
      [mapaId, ids]
    );
  }
  ultimaSincronizacao.set(mapaId, agora);
  return dados.desatualizado ? "falhou" : "ok";
}

function mapearCaso(r, historico) {
  return {
    id: r.id,
    vooId: r.voo_id,
    secao: r.secao,
    talhao: r.talhao,
    fazenda: r.fazenda,
    fornecedor: r.fornecedor,
    dataVoo: r.data_voo_txt,
    status: r.status,
    areaExcedenteHa: r.area_excedente_ha === null ? null : Number(r.area_excedente_ha),
    observacao: r.observacao,
    poligonoExcedente: r.poligono_excedente,
    dataAjuste: r.data_ajuste_txt,
    vooCancelado: r.voo_cancelado,
    atualizadoEm: r.atualizado_em ? r.atualizado_em.toISOString() : null,
    atualizadoPorNome: r.atualizado_por_nome,
    historico,
  };
}

async function listarCasos(mapaId) {
  const { rows } = await pool.query(
    `SELECT a.*, to_char(a.data_voo, 'YYYY-MM-DD') AS data_voo_txt,
            to_char(a.data_ajuste, 'YYYY-MM-DD') AS data_ajuste_txt, u.nome AS atualizado_por_nome
     FROM analises_excedente a LEFT JOIN usuarios u ON u.id = a.atualizado_por
     WHERE a.mapa_id = $1 ORDER BY a.data_voo DESC, a.secao, a.talhao`,
    [mapaId]
  );
  const { rows: hist } = await pool.query(
    `SELECT h.*, u.nome AS usuario_nome FROM historico_excedente h
     JOIN analises_excedente a ON a.id = h.analise_id
     LEFT JOIN usuarios u ON u.id = h.usuario_id
     WHERE a.mapa_id = $1 ORDER BY h.feito_em`,
    [mapaId]
  );
  const porCaso = new Map();
  for (const h of hist) {
    if (!porCaso.has(h.analise_id)) porCaso.set(h.analise_id, []);
    porCaso.get(h.analise_id).push({
      id: h.id,
      usuarioNome: h.usuario_nome,
      feitoEm: h.feito_em.toISOString(),
      statusAnterior: h.status_anterior,
      statusNovo: h.status_novo,
      campos: h.campos,
      substituido: h.substituido,
    });
  }
  return rows.map((r) => mapearCaso(r, porCaso.get(r.id) || []));
}

async function prepararMapa(req, res, exigirEdicao) {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) {
    res.status(400).json({ erro: "id de mapa inválido" });
    return null;
  }
  const pode = await usuarioPodeVerMapa(req.usuarioId, mapaId, req.usuarioPapel);
  if (!pode || !(await ehMapaExcedente(mapaId))) {
    res.status(404).json({ erro: "mapa não encontrado" });
    return null;
  }
  if (exigirEdicao && !(await usuarioPodeEditarMapa(req.usuarioId, mapaId, req.usuarioPapel))) {
    res.status(403).json({ erro: "sem permissão para apontar neste mapa" });
    return null;
  }
  return mapaId;
}

excedenteRouter.get("/mapas/:id/excedente", async (req, res) => {
  const mapaId = await prepararMapa(req, res, false);
  if (mapaId === null) return;
  const atualizacao = await sincronizarCasos(mapaId);
  res.json({ casos: await listarCasos(mapaId), atualizacao });
});

function validarCampos(campos) {
  if (campos === undefined || campos === null) return { dados: {} };
  if (typeof campos !== "object" || Array.isArray(campos)) return { erro: "campos inválidos" };
  const dados = {};
  if ("areaExcedenteHa" in campos) {
    const v = campos.areaExcedenteHa;
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) return { erro: "área inválida" };
    dados.areaExcedenteHa = v;
  }
  if ("observacao" in campos) {
    const v = campos.observacao;
    if (v !== null && (typeof v !== "string" || v.length > 2000)) return { erro: "observação inválida" };
    dados.observacao = v;
  }
  if ("poligonoExcedente" in campos) {
    const v = campos.poligonoExcedente;
    if (v !== null && (v?.type !== "Polygon" || !Array.isArray(v.coordinates))) return { erro: "desenho inválido" };
    dados.poligonoExcedente = v;
  }
  if ("dataAjuste" in campos) {
    const v = campos.dataAjuste;
    if (v !== null && (typeof v !== "string" || !REGEX_DIA.test(v))) return { erro: "data do ajuste inválida" };
    dados.dataAjuste = v;
  }
  return { dados };
}

function validarApontamento(a) {
  if (!REGEX_UUID.test(a?.id || "") || !REGEX_UUID.test(a?.casoId || "")) return { erro: "ids inválidos" };
  if (!STATUS_EXCEDENTE.includes(a.status)) return { erro: "status inválido" };
  const feitoEm = new Date(a.feitoEm);
  if (typeof a.feitoEm !== "string" || Number.isNaN(feitoEm.getTime())) return { erro: "feitoEm inválido" };
  const campos = validarCampos(a.campos);
  if (campos.erro) return campos;
  return { dados: { id: a.id, casoId: a.casoId, status: a.status, feitoEm: limitarFeitoEm(feitoEm), campos: campos.dados } };
}

const COLUNAS = {
  areaExcedenteHa: "area_excedente_ha",
  observacao: "observacao",
  poligonoExcedente: "poligono_excedente",
  dataAjuste: "data_ajuste",
};

async function aplicarApontamento(cliente, mapaId, usuarioId, a) {
  const jaRecebido = await cliente.query(`SELECT substituido FROM historico_excedente WHERE id = $1`, [a.id]);
  if (jaRecebido.rows[0]) return { id: a.id, resultado: jaRecebido.rows[0].substituido ? "substituido" : "aplicado" };

  const { rows } = await cliente.query(
    `SELECT status, atualizado_em FROM analises_excedente WHERE id = $1 AND mapa_id = $2 FOR UPDATE`,
    [a.casoId, mapaId]
  );
  const caso = rows[0];
  if (!caso) return { id: a.id, resultado: "recusado", erro: "caso não encontrado neste mapa" };

  const maisAntigo = caso.atualizado_em && a.feitoEm <= caso.atualizado_em;
  if (!maisAntigo && !transicaoPermitida(caso.status, a.status)) {
    return { id: a.id, resultado: "recusado", erro: `não dá para ir de "${caso.status}" para "${a.status}"` };
  }
  await cliente.query(
    `INSERT INTO historico_excedente (id, analise_id, usuario_id, feito_em, status_anterior, status_novo, campos, substituido)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [a.id, a.casoId, usuarioId, a.feitoEm, caso.status, a.status, JSON.stringify(a.campos), Boolean(maisAntigo)]
  );
  if (maisAntigo) return { id: a.id, resultado: "substituido" };

  const sets = ["status = $3", "atualizado_em = $4", "atualizado_por = $5"];
  const valores = [a.casoId, mapaId, a.status, a.feitoEm, usuarioId];
  for (const [campo, valor] of Object.entries(a.campos)) {
    valores.push(campo === "poligonoExcedente" && valor !== null ? JSON.stringify(valor) : valor);
    sets.push(`${COLUNAS[campo]} = $${valores.length}`);
  }
  await cliente.query(`UPDATE analises_excedente SET ${sets.join(", ")} WHERE id = $1 AND mapa_id = $2`, valores);
  return { id: a.id, resultado: "aplicado" };
}

excedenteRouter.post("/mapas/:id/excedente/apontamentos", async (req, res) => {
  const mapaId = await prepararMapa(req, res, true);
  if (mapaId === null) return;
  const lista = req.body?.apontamentos;
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > 500) {
    return res.status(400).json({ erro: "apontamentos deve ser uma lista de 1 a 500 itens" });
  }
  const validados = [];
  for (const a of lista) {
    const v = validarApontamento(a);
    if (v.erro) return res.status(400).json({ erro: v.erro });
    validados.push(v.dados);
  }
  const resultados = [];
  for (const a of validados) {
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      resultados.push(await aplicarApontamento(cliente, mapaId, req.usuarioId, a));
      await cliente.query("COMMIT");
    } catch (err) {
      await cliente.query("ROLLBACK");
      throw err;
    } finally {
      cliente.release();
    }
  }
  res.json({ resultados });
});
```

`maisAntigo` com `atualizado_em` nulo (caso nunca apontado) é `null`, ou seja, falso, então aplica. Ignorar a transição quando o apontamento é mais antigo é proposital: ele só vai para o histórico, sem mudar nada.

- [ ] **Step 4: Montar no `app.js`**

Em `backend/src/app.js`, junto dos imports:

```js
import { excedenteRouter } from "./routes/excedente.js";
```

e logo depois de `app.use(planejamentosRouter);`:

```js
// Antes do adminRouter pelo mesmo motivo do voosRouter (ver comentário acima).
app.use(excedenteRouter);
```

- [ ] **Step 5: Rodar e ver passar**

Run: o comando do Step 2. Expected: PASS (10 testes). Em seguida rode a suíte inteira (`npm test` com as mesmas variáveis): todos passando.

- [ ] **Step 6: Commit**

```bash
git add backend/src/routes/excedente.js backend/src/app.js backend/test/excedente-rotas.test.js
git commit -m "Plantio Excedente: rotas de casos e apontamentos"
```

---

### Task 3: Regras puras do frontend e fila offline

**Files:**
- Create: `frontend/src/lib/excedente.js`
- Create: `frontend/src/lib/filaExcedente.js`
- Test: `frontend/src/lib/excedente.test.js`, `frontend/src/lib/filaExcedente.test.js`

**Interfaces:**
- Produces (`excedente.js`):
  - `CORES_EXCEDENTE = {aguardando, precisa_ajuste, sem_ajuste, ajustado}` (hex), `COR_CONTORNO_AJUSTADO = "#14532d"`;
  - `ROTULOS_STATUS` (texto pt-BR por status);
  - `chaveTalhao(secao, talhao) → "secao-talhao"`;
  - `casoVigentePorTalhao(casos) → Map<chave, caso>`, o caso com maior `dataVoo` por talhão;
  - `aplicarPendentes(casos, itensFila) → casos`, que aplica na cópia local os itens `pendente` da fila;
  - `contarPorStatus(casos) → {aguardando, precisa_ajuste, concluidos}`;
  - `botoesDoStatus(status) → [{status, rotulo}]`.
- Produces (`filaExcedente.js`): `criarFilaExcedente({api, store, aoMudar, gerarId})` com:
  - `enfileirar({mapaId, casoId, status, campos}) → item`;
  - `enviarPendentes(token) → {enviados, recusados, restantes}`;
  - `retentar(itemId)`;
  - `descartar(itemId)`.
  - Item: `{id, mapaId, casoId, status, campos, feitoEm, estado: "pendente"|"recusado", erro}`.
  - `api.apontar(token, mapaId, apontamentos) → {resultados}`.
  - `store = {salvar, remover, listar}`.

- [ ] **Step 1: Testes que falham**

`frontend/src/lib/excedente.test.js`:

```js
import { describe, it, expect } from "vitest";
import { casoVigentePorTalhao, aplicarPendentes, contarPorStatus, botoesDoStatus, chaveTalhao } from "./excedente.js";

const caso = (id, extra) => ({ id, secao: "10324", talhao: "3", dataVoo: "2026-05-10", status: "aguardando", ...extra });

describe("casoVigentePorTalhao", () => {
  it("talhão com 2 casos fica com o voo mais recente", () => {
    const m = casoVigentePorTalhao([caso("a", { dataVoo: "2026-05-10" }), caso("b", { dataVoo: "2026-09-01", status: "precisa_ajuste" })]);
    expect(m.get(chaveTalhao("10324", "3")).id).toBe("b");
  });
});

describe("aplicarPendentes", () => {
  it("aplica status e campos da fila só nos itens pendentes, na ordem", () => {
    const fila = [
      { casoId: "a", status: "precisa_ajuste", campos: { observacao: "x" }, estado: "pendente", feitoEm: "2026-10-30T10:00:00Z" },
      { casoId: "a", status: "ajustado", campos: { dataAjuste: "2026-10-30" }, estado: "pendente", feitoEm: "2026-10-30T11:00:00Z" },
      { casoId: "a", status: "aguardando", campos: {}, estado: "recusado", feitoEm: "2026-10-30T12:00:00Z" },
    ];
    const [a] = aplicarPendentes([caso("a")], fila);
    expect(a.status).toBe("ajustado");
    expect(a.observacao).toBe("x");
    expect(a.dataAjuste).toBe("2026-10-30");
    expect(a.pendente).toBe(true);
  });
});

describe("contarPorStatus e botoesDoStatus", () => {
  it("conta concluídos juntando sem_ajuste e ajustado", () => {
    expect(contarPorStatus([caso("a"), caso("b", { status: "sem_ajuste" }), caso("c", { status: "ajustado" }), caso("d", { status: "precisa_ajuste" })]))
      .toEqual({ aguardando: 1, precisa_ajuste: 1, concluidos: 2 });
  });
  it("oferece os botões do fluxo combinado", () => {
    expect(botoesDoStatus("aguardando").map((b) => b.status)).toEqual(["precisa_ajuste", "sem_ajuste"]);
    expect(botoesDoStatus("precisa_ajuste").map((b) => b.status)).toEqual(["ajustado", "aguardando"]);
    expect(botoesDoStatus("ajustado").map((b) => b.status)).toEqual(["aguardando"]);
  });
});
```

`frontend/src/lib/filaExcedente.test.js`:

```js
import { describe, it, expect } from "vitest";
import { criarFilaExcedente } from "./filaExcedente.js";

function storeMemoria() {
  const itens = new Map();
  return {
    itens,
    salvar: async (i) => void itens.set(i.id, i),
    remover: async (id) => void itens.delete(id),
    listar: async () => [...itens.values()],
  };
}
let n = 0;
const gerarId = () => `id-${++n}`;

describe("criarFilaExcedente", () => {
  it("envia os pendentes de um mapa num lote e remove os aplicados e substituídos", async () => {
    const store = storeMemoria();
    const chamadas = [];
    const api = { apontar: async (_t, mapaId, aps) => (chamadas.push({ mapaId, aps }), { resultados: aps.map((a, i) => ({ id: a.id, resultado: i ? "substituido" : "aplicado" })) }) };
    const fila = criarFilaExcedente({ api, store, gerarId });
    await fila.enfileirar({ mapaId: 7, casoId: "c1", status: "sem_ajuste", campos: {} });
    await fila.enfileirar({ mapaId: 7, casoId: "c2", status: "precisa_ajuste", campos: { observacao: "x" } });
    const r = await fila.enviarPendentes("tok");
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].aps.map((a) => a.casoId)).toEqual(["c1", "c2"]);
    expect(r).toEqual({ enviados: 2, recusados: 0, restantes: false });
    expect(store.itens.size).toBe(0);
  });

  it("sem rede: mantém tudo pendente", async () => {
    const store = storeMemoria();
    const api = { apontar: async () => { throw new TypeError("Failed to fetch"); } };
    const fila = criarFilaExcedente({ api, store, gerarId });
    await fila.enfileirar({ mapaId: 7, casoId: "c1", status: "sem_ajuste", campos: {} });
    expect(await fila.enviarPendentes("tok")).toEqual({ enviados: 0, recusados: 0, restantes: true });
    expect([...store.itens.values()][0].estado).toBe("pendente");
  });

  it("recusa por item vira recusado com o motivo; retentar volta a pendente; descartar remove", async () => {
    const store = storeMemoria();
    const api = { apontar: async (_t, _m, aps) => ({ resultados: [{ id: aps[0].id, resultado: "recusado", erro: "não dá" }] }) };
    const fila = criarFilaExcedente({ api, store, gerarId });
    const item = await fila.enfileirar({ mapaId: 7, casoId: "c1", status: "ajustado", campos: {} });
    expect((await fila.enviarPendentes("tok")).recusados).toBe(1);
    expect(store.itens.get(item.id)).toMatchObject({ estado: "recusado", erro: "não dá" });
    await fila.retentar(item.id);
    expect(store.itens.get(item.id).estado).toBe("pendente");
    await fila.descartar(item.id);
    expect(store.itens.size).toBe(0);
  });

  it("perda de permissão (403) recusa o lote inteiro", async () => {
    const store = storeMemoria();
    const erro = Object.assign(new Error("sem permissão"), { status: 403 });
    const api = { apontar: async () => { throw erro; } };
    const fila = criarFilaExcedente({ api, store, gerarId });
    await fila.enfileirar({ mapaId: 7, casoId: "c1", status: "sem_ajuste", campos: {} });
    expect((await fila.enviarPendentes("tok")).recusados).toBe(1);
    expect([...store.itens.values()][0]).toMatchObject({ estado: "recusado", erro: "sem permissão" });
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `cd frontend && npx vitest run --project unit src/lib/excedente.test.js src/lib/filaExcedente.test.js`
Expected: FAIL (módulos inexistentes).

- [ ] **Step 3: Implementar `frontend/src/lib/excedente.js`**

```js
// Plantio Excedente — regras puras da tela (ver
// docs/superpowers/specs/2026-10-30-plantio-excedente-design.md).

export const CORES_EXCEDENTE = {
  aguardando: "#facc15",
  precisa_ajuste: "#dc2626",
  sem_ajuste: "#16a34a",
  ajustado: "#16a34a",
};
// "Ajustado" e "sem ajuste" são o mesmo verde; o ajustado ganha contorno
// escuro grosso (o ✓ no rótulo não existe na fonte offline, só 0-255).
export const COR_CONTORNO_AJUSTADO = "#14532d";

export const ROTULOS_STATUS = {
  aguardando: "Aguardando análise",
  precisa_ajuste: "Precisa de ajuste",
  sem_ajuste: "Sem ajuste",
  ajustado: "Ajuste concluído",
};

export function chaveTalhao(secao, talhao) {
  return `${secao}-${talhao}`;
}

export function casoVigentePorTalhao(casos) {
  const m = new Map();
  for (const c of casos) {
    const k = chaveTalhao(c.secao, c.talhao);
    const atual = m.get(k);
    if (!atual || c.dataVoo > atual.dataVoo) m.set(k, c);
  }
  return m;
}

// Itens da fila do aparelho ainda não enviados valem na tela na hora
// (o servidor confirma depois).
export function aplicarPendentes(casos, itensFila) {
  const pendentes = itensFila
    .filter((i) => i.estado === "pendente")
    .sort((a, b) => a.feitoEm.localeCompare(b.feitoEm));
  if (pendentes.length === 0) return casos;
  const porId = new Map(casos.map((c) => [c.id, { ...c }]));
  for (const i of pendentes) {
    const c = porId.get(i.casoId);
    if (!c) continue;
    Object.assign(c, i.campos, { status: i.status, pendente: true });
  }
  return casos.map((c) => porId.get(c.id));
}

export function contarPorStatus(casos) {
  const r = { aguardando: 0, precisa_ajuste: 0, concluidos: 0 };
  for (const c of casos) {
    if (c.status === "aguardando") r.aguardando++;
    else if (c.status === "precisa_ajuste") r.precisa_ajuste++;
    else r.concluidos++;
  }
  return r;
}

const REABRIR = { status: "aguardando", rotulo: "Reabrir" };
export function botoesDoStatus(status) {
  if (status === "aguardando") {
    return [
      { status: "precisa_ajuste", rotulo: "Precisa de ajuste" },
      { status: "sem_ajuste", rotulo: "Sem ajuste" },
    ];
  }
  if (status === "precisa_ajuste") return [{ status: "ajustado", rotulo: "Ajuste concluído" }, REABRIR];
  return [REABRIR];
}
```

- [ ] **Step 4: Implementar `frontend/src/lib/filaExcedente.js`**

```js
import { ehErroTransitorio } from "./filaApontamentos.js";

// Fila offline dos apontamentos do Plantio Excedente — mesmo espírito de
// filaApontamentos.js (motor puro, dependências injetadas; instância real em
// filaExcedenteApp.js). Um item por apontamento; o envio junta os pendentes
// de cada mapa num POST só. O servidor decide por item: aplicado ou
// substituído saem da fila, recusado fica com o motivo até o usuário tentar
// de novo ou descartar.
export function criarFilaExcedente({ api, store, aoMudar = () => {}, gerarId = () => crypto.randomUUID() }) {
  async function enfileirar({ mapaId, casoId, status, campos }) {
    const item = {
      id: gerarId(),
      mapaId,
      casoId,
      status,
      campos: campos || {},
      feitoEm: new Date().toISOString(),
      estado: "pendente",
      erro: null,
    };
    await store.salvar(item);
    aoMudar({ tipo: "enfileirado", item });
    return item;
  }

  async function enviarPendentes(token) {
    const pendentes = (await store.listar()).filter((i) => i.estado === "pendente");
    const porMapa = new Map();
    for (const i of pendentes) {
      if (!porMapa.has(i.mapaId)) porMapa.set(i.mapaId, []);
      porMapa.get(i.mapaId).push(i);
    }
    let enviados = 0;
    let recusados = 0;
    let restantes = false;
    for (const [mapaId, itens] of porMapa) {
      const ordenados = [...itens].sort((a, b) => a.feitoEm.localeCompare(b.feitoEm));
      let resposta;
      try {
        resposta = await api.apontar(
          token,
          mapaId,
          ordenados.map(({ id, casoId, status, campos, feitoEm }) => ({ id, casoId, status, campos, feitoEm }))
        );
      } catch (erro) {
        if (ehErroTransitorio(erro)) {
          restantes = true;
          break;
        }
        for (const i of ordenados) await store.salvar({ ...i, estado: "recusado", erro: erro.message });
        recusados += ordenados.length;
        continue;
      }
      const porId = new Map((resposta.resultados || []).map((r) => [r.id, r]));
      for (const i of ordenados) {
        const r = porId.get(i.id);
        if (r?.resultado === "recusado") {
          recusados++;
          await store.salvar({ ...i, estado: "recusado", erro: r.erro || "recusado pelo servidor" });
        } else if (r) {
          enviados++;
          await store.remover(i.id);
        }
      }
    }
    if (enviados || recusados) aoMudar({ tipo: "enviado", enviados, recusados });
    return { enviados, recusados, restantes };
  }

  async function retentar(itemId) {
    const item = (await store.listar()).find((i) => i.id === itemId);
    if (!item || item.estado !== "recusado") return;
    await store.salvar({ ...item, estado: "pendente", erro: null });
    aoMudar({ tipo: "retentado", itemId });
  }

  async function descartar(itemId) {
    await store.remover(itemId);
    aoMudar({ tipo: "descartado", itemId });
  }

  return { enfileirar, enviarPendentes, retentar, descartar };
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: o comando do Step 2. Expected: PASS. Depois rode `cd frontend && npm run test:unit`: tudo passando.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/excedente.js frontend/src/lib/excedente.test.js frontend/src/lib/filaExcedente.js frontend/src/lib/filaExcedente.test.js
git commit -m "Plantio Excedente: regras da tela e fila offline"
```

---

### Task 4: IndexedDB, API e instância da fila

**Files:**
- Modify: `frontend/src/lib/db.js` (versão 6 → 7, dois stores novos e as funções)
- Modify: `frontend/src/lib/api.js` (duas funções no fim)
- Create: `frontend/src/lib/filaExcedenteApp.js`

**Interfaces:**
- Produces:
  - `db.js`: `salvarCasosExcedente(mapaId, casos)`, `lerCasosExcedente(mapaId) → casos[] | null`, `salvarItemFilaExcedente(item)`, `removerItemFilaExcedente(id)`, `listarFilaExcedente() → item[]`, `limparFilaExcedente()`.
  - `api.js`: `buscarCasosExcedente(token, mapaId) → {casos, atualizacao}`, `apontarExcedente(token, mapaId, apontamentos) → {resultados}`.
  - `filaExcedenteApp.js`: `filaExcedente` (instância), `assinarFilaExcedente(fn) → cancelar`.

- [ ] **Step 1: `db.js`**

Junto das outras constantes:

```js
const STORE_CASOS_EXCEDENTE = "casos_excedente";
const STORE_FILA_EXCEDENTE = "fila_excedente";
```

Troque `openDB(DB_NAME, 6, {` por `openDB(DB_NAME, 7, {` e, dentro de `upgrade`, antes do bloco `if (versaoAnterior < 6)`:

```js
      if (versaoAnterior < 7) {
        // Plantio Excedente: cópia dos casos por mapa (1 registro por
        // mapaId) e a fila offline de apontamentos (ver lib/filaExcedente.js).
        db.createObjectStore(STORE_CASOS_EXCEDENTE, { keyPath: "mapaId" });
        db.createObjectStore(STORE_FILA_EXCEDENTE, { keyPath: "id" });
      }
```

No fim do arquivo:

```js
export async function salvarCasosExcedente(mapaId, casos) {
  const db = await abrirDb();
  await db.put(STORE_CASOS_EXCEDENTE, { mapaId, casos, salvoEm: new Date().toISOString() });
}

export async function lerCasosExcedente(mapaId) {
  const db = await abrirDb();
  return (await db.get(STORE_CASOS_EXCEDENTE, mapaId))?.casos ?? null;
}

export async function salvarItemFilaExcedente(item) {
  const db = await abrirDb();
  await db.put(STORE_FILA_EXCEDENTE, item);
}

export async function removerItemFilaExcedente(id) {
  const db = await abrirDb();
  await db.delete(STORE_FILA_EXCEDENTE, id);
}

export async function listarFilaExcedente() {
  const db = await abrirDb();
  return db.getAll(STORE_FILA_EXCEDENTE);
}

export async function limparFilaExcedente() {
  const db = await abrirDb();
  await db.clear(STORE_FILA_EXCEDENTE);
}
```

Confira se há uma função que limpa os dados locais no logout (`grep -n "clear(" frontend/src/lib/db.js`). Se houver, inclua lá os dois stores novos, como os de pins e apontamentos.

- [ ] **Step 2: `api.js`, no fim**

```js
// Plantio Excedente (ver backend/src/routes/excedente.js).
export async function buscarCasosExcedente(token, mapaId) {
  const resp = await fetch(`${API_URL}/mapas/${mapaId}/excedente`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function apontarExcedente(token, mapaId, apontamentos) {
  const resp = await fetch(`${API_URL}/mapas/${mapaId}/excedente/apontamentos`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ apontamentos }),
  });
  await tratarResposta(resp);
  return resp.json();
}
```

- [ ] **Step 3: `filaExcedenteApp.js`**

Leia `frontend/src/lib/filaApontamentosApp.js` e siga o mesmo padrão de assinatura. O conteúdo esperado é:

```js
import { criarFilaExcedente } from "./filaExcedente.js";
import { apontarExcedente } from "./api.js";
import { salvarItemFilaExcedente, removerItemFilaExcedente, listarFilaExcedente } from "./db.js";

// Instância real da fila do Plantio Excedente (motor em filaExcedente.js).
const ouvintes = new Set();

export function assinarFilaExcedente(fn) {
  ouvintes.add(fn);
  return () => ouvintes.delete(fn);
}

export const filaExcedente = criarFilaExcedente({
  api: { apontar: apontarExcedente },
  store: { salvar: salvarItemFilaExcedente, remover: removerItemFilaExcedente, listar: listarFilaExcedente },
  aoMudar: (evento) => ouvintes.forEach((fn) => fn(evento)),
});
```

- [ ] **Step 4: Build e commit**

Run: `cd frontend && npm run build`
Expected: build sem erro.

```bash
git add frontend/src/lib/db.js frontend/src/lib/api.js frontend/src/lib/filaExcedenteApp.js
git commit -m "Plantio Excedente: cópia local, API e fila do aparelho"
```

---

### Task 5: Hook `useExcedente` (dados, camadas do mapa, envio)

**Files:**
- Create: `frontend/src/hooks/useExcedente.js`

**Interfaces:**
- Consumes: Tasks 3 e 4. `excedenteInfo` é o `info` de `camadasCarregadasRef` com `tipoCamada === "excedente"`, com os campos `sourceId`, `sourceLayerPrincipal`, `fillLayerId` e `lineLayerId` (ver `pages/Mapa.jsx:853-870`).
- Produces: `useExcedente(mapRef, mapaPronto, excedenteInfo, mapaId, token)`, que devolve:
  - `casos`: já com os pendentes da fila aplicados;
  - `casoPorChave`: `Map<chave, caso>`, o caso vigente de cada talhão;
  - `contagem`: `{aguardando, precisa_ajuste, concluidos}`;
  - `filtroStatus` e `setFiltroStatus`. O filtro é `null` (todos) ou um `Set` com algum de `"aguardando"`, `"precisa_ajuste"` e `"concluidos"`;
  - `carregando`: só no 1º acesso, sem cópia;
  - `atualizando`;
  - `avisoAtualizacao`: `null` ou um texto;
  - `itensFila`: todos os itens da fila deste mapa;
  - `apontar({casoId, status, campos}) → Promise<void>`;
  - `retentar(id)` e `descartar(id)`;
  - `selecionado` e `setSelecionado`, com o caso cujo cartão está aberto.

- [ ] **Step 1: Implementar**

```js
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { buscarCasosExcedente } from "../lib/api.js";
import { lerCasosExcedente, salvarCasosExcedente, listarFilaExcedente } from "../lib/db.js";
import { filaExcedente, assinarFilaExcedente } from "../lib/filaExcedenteApp.js";
import {
  CORES_EXCEDENTE, COR_CONTORNO_AJUSTADO, casoVigentePorTalhao, aplicarPendentes, contarPorStatus, chaveTalhao,
} from "../lib/excedente.js";

// Plantio Excedente (ver docs/superpowers/specs/2026-10-30-plantio-excedente-design.md)
// — mesmo espírito de useApontamentoVoo: a camada Talhões marcada com
// tipoCamada "excedente" é pintada por status; os trechos desenhados ficam
// numa fonte GeoJSON própria. Cópia no aparelho primeiro, servidor em
// segundo plano; apontamento vai sempre pela fila (envia na hora se houver
// sinal).
const FONTE_TRECHOS = "excedente-trechos";
const CAMADA_TRECHOS_FILL = "excedente-trechos-preenchimento";
const CAMADA_TRECHOS_LINHA = "excedente-trechos-contorno";
const CAMADA_AJUSTADO = "excedente-contorno-ajustado";
const INTERVALO_REENVIO_MS = 3 * 60 * 1000;
const chaveExpr = ["concat", ["get", "SECAO"], "-", ["get", "TALHAO"]];

function grupoDoStatus(status) {
  return status === "sem_ajuste" || status === "ajustado" ? "concluidos" : status;
}

export function useExcedente(mapRef, mapaPronto, excedenteInfo, mapaId, token) {
  const [casosServidor, setCasosServidor] = useState(null); // null = nada ainda
  const [itensFila, setItensFila] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const [avisoAtualizacao, setAvisoAtualizacao] = useState(null);
  const [selecionado, setSelecionado] = useState(null);
  const [versaoBusca, setVersaoBusca] = useState(0);
  const ativo = Boolean(excedenteInfo);
  const mapaIdNum = Number(mapaId);

  const recarregarFila = useCallback(async () => {
    const todos = await listarFilaExcedente();
    setItensFila(todos.filter((i) => i.mapaId === mapaIdNum));
  }, [mapaIdNum]);

  // Cópia do aparelho na hora; servidor depois.
  useEffect(() => {
    if (!ativo) return undefined;
    let cancelado = false;
    (async () => {
      const copia = await lerCasosExcedente(mapaIdNum);
      if (!cancelado && copia && casosServidor === null) setCasosServidor(copia);
      await recarregarFila();
      if (!navigator.onLine) {
        setAvisoAtualizacao("Sem conexão — mostrando a última cópia do aparelho.");
        return;
      }
      setAtualizando(true);
      try {
        const { casos, atualizacao } = await buscarCasosExcedente(token, mapaIdNum);
        if (cancelado) return;
        setCasosServidor(casos);
        await salvarCasosExcedente(mapaIdNum, casos);
        setAvisoAtualizacao(atualizacao === "falhou" ? "Não foi possível buscar voos novos agora." : null);
      } catch {
        if (!cancelado) setAvisoAtualizacao("Não foi possível atualizar agora — mostrando a última cópia do aparelho.");
      } finally {
        if (!cancelado) setAtualizando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
    // casosServidor fora das dependências de propósito: só a 1ª leitura usa a cópia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, mapaIdNum, token, versaoBusca, recarregarFila]);

  const enviarFila = useCallback(async () => {
    if (!navigator.onLine) return;
    const r = await filaExcedente.enviarPendentes(token);
    if (r.enviados > 0) setVersaoBusca((v) => v + 1);
  }, [token]);

  // Envio ao reconectar, a cada 3 min enquanto houver fila, e quando a fila muda.
  useEffect(() => {
    if (!ativo) return undefined;
    const cancelarAssinatura = assinarFilaExcedente(() => recarregarFila());
    const aoVoltar = () => enviarFila();
    window.addEventListener("online", aoVoltar);
    const intervalo = setInterval(() => enviarFila(), INTERVALO_REENVIO_MS);
    enviarFila();
    return () => {
      cancelarAssinatura();
      window.removeEventListener("online", aoVoltar);
      clearInterval(intervalo);
    };
  }, [ativo, enviarFila, recarregarFila]);

  const casos = useMemo(() => aplicarPendentes(casosServidor || [], itensFila), [casosServidor, itensFila]);
  const casoPorChave = useMemo(() => casoVigentePorTalhao(casos), [casos]);
  const contagem = useMemo(() => contarPorStatus([...casoPorChave.values()]), [casoPorChave]);

  // Pinta a camada Talhões por status + contorno do ajustado + trechos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto || !excedenteInfo) return;
    const ramosCor = [];
    const chavesAjustado = [];
    const porCor = new Map();
    for (const [k, c] of casoPorChave) {
      if (filtroStatus && !filtroStatus.has(grupoDoStatus(c.status))) continue;
      const cor = CORES_EXCEDENTE[c.status];
      if (!porCor.has(cor)) porCor.set(cor, []);
      porCor.get(cor).push(k);
      if (c.status === "ajustado") chavesAjustado.push(k);
    }
    for (const [cor, chaves] of porCor) ramosCor.push(chaves, cor);
    const transparente = "rgba(0,0,0,0)";
    if (excedenteInfo.fillLayerId && map.getLayer(excedenteInfo.fillLayerId)) {
      map.setPaintProperty(excedenteInfo.fillLayerId, "fill-color", ramosCor.length ? ["match", chaveExpr, ...ramosCor, transparente] : transparente);
      map.setPaintProperty(excedenteInfo.fillLayerId, "fill-opacity", 0.55);
    }

    if (!map.getLayer(CAMADA_AJUSTADO)) {
      map.addLayer({
        id: CAMADA_AJUSTADO,
        type: "line",
        source: excedenteInfo.sourceId,
        "source-layer": excedenteInfo.sourceLayerPrincipal,
        paint: { "line-color": COR_CONTORNO_AJUSTADO, "line-width": 3 },
      });
    }
    map.setFilter(CAMADA_AJUSTADO, chavesAjustado.length ? ["match", chaveExpr, chavesAjustado, true, false] : ["==", 1, 0]);

    const features = [];
    for (const c of casoPorChave.values()) {
      if (!c.poligonoExcedente) continue;
      if (filtroStatus && !filtroStatus.has(grupoDoStatus(c.status))) continue;
      features.push({ type: "Feature", properties: { casoId: c.id, aberto: c.status === "precisa_ajuste" }, geometry: c.poligonoExcedente });
    }
    const dados = { type: "FeatureCollection", features };
    if (map.getSource(FONTE_TRECHOS)) {
      map.getSource(FONTE_TRECHOS).setData(dados);
    } else {
      map.addSource(FONTE_TRECHOS, { type: "geojson", data: dados });
      map.addLayer({
        id: CAMADA_TRECHOS_FILL,
        type: "fill",
        source: FONTE_TRECHOS,
        filter: ["==", ["get", "aberto"], true],
        paint: { "fill-color": CORES_EXCEDENTE.precisa_ajuste, "fill-opacity": 0.35 },
      });
      map.addLayer({
        id: CAMADA_TRECHOS_LINHA,
        type: "line",
        source: FONTE_TRECHOS,
        paint: { "line-color": CORES_EXCEDENTE.precisa_ajuste, "line-width": 2, "line-dasharray": [2, 1.5] },
      });
    }
  }, [mapRef, mapaPronto, excedenteInfo, casoPorChave, filtroStatus]);

  // Mapa remontou a camada (estilo mudou): as camadas próprias somem junto da fonte.
  useEffect(() => {
    const map = mapRef.current;
    return () => {
      if (!map || !map.getStyle()) return;
      for (const id of [CAMADA_TRECHOS_FILL, CAMADA_TRECHOS_LINHA, CAMADA_AJUSTADO]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(FONTE_TRECHOS)) map.removeSource(FONTE_TRECHOS);
    };
  }, [mapRef, excedenteInfo?.sourceId]);

  async function apontar({ casoId, status, campos }) {
    await filaExcedente.enfileirar({ mapaId: mapaIdNum, casoId, status, campos });
    await recarregarFila();
    enviarFila();
  }

  return {
    casos,
    casoPorChave,
    contagem,
    filtroStatus,
    setFiltroStatus,
    carregando: ativo && casosServidor === null && atualizando,
    atualizando,
    avisoAtualizacao,
    itensFila,
    apontar,
    retentar: filaExcedente.retentar,
    descartar: filaExcedente.descartar,
    selecionado,
    setSelecionado,
    chaveTalhao,
  };
}
```

Pontos a conferir contra o código real antes de seguir:
- `getLayer` em camada que não existe: `useApontamentoVoo.js` usa `getLayerSeguro`. Se for exportado, use-o.
- A camada de contorno do ajustado precisa ficar abaixo dos rótulos. Passe como `beforeId` o primeiro id terminado em `-rotulo` em `map.getStyle().layers`, a mesma regra de `primeiroRotuloExistente` em `Mapa.jsx`. Importe essa função se ela estiver exportada; senão, repita o laço de 3 linhas.
- `selecionado` guarda o **id** do caso, e o cartão lê o caso atualizado de `casos`. Se guardasse o objeto, o cartão ficaria parado depois de apontar.

- [ ] **Step 2: Build e commit**

Run: `cd frontend && npm run build`. Expected: sem erro.

```bash
git add frontend/src/hooks/useExcedente.js
git commit -m "Plantio Excedente: hook de casos, pintura do mapa e envio da fila"
```

---

### Task 6: Tela (painel, cartão, ligação no mapa e no admin)

**Files:**
- Create: `frontend/src/components/PainelExcedente.jsx`
- Create: `frontend/src/components/CartaoExcedente.jsx`
- Modify: `frontend/src/pages/Mapa.jsx`
- Modify: `frontend/src/pages/AdminCamadas.jsx` (opção de tipo de camada)
- Modify: `frontend/src/lib/estiloCamada.js` (aceitar `"excedente"` em `tipoCamada`)
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `useExcedente` (Task 5); `botoesDoStatus`, `ROTULOS_STATUS`, `CORES_EXCEDENTE` (Task 3); o componente de data Hoje / Ontem / Outro dia de `components/BarraApontamento.jsx`.
- Produces:
  - `<PainelExcedente excedente={...} />`;
  - `<CartaoExcedente caso podeEditar aoApontar aoDesenhar aoFechar trechoDesenhado />`.

- [ ] **Step 1: Tipo de camada no admin**

Em `frontend/src/lib/estiloCamada.js` (linhas 149 e 179), `tipoCamada: bruto?.tipoCamada || "padrao"` já passa qualquer texto adiante. Confira só se nada mais restringe a `"voos"`.

Em `AdminCamadas.jsx:1150`, ao lado do checkbox "Apontamento de voo", acrescente um segundo checkbox, no mesmo formato:

```jsx
<label className="adm-checkbox">
  <input
    type="checkbox"
    checked={estiloForm.tipoCamada === "excedente"}
    onChange={(e) => atualizarEstiloFormCampo("tipoCamada", e.target.checked ? "excedente" : "padrao")}
  />
  Plantio excedente (pinta os talhões pela análise)
</label>
```

Na linha 1040, ao lado da etiqueta de voos:

```jsx
{estiloForm?.tipoCamada === "excedente" && <span className="adm-etiqueta">Plantio excedente</span>}
```

- [ ] **Step 2: `CartaoExcedente.jsx`**

Leia antes `components/CartaoPlanejamento.jsx` (estrutura do cartão `.painel-flutuante .painel-atributos`) e `components/BarraApontamento.jsx`. Do segundo, copie a lógica da data **local** Hoje / Ontem / Outro dia: um helper que monta `AAAA-MM-DD` com `getFullYear/getMonth/getDate`, nunca `toISOString`. Se esse helper já estiver exportado em algum `lib/`, importe-o. O conteúdo:

```jsx
import { useState } from "react";
import { botoesDoStatus, ROTULOS_STATUS, CORES_EXCEDENTE } from "../lib/excedente.js";

function diaLocal(deslocamentoDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deslocamentoDias);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}
const formatarDia = (dia) => (dia ? dia.split("-").reverse().join("/") : "");

// Cartão do talhão no mapa de Plantio Excedente. `trechoDesenhado` chega do
// Mapa.jsx depois que o usuário desenha o trecho pela medição de área.
export default function CartaoExcedente({ caso, podeEditar, aoApontar, aoDesenhar, aoFechar, trechoDesenhado }) {
  const [acao, setAcao] = useState(null); // status escolhido aguardando os campos
  const [area, setArea] = useState(caso.areaExcedenteHa ?? "");
  const [observacao, setObservacao] = useState("");
  const [dataAjuste, setDataAjuste] = useState(diaLocal(0));
  const [outroDia, setOutroDia] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function confirmar(status) {
    const campos = {};
    if (status === "precisa_ajuste") {
      campos.areaExcedenteHa = area === "" ? null : Number(area);
      if (trechoDesenhado) campos.poligonoExcedente = trechoDesenhado;
    }
    if (status === "ajustado") campos.dataAjuste = dataAjuste;
    if (observacao.trim()) campos.observacao = observacao.trim();
    setEnviando(true);
    try {
      await aoApontar({ casoId: caso.id, status, campos });
      setAcao(null);
      setObservacao("");
    } finally {
      setEnviando(false);
    }
  }

  function escolher(status) {
    if (status === "precisa_ajuste" || status === "ajustado") setAcao(status);
    else confirmar(status);
  }

  return (
    <aside className="painel-flutuante painel-atributos aberto cartao-excedente" aria-label="Análise de plantio excedente">
      <header className="cabecalho-atributos">
        <div>
          <h2>Talhão {caso.talhao}</h2>
          <p className="subtitulo">{caso.fazenda} · cód. {caso.secao}{caso.fornecedor ? " · fornecedor" : ""}</p>
        </div>
        <button type="button" className="fechar" aria-label="Fechar" onClick={aoFechar}>×</button>
      </header>
      <p className="selo-status-excedente" style={{ "--cor-status": CORES_EXCEDENTE[caso.status] }}>
        {ROTULOS_STATUS[caso.status]}{caso.pendente ? " · aguardando envio" : ""}
      </p>
      <p>Voo de Falhas Plantio em {formatarDia(caso.dataVoo)}</p>
      {caso.vooCancelado && <p className="aviso">Voo cancelado no DroneManagement.</p>}
      {caso.areaExcedenteHa != null && <p>Área excedente estimada: {caso.areaExcedenteHa} ha</p>}
      {caso.observacao && <p>{caso.observacao}</p>}
      {caso.dataAjuste && <p>Ajuste feito em {formatarDia(caso.dataAjuste)}</p>}

      {podeEditar && !acao && (
        <div className="acoes-excedente">
          {botoesDoStatus(caso.status).map((b) => (
            <button key={b.status} type="button" disabled={enviando} onClick={() => escolher(b.status)}>
              {b.rotulo}
            </button>
          ))}
        </div>
      )}

      {podeEditar && acao === "precisa_ajuste" && (
        <form className="form-excedente" onSubmit={(e) => { e.preventDefault(); confirmar("precisa_ajuste"); }}>
          <label>
            Área excedente estimada (ha)
            <input type="number" min="0" step="0.01" value={area} onChange={(e) => setArea(e.target.value)} />
          </label>
          <label>
            Observação
            <textarea value={observacao} maxLength={2000} onChange={(e) => setObservacao(e.target.value)} />
          </label>
          <button type="button" onClick={aoDesenhar}>{trechoDesenhado ? "Desenhar de novo" : "Desenhar trecho"}</button>
          {trechoDesenhado && <p>Trecho desenhado.</p>}
          <div className="acoes-excedente">
            <button type="submit" disabled={enviando}>Confirmar</button>
            <button type="button" onClick={() => setAcao(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {podeEditar && acao === "ajustado" && (
        <form className="form-excedente" onSubmit={(e) => { e.preventDefault(); confirmar("ajustado"); }}>
          <fieldset>
            <legend>Data do ajuste</legend>
            <button type="button" onClick={() => { setOutroDia(false); setDataAjuste(diaLocal(0)); }}>Hoje</button>
            <button type="button" onClick={() => { setOutroDia(false); setDataAjuste(diaLocal(-1)); }}>Ontem</button>
            <button type="button" onClick={() => setOutroDia(true)}>Outro dia</button>
            {outroDia && <input type="date" value={dataAjuste} max={diaLocal(0)} onChange={(e) => setDataAjuste(e.target.value)} />}
            <p>{formatarDia(dataAjuste)}</p>
          </fieldset>
          <label>
            Observação
            <textarea value={observacao} maxLength={2000} onChange={(e) => setObservacao(e.target.value)} />
          </label>
          <div className="acoes-excedente">
            <button type="submit" disabled={enviando}>Confirmar</button>
            <button type="button" onClick={() => setAcao(null)}>Cancelar</button>
          </div>
        </form>
      )}

      {caso.historico?.length > 0 && (
        <ol className="historico-excedente">
          {caso.historico.filter((h) => !h.substituido).map((h) => (
            <li key={h.id}>{ROTULOS_STATUS[h.statusNovo]} por {h.usuarioNome || "?"}, {formatarDia(h.feitoEm.slice(0, 10))}</li>
          ))}
        </ol>
      )}
    </aside>
  );
}
```

Se `BarraApontamento.jsx` já usa um componente de data próprio, use-o no lugar do `fieldset`. Para os botões, siga a regra de `docs/movimento-esperas.md`: `useOcupado` (`propsBotao` + `conteudo`) e `await fim(true)` antes de fechar o formulário. Assim o ✓ aparece antes de a tela mudar.

- [ ] **Step 3: `PainelExcedente.jsx`**

Leia antes `components/PainelVoos.jsx` e siga o mesmo esqueleto: título, contadores, chips e a fila do aparelho com "Tentar de novo" e "Descartar".

```jsx
import { CORES_EXCEDENTE, ROTULOS_STATUS } from "../lib/excedente.js";

const GRUPOS = [
  { chave: "aguardando", rotulo: "Aguardando", cor: CORES_EXCEDENTE.aguardando },
  { chave: "precisa_ajuste", rotulo: "Precisam ajuste", cor: CORES_EXCEDENTE.precisa_ajuste },
  { chave: "concluidos", rotulo: "Concluídos", cor: CORES_EXCEDENTE.sem_ajuste },
];

export default function PainelExcedente({ excedente }) {
  const { contagem, filtroStatus, setFiltroStatus, itensFila, retentar, descartar, avisoAtualizacao, atualizando, carregando } = excedente;
  const pendentes = itensFila.filter((i) => i.estado === "pendente");
  const recusados = itensFila.filter((i) => i.estado === "recusado");

  function alternar(chave) {
    const atual = filtroStatus ? new Set(filtroStatus) : new Set(GRUPOS.map((g) => g.chave));
    if (atual.has(chave)) atual.delete(chave);
    else atual.add(chave);
    setFiltroStatus(atual.size === GRUPOS.length ? null : atual);
  }

  return (
    <section className="painel-excedente" aria-label="Plantio excedente">
      {carregando && <p>Carregando análises…</p>}
      <div className="chips-excedente">
        {GRUPOS.map((g) => (
          <button
            key={g.chave}
            type="button"
            className={`chip-excedente${!filtroStatus || filtroStatus.has(g.chave) ? " ativo" : ""}`}
            style={{ "--cor-status": g.cor }}
            aria-pressed={!filtroStatus || filtroStatus.has(g.chave)}
            onClick={() => alternar(g.chave)}
          >
            {g.rotulo} <strong>{contagem[g.chave]}</strong>
          </button>
        ))}
      </div>
      {atualizando && !carregando && <p className="aviso-discreto">Atualizando com o DroneManagement…</p>}
      {avisoAtualizacao && <p className="aviso-discreto">{avisoAtualizacao}</p>}
      {pendentes.length > 0 && <p>{pendentes.length === 1 ? "1 apontamento aguardando envio" : `${pendentes.length} apontamentos aguardando envio`}</p>}
      {recusados.map((i) => (
        <div key={i.id} className="item-recusado">
          <p>{ROTULOS_STATUS[i.status]} recusado: {i.erro}</p>
          <button type="button" onClick={() => retentar(i.id)}>Tentar de novo</button>
          <button type="button" onClick={() => descartar(i.id)}>Descartar</button>
        </div>
      ))}
    </section>
  );
}
```

- [ ] **Step 4: Ligar no `Mapa.jsx`**

Siga o caminho do `voosInfo`/`PainelVoos` (procure com `grep -n "voosInfo\|PainelVoos\|apontamento\.\|planejamentos.abrirRascunho" frontend/src/pages/Mapa.jsx`):

1. Logo depois do `useMemo` de `voosInfo` (linha ~1061):

```js
  const excedenteInfo = useMemo(
    () => [...camadasCarregadasRef.current.values()].find((info) => info.tipoCamada === "excedente") || null,
    [versaoCamadas]
  );
  const excedente = useExcedente(mapRef, mapaPronto, excedenteInfo, mapaId, sessao.token);
  const [trechoExcedente, setTrechoExcedente] = useState(null); // GeoJSON Polygon do desenho em andamento
  const casoExcedenteAberto = excedente.casos.find((c) => c.id === excedente.selecionado) || null;
```

2. **Clique**: no handler de clique do mapa, antes da lógica de atributos e depois das saídas antecipadas de rascunho de pin e de planejamento (linhas ~1643-1647), entra este bloco quando `excedenteInfo` existe e a medição não está ativa. Ele roda `queryRenderedFeatures(e.point, { layers: [excedenteInfo.fillLayerId] })`. Se a feição tiver um caso em `excedente.casoPorChave` (pela chave `SECAO-TALHAO` das propriedades), chama `excedente.setSelecionado(caso.id)`, `setTrechoExcedente(null)` e fecha os outros cartões, como o clique nos voos já faz. Talhão sem caso segue o caminho normal de atributos.
3. **Barra de ferramentas (desktop)**: item "Excedente", com o mesmo padrão do item "Voos", visível só quando `excedenteInfo` existe. Abre um painel lateral com `<PainelExcedente excedente={excedente} />`.
4. **Gaveta (celular)**: com `excedenteInfo`, a 1ª aba é "Excedente", com o mesmo `PainelExcedente`, no mesmo esquema da aba Voos. Recolhida, mostra o resumo: "N aguardando · N precisam ajuste".
5. **Cartão**: renderizar junto de `CartaoPlanejamento`:

```jsx
{casoExcedenteAberto && (
  <CartaoExcedente
    key={casoExcedenteAberto.id}
    caso={casoExcedenteAberto}
    podeEditar={podeEditar}
    trechoDesenhado={trechoExcedente}
    aoApontar={excedente.apontar}
    aoDesenhar={() => {
      medicao.setMedindo(true);
      medicao.setModoMedicao("area");
    }}
    aoFechar={() => {
      excedente.setSelecionado(null);
      setTrechoExcedente(null);
    }}
  />
)}
```

Confira em `useMedicao.js:406` os nomes reais do setter de modo (`setModoMedicao` ou outro) e se ativar a medição limpa os pontos. O cartão continua aberto durante o desenho. Inclua `casoExcedenteAberto` na mesma lista de condições que esconde a gaveta no celular (`mostrarGaveta`, linha ~2454) e que bloqueia o clique de atributos.

6. **Trazer o desenho de volta**: em `<BarraAcaoMedicao>` (linha ~2933), acrescente uma prop `aoSalvarTrecho`, no mesmo formato de `aoSalvarPlanejamento`:

```jsx
aoSalvarTrecho={
  casoExcedenteAberto
    ? () => {
        const p = medicao.pontosMedicao;
        setTrechoExcedente({ type: "Polygon", coordinates: [[...p, p[0]]] });
        medicao.setMedindo(false);
      }
    : undefined
}
```

Em `BarraAcaoMedicao.jsx`, ao lado do botão "Salvar como planejamento" (linha 119), acrescente:

```jsx
{aoSalvarTrecho && modoMedicao === "area" && pontosMedicao.length >= 3 && (
  <button type="button" className="botao-acao-primario" onClick={() => aoSalvarTrecho()}>
    Usar como trecho excedente
  </button>
)}
```

e receba `aoSalvarTrecho` na assinatura do componente.

7. **Sair da conta com fila pendente**: onde o logout já confirma por causa da fila de voos e dos pins (`grep -n "confirm(" frontend/src/components/MenuLateral.jsx frontend/src/pages/*.jsx`), some também os itens de `listarFilaExcedente()` com `estado === "pendente"` na mesma mensagem e chame `limparFilaExcedente()` ao confirmar.

- [ ] **Step 5: CSS**

No fim de `frontend/src/index.css`, usando os tokens que já existem (`--cartao-*`, `--accent`):

```css
/* Plantio Excedente */
.selo-status-excedente { display: inline-flex; align-items: center; gap: 6px; font-weight: 600; }
.selo-status-excedente::before { content: ""; width: 10px; height: 10px; border-radius: 50%; background: var(--cor-status); }
.acoes-excedente { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0; }
.form-excedente { display: grid; gap: 10px; margin: 12px 0; }
.form-excedente label { display: grid; gap: 4px; }
.historico-excedente { margin: 12px 0 0; padding-left: 18px; font-size: 0.85rem; color: var(--cartao-texto-secundario, inherit); }
.chips-excedente { display: flex; flex-wrap: wrap; gap: 6px; }
.chip-excedente { border: 2px solid var(--cor-status); background: transparent; color: inherit; opacity: 0.55; }
.chip-excedente.ativo { opacity: 1; }
.aviso-discreto { font-size: 0.85rem; opacity: 0.8; }
```

Ajuste os nomes de token ao que existe em `:root` (`grep -n "^\s*--cartao" frontend/src/index.css`).

- [ ] **Step 6: Build, testes e commit**

Run: `cd frontend && npm run build && npm run test:unit`. Expected: sem erro, tudo passando.

```bash
git add frontend/src/components/PainelExcedente.jsx frontend/src/components/CartaoExcedente.jsx frontend/src/components/BarraAcaoMedicao.jsx frontend/src/pages/Mapa.jsx frontend/src/pages/AdminCamadas.jsx frontend/src/lib/estiloCamada.js frontend/src/index.css
git commit -m "Plantio Excedente: painel, cartão e ligação no mapa"
```

---

### Task 7: Verificação ponta a ponta e registro

**Files:**
- Modify: `CLAUDE.md` (entrada "Plantio Excedente", no fim de "Estado atual")
- Modify: `docs/superpowers/specs/2026-10-30-plantio-excedente-design.md` (os 4 ajustes do topo deste plano)

- [ ] **Step 1: Preparar o ambiente local** seguindo a skill `verify`:
  - Postgres local;
  - backend na porta 3099, porque a 3000 está ocupada por outro projeto;
  - frontend dev na 5173 com `VITE_API_URL=http://localhost:3099`.

  Crie um mapa local com uma camada Talhões que aponte para o arquivo atual do R2 (só leitura), como nas verificações anteriores, e marque `tipoCamada: "excedente"`. Crie 3 usuários: editor (grupo com `pode_editar`), leitor e admin.

- [ ] **Step 2: Playwright**. Os casos entram por um script de preparo, que insere direto em `analises_excedente` 3 talhões reais da camada (SECAO e TALHAO lidos do `.pmtiles`). O backend roda com as `DRONEMGMT_*` vazias e `DM_VIA_PONTE` desligada: a sincronização falha e a tela mostra o aviso. Nunca toque o DroneManagement real. Confira:
  1. os 3 talhões aparecem amarelos e o painel mostra "Aguardando 3";
  2. aparece o aviso "Não foi possível buscar voos novos agora.";
  3. o editor clica num talhão, escolhe "Precisa de ajuste", preenche a área, desenha o trecho e confirma; o talhão fica vermelho e o trecho aparece;
  4. o editor marca outro talhão como "Sem ajuste" e ele fica verde;
  5. com `context.setOffline(true)`, o editor conclui o vermelho, o painel mostra "1 apontamento aguardando envio" e o talhão fica verde com contorno escuro;
  6. com `setOffline(false)`, a fila esvazia e o banco mostra `ajustado` com `data_ajuste` correta;
  7. o leitor vê as mesmas cores, sem botões no cartão;
  8. com `setOffline(true)`, o leitor recarrega e continua vendo as cores (cópia local; no dev a recarga offline não carrega o app, então teste só bloqueando o backend com `page.route`);
  9. no celular (390×844), a gaveta tem a aba "Excedente" e o cartão não fica atrás dos controles;
  10. o console fica sem erros, fora os 404/CORS já conhecidos do ambiente local.

- [ ] **Step 3: Limpar** o banco local (mapa, camada, usuários, casos) e desligar servidores e Postgres. Rode `cd backend && npm test` (com as variáveis locais) e `cd frontend && npm run test:unit` uma última vez.

- [ ] **Step 4: Registrar e commitar**

Acrescente a entrada em `CLAUDE.md`, no estilo das anteriores. Ela deve cobrir:
- o que entrou;
- os 4 ajustes ao spec;
- **antes de publicar**: aplicar a migration 021 em produção, criar o mapa "Plantio Excedente" com Talhões e Limites, marcar a camada Talhões dele como "Plantio excedente" e dar `pode_editar` ao grupo dos analistas e gestores.

```bash
git add CLAUDE.md docs/superpowers/specs/2026-10-30-plantio-excedente-design.md
git commit -m "Plantio Excedente: verificação e registro"
```
