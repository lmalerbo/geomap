import { describe, it, expect } from "vitest";
import { ICONES_PREPARO, ICONE_PADRAO, idImagemPin, svgPin, nomeIcone, PALETA_PINS } from "./iconesPreparo.js";

const CHAVES = [
  "pedra", "toco", "erosao", "alagamento", "formigueiro", "cupinzeiro", "curva_nivel", "carreador",
  "cerca", "rede_eletrica", "tubulacao", "compactacao", "mato", "maquina", "observacao",
];

describe("catálogo de ícones do preparo", () => {
  it("tem exatamente as 15 chaves combinadas com o backend", () => {
    expect(ICONES_PREPARO.map((i) => i.chave)).toEqual(CHAVES);
    expect(CHAVES).toContain(ICONE_PADRAO);
  });
  it("todo ícone tem nome e desenho", () => {
    for (const i of ICONES_PREPARO) {
      expect(i.nome.length).toBeGreaterThan(0);
      expect(i.desenho).toMatch(/<(path|circle|ellipse|rect)/);
    }
  });
  it("id de imagem é estável e sem #", () => {
    expect(idImagemPin("pedra", "#16A34A")).toBe("pin-pedra-16a34a");
  });
  it("svg do pin usa a cor e o desenho do ícone", () => {
    const svg = svgPin("toco", "#123456");
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain(ICONES_PREPARO.find((i) => i.chave === "toco").desenho);
  });
  it("nome de chave desconhecida cai no padrão", () => {
    expect(nomeIcone("xyz")).toBe(nomeIcone(ICONE_PADRAO));
  });
  it("paleta tem 8 cores hex", () => {
    expect(PALETA_PINS).toHaveLength(8);
    for (const c of PALETA_PINS) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});
