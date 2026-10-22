import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { criarCenario, limparCenario, iniciarServidor, tokenPara, req, pool } from "./helpers.js";
import { hojeEmSaoPaulo } from "../src/lib/planejamentoVoo.js";

let c, srv, tAdmin, tLeitor, tSemGrupo;
before(async () => {
  c = await criarCenario();
  srv = await iniciarServidor();
  tAdmin = tokenPara(c.admin);
  tLeitor = tokenPara(c.leitor);
  tSemGrupo = tokenPara(c.semGrupo);
});
after(async () => {
  await srv.fechar();
  await limparCenario(c);
  await pool.end();
});

const anel = [[-47.6, -21.1], [-47.5, -21.1], [-47.5, -21.0], [-47.6, -21.1]];
function diaMais(n) {
  const d = new Date(`${hojeEmSaoPaulo()}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
const corpo = (data) => ({ data, poligono: { type: "Polygon", coordinates: [anel] }, talhoes: [{ secao: "10324", talhao: "1", fazenda: "PEDRA" }] });

test("admin cria; leitor vê só de hoje em diante; auditoria registra", async () => {
  const futuro = await req(`${srv.url}/admin/mapas/${c.mapa.id}/planejamentos`, tAdmin, { method: "POST", body: corpo(diaMais(1)) });
  assert.equal(futuro.status, 201);
  const hoje = await req(`${srv.url}/admin/mapas/${c.mapa.id}/planejamentos`, tAdmin, { method: "POST", body: corpo(diaMais(0)) });
  assert.equal(hoje.status, 201);
  const passado = await req(`${srv.url}/admin/mapas/${c.mapa.id}/planejamentos`, tAdmin, { method: "POST", body: corpo(diaMais(-1)) });
  assert.equal(passado.status, 201);

  const lista = await req(`${srv.url}/mapas/${c.mapa.id}/planejamentos`, tLeitor);
  assert.equal(lista.status, 200);
  const datas = lista.corpo.planejamentos.map((p) => p.data);
  assert.deepEqual(datas, [diaMais(0), diaMais(1)]);
  assert.equal(lista.corpo.planejamentos[0].talhoes[0].fazenda, "PEDRA");

  const log = await pool.query(`SELECT detalhe FROM logs WHERE usuario_id = $1 AND acao = 'admin'`, [c.admin.id]);
  assert.ok(log.rows.some((l) => l.detalhe.includes("planejamento")));
});

test("não admin não escreve; sem acesso ao mapa recebe 404", async () => {
  const r = await req(`${srv.url}/admin/mapas/${c.mapa.id}/planejamentos`, tLeitor, { method: "POST", body: corpo(diaMais(1)) });
  assert.equal(r.status, 403);
  const semAcesso = await req(`${srv.url}/mapas/${c.mapa.id}/planejamentos`, tSemGrupo);
  assert.equal(semAcesso.status, 404);
});

test("validação, alterar data e apagar", async () => {
  const ruim = await req(`${srv.url}/admin/mapas/${c.mapa.id}/planejamentos`, tAdmin, { method: "POST", body: { ...corpo(diaMais(1)), data: "x" } });
  assert.equal(ruim.status, 400);
  const criado = await req(`${srv.url}/admin/mapas/${c.mapa.id}/planejamentos`, tAdmin, { method: "POST", body: corpo(diaMais(2)) });
  const id = criado.corpo.planejamento.id;
  const alterado = await req(`${srv.url}/admin/planejamentos/${id}`, tAdmin, { method: "PUT", body: { data: diaMais(3) } });
  assert.equal(alterado.status, 200);
  assert.equal(alterado.corpo.planejamento.data, diaMais(3));
  const proibido = await req(`${srv.url}/admin/planejamentos/${id}`, tLeitor, { method: "DELETE" });
  assert.equal(proibido.status, 403);
  const apagado = await req(`${srv.url}/admin/planejamentos/${id}`, tAdmin, { method: "DELETE" });
  assert.equal(apagado.status, 200);
  const inexistente = await req(`${srv.url}/admin/planejamentos/${id}`, tAdmin, { method: "DELETE" });
  assert.equal(inexistente.status, 404);
});
