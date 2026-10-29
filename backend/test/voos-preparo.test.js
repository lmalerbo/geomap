import { test } from "node:test";
import assert from "node:assert/strict";
import { filtroVoosPreparo, mapearVoosPreparo, secaoValida } from "../src/lib/voosPreparo.js";

const reg = (projeto, extra = {}) => ({
  id: "3592d102-3d8e-4a5a-830a-c09186c1099f", section: "10724", landPlot: 2, controlStatus: 4,
  verifyFlightSize: 5, createdUtc: "2026-10-27T12:00:00Z", scheduledDate: "2026-10-27T12:00:00Z",
  startDateFlight: "2026-10-28T10:00:00Z", modifiedUtc: "2026-10-28T11:00:00Z", harvest: 2026,
  flightProjectDetails: projeto ? { description: projeto } : undefined, ...extra,
});

test("filtro pela unidade e pela fazenda", () => {
  assert.deepEqual(JSON.parse(filtroVoosPreparo("u-1", "10724")),
    { $and: [{ unitId: "UUID('u-1')" }, { section: "10724" }] });
});

test("só Sistematização e Expansão, com os campos que o Hub grava", () => {
  const out = mapearVoosPreparo([reg("Sistematização"), reg("Expansão", { controlStatus: 11 }),
                                 reg("Levantamento Topográfico"), reg("Falhas Soca"), reg(null)]);
  assert.equal(out.length, 2);
  assert.deepEqual(out[0], {
    id: "3592d102-3d8e-4a5a-830a-c09186c1099f", section: "10724", landPlot: "2", projeto: "Sistematização",
    controlStatus: 4, verifyFlightSize: 5, createdUtc: "2026-10-27T12:00:00Z",
    scheduledDate: "2026-10-27T12:00:00Z", startDateFlight: "2026-10-28T10:00:00Z", modifiedUtc: "2026-10-28T11:00:00Z",
  });
  assert.equal(out[1].controlStatus, 11);   // cancelado vai junto; o Hub filtra
});

test("seção só com dígitos", () => {
  assert.ok(secaoValida("10724"));
  for (const s of ["", "10724')", "abc", 10724, null]) assert.ok(!secaoValida(s), String(s));
});
