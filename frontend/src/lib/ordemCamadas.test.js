import { describe, it, expect, vi } from "vitest";
import { manterNoTopo } from "./ordemCamadas.js";

function criarMapa(ordem) {
  const camadas = [...ordem];
  return {
    camadas,
    getLayersOrder: () => [...camadas],
    getLayer: (id) => (camadas.includes(id) ? { id } : undefined),
    moveLayer: vi.fn((id) => {
      camadas.splice(camadas.indexOf(id), 1);
      camadas.push(id);
    }),
  };
}

describe("manterNoTopo", () => {
  it("move as camadas pro topo na ordem pedida quando outra camada entrou por cima", () => {
    const map = criarMapa(["fundo", "pins", "pins-pendentes", "talhoes-rotulo"]);
    manterNoTopo(map, ["pins", "pins-pendentes"]);
    expect(map.camadas).toEqual(["fundo", "talhoes-rotulo", "pins", "pins-pendentes"]);
  });

  it("não mexe em nada quando já estão no topo (evita loop com styledata)", () => {
    const map = criarMapa(["fundo", "talhoes-rotulo", "pins", "pins-pendentes"]);
    manterNoTopo(map, ["pins", "pins-pendentes"]);
    expect(map.moveLayer).not.toHaveBeenCalled();
  });

  it("ignora ids que ainda não existem no mapa", () => {
    const map = criarMapa(["fundo", "talhoes-rotulo"]);
    manterNoTopo(map, ["pins", "pins-pendentes"]);
    expect(map.moveLayer).not.toHaveBeenCalled();
    expect(map.camadas).toEqual(["fundo", "talhoes-rotulo"]);
  });

  it("funciona sem getLayersOrder (lê a ordem de getStyle)", () => {
    const map = criarMapa(["pins", "pins-pendentes", "medicao"]);
    const semOrdem = { ...map, getLayersOrder: undefined, getStyle: () => ({ layers: map.camadas.map((id) => ({ id })) }) };
    manterNoTopo(semOrdem, ["pins", "pins-pendentes"]);
    expect(map.camadas).toEqual(["medicao", "pins", "pins-pendentes"]);
  });
});
