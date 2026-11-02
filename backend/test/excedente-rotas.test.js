import { test, before, after, beforeEach } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarCenario, limparCenario, iniciarServidor, tokenPara, req, pool } from "./helpers.js";
import { definirFonteParaTestes } from "../src/lib/fonteIndicadoresVoo.js";
import { esquecerSincronizacoesParaTestes } from "../src/routes/excedente.js";

let c, srv, tAdmin, tEditor, tLeitor, tSemGrupo;
let realizados = [];
let falhar = false;
let desatualizado = false;

const voo = (id, extra = {}) => ({
  id, dataVoo: "2026-05-10T13:00:00Z", tipo: "Falhas Plantio", secao: "10324", talhao: id.slice(-1),
  fazenda: "PEDRA", propriedade: "PRÓPRIA", ...extra,
});

before(async () => {
  c = await criarCenario();
  // Marca o mapa do cenário como mapa de excedente (camada Talhões com tipoCamada).
  await pool.query(
    `INSERT INTO camadas (mapa_id, nome, versao, arquivo_path, estilo_config) VALUES ($1, 'Talhões', '1', 'x.pmtiles', $2)`,
    [c.mapa.id, JSON.stringify({ tipoCamada: "excedente" })]
  );
  srv = await iniciarServidor();
  tAdmin = tokenPara(c.admin);
  tEditor = tokenPara(c.editor);
  tLeitor = tokenPara(c.leitor);
  tSemGrupo = tokenPara(c.semGrupo);
  definirFonteParaTestes(async () => {
    if (falhar) throw new Error("ponte desligada");
    return { realizados, pendentes: [], atualizadoEm: new Date().toISOString(), desatualizado };
  });
});
beforeEach(() => esquecerSincronizacoesParaTestes());
after(async () => {
  definirFonteParaTestes(null);
  await srv.fechar();
  // camadas.mapa_id não tem ON DELETE CASCADE: sem isso limparCenario falha por FK.
  await pool.query("DELETE FROM camadas WHERE mapa_id = $1", [c.mapa.id]);
  await limparCenario(c);
  await pool.end();
});

const urlCasos = () => `${srv.url}/mapas/${c.mapa.id}/excedente`;
const urlApont = () => `${srv.url}/mapas/${c.mapa.id}/excedente/apontamentos`;
const apont = (casoId, status, extra = {}) => ({
  id: randomUUID(), casoId, status, campos: {}, feitoEm: new Date().toISOString(), ...extra,
});

test("ponte fora no primeiro acesso: 200, lista vazia, atualizacao falhou", async () => {
  falhar = true;
  const r = await req(urlCasos(), tLeitor);
  falhar = false;
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.casos, []);
  assert.equal(r.corpo.atualizacao, "falhou");
});

test("cache desatualizado: aviso de falha se repete dentro do intervalo", async () => {
  desatualizado = true;
  const r1 = await req(urlCasos(), tLeitor);
  const r2 = await req(urlCasos(), tLeitor);
  desatualizado = false;
  assert.equal(r1.corpo.atualizacao, "falhou");
  assert.equal(r2.corpo.atualizacao, "falhou");
});

test("cria casos dos voos FLP sem duplicar; leitor vê; sem grupo não vê", async () => {
  realizados = [voo("v-a1"), voo("v-a2"), voo("v-x9", { tipo: "Falhas Soca" })];
  const r1 = await req(urlCasos(), tLeitor);
  assert.equal(r1.status, 200);
  assert.equal(r1.corpo.atualizacao, "ok");
  assert.deepEqual(r1.corpo.casos.map((x) => x.vooId).sort(), ["v-a1", "v-a2"]);
  assert.ok(r1.corpo.casos.every((x) => x.status === "aguardando"));
  esquecerSincronizacoesParaTestes();
  const r2 = await req(urlCasos(), tLeitor);
  assert.equal(r2.corpo.casos.length, 2);
  assert.equal((await req(urlCasos(), tSemGrupo)).status, 404);
});

test("mapa sem camada excedente: 404 e não cria casos", async () => {
  const r = await req(`${srv.url}/mapas/${c.mapaOutro.id}/excedente`, tAdmin);
  assert.equal(r.status, 404);
  const { rows } = await pool.query("SELECT 1 FROM analises_excedente WHERE mapa_id = $1", [c.mapaOutro.id]);
  assert.equal(rows.length, 0);
});

test("leitor não aponta; editor aponta com campos e histórico", async () => {
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-a1");
  const negado = await req(urlApont(), tLeitor, { method: "POST", body: { apontamentos: [apont(caso.id, "sem_ajuste")] } });
  assert.equal(negado.status, 403);

  const poligono = { type: "Polygon", coordinates: [[[-47.6, -21.1], [-47.5, -21.1], [-47.5, -21.0], [-47.6, -21.1]]] };
  const a = apont(caso.id, "precisa_ajuste", { campos: { areaExcedenteHa: 1.5, observacao: "cabeceira norte", poligonoExcedente: poligono } });
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [a] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.resultados, [{ id: a.id, resultado: "aplicado" }]);

  const depois = (await req(urlCasos(), tLeitor)).corpo.casos.find((x) => x.id === caso.id);
  assert.equal(depois.status, "precisa_ajuste");
  assert.equal(depois.areaExcedenteHa, 1.5);
  assert.equal(depois.observacao, "cabeceira norte");
  assert.deepEqual(depois.poligonoExcedente, poligono);
  assert.equal(depois.historico.length, 1);
  assert.equal(depois.historico[0].statusAnterior, "aguardando");
});

test("transição inválida é recusada com motivo", async () => {
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-a2");
  const a = apont(caso.id, "ajustado");
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [a] } });
  assert.equal(r.corpo.resultados[0].resultado, "recusado");
  assert.match(r.corpo.resultados[0].erro, /aguardando/);
});

test("mais recente vence; mais antigo fica no histórico como substituído", async () => {
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-a1"); // precisa_ajuste
  // `novo` precisa ser posterior ao apontamento do teste anterior (feito "agora" lá).
  const novo = apont(caso.id, "ajustado", { campos: { dataAjuste: "2026-10-29" } });
  const velho = apont(caso.id, "aguardando", { feitoEm: new Date(Date.now() - 3_600_000).toISOString() });
  const r = await req(urlApont(), tAdmin, { method: "POST", body: { apontamentos: [novo, velho] } });
  assert.deepEqual(r.corpo.resultados.map((x) => x.resultado), ["aplicado", "substituido"]);
  const depois = (await req(urlCasos(), tLeitor)).corpo.casos.find((x) => x.id === caso.id);
  assert.equal(depois.status, "ajustado");
  assert.equal(depois.dataAjuste, "2026-10-29");
  assert.ok(depois.historico.some((h) => h.substituido));
});

test("reenvio do mesmo apontamento é idempotente", async () => {
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-a2"); // aguardando
  const a = apont(caso.id, "sem_ajuste");
  await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [a] } });
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [a] } });
  assert.deepEqual(r.corpo.resultados, [{ id: a.id, resultado: "aplicado" }]);
  const depois = (await req(urlCasos(), tLeitor)).corpo.casos.find((x) => x.id === caso.id);
  assert.equal(depois.historico.length, 1);
});

test("relógio adiantado não trava edições seguintes", async () => {
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-a2"); // sem_ajuste
  const futuro = apont(caso.id, "aguardando", { feitoEm: new Date(Date.now() + 2 * 86_400_000).toISOString() });
  await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [futuro] } });
  await new Promise((r) => setTimeout(r, 10));
  // 6 min depois "de verdade" (simulado pelo feitoEm) uma edição normal ainda vence.
  const depois = apont(caso.id, "precisa_ajuste", { feitoEm: new Date(Date.now() + 6 * 60_000).toISOString() });
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [depois] } });
  assert.equal(r.corpo.resultados[0].resultado, "aplicado");
});

test("voo que some dos realizados marca cancelado, sem apagar; volta desmarca", async () => {
  realizados = [voo("v-a2")];
  const r = await req(urlCasos(), tLeitor);
  const a1 = r.corpo.casos.find((x) => x.vooId === "v-a1");
  assert.equal(a1.vooCancelado, true);
  realizados = [voo("v-a1"), voo("v-a2")];
  esquecerSincronizacoesParaTestes();
  const r2 = await req(urlCasos(), tLeitor);
  assert.equal(r2.corpo.casos.find((x) => x.vooId === "v-a1").vooCancelado, false);
});

test("corpo inválido: 400", async () => {
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [{ id: "x" }] } });
  assert.equal(r.status, 400);
});
