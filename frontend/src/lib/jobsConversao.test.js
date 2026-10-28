import { describe, expect, it } from "vitest";
import { formatarDecorrido, textoConversao, pousoDoResultado, vooDoPalco } from "./jobsConversao.js";

describe("formatarDecorrido", () => {
  it("mostra minutos e segundos com dois dígitos", () => {
    expect(formatarDecorrido(0)).toBe("0:00");
    expect(formatarDecorrido(9_400)).toBe("0:09");
    expect(formatarDecorrido(192_000)).toBe("3:12");
  });

  it("passa de uma hora sem virar hora", () => {
    expect(formatarDecorrido(61 * 60_000 + 5_000)).toBe("61:05");
  });

  it("nunca fica negativo nem quebra com valor inválido", () => {
    expect(formatarDecorrido(-5_000)).toBe("0:00");
    expect(formatarDecorrido(NaN)).toBe("0:00");
  });
});

describe("textoConversao", () => {
  it("junta o nome e o tempo desde o início do job", () => {
    expect(textoConversao({ rotulo: "Talhões", inicio: 1_000 }, 193_000)).toBe("Convertendo Talhões · 3:12");
  });

  it("job salvo antes de guardar o início mostra só o nome", () => {
    expect(textoConversao({ rotulo: "Talhões" }, 193_000)).toBe("Convertendo Talhões");
  });
});

describe("pousoDoResultado", () => {
  it("concluído vira publicada com a versão", () => {
    expect(pousoDoResultado({ rotulo: "Talhões", versao: "2.6", status: "concluido" })).toEqual({
      ok: true,
      texto: "Talhões publicada · versão 2.6",
    });
  });

  it("sem versão conhecida, só publicada", () => {
    expect(pousoDoResultado({ rotulo: "Talhões", status: "concluido" })).toEqual({
      ok: true,
      texto: "Talhões publicada",
    });
  });

  it("erro mostra a mensagem do servidor", () => {
    expect(pousoDoResultado({ rotulo: "Talhões", status: "erro", erro: "faltando: .prj" })).toEqual({
      ok: false,
      texto: "faltando: .prj",
    });
  });
});

describe("vooDoPalco", () => {
  const criar = { jobId: "a", tipo: "criar", camadaId: null };
  const atualizar5 = { jobId: "b", tipo: "atualizar", camadaId: 5 };

  it("com camada selecionada, mostra o job dessa camada", () => {
    expect(vooDoPalco([criar, atualizar5], 5)).toBe(atualizar5);
  });

  it("com camada selecionada sem job, não mostra nada", () => {
    expect(vooDoPalco([criar, atualizar5], 7)).toBeNull();
  });

  it("sem camada selecionada, mostra a camada nova em conversão", () => {
    expect(vooDoPalco([atualizar5, criar], null)).toBe(criar);
  });

  it("lista vazia não mostra nada", () => {
    expect(vooDoPalco([], null)).toBeNull();
  });
});
