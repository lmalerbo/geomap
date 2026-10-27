import { describe, it, expect } from "vitest";
import { criarProgressoSync, textosProgressoSync } from "./progressoSync.js";

const CAMADAS = [
  { id: 1, nome: "Talhões" },
  { id: 2, nome: "Limites" },
];

function montar(camadas = CAMADAS) {
  const avisos = [];
  let t = 0;
  const p = criarProgressoSync(camadas, (s) => avisos.push(s), { agora: () => t, intervalo: 100 });
  return { p, avisos, ultimo: () => avisos[avisos.length - 1], andar: (ms) => (t += ms) };
}

describe("criarProgressoSync", () => {
  it("começa baixando, sem total de bytes conhecido", () => {
    const { ultimo } = montar();
    expect(ultimo()).toEqual({
      fase: "baixando",
      camadaAtual: "Talhões",
      camadasFeitas: 0,
      camadasTotal: 2,
      falhas: 0,
      bytes: 0,
      bytesTotal: null,
    });
  });

  it("só soma o total de bytes quando todas as camadas informaram o tamanho", () => {
    const { p, ultimo, andar } = montar();
    p.bytes(1, 100, 1000);
    expect(ultimo().bytesTotal).toBeNull();
    expect(ultimo().bytes).toBe(100);
    andar(200);
    p.bytes(2, 50, 500);
    expect(ultimo().bytesTotal).toBe(1500);
    expect(ultimo().bytes).toBe(150);
  });

  it("camada sem tamanho informado deixa o total desconhecido", () => {
    const { p, ultimo } = montar();
    p.bytes(1, 100, 1000);
    p.bytes(2, 50, null);
    expect(ultimo().bytesTotal).toBeNull();
  });

  it("segura avisos de bytes mais próximos que o intervalo", () => {
    const { p, avisos, andar } = montar();
    const antes = avisos.length;
    p.bytes(1, 10, 1000);
    p.bytes(1, 20, 1000);
    expect(avisos.length).toBe(antes + 1);
    andar(150);
    p.bytes(1, 30, 1000);
    expect(avisos.length).toBe(antes + 2);
  });

  it("guardando: baixou tudo, falta gravar; camada atual segue a próxima baixando", () => {
    const { p, ultimo } = montar();
    p.guardando(1);
    expect(ultimo().fase).toBe("baixando");
    expect(ultimo().camadaAtual).toBe("Limites");
    p.guardando(2);
    expect(ultimo().fase).toBe("guardando");
    expect(ultimo().camadaAtual).toBeNull();
  });

  it("conta concluídas e falhas e termina pronto", () => {
    const { p, ultimo } = montar();
    p.concluida(1);
    expect(ultimo().camadasFeitas).toBe(1);
    p.falhou(2);
    expect(ultimo()).toMatchObject({ fase: "pronto", camadasFeitas: 2, falhas: 1 });
  });

  it("não passa para MB se isso fizer a barra voltar atrás", () => {
    const { p, ultimo, andar } = montar([
      { id: 1, nome: "Talhões" },
      { id: 2, nome: "Unidades" },
    ]);
    p.bytes(2, 10, 10);
    p.concluida(2); // 1 de 2 camadas = 50 %
    p.bytes(1, 100, 10000); // por bytes seria 1 %
    expect(ultimo().bytesTotal).toBeNull();
    andar(200);
    p.bytes(1, 6000, 10000); // 60 %: agora pode
    expect(ultimo().bytesTotal).toBe(10010);
    andar(200);
    p.bytes(1, 6100, 10000);
    expect(ultimo().bytesTotal).toBe(10010); // e não volta mais
  });

  it("bytes da camada concluída contam como o tamanho dela", () => {
    const { p, ultimo } = montar();
    p.bytes(1, 100, 1000);
    p.bytes(2, 0, 500);
    p.concluida(1);
    expect(ultimo().bytes).toBe(1000);
  });
});

describe("textosProgressoSync", () => {
  it("baixando com MB", () => {
    const t = textosProgressoSync({
      fase: "baixando",
      camadaAtual: "Talhões",
      camadasFeitas: 2,
      camadasTotal: 6,
      bytes: 24.1 * 1048576,
      bytesTotal: 39.7 * 1048576,
    });
    expect(t.texto).toBe("Baixando Talhões");
    expect(t.detalhe).toBe("2 de 6 camadas · 24,1 MB de 39,7 MB");
    expect(t.estado).toBe("enviando");
    expect(t.valor / t.total).toBeCloseTo(24.1 / 39.7);
  });

  it("baixando sem MB usa as camadas como passos", () => {
    const t = textosProgressoSync({
      fase: "baixando",
      camadaAtual: "Limites",
      camadasFeitas: 1,
      camadasTotal: 4,
      bytes: 0,
      bytesTotal: null,
    });
    expect(t.detalhe).toBe("1 de 4 camadas");
    expect([t.valor, t.total]).toEqual([1, 4]);
  });

  it("guardando e pronto", () => {
    const base = { camadaAtual: null, camadasFeitas: 1, camadasTotal: 1, bytes: 0, bytesTotal: null };
    expect(textosProgressoSync({ ...base, fase: "guardando" })).toMatchObject({
      texto: "Guardando no aparelho…",
      estado: "processando",
    });
    expect(textosProgressoSync({ ...base, fase: "pronto" })).toMatchObject({ texto: "Tudo baixado", estado: "ok" });
    expect(textosProgressoSync({ ...base, camadasTotal: 1, camadasFeitas: 0, fase: "baixando" }).detalhe).toBe(
      "0 de 1 camada"
    );
  });
});
