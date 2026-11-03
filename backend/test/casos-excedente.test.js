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
    voo({ id: "v6", dataVoo: "lixo" }),
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