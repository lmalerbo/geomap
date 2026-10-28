import { test } from "node:test";
import assert from "node:assert/strict";
import { motivoParaNaoApontar, CONTROL_STATUS_A_VOAR } from "../src/lib/regrasApontamento.js";

test("registro ainda pendente (A voar) pode ser apontado", () => {
  assert.equal(motivoParaNaoApontar({ controlStatus: CONTROL_STATUS_A_VOAR }), null);
});

test("registro que já saiu de 'A voar' não é apontado de novo", () => {
  // 4 = "Voado, processar imagens" — o que o próprio apontamento grava.
  const motivo = motivoParaNaoApontar({ controlStatus: 4 });
  assert.match(motivo, /não estava mais pendente/);
});

test("registro sem status (resposta inesperada) também é recusado", () => {
  assert.ok(motivoParaNaoApontar({}));
  assert.ok(motivoParaNaoApontar(null));
});

import { estagioValidoParaFalhasSoca, ESTAGIO } from "../src/lib/regrasApontamento.js";

test("Falhas Soca safra 2026: inverno, ano, 18 meses (e formação) e 02º corte", () => {
  for (const e of [ESTAGIO.INVERNO, ESTAGIO.ANO, ESTAGIO.DEZOITO_MESES, ESTAGIO.DEZOITO_MESES_FORMACAO, ESTAGIO.CORTE_02]) {
    assert.equal(estagioValidoParaFalhasSoca({ harvest: 2026, internship: e }), true, `estágio ${e}`);
  }
  assert.equal(estagioValidoParaFalhasSoca({ harvest: 2026, internship: ESTAGIO.CORTE_03 }), false, "03º corte não vale em 2026");
  assert.equal(estagioValidoParaFalhasSoca({ harvest: 2026, internship: 4 }), false);
});

test("Falhas Soca safra 2027: só 02º e 03º corte", () => {
  assert.equal(estagioValidoParaFalhasSoca({ harvest: 2027, internship: ESTAGIO.CORTE_02 }), true);
  assert.equal(estagioValidoParaFalhasSoca({ harvest: 2027, internship: ESTAGIO.CORTE_03 }), true);
  assert.equal(estagioValidoParaFalhasSoca({ harvest: 2027, internship: ESTAGIO.INVERNO }), false);
});

test("Falhas Soca de outra safra ou sem dado de estágio não conta", () => {
  assert.equal(estagioValidoParaFalhasSoca({ harvest: 2025, internship: ESTAGIO.CORTE_02 }), false);
  assert.equal(estagioValidoParaFalhasSoca({}), false);
  assert.equal(estagioValidoParaFalhasSoca(undefined), false);
});

import { ehFalhasUrgente, dataReferenciaVoo } from "../src/lib/regrasApontamento.js";

test("urgente com destaque só pras Falhas com Voar urgente", () => {
  assert.equal(ehFalhasUrgente("Falhas Plantio", 6), true);
  assert.equal(ehFalhasUrgente("Falhas Soca", 6), true);
  assert.equal(ehFalhasUrgente("Falhas Soca", 5), false);
  assert.equal(ehFalhasUrgente("Projeto Plantio", 6), false);
});

test("data de referência: plantio, corte ou agendamento", () => {
  const bruto = {
    scheduledDate: "2026-07-16T16:26:24.809Z",
    layerDetails: { datePlanting: "2024-01-06T00:00:00Z", cutDate: "2026-05-14T00:00:00Z" },
  };
  assert.equal(dataReferenciaVoo("Falhas Plantio", bruto), "2024-01-06T00:00:00Z");
  assert.equal(dataReferenciaVoo("Falhas Soca", bruto), "2026-05-14T00:00:00Z");
  assert.equal(dataReferenciaVoo("Projeto Plantio", bruto), "2026-07-16T16:26:24.809Z");
  assert.equal(dataReferenciaVoo("Falhas Soca", {}), null);
});
