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
let chamadasFonte = 0;
let atrasoFonteMs = 0;

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
    chamadasFonte++;
    if (atrasoFonteMs) await new Promise((r) => setTimeout(r, atrasoFonteMs));
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
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: "x" } });
  assert.equal(r.status, 400);
});

test("item inválido é recusado sozinho; os outros do lote seguem", async () => {
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-a1");
  const aberto = { type: "Polygon", coordinates: [[[-47.6, -21.1], [-47.5, -21.1], [-47.5, -21.0]]] };
  const ruim = apont(caso.id, "precisa_ajuste", { campos: { poligonoExcedente: aberto } });
  const bom = apont(caso.id, "aguardando");
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [ruim, bom] } });
  assert.equal(r.status, 200);
  assert.deepEqual(r.corpo.resultados.map((x) => x.resultado), ["recusado", "aplicado"]);
  assert.match(r.corpo.resultados[0].erro, /desenho/);
});

test("data do ajuste no futuro é recusada", async () => {
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-a1");
  const a = apont(caso.id, "ajustado", { statusAnterior: "precisa_ajuste", campos: { dataAjuste: "2099-01-01" } });
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [a] } });
  assert.equal(r.corpo.resultados[0].resultado, "recusado");
});

test("reabrir apaga área, trecho e data do ajuste", async () => {
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-a1"); // aguardando
  const poligono = { type: "Polygon", coordinates: [[[-47.6, -21.1], [-47.5, -21.1], [-47.5, -21.0], [-47.6, -21.1]]] };
  const t = (min) => new Date(Date.now() + min * 1000).toISOString();
  const lote = [
    apont(caso.id, "precisa_ajuste", { feitoEm: t(1), campos: { areaExcedenteHa: 2, poligonoExcedente: poligono } }),
    apont(caso.id, "ajustado", { feitoEm: t(2), campos: { dataAjuste: "2026-10-29" } }),
    apont(caso.id, "aguardando", { feitoEm: t(3) }),
  ];
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: lote } });
  assert.deepEqual(r.corpo.resultados.map((x) => x.resultado), ["aplicado", "aplicado", "aplicado"]);
  const depois = (await req(urlCasos(), tLeitor)).corpo.casos.find((x) => x.id === caso.id);
  assert.equal(depois.status, "aguardando");
  assert.equal(depois.areaExcedenteHa, null);
  assert.equal(depois.poligonoExcedente, null);
  assert.equal(depois.dataAjuste, null);
});

test("dois aparelhos: o mais recente vale, pela transição que o aparelho viu", async () => {
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-a1"); // aguardando
  const t = (min) => new Date(Date.now() + min * 1000).toISOString();
  // A (com sinal) marca sem ajuste; B (sem sinal, ainda vendo "aguardando") marca depois.
  const deA = apont(caso.id, "sem_ajuste", { feitoEm: t(10), statusAnterior: "aguardando" });
  const deB = apont(caso.id, "precisa_ajuste", { feitoEm: t(20), statusAnterior: "aguardando", campos: { areaExcedenteHa: 1 } });
  await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [deA] } });
  const r = await req(urlApont(), tAdmin, { method: "POST", body: { apontamentos: [deB] } });
  assert.equal(r.corpo.resultados[0].resultado, "aplicado");
  const depois = (await req(urlCasos(), tLeitor)).corpo.casos.find((x) => x.id === caso.id);
  assert.equal(depois.status, "precisa_ajuste");
});

test("resposta do apontamento traz os casos já atualizados", async () => {
  realizados = [voo("v-r1")];
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-r1");
  const a = apont(caso.id, "sem_ajuste");
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [a] } });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.casos.find((x) => x.id === caso.id).status, a.status);
});

test("buscas simultâneas fazem uma sincronização só", async () => {
  chamadasFonte = 0;
  atrasoFonteMs = 200;
  const [r1, r2, r3] = await Promise.all([req(urlCasos(), tLeitor), req(urlCasos(), tLeitor), req(urlCasos(), tLeitor)]);
  atrasoFonteMs = 0;
  assert.equal(chamadasFonte, 1);
  assert.ok([r1, r2, r3].every((r) => r.status === 200 && r.corpo.atualizacao === "ok"));
});

test("trecho de arquivo: várias partes e buraco são aceitos; anel aberto não", async () => {
  realizados = [voo("v-m1")];
  const caso = (await req(urlCasos(), tEditor)).corpo.casos.find((x) => x.vooId === "v-m1");
  const quadrado = (x, y, l) => [[x, y], [x + l, y], [x + l, y + l], [x, y + l], [x, y]];
  const multi = {
    type: "MultiPolygon",
    coordinates: [[quadrado(-47.6, -21.1, 0.02), quadrado(-47.595, -21.095, 0.005)], [quadrado(-47.5, -21.1, 0.01)]],
  };
  const ok = apont(caso.id, "precisa_ajuste", { campos: { areaExcedenteHa: 3.2, poligonoExcedente: multi } });
  const aberto = { type: "Polygon", coordinates: [quadrado(-47.6, -21.1, 0.02).slice(0, -1)] };
  const ruim = apont(caso.id, "precisa_ajuste", { campos: { areaExcedenteHa: 1, poligonoExcedente: aberto } });
  const r = await req(urlApont(), tEditor, { method: "POST", body: { apontamentos: [ruim, ok] } });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.resultados.find((x) => x.id === ruim.id).resultado, "recusado");
  assert.equal(r.corpo.resultados.find((x) => x.id === ok.id).resultado, "aplicado");
  assert.deepEqual(r.corpo.casos.find((x) => x.id === caso.id).poligonoExcedente, multi);
});
