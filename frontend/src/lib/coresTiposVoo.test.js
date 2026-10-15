import { describe, it, expect } from "vitest";
import {
  TIPOS_VOO_PADRAO,
  TIPOS_VOO_EDITAVEIS,
  CHAVE_FALHAS_PLANTIO_FORNECEDOR,
  COR_FALHAS_PLANTIO_FORNECEDOR,
  normalizarCoresTiposVoo,
  corTipoVoo,
  ordemTipoVoo,
} from "./coresTiposVoo.js";
import { normalizarEstiloConfig } from "./estiloCamada.js";

describe("coresTiposVoo", () => {
  it("cor padrão de Levantamento Topográfico é #c19a6b", () => {
    expect(corTipoVoo("Levantamento Topográfico")).toBe("#c19a6b");
  });

  it("personalizada substitui a padrão", () => {
    expect(corTipoVoo("Falhas Plantio", { "Falhas Plantio": "#ff0000" })).toBe("#ff0000");
  });

  it("personalizada inválida é ignorada", () => {
    expect(corTipoVoo("Falhas Plantio", { "Falhas Plantio": "marrom" })).toBe("#16a34a");
    expect(corTipoVoo("Falhas Plantio", { "Falhas Plantio": "#abc" })).toBe("#16a34a");
  });

  it("chave de fornecedor tem padrão #38bdf8", () => {
    expect(corTipoVoo(CHAVE_FALHAS_PLANTIO_FORNECEDOR)).toBe("#38bdf8");
  });

  it("tipo desconhecido devolve sempre a mesma cor da paleta de fallback", () => {
    const cor1 = corTipoVoo("Tipo Inexistente XYZ");
    const cor2 = corTipoVoo("Tipo Inexistente XYZ");
    expect(cor1).toBe(cor2);
    expect(["#2a78d6", "#1baf7a", "#4a3aa7", "#e87ba4", "#eb6834"]).toContain(cor1);
  });

  it("normalizarCoresTiposVoo descarta inválidos, põe em minúsculas e devolve {} pra null/array", () => {
    const entrada = {
      "Falhas Plantio": "#16A34A",
      "Falhas Soca": "marrom",
      "Ervas Daninhas": "#abc",
      "Ambiental": "#EC4899",
    };
    const esperado = {
      "Falhas Plantio": "#16a34a",
      "Ambiental": "#ec4899",
    };
    expect(normalizarCoresTiposVoo(entrada)).toEqual(esperado);
    expect(normalizarCoresTiposVoo(null)).toEqual({});
    expect(normalizarCoresTiposVoo([])).toEqual({});
    expect(normalizarCoresTiposVoo("string")).toEqual({});
  });

  it("TIPOS_VOO_EDITAVEIS[1][0] é a chave de fornecedor", () => {
    expect(TIPOS_VOO_EDITAVEIS[1][0]).toBe(CHAVE_FALHAS_PLANTIO_FORNECEDOR);
  });

  it("ordemTipoVoo retorna índice correto e Infinity para desconhecido", () => {
    expect(ordemTipoVoo("Falhas Soca")).toBe(1);
    expect(ordemTipoVoo("Tipo Inexistente")).toBe(Infinity);
  });
});