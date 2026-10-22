import { describe, it, expect } from "vitest";
import {
  pontoNoPoligono, talhoesDentro, resumirPlanejamento, siglaTipoVoo,
  rotuloDia, tituloDia, corDoDia, filtrarDeHojeEmDiante,
} from "./planejamentoVoo.js";

const quadrado = [[0, 0], [10, 0], [10, 10], [0, 10], [0, 0]];
const emU = [[0, 0], [10, 0], [10, 10], [7, 10], [7, 3], [3, 3], [3, 10], [0, 10], [0, 0]];
const poligono = { type: "Polygon", coordinates: [quadrado] };

describe("pontoNoPoligono", () => {
  it("dentro, fora e no vão de um polígono côncavo", () => {
    expect(pontoNoPoligono([5, 5], quadrado)).toBe(true);
    expect(pontoNoPoligono([15, 5], quadrado)).toBe(false);
    expect(pontoNoPoligono([1, 8], emU)).toBe(true);
    expect(pontoNoPoligono([5, 8], emU)).toBe(false);
  });
});

describe("talhoesDentro", () => {
  it("pega os de dentro sem repetir a mesma chave", () => {
    const pontos = [
      { secao: "1", talhao: "1", fazenda: "A", lon: 5, lat: 5 },
      { secao: "1", talhao: "1", fazenda: "A", lon: 5.1, lat: 5 },
      { secao: "1", talhao: "2", fazenda: "A", lon: 50, lat: 5 },
    ];
    expect(talhoesDentro(pontos, poligono)).toEqual([{ secao: "1", talhao: "1", fazenda: "A" }]);
  });
});

describe("resumirPlanejamento", () => {
  it("soma por tipo e fazenda só o que está pendente", () => {
    const talhoes = [
      { secao: "10", talhao: "1", fazenda: "PEDRA" },
      { secao: "10", talhao: "2", fazenda: "PEDRA" },
      { secao: "20", talhao: "5", fazenda: "SAPE" },
      { secao: "30", talhao: "9", fazenda: "JA VOADO" },
    ];
    const pendentes = [
      { secao: "10", talhao: "1", projeto: "Falhas Plantio", areaHa: 10 },
      { secao: "10", talhao: "1", projeto: "Falhas Soca", areaHa: 10 },
      { secao: "10", talhao: "2", projeto: "Falhas Plantio", areaHa: 5.5 },
      { secao: "20", talhao: "5", projeto: "Levantamento Topográfico", areaHa: 4 },
      { secao: "99", talhao: "1", projeto: "Falhas Plantio", areaHa: 100 },
    ];
    const r = resumirPlanejamento(talhoes, pendentes);
    expect(r.hectares).toBeCloseTo(29.5);
    expect(r.qtdTalhoes).toBe(3);
    expect(r.porTipo).toEqual([
      { sigla: "FP", nome: "Falhas Plantio", hectares: 15.5 },
      { sigla: "FS", nome: "Falhas Soca", hectares: 10 },
      { sigla: "LT", nome: "Levantamento Topográfico", hectares: 4 },
    ]);
    expect(r.porFazenda).toEqual([
      { fazenda: "PEDRA", secao: "10", hectares: 25.5, siglas: ["FP", "FS"] },
      { fazenda: "SAPE", secao: "20", hectares: 4, siglas: ["LT"] },
    ]);
  });
});

describe("rótulos, cores e datas", () => {
  it("siglas fixas e iniciais para desconhecido", () => {
    expect(siglaTipoVoo("Sistematização")).toBe("SIS");
    expect(siglaTipoVoo("Tipo Novo Aqui")).toBe("TNA");
  });
  it("dia da semana em português", () => {
    expect(rotuloDia("2026-10-19")).toBe("Seg 19/10");
    expect(tituloDia("2026-10-25")).toBe("Domingo, 25/10");
  });
  it("cor fixa por dia da semana", () => {
    expect(corDoDia("2026-10-19")).toBe(corDoDia("2026-10-26"));
    expect(corDoDia("2026-10-19")).not.toBe(corDoDia("2026-10-20"));
  });
  it("tira os dias que já passaram", () => {
    const lista = [{ data: "2026-10-18" }, { data: "2026-10-19" }, { data: "2026-10-20" }];
    expect(filtrarDeHojeEmDiante(lista, "2026-10-19").map((p) => p.data)).toEqual(["2026-10-19", "2026-10-20"]);
  });
});