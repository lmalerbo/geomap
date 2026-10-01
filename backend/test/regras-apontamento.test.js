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
