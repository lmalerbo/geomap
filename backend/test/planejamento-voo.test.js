import { test } from "node:test";
import assert from "node:assert/strict";
import { validarPlanejamento, hojeEmSaoPaulo } from "../src/lib/planejamentoVoo.js";

const anel = [[-47.6, -21.1], [-47.5, -21.1], [-47.5, -21.0], [-47.6, -21.1]];
const ok = { data: "2026-10-19", poligono: { type: "Polygon", coordinates: [anel] }, talhoes: [{ secao: "10324", talhao: "1", fazenda: "PEDRA" }] };

test("planejamento válido passa", () => {
  assert.equal(validarPlanejamento(ok), null);
  assert.equal(validarPlanejamento({ ...ok, talhoes: [] }), null);
});

test("recusa data, polígono e talhões inválidos", () => {
  assert.match(validarPlanejamento({ ...ok, data: "19/10/2026" }), /data/);
  assert.match(validarPlanejamento({ ...ok, data: "2026-02-30" }), /data/);
  assert.match(validarPlanejamento({ ...ok, poligono: { type: "Point", coordinates: [0, 0] } }), /polígono/);
  assert.match(validarPlanejamento({ ...ok, poligono: { type: "Polygon", coordinates: [anel.slice(0, 3)] } }), /polígono/);
  assert.match(validarPlanejamento({ ...ok, poligono: { type: "Polygon", coordinates: [[[-200, 0], [1, 1], [2, 2], [-200, 0]]] } }), /polígono/);
  assert.match(validarPlanejamento({ ...ok, poligono: { type: "Polygon", coordinates: [[[0, 0], [1, 1], [2, 2], [3, 3]]] } }), /polígono/); // não fechado
  assert.match(validarPlanejamento({ ...ok, talhoes: "x" }), /talhões/);
  assert.match(validarPlanejamento({ ...ok, talhoes: [{ secao: "1" }] }), /talhões/);
  assert.match(validarPlanejamento({ ...ok, talhoes: new Array(2001).fill(ok.talhoes[0]) }), /talhões/);
  assert.match(validarPlanejamento(null), /corpo/);
});

test("hoje em São Paulo vira o dia certo perto da meia-noite UTC", () => {
  assert.equal(hojeEmSaoPaulo(new Date("2026-10-20T02:30:00Z")), "2026-10-19");
  assert.equal(hojeEmSaoPaulo(new Date("2026-10-20T03:30:00Z")), "2026-10-20");
});