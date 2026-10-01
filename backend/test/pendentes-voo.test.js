import { test } from "node:test";
import assert from "node:assert/strict";
import { filtrarEMapearPendentes, filtroPendentesDroneMgmt } from "../src/lib/pendentesVoo.js";
import { ESTAGIO } from "../src/lib/regrasApontamento.js";

function bruto({ projeto, propriedade = "PROPRIA", internship = ESTAGIO.CORTE_02, harvest = 2026, area = 10 } = {}) {
  return {
    id: `id-${Math.random()}`,
    section: "10001",
    landPlot: "1",
    controlStatus: 2,
    verifyFlightSize: 5,
    flightProjectDetails: projeto ? { description: projeto } : undefined,
    layerDetails: { totalArea: area, transferProperty: propriedade, internship, harvest },
  };
}

test("Falhas Soca fora do estágio ou em fornecedor não é pendente; outras finalidades passam", () => {
  const itens = filtrarEMapearPendentes([
    bruto({ projeto: "Falhas Soca" }),
    bruto({ projeto: "Falhas Soca", propriedade: "FORNECEDOR" }),
    bruto({ projeto: "Falhas Soca", internship: ESTAGIO.CORTE_03 }),
    bruto({ projeto: "Falhas Plantio", propriedade: "FORNEC. SUBPARCERIA" }),
    bruto({ projeto: "Ervas Daninhas" }),
  ]);
  assert.deepEqual(itens.map((i) => i.projeto), ["Falhas Soca", "Falhas Plantio", "Ervas Daninhas"]);
});

test("registro mapeado mantém os campos do mapa de Voos e ganha a propriedade", () => {
  const [item] = filtrarEMapearPendentes([bruto({ projeto: "Falhas Plantio", propriedade: "FORNECEDOR", area: 12.5 })]);
  assert.deepEqual(Object.keys(item).sort(), [
    "areaHa", "controlStatus", "dataReferencia", "fornecedor", "id", "projeto", "propriedade", "secao", "talhao", "urgente", "verifyFlightSize",
  ]);
  assert.equal(item.areaHa, 12.5);
  assert.equal(item.fornecedor, true);
  assert.equal(item.propriedade, "FORNECEDOR");
});

test("filtro de pendentes pede A voar com porte 5/6 da unidade", () => {
  const filtro = JSON.parse(filtroPendentesDroneMgmt("u-1"));
  assert.deepEqual(filtro, {
    $and: [
      { unitId: "UUID('u-1')" },
      { controlStatus: 2 },
      { $or: [{ verifyFlightSize: 5 }, { verifyFlightSize: 6 }] },
    ],
  });
});

test("pendente mantém urgente e data de referência do mapa de Voos", () => {
  const [item] = filtrarEMapearPendentes([
    { ...bruto({ projeto: "Falhas Plantio" }), verifyFlightSize: 6, layerDetails: { totalArea: 1, transferProperty: "PROPRIA", datePlanting: "2026-08-01T00:00:00Z" } },
  ]);
  assert.equal(item.urgente, true);
  assert.equal(item.dataReferencia, "2026-08-01T00:00:00Z");
});
