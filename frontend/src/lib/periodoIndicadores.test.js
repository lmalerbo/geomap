import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  hojeLocal, safraDe, ultimos30Dias, mesAtual, formatarHa, formatarPercentual, formatarDataCurta,
  salvarUltimoResultado, lerUltimoResultado, chaveResultado, criarSequenciaRequisicoes,
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

describe("isolamento e ordem", () => {
  it("chave do resultado salvo é separada por usuário", () => {
    const base = { de: "2026-04-01", ate: "2027-03-31", piloto: "" };
    expect(chaveResultado({ ...base, usuarioId: 1 })).not.toBe(chaveResultado({ ...base, usuarioId: 2 }));
  });
  it("só a requisição mais recente é considerada atual", () => {
    const seq = criarSequenciaRequisicoes();
    const primeira = seq.nova();
    const segunda = seq.nova();
    expect(seq.ehAtual(primeira)).toBe(false);
    expect(seq.ehAtual(segunda)).toBe(true);
  });
});
