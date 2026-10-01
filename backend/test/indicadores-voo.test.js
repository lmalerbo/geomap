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

test("lerPeriodo recusa ano antes de 2000 e período maior que 5 anos (digitação parcial do ano)", () => {
  assert.ok(lerPeriodo({ de: "0002-04-01", ate: "2026-05-31" }, "2026-10-01").erro);
  assert.ok(lerPeriodo({ de: "2020-01-01", ate: "2026-01-02" }, "2026-10-01").erro);
  assert.deepEqual(lerPeriodo({ de: "2021-04-01", ate: "2026-03-31" }, "2026-10-01"), { de: "2021-04-01", ate: "2026-03-31" });
});

test("registro com data de voo inválida é descartado sem derrubar o cálculo", () => {
  const r = calcularIndicadores({
    ...base,
    realizados: [voo(undefined, { areaHa: 5 }), voo("não é data", { areaHa: 5 }), voo("2026-05-04T15:00:00Z", { areaHa: 7 })],
    pendentes: [],
  });
  assert.equal(r.resumo.realizadoHa, 7);
  assert.equal(r.resumo.realizadoTalhoes, 1);
});
