import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mapearRegistroRealizado, cacheAindaValido, obterConjunto, VALIDADE_CACHE_MS, VERSAO_CACHE, filtroRealizadosDroneMgmt,
} from "../src/lib/fonteIndicadoresVoo.js";

test("registro voado vira o formato enxuto", () => {
  const r = mapearRegistroRealizado({
    id: "x", startDateFlight: "2026-05-04T15:00:00Z", pilotUserADId: "ABC-1", section: "10001", landPlot: "2",
    flightProjectDetails: { description: "Falhas Plantio" },
    layerDetails: { descriptionSection: "LAGOINHA [10001]", totalArea: 21.4, transferProperty: "FORNECEDOR" },
  });
  assert.deepEqual(r, {
    id: "x", dataVoo: "2026-05-04T15:00:00Z", pilotoId: "abc-1", tipo: "Falhas Plantio", secao: "10001", talhao: "2",
    fazenda: "LAGOINHA [10001]", areaHa: 21.4, propriedade: "FORNECEDOR",
  });
});

test("filtro de realizados pede Verificar porte = Voado da unidade", () => {
  assert.deepEqual(JSON.parse(filtroRealizadosDroneMgmt("u-1")), { $and: [{ unitId: "UUID('u-1')" }, { verifyFlightSize: 9 }] });
});

test("cache vale só com mesma contagem, mesma versão e menos de 1h", () => {
  const agora = 10_000_000;
  const cache = { versao: VERSAO_CACHE, count: 5, atualizadoEmMs: agora - 1000 };
  assert.equal(cacheAindaValido(cache, 5, agora), true);
  assert.equal(cacheAindaValido(cache, 6, agora), false);
  assert.equal(cacheAindaValido({ ...cache, versao: "velha" }, 5, agora), false);
  assert.equal(cacheAindaValido({ ...cache, atualizadoEmMs: agora - VALIDADE_CACHE_MS - 1 }, 5, agora), false);
  assert.equal(cacheAindaValido(null, 5, agora), false);
});

function armazenamentoFalso(inicial) {
  let cache = inicial;
  const gravacoes = [];
  return {
    gravacoes,
    lerCache: async () => cache,
    gravarCache: async (chave, count, itens) => {
      gravacoes.push({ chave, count, itens });
      cache = { versao: VERSAO_CACHE, count, itens, atualizadoEmMs: Date.now(), atualizadoEm: "2026-10-01T12:00:00Z" };
      return cache.atualizadoEm;
    },
  };
}

test("DroneManagement fora do ar com cache existente devolve o cache marcado como desatualizado", async () => {
  const armazenamento = armazenamentoFalso({
    versao: VERSAO_CACHE, count: 1, itens: [{ id: "velho" }], atualizadoEmMs: 0, atualizadoEm: "2026-09-30T10:00:00Z",
  });
  const consulta = {
    contarRegistros: async () => { throw new Error("fora do ar"); },
    buscarTodosRegistros: async () => { throw new Error("fora do ar"); },
  };
  const r = await obterConjunto({ chave: "realizados", filtro: "{}", transformar: (x) => x, forcar: false, consulta, armazenamento });
  assert.deepEqual(r, { itens: [{ id: "velho" }], atualizadoEm: "2026-09-30T10:00:00Z", desatualizado: true });
});

test("DroneManagement fora do ar sem cache propaga o erro", async () => {
  const consulta = { contarRegistros: async () => { throw new Error("fora do ar"); }, buscarTodosRegistros: async () => [] };
  await assert.rejects(
    obterConjunto({ chave: "realizados", filtro: "{}", transformar: (x) => x, forcar: false, consulta, armazenamento: armazenamentoFalso(null) }),
    /fora do ar/
  );
});

test("contagem diferente rebusca, transforma e grava; contagem igual reusa sem buscar", async () => {
  const armazenamento = armazenamentoFalso(null);
  let buscas = 0;
  const consulta = {
    contarRegistros: async () => 2,
    buscarTodosRegistros: async () => { buscas += 1; return { count: 2, registros: [{ id: 1 }, { id: 2 }] }; },
  };
  const args = { chave: "realizados", filtro: "{}", transformar: (rs) => rs.map((r) => ({ id: `m${r.id}` })), forcar: false, consulta, armazenamento };
  const primeira = await obterConjunto(args);
  assert.deepEqual(primeira.itens, [{ id: "m1" }, { id: "m2" }]);
  assert.equal(primeira.desatualizado, false);
  await obterConjunto(args);
  assert.equal(buscas, 1);
  await obterConjunto({ ...args, forcar: true });
  assert.equal(buscas, 2);
});
