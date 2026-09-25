import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { sairDescartandoPins } from "./usePinsPendentes.js";

describe("sairDescartandoPins", () => {
  let ordem;
  beforeEach(() => {
    ordem = [];
    vi.stubGlobal("window", { confirm: vi.fn(() => true), alert: vi.fn() });
  });
  afterEach(() => vi.unstubAllGlobals());

  const limpar = () => vi.fn(async () => void ordem.push("limpar"));
  const sair = () => vi.fn(() => void ordem.push("sair"));

  it("limpa os pins locais antes de sair, mesmo sem pendentes", async () => {
    const l = limpar();
    const s = sair();
    expect(await sairDescartandoPins(0, s, l)).toBe(true);
    expect(ordem).toEqual(["limpar", "sair"]);
    expect(window.confirm).not.toHaveBeenCalled();
  });

  it("com pendentes, só limpa e sai depois de o usuário confirmar", async () => {
    const l = limpar();
    const s = sair();
    await sairDescartandoPins(2, s, l);
    expect(window.confirm).toHaveBeenCalledTimes(1);
    expect(ordem).toEqual(["limpar", "sair"]);
  });

  it("usuário cancelou: não limpa nem sai", async () => {
    window.confirm.mockReturnValue(false);
    const l = limpar();
    const s = sair();
    expect(await sairDescartandoPins(2, s, l)).toBe(false);
    expect(l).not.toHaveBeenCalled();
    expect(s).not.toHaveBeenCalled();
  });

  it("falha ao limpar: não sai (senão os pendentes seriam enviados pelo próximo usuário)", async () => {
    const l = vi.fn(async () => {
      throw new Error("IndexedDB indisponível");
    });
    const s = sair();
    expect(await sairDescartandoPins(1, s, l)).toBe(false);
    expect(s).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledTimes(1);
  });
});
