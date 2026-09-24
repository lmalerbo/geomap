import { describe, it, expect, vi } from "vitest";
import { criarSyncPins } from "./syncPins.js";

function criarStore(iniciais = []) {
  const pins = new Map(iniciais.map((p) => [p.id, { ...p }]));
  const cursores = new Map();
  return {
    pins,
    salvar: async (p) => void pins.set(p.id, { ...p }),
    buscar: async (id) => (pins.has(id) ? { ...pins.get(id) } : undefined),
    remover: async (id) => void pins.delete(id),
    listarPendentes: async () => [...pins.values()].filter((p) => p.pendente).map((p) => ({ ...p })),
    listarTodos: async () => [...pins.values()].map((p) => ({ ...p })),
    obterCursor: async (m) => cursores.get(m) ?? null,
    salvarCursor: async (m, d) => void cursores.set(m, d),
    cursores,
  };
}
const pin = (extra = {}) => ({
  id: "a", mapaId: 1, icone: "pedra", cor: "#16a34a", titulo: "Pedra", nota: "", lng: -47, lat: -21,
  criadoEm: "2026-09-24T10:00:00.000Z", atualizadoEm: "2026-09-24T10:00:00.000Z", removidoEm: null, pendente: "salvar", ...extra,
});
const erroHttp = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

describe("enviarPendentes", () => {
  it("envia pendente e grava a versão do servidor sem pendente", async () => {
    const store = criarStore([pin()]);
    const api = { salvarPin: vi.fn(async (_t, _m, id) => ({ pin: { ...pin({ id }), pendente: undefined, criadoPorNome: "Ana" } })) };
    const r = await criarSyncPins({ api, store }).enviarPendentes("tk");
    expect(r).toEqual({ enviados: 1, restantes: false });
    expect(store.pins.get("a").pendente).toBeNull();
    expect(store.pins.get("a").criadoPorNome).toBe("Ana");
    expect(api.salvarPin).toHaveBeenCalledWith("tk", 1, "a", expect.objectContaining({ titulo: "Pedra", atualizadoEm: "2026-09-24T10:00:00.000Z" }));
  });

  it("erro de rede mantém pendente e para a fila", async () => {
    const store = criarStore([pin({ id: "a" }), pin({ id: "b", atualizadoEm: "2026-09-24T11:00:00.000Z" })]);
    const api = { salvarPin: vi.fn(async () => { throw new TypeError("Failed to fetch"); }) };
    const r = await criarSyncPins({ api, store }).enviarPendentes("tk");
    expect(r.restantes).toBe(true);
    expect(api.salvarPin).toHaveBeenCalledTimes(1);
    expect(store.pins.get("a").pendente).toBe("salvar");
  });

  it("403 descarta o local e avisa", async () => {
    const store = criarStore([pin()]);
    const aoDescartar = vi.fn();
    const api = { salvarPin: async () => { throw erroHttp(403); } };
    await criarSyncPins({ api, store, aoDescartar }).enviarPendentes("tk");
    expect(store.pins.has("a")).toBe(false);
    expect(aoDescartar).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), expect.objectContaining({ status: 403 }));
  });

  it("não apaga edição local feita durante o envio", async () => {
    const store = criarStore([pin()]);
    const api = {
      salvarPin: async () => {
        await store.salvar(pin({ titulo: "Editado", atualizadoEm: "2026-09-24T12:00:00.000Z" }));
        return { pin: pin({ pendente: undefined }) };
      },
    };
    const sync = criarSyncPins({ api, store });
    await sync.enviarPendentes("tk");
    expect(store.pins.get("a").titulo).toBe("Editado");
    expect(store.pins.get("a").pendente).toBe("salvar");
  });

  it("remoção pendente de pin que nunca chegou ao servidor apaga o local", async () => {
    const store = criarStore([pin({ pendente: "remover", removidoEm: "2026-09-24T10:05:00.000Z", atualizadoEm: "2026-09-24T10:05:00.000Z" })]);
    const api = { removerPin: vi.fn(async () => ({ pin: null })) };
    await criarSyncPins({ api, store }).enviarPendentes("tk");
    expect(api.removerPin).toHaveBeenCalledWith("tk", 1, "a", "2026-09-24T10:05:00.000Z");
    expect(store.pins.has("a")).toBe(false);
  });

  it("chamadas concorrentes não enviam o mesmo pin duas vezes ao mesmo tempo", async () => {
    const store = criarStore([pin()]);
    let emVoo = 0;
    let maxEmVoo = 0;
    const api = {
      salvarPin: async () => {
        emVoo++;
        maxEmVoo = Math.max(maxEmVoo, emVoo);
        await new Promise((r) => setTimeout(r, 10));
        emVoo--;
        return { pin: pin({ pendente: undefined }) };
      },
    };
    const sync = criarSyncPins({ api, store });
    await Promise.all([sync.enviarPendentes("tk"), sync.enviarPendentes("tk")]);
    expect(maxEmVoo).toBe(1);
  });
});

describe("receberPins", () => {
  it("aplica novos, apaga removidos, não sobrescreve pendente e salva o cursor", async () => {
    const store = criarStore([
      pin({ id: "pendente", titulo: "Local" }),
      pin({ id: "velho", pendente: null }),
    ]);
    const api = {
      listarPins: vi.fn(async () => ({
        pins: [
          pin({ id: "pendente", titulo: "Servidor", pendente: undefined }),
          pin({ id: "velho", removidoEm: "2026-09-24T13:00:00.000Z", pendente: undefined }),
          pin({ id: "novo", pendente: undefined }),
        ],
        agora: "2026-09-24T13:30:00.000Z",
      })),
    };
    const n = await criarSyncPins({ api, store }).receberPins("tk", 1);
    expect(n).toBe(3);
    expect(api.listarPins).toHaveBeenCalledWith("tk", 1, null);
    expect(store.pins.get("pendente").titulo).toBe("Local");
    expect(store.pins.has("velho")).toBe(false);
    expect(store.pins.get("novo").pendente).toBeNull();
    expect(store.cursores.get(1)).toBe("2026-09-24T13:30:00.000Z");
  });
});

describe("limparMapasSemPermissao", () => {
  it("apaga pins de mapas que saíram do catálogo", async () => {
    const store = criarStore([pin({ id: "fica", mapaId: 1 }), pin({ id: "sai", mapaId: 2 })]);
    await criarSyncPins({ api: {}, store }).limparMapasSemPermissao([1]);
    expect([...store.pins.keys()]).toEqual(["fica"]);
  });
});
