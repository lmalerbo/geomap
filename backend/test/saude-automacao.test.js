import { test } from "node:test";
import assert from "node:assert/strict";
import { resumirAutomacao, diaLocal } from "../src/lib/saudeAutomacao.js";

const AUTOMACAO = 7;
const camadas = [
  { id: 5, nome: "Talhões", mapaNome: "Geral", versao: "x", publicadoEm: "2026-07-01T12:00:00Z" },
  { id: 1, nome: "Limites", mapaNome: "Geral", versao: "x", publicadoEm: "2026-07-01T12:00:00Z" },
  { id: 9, nome: "Rio", mapaNome: "Geral", versao: "1.0", publicadoEm: "2026-07-01T12:00:00Z" },
];

// 08:05 local = 11:05Z
function rodada(dia, { status = "concluido", usuarioId = AUTOMACAO } = {}) {
  return [5, 1].map((camadaId, i) => ({
    camadaId,
    tipo: "atualizar_arquivo",
    status,
    erro: status === "erro" ? "ogr2ogr falhou" : null,
    criadoEm: `${dia}T11:${10 + i * 20}:00Z`,
    atualizadoEm: `${dia}T11:${25 + i * 20}:00Z`,
    usuarioId,
  }));
}

test("dia local é UTC-3 (02:00Z ainda é o dia anterior)", () => {
  assert.equal(diaLocal("2026-10-01T02:00:00Z"), "2026-09-30");
  assert.equal(diaLocal("2026-10-01T04:00:00Z"), "2026-10-01");
});

test("rodada completa hoje: tudo em dia, dia marcado ok", () => {
  const r = resumirAutomacao({
    agora: "2026-10-01T15:00:00Z",
    automacaoId: AUTOMACAO,
    logins: ["2026-10-01T11:06:00Z"],
    jobs: [...rodada("2026-09-30"), ...rodada("2026-10-01")],
    camadas,
  });
  assert.equal(r.atrasadas, 0);
  assert.equal(r.dias.at(-1).situacao, "ok");
  assert.equal(r.ultimoDiaCompleto, "2026-10-01");
  assert.deepEqual(
    r.camadas.map((c) => [c.nome, c.situacao]),
    [["Talhões", "em_dia"], ["Limites", "em_dia"], ["Rio", "manual"]]
  );
});

test("três dias sem envio (sem internet no servidor geo): camadas atrasadas", () => {
  const r = resumirAutomacao({
    agora: "2026-09-30T16:00:00Z",
    automacaoId: AUTOMACAO,
    logins: ["2026-09-27T11:06:00Z"],
    jobs: rodada("2026-09-27"),
    camadas,
  });
  assert.equal(r.atrasadas, 2);
  assert.equal(r.maiorAtraso, 3);
  assert.deepEqual(r.dias.slice(-4).map((d) => d.situacao), ["ok", "sem_envio", "sem_envio", "sem_envio"]);
});

test("antes das 11h o dia de hoje ainda está aguardando, não atrasado", () => {
  const r = resumirAutomacao({
    agora: "2026-10-01T12:00:00Z", // 09:00 local
    automacaoId: AUTOMACAO,
    logins: [],
    jobs: rodada("2026-09-30"),
    camadas,
  });
  assert.equal(r.dias.at(-1).situacao, "aguardando");
  assert.equal(r.atrasadas, 0);
});

test("job processando recente é andamento; órfão antigo não conta", () => {
  const vivo = { ...rodada("2026-10-01")[0], status: "processando", criadoEm: "2026-10-01T11:50:00Z" };
  const orfao = { ...rodada("2026-09-26")[1], status: "processando" };
  const r = resumirAutomacao({
    agora: "2026-10-01T12:00:00Z",
    automacaoId: AUTOMACAO,
    logins: [],
    jobs: [...rodada("2026-09-30"), vivo, orfao],
    camadas,
  });
  assert.equal(r.dias.at(-1).situacao, "andamento");
  assert.deepEqual(r.processandoAgora, [{ nome: "Talhões", mapaNome: "Geral" }]);
});

test("última tentativa com erro de conversão aparece como erro, com a mensagem", () => {
  const r = resumirAutomacao({
    agora: "2026-10-01T15:00:00Z",
    automacaoId: AUTOMACAO,
    logins: [],
    jobs: [...rodada("2026-09-30"), ...rodada("2026-10-01", { status: "erro" })],
    camadas,
  });
  const talhoes = r.camadas.find((c) => c.id === 5);
  assert.equal(talhoes.situacao, "erro");
  assert.equal(talhoes.ultimoErro, "ogr2ogr falhou");
  assert.equal(r.dias.at(-1).situacao, "erro");
});

test("job antigo sem usuário é atribuído à automação pelo login logo antes", () => {
  const r = resumirAutomacao({
    agora: "2026-10-01T15:00:00Z",
    automacaoId: AUTOMACAO,
    logins: ["2026-10-01T11:06:00Z"],
    jobs: rodada("2026-10-01", { usuarioId: null }),
    camadas,
  });
  assert.equal(r.qtdCamadasAutomacao, 2);
  assert.equal(r.dias.at(-1).situacao, "ok");
});

test("envio manual de um admin não entra como automação", () => {
  const manual = { ...rodada("2026-10-01")[0], camadaId: 9, usuarioId: 1 };
  const r = resumirAutomacao({
    agora: "2026-10-01T15:00:00Z",
    automacaoId: AUTOMACAO,
    logins: [],
    jobs: [manual],
    camadas,
  });
  assert.equal(r.qtdCamadasAutomacao, 0);
  assert.equal(r.camadas.find((c) => c.id === 9).situacao, "manual");
});
