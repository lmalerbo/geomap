import { describe, it, expect } from "vitest";
import { casoVigentePorTalhao, aplicarPendentes, contarPorStatus, botoesDoStatus, chaveTalhao, camposDoApontamento } from "./excedente.js";

const caso = (id, extra) => ({ id, secao: "10324", talhao: "3", dataVoo: "2026-05-10", status: "aguardando", ...extra });

describe("casoVigentePorTalhao", () => {
  it("talhão com 2 casos fica com o voo mais recente", () => {
    const m = casoVigentePorTalhao([caso("a", { dataVoo: "2026-05-10" }), caso("b", { dataVoo: "2026-09-01", status: "precisa_ajuste" })]);
    expect(m.get(chaveTalhao("10324", "3")).id).toBe("b");
  });
  it("precisa de ajuste em aberto não some com um voo novo no mesmo talhão", () => {
    const m = casoVigentePorTalhao([caso("a", { status: "precisa_ajuste" }), caso("b", { dataVoo: "2026-09-01" })]);
    expect(m.get(chaveTalhao("10324", "3")).id).toBe("a");
  });
  it("voo cancelado não esconde o caso válido; sozinho, continua aparecendo", () => {
    const m = casoVigentePorTalhao([caso("a"), caso("b", { dataVoo: "2026-09-01", vooCancelado: true })]);
    expect(m.get(chaveTalhao("10324", "3")).id).toBe("a");
    expect(casoVigentePorTalhao([caso("b", { vooCancelado: true })]).get(chaveTalhao("10324", "3")).id).toBe("b");
  });
});

describe("camposDoApontamento", () => {
  it("reabrir apaga área, trecho e data; sem ajuste apaga área e trecho", () => {
    expect(camposDoApontamento("aguardando")).toEqual({ areaExcedenteHa: null, poligonoExcedente: null, dataAjuste: null });
    expect(camposDoApontamento("sem_ajuste", { observacao: "x" })).toEqual({ areaExcedenteHa: null, poligonoExcedente: null, observacao: "x" });
    expect(camposDoApontamento("ajustado", { dataAjuste: "2026-10-30" })).toEqual({ dataAjuste: "2026-10-30" });
  });
  it("na tela, reabrir pendente já some com o trecho", () => {
    const fila = [{ casoId: "a", status: "aguardando", campos: {}, estado: "pendente", feitoEm: "2026-10-30T10:00:00Z" }];
    const [a] = aplicarPendentes([caso("a", { status: "precisa_ajuste", areaExcedenteHa: 2, poligonoExcedente: {} })], fila);
    expect(a.areaExcedenteHa).toBeNull();
    expect(a.poligonoExcedente).toBeNull();
  });
});

describe("aplicarPendentes", () => {
  it("aplica status e campos da fila só nos itens pendentes, na ordem", () => {
    const fila = [
      { casoId: "a", status: "precisa_ajuste", campos: { observacao: "x" }, estado: "pendente", feitoEm: "2026-10-30T10:00:00Z" },
      { casoId: "a", status: "ajustado", campos: { dataAjuste: "2026-10-30" }, estado: "pendente", feitoEm: "2026-10-30T11:00:00Z" },
      { casoId: "a", status: "aguardando", campos: {}, estado: "recusado", feitoEm: "2026-10-30T12:00:00Z" },
    ];
    const [a] = aplicarPendentes([caso("a")], fila);
    expect(a.status).toBe("ajustado");
    expect(a.observacao).toBe("x");
    expect(a.dataAjuste).toBe("2026-10-30");
    expect(a.pendente).toBe(true);
  });
});

describe("contarPorStatus e botoesDoStatus", () => {
  it("conta concluídos juntando sem_ajuste e ajustado", () => {
    expect(contarPorStatus([caso("a"), caso("b", { status: "sem_ajuste" }), caso("c", { status: "ajustado" }), caso("d", { status: "precisa_ajuste" })]))
      .toEqual({ aguardando: 1, precisa_ajuste: 1, concluidos: 2 });
  });
  it("oferece os botões do fluxo combinado", () => {
    expect(botoesDoStatus("aguardando").map((b) => b.status)).toEqual(["precisa_ajuste", "sem_ajuste"]);
    expect(botoesDoStatus("precisa_ajuste").map((b) => b.status)).toEqual(["ajustado", "aguardando"]);
    expect(botoesDoStatus("ajustado").map((b) => b.status)).toEqual(["aguardando"]);
  });
});