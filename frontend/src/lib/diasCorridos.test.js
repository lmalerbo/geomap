import { describe, it, expect } from "vitest";
import { diasCorridos, textoLegendaDias } from "./diasCorridos.js";

// 1º/10/2026 às 22h no horário local do teste
const hoje = new Date(2026, 9, 1, 22, 0, 0);

describe("diasCorridos", () => {
  it("data só-dia (plantio/corte) não perde um dia pelo fuso", () => {
    expect(diasCorridos("2026-09-30T00:00:00Z", hoje)).toBe(1);
    expect(diasCorridos("2026-10-01T00:00:00Z", hoje)).toBe(0);
    expect(diasCorridos("2026-05-14T00:00:00Z", hoje)).toBe(140);
  });

  it("data com hora (agendamento) usa o dia local", () => {
    const agendado = new Date(2026, 8, 21, 8, 30).toISOString();
    expect(diasCorridos(agendado, hoje)).toBe(10);
  });

  it("sem data ou data inválida não gera número", () => {
    expect(diasCorridos(null, hoje)).toBe(null);
    expect(diasCorridos("não é data", hoje)).toBe(null);
  });
});

describe("textoLegendaDias", () => {
  it("um número por tipo, na ordem recebida", () => {
    const regs = [
      { projeto: "Falhas Plantio", dataReferencia: "2026-09-21T00:00:00Z" },
      { projeto: "Projeto Plantio", dataReferencia: "2026-08-22T00:00:00Z" },
    ];
    expect(textoLegendaDias(regs, hoje)).toBe("10 d · 40 d");
  });

  it("tipo repetido conta uma vez e tipo sem data fica de fora", () => {
    const regs = [
      { projeto: "Falhas Soca", dataReferencia: "2026-09-30T00:00:00Z" },
      { projeto: "Falhas Soca", dataReferencia: "2026-01-01T00:00:00Z" },
      { projeto: "Outro", dataReferencia: null },
    ];
    expect(textoLegendaDias(regs, hoje)).toBe("1 d");
  });
});
