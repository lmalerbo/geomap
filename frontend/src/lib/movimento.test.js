import { describe, it, expect, vi } from "vitest";
import {
  DURACAO_OK,
  DURACAO_ERRO,
  DURACAO_CONCLUIDO,
  LACO_VOO,
  SAIDA_ESBOCO,
  PASSO_CASCATA,
  MAX_CASCATA,
  formatarBytes,
  fracao,
  textoMb,
  atrasoVoo,
  gerarConfete,
  linhasEsboco,
  criarFimUnico,
} from "./movimento.js";

describe("constantes", () => {
  it("exporta valores esperados", () => {
    expect(DURACAO_OK).toBe(900);
    expect(DURACAO_ERRO).toBe(1200);
    expect(DURACAO_CONCLUIDO).toBe(1900);
    expect(LACO_VOO).toBe(12000);
    expect(SAIDA_ESBOCO).toBe(180);
    expect(PASSO_CASCATA).toBe(28);
    expect(MAX_CASCATA).toBe(10);
  });
});

describe("formatarBytes", () => {
  it("formata MB com uma casa decimal", () => {
    expect(formatarBytes(1572864)).toBe("1,5 MB");
    expect(formatarBytes(20 * 1048576)).toBe("20 MB");
  });

  it("formata KB arredondando para cima mínimo 1", () => {
    expect(formatarBytes(300)).toBe("1 KB");
  });

  it("trata valor inválido como 0", () => {
    expect(formatarBytes(undefined)).toBe("1 KB");
    expect(formatarBytes(NaN)).toBe("1 KB");
    expect(formatarBytes(-100)).toBe("1 KB");
  });
});

describe("fracao", () => {
  it("calcula fração limitada entre 0 e 1", () => {
    expect(fracao(5, 10)).toBe(0.5);
    expect(fracao(30, 20)).toBe(1);
    expect(fracao(-3, 10)).toBe(0);
  });

  it("devolve 0 para total inválido ou valor não finito", () => {
    expect(fracao(5, 0)).toBe(0);
    expect(fracao(5, -1)).toBe(0);
    expect(fracao(NaN, 10)).toBe(0);
    expect(fracao(Infinity, 10)).toBe(0);
    expect(fracao(5, NaN)).toBe(0);
    expect(fracao(5)).toBe(0);
    expect(fracao(5, undefined)).toBe(0);
  });
});

describe("textoMb", () => {
  it("devolve string vazia para total inválido", () => {
    expect(textoMb(0, 0)).toBe("");
    expect(textoMb(100, 0)).toBe("");
    expect(textoMb(100, NaN)).toBe("");
  });

  it("formata valor e total limitando ao total", () => {
    expect(textoMb(3 * 1048576, 20 * 1048576)).toBe("3 MB de 20 MB");
    expect(textoMb(50 * 1048576, 20 * 1048576)).toBe("20 MB de 20 MB");
  });
});

describe("atrasoVoo", () => {
  const agora = 100000;

  it("calcula atraso negativo baseado no resto do laco", () => {
    expect(atrasoVoo(agora - 13000, agora)).toBe(-1000);
    expect(atrasoVoo(agora + 500, agora)).toBe(0);
    expect(atrasoVoo(agora, agora)).toBe(0);
    expect(Object.is(atrasoVoo(agora, agora), 0)).toBe(true);
    expect(atrasoVoo(agora - 12000, agora)).toBe(0);
  });

  it("trata desde inválido como 0", () => {
    expect(atrasoVoo(undefined, agora)).toBe(0);
    expect(atrasoVoo(NaN, agora)).toBe(0);
    expect(atrasoVoo(null, agora)).toBe(0);
  });

  it("usa LACO_VOO padrão quando não informado", () => {
    expect(atrasoVoo(agora - 13000, agora)).toBe(-1000);
  });
});

describe("gerarConfete", () => {
  it("gera n peças com propriedades esperadas (aleatório fixo = 0)", () => {
    const r = gerarConfete(18, () => 0);
    expect(r.length).toBe(18);
    expect(r[0].cor).toBe("var(--mo-c1)");
    expect(r[5].cor).toBe("var(--mo-c2)");
    expect(r[0]).toEqual({ cor: "var(--mo-c1)", dx: 60, dy: -20, r: -270, atraso: 120 });
  });

  it("devolve array vazio para n = 0", () => {
    expect(gerarConfete(0).length).toBe(0);
  });
});

describe("linhasEsboco", () => {
  it("calcula linhas entre 4 e 12 baseado na altura", () => {
    expect(linhasEsboco(0)).toBe(6);
    expect(linhasEsboco(1000)).toBe(12);
    expect(linhasEsboco(50)).toBe(4);
    expect(linhasEsboco(260)).toBe(10);
  });

  it("usa 160 como altura padrão", () => {
    expect(linhasEsboco()).toBe(6);
    expect(linhasEsboco(null)).toBe(6);
    expect(linhasEsboco(undefined)).toBe(6);
  });
});

describe("criarFimUnico", () => {
  it("chama fn apenas na primeira invocação", () => {
    let contador = 0;
    const fn = vi.fn((...args) => {
      contador++;
      return args.join("-");
    });
    const fim = criarFimUnico(fn);

    const r1 = fim("a", "b");
    const r2 = fim("c", "d");

    expect(contador).toBe(1);
    expect(r1).toBe("a-b");
    expect(r2).toBeUndefined();
    expect(fn).toHaveBeenCalledTimes(1);
    expect(fn).toHaveBeenCalledWith("a", "b");
  });
});