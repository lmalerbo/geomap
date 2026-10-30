import { describe, it, expect } from "vitest";
import { normalizarEstiloConfig } from "./estiloCamada.js";

describe("normalizarEstiloConfig — consultavel", () => {
  it("é falso quando a camada nunca foi configurada", () => {
    expect(normalizarEstiloConfig(null).consultavel).toBe(false);
  });

  it("mantém o valor salvo no formato novo", () => {
    expect(normalizarEstiloConfig({ preenchimento: {}, consultavel: true }).consultavel).toBe(true);
  });

  it("mantém o valor salvo no formato antigo (flat)", () => {
    expect(normalizarEstiloConfig({ cor: "#ff0000", consultavel: true }).consultavel).toBe(true);
  });

  it("só aceita true de verdade", () => {
    expect(normalizarEstiloConfig({ preenchimento: {}, consultavel: "sim" }).consultavel).toBe(false);
  });
});
