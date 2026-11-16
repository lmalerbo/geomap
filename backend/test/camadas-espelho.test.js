import test from "node:test";
import assert from "node:assert/strict";
import { resumirAutomacao } from "../src/lib/saudeAutomacao.js";

test("Camadas espelho: camada que acompanha origem da automação conta como automação em dia", () => {
  const agora = "2026-11-16T14:00:00.000Z";
  const automacaoId = 42;
  const logins = ["2026-11-16T11:05:00.000Z"]; // 08:05 local
  const jobs = [
    {
      camadaId: 10,
      tipo: "atualizar_arquivo",
      status: "concluido",
      criadoEm: "2026-11-16T11:10:00.000Z",
      atualizadoEm: "2026-11-16T11:25:00.000Z",
      usuarioId: automacaoId,
    },
  ];
  const camadas = [
    {
      id: 10,
      nome: "Talhões",
      mapaNome: "Geral",
      versao: "2.5",
      publicadoEm: "2026-11-16T11:25:00.000Z",
      origemId: null,
    },
    {
      id: 20,
      nome: "Talhões — Cópia",
      mapaNome: "Plantio Excedente",
      versao: "2.5",
      publicadoEm: "2026-11-16T11:25:00.000Z",
      origemId: 10, // Espelho da camada 10
    },
    {
      id: 30,
      nome: "Estradas",
      mapaNome: "Geral",
      versao: "1.0",
      publicadoEm: "2026-10-01T10:00:00.000Z",
      origemId: null,
    },
  ];

  const resumo = resumirAutomacao({ agora, automacaoId, logins, jobs, camadas });

  assert.equal(resumo.qtdCamadasAutomacao, 2, "deve contar tanto a origem quanto o espelho");
  assert.equal(resumo.atrasadas, 0, "nenhuma deve estar atrasada");

  const c10 = resumo.camadas.find((c) => c.id === 10);
  const c20 = resumo.camadas.find((c) => c.id === 20);
  const c30 = resumo.camadas.find((c) => c.id === 30);

  assert.equal(c10.automacao, true);
  assert.equal(c10.situacao, "em_dia");
  assert.equal(c10.ehEspelho, false);

  assert.equal(c20.automacao, true, "camada espelho herda flag de automacao");
  assert.equal(c20.situacao, "em_dia", "camada espelho está em dia");
  assert.equal(c20.ehEspelho, true);
  assert.equal(c20.origemId, 10);

  assert.equal(c30.automacao, false);
  assert.equal(c30.situacao, "manual");
});

test("Camadas espelho: se a origem estiver atrasada, o espelho reflete o atraso", () => {
  const agora = "2026-11-16T15:00:00.000Z"; // 12h local (após as 11h limite)
  const automacaoId = 42;
  const logins = []; // nenhum login nos últimos dias
  const jobs = [];
  const camadas = [
    {
      id: 10,
      nome: "Talhões",
      mapaNome: "Geral",
      versao: "2.0",
      publicadoEm: "2026-11-10T10:00:00.000Z", // 6 dias atrás
      origemId: null,
    },
    {
      id: 20,
      nome: "Talhões — Cópia",
      mapaNome: "Plantio Excedente",
      versao: "2.0",
      publicadoEm: "2026-11-10T10:00:00.000Z",
      origemId: 10,
    },
  ];

  // Simula que id 10 é uma das camadas configuradas da automação
  const jobsAntigos = [
    {
      camadaId: 10,
      tipo: "atualizar_arquivo",
      status: "concluido",
      criadoEm: "2026-11-10T11:10:00.000Z",
      atualizadoEm: "2026-11-10T11:25:00.000Z",
      usuarioId: automacaoId,
    },
  ];

  const resumo = resumirAutomacao({ agora, automacaoId, logins, jobs: jobsAntigos, camadas });

  const c10 = resumo.camadas.find((c) => c.id === 10);
  const c20 = resumo.camadas.find((c) => c.id === 20);

  assert.equal(c10.situacao, "atrasada");
  assert.equal(c20.situacao, "atrasada");
  assert.equal(resumo.atrasadas, 2);
});

test("Camadas espelho: espelho de camada manual não é considerado da automação", () => {
  const agora = "2026-11-16T14:00:00.000Z";
  const automacaoId = 42;
  const logins = [];
  const jobs = [];
  const camadas = [
    {
      id: 50,
      nome: "Curvas de Nível",
      mapaNome: "Geral",
      versao: "1.0",
      publicadoEm: "2026-11-01T10:00:00.000Z",
      origemId: null,
    },
    {
      id: 51,
      nome: "Curvas de Nível (Espelho)",
      mapaNome: "Projeto Novo",
      versao: "1.0",
      publicadoEm: "2026-11-01T10:00:00.000Z",
      origemId: 50,
    },
  ];

  const resumo = resumirAutomacao({ agora, automacaoId, logins, jobs, camadas });

  const c50 = resumo.camadas.find((c) => c.id === 50);
  const c51 = resumo.camadas.find((c) => c.id === 51);

  assert.equal(c50.automacao, false);
  assert.equal(c50.situacao, "manual");

  assert.equal(c51.automacao, false);
  assert.equal(c51.situacao, "manual");
  assert.equal(c51.ehEspelho, true);
});
