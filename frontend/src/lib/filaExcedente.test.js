import { describe, it, expect } from "vitest";
import { criarFilaExcedente, criarEnvioUnico } from "./filaExcedente.js";

function storeMemoria() {
  const itens = new Map();
  return {
    itens,
    salvar: async (i) => void itens.set(i.id, i),
    remover: async (id) => void itens.delete(id),
    listar: async () => [...itens.values()],
  };
}
let n = 0;
const gerarId = () => `id-${++n}`;

describe("criarFilaExcedente", () => {
  it("envia os pendentes de um mapa num lote e remove os aplicados e substituídos", async () => {
    const store = storeMemoria();
    const chamadas = [];
    const api = { apontar: async (_t, mapaId, aps) => (chamadas.push({ mapaId, aps }), { resultados: aps.map((a, i) => ({ id: a.id, resultado: i ? "substituido" : "aplicado" })) }) };
    const fila = criarFilaExcedente({ api, store, gerarId });
    await fila.enfileirar({ mapaId: 7, casoId: "c1", status: "sem_ajuste", campos: {} });
    await fila.enfileirar({ mapaId: 7, casoId: "c2", status: "precisa_ajuste", campos: { observacao: "x" } });
    const r = await fila.enviarPendentes("tok");
    expect(chamadas).toHaveLength(1);
    expect(chamadas[0].aps.map((a) => a.casoId)).toEqual(["c1", "c2"]);
    expect(r).toEqual({ enviados: 2, recusados: 0, restantes: false });
    expect(store.itens.size).toBe(0);
  });

  it("sem rede: mantém tudo pendente", async () => {
    const store = storeMemoria();
    const api = { apontar: async () => { throw new TypeError("Failed to fetch"); } };
    const fila = criarFilaExcedente({ api, store, gerarId });
    await fila.enfileirar({ mapaId: 7, casoId: "c1", status: "sem_ajuste", campos: {} });
    expect(await fila.enviarPendentes("tok")).toEqual({ enviados: 0, recusados: 0, restantes: true });
    expect([...store.itens.values()][0].estado).toBe("pendente");
  });

  it("recusa por item vira recusado com o motivo; retentar volta a pendente; descartar remove", async () => {
    const store = storeMemoria();
    const api = { apontar: async (_t, _m, aps) => ({ resultados: [{ id: aps[0].id, resultado: "recusado", erro: "não dá" }] }) };
    const fila = criarFilaExcedente({ api, store, gerarId });
    const item = await fila.enfileirar({ mapaId: 7, casoId: "c1", status: "ajustado", campos: {} });
    expect((await fila.enviarPendentes("tok")).recusados).toBe(1);
    expect(store.itens.get(item.id)).toMatchObject({ estado: "recusado", erro: "não dá" });
    await fila.retentar(item.id);
    expect(store.itens.get(item.id).estado).toBe("pendente");
    await fila.descartar(item.id);
    expect(store.itens.size).toBe(0);
  });

  it("perda de permissão (403) recusa o lote inteiro", async () => {
    const store = storeMemoria();
    const erro = Object.assign(new Error("sem permissão"), { status: 403 });
    const api = { apontar: async () => { throw erro; } };
    const fila = criarFilaExcedente({ api, store, gerarId });
    await fila.enfileirar({ mapaId: 7, casoId: "c1", status: "sem_ajuste", campos: {} });
    expect((await fila.enviarPendentes("tok")).recusados).toBe(1);
    expect([...store.itens.values()][0]).toMatchObject({ estado: "recusado", erro: "sem permissão" });
  });

  it("5xx e sessão vencida (401) mantêm a fila pendente para tentar de novo", async () => {
    for (const status of [500, 502, 504, 401]) {
      const store = storeMemoria();
      const erro = Object.assign(new Error("falhou"), { status });
      const fila = criarFilaExcedente({ api: { apontar: async () => { throw erro; } }, store, gerarId });
      await fila.enfileirar({ mapaId: 7, casoId: "c1", status: "sem_ajuste", campos: {} });
      expect(await fila.enviarPendentes("tok")).toEqual({ enviados: 0, recusados: 0, restantes: true });
      expect([...store.itens.values()][0].estado).toBe("pendente");
    }
  });

  it("manda o status que o aparelho viu", async () => {
    const store = storeMemoria();
    let enviados;
    const api = { apontar: async (_t, _m, aps) => ((enviados = aps), { resultados: aps.map((a) => ({ id: a.id, resultado: "aplicado" })) }) };
    const fila = criarFilaExcedente({ api, store, gerarId });
    await fila.enfileirar({ mapaId: 7, casoId: "c1", status: "sem_ajuste", statusAnterior: "aguardando", campos: {} });
    await fila.enviarPendentes("tok");
    expect(enviados[0].statusAnterior).toBe("aguardando");
  });
});
describe("casos devolvidos pelo servidor", () => {
  it("o aviso de enviado traz os casos atualizados de cada mapa", async () => {
    const store = storeMemoria();
    const avisos = [];
    const casos = [{ id: "c1", status: "sem_ajuste" }];
    const api = { apontar: async (_t, _m, aps) => ({ resultados: [{ id: aps[0].id, resultado: "aplicado" }], casos }) };
    const fila = criarFilaExcedente({ api, store, gerarId, aoMudar: (d) => avisos.push(d) });
    await fila.enfileirar({ mapaId: 7, casoId: "c1", status: "sem_ajuste", campos: {} });
    await fila.enviarPendentes("tok");
    const enviado = avisos.find((a) => a.tipo === "enviado");
    expect(enviado.casosPorMapa).toEqual({ 7: casos });
  });
});

describe("criarEnvioUnico", () => {
  it("pedido durante um envio roda de novo depois, sem envios simultâneos", async () => {
    let rodando = 0;
    let maximo = 0;
    let vezes = 0;
    let liberar;
    const envio = criarEnvioUnico(async () => {
      rodando++; maximo = Math.max(maximo, rodando); vezes++;
      if (vezes === 1) await new Promise((r) => { liberar = r; });
      rodando--;
      return { enviados: vezes };
    });
    const p1 = envio("tok");
    const p2 = envio("tok"); // item novo entrou durante o 1º envio
    const p3 = envio("tok");
    liberar();
    await Promise.all([p1, p2, p3]);
    expect(vezes).toBe(2);
    expect(maximo).toBe(1);
    expect((await p2).enviados).toBe(2);
  });
});
