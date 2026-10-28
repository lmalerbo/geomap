import { describe, it, expect, vi } from "vitest";
import { criarFilaApontamentos, ehErroTransitorio } from "./filaApontamentos.js";

function criarStore(iniciais = []) {
  const lotes = new Map(iniciais.map((l) => [l.id, { ...l }]));
  return {
    lotes,
    salvar: async (l) => void lotes.set(l.id, structuredClone(l)),
    remover: async (id) => void lotes.delete(id),
    listar: async () => [...lotes.values()].map((l) => structuredClone(l)),
  };
}
const reg = (id, extra = {}) => ({ id, secao: "10722", talhao: id, projeto: "Falhas Plantio", areaHa: 10, ...extra });
const lote = (id, registros, extra = {}) => ({
  id, mapaId: 7, dataVoo: "2026-09-30", criadoEm: "2026-10-01T10:00:00.000Z", estado: "pendente", registros, falhas: [], ...extra,
});
const erroHttp = (status, mensagem) => Object.assign(new Error(mensagem), { status });

describe("enfileirar", () => {
  it("guarda o lote pendente com a data do voo escolhida", async () => {
    const store = criarStore();
    const aoMudar = vi.fn();
    const fila = criarFilaApontamentos({ api: {}, store, aoMudar, gerarId: () => "L1" });
    await fila.enfileirar({ mapaId: 7, dataVoo: "2026-09-29", registros: [reg("a")] });
    const salvo = store.lotes.get("L1");
    expect(salvo.estado).toBe("pendente");
    expect(salvo.dataVoo).toBe("2026-09-29");
    expect(aoMudar).toHaveBeenCalledWith(expect.objectContaining({ tipo: "enfileirado" }));
  });
});

describe("enviarPendentes", () => {
  it("envia com a data original e remove o lote quando tudo dá certo", async () => {
    const store = criarStore([lote("L1", [reg("a"), reg("b")], { dataVoo: "2026-09-28" })]);
    const api = { apontar: vi.fn(async () => ({ sucesso: ["a", "b"], falha: [] })) };
    const r = await criarFilaApontamentos({ api, store }).enviarPendentes("tk");
    expect(r).toEqual({ enviados: 2, restantes: false, recusados: 0 });
    expect(store.lotes.size).toBe(0);
    expect(api.apontar).toHaveBeenCalledWith("tk", {
      mapaId: 7,
      dataVoo: "2026-09-28",
      registros: [
        { id: "a", secao: "10722", talhao: "a" },
        { id: "b", secao: "10722", talhao: "b" },
      ],
    });
  });

  it("falha de rede mantém tudo pendente e para a fila", async () => {
    const store = criarStore([lote("L1", [reg("a")]), lote("L2", [reg("b")])]);
    const api = { apontar: vi.fn(async () => { throw new TypeError("Failed to fetch"); }) };
    const r = await criarFilaApontamentos({ api, store }).enviarPendentes("tk");
    expect(r.restantes).toBe(true);
    expect(api.apontar).toHaveBeenCalledTimes(1);
    expect([...store.lotes.values()].every((l) => l.estado === "pendente")).toBe(true);
  });

  it("recusa parcial: o lote vira recusado só com os talhões que falharam, com o motivo", async () => {
    const store = criarStore([lote("L1", [reg("a"), reg("b")])]);
    const api = { apontar: vi.fn(async () => ({ sucesso: ["a"], falha: [{ id: "b", erro: "não estava mais pendente" }] })) };
    const r = await criarFilaApontamentos({ api, store }).enviarPendentes("tk");
    expect(r).toEqual({ enviados: 1, restantes: false, recusados: 1 });
    const l = store.lotes.get("L1");
    expect(l.estado).toBe("recusado");
    expect(l.falhas).toEqual([expect.objectContaining({ id: "b", talhao: "b", erro: "não estava mais pendente" })]);
  });

  it("servidor recusa o lote inteiro (erro HTTP): todos os talhões ficam recusados com o motivo", async () => {
    const store = criarStore([lote("L1", [reg("a"), reg("b")])]);
    const api = { apontar: vi.fn(async () => { throw erroHttp(400, "sem vínculo de piloto"); }) };
    const r = await criarFilaApontamentos({ api, store }).enviarPendentes("tk");
    expect(r.recusados).toBe(2);
    const l = store.lotes.get("L1");
    expect(l.estado).toBe("recusado");
    expect(l.falhas.map((f) => f.erro)).toEqual(["sem vínculo de piloto", "sem vínculo de piloto"]);
  });

  it("lotes já recusados não são reenviados sozinhos", async () => {
    const store = criarStore([lote("L1", [], { estado: "recusado", falhas: [{ ...reg("a"), erro: "x" }] })]);
    const api = { apontar: vi.fn() };
    await criarFilaApontamentos({ api, store }).enviarPendentes("tk");
    expect(api.apontar).not.toHaveBeenCalled();
  });
});

describe("ponte do DroneManagement desligada", () => {
  it("503 mantém o lote pendente e para a fila, sem recusar", async () => {
    const store = criarStore([lote("L1", [reg("a")]), lote("L2", [reg("b")])]);
    const aoMudar = vi.fn();
    const api = { apontar: vi.fn(async () => { throw erroHttp(503, "ponte desligada"); }) };
    const r = await criarFilaApontamentos({ api, store, aoMudar }).enviarPendentes("tk");
    expect(r).toEqual({ enviados: 0, restantes: true, recusados: 0 });
    expect(api.apontar).toHaveBeenCalledTimes(1);
    expect([...store.lotes.values()].every((l) => l.estado === "pendente")).toBe(true);
    expect(aoMudar).not.toHaveBeenCalled();
  });

  it("400 continua virando recusado e não para a fila por si só", async () => {
    const store = criarStore([lote("L1", [reg("a")])]);
    const api = { apontar: vi.fn(async () => { throw erroHttp(400, "dados inválidos"); }) };
    const r = await criarFilaApontamentos({ api, store }).enviarPendentes("tk");
    expect(r.restantes).toBe(false);
    expect(r.recusados).toBe(1);
    expect(store.lotes.get("L1").estado).toBe("recusado");
  });
});

describe("ehErroTransitorio", () => {
  it("falha de rede (sem status HTTP) é transitória", () => {
    expect(ehErroTransitorio(new TypeError("Failed to fetch"))).toBe(true);
  });

  it("503 é transitório", () => {
    expect(ehErroTransitorio(erroHttp(503, "ponte desligada"))).toBe(true);
  });

  it("502 com 'ponte' na mensagem é transitório, sem diferenciar maiúsculas", () => {
    expect(ehErroTransitorio(erroHttp(502, "A PONTE não respondeu"))).toBe(true);
    expect(ehErroTransitorio(erroHttp(502, "ponte do DroneManagement"))).toBe(true);
  });

  it("502 sem 'ponte' e 400 não são transitórios", () => {
    expect(ehErroTransitorio(erroHttp(502, "bad gateway"))).toBe(false);
    expect(ehErroTransitorio(erroHttp(400, "ponte"))).toBe(false);
  });
});

describe("retentar e descartar", () => {
  it("retentar devolve os talhões recusados para pendente (sem o motivo)", async () => {
    const store = criarStore([lote("L1", [], { estado: "recusado", falhas: [{ ...reg("a"), erro: "x" }] })]);
    await criarFilaApontamentos({ api: {}, store }).retentar("L1");
    const l = store.lotes.get("L1");
    expect(l.estado).toBe("pendente");
    expect(l.registros).toEqual([reg("a")]);
    expect(l.falhas).toEqual([]);
  });

  it("descartar remove o lote", async () => {
    const store = criarStore([lote("L1", [reg("a")])]);
    await criarFilaApontamentos({ api: {}, store }).descartar("L1");
    expect(store.lotes.size).toBe(0);
  });
});
