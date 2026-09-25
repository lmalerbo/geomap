import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarCenario, limparCenario, iniciarServidor, tokenPara, req, pool } from "./helpers.js";

let c, srv, tEditor, tLeitor, tSemGrupo, tAdmin;
before(async () => {
  c = await criarCenario();
  srv = await iniciarServidor();
  tEditor = tokenPara(c.editor);
  tLeitor = tokenPara(c.leitor);
  tSemGrupo = tokenPara(c.semGrupo);
  tAdmin = tokenPara(c.admin);
});
after(async () => {
  await srv.fechar();
  await limparCenario(c);
  await pool.end();
});

function corpo(extra = {}) {
  const agora = new Date().toISOString();
  return { icone: "pedra", cor: "#16a34a", titulo: "Pedra", nota: "grande", lng: -47.6, lat: -21.1, criadoEm: agora, atualizadoEm: agora, ...extra };
}
const url = (mapaId, id = "") => `${srv.url}/mapas/${mapaId}/pins${id ? `/${id}` : ""}`;

test("editor cria pin e leitor recebe", async () => {
  const id = randomUUID();
  const r = await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo() });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.pin.id, id);
  assert.equal(r.corpo.pin.criadoPorNome, c.editor.nome);
  const lista = await req(url(c.mapa.id), tLeitor);
  assert.equal(lista.status, 200);
  assert.ok(lista.corpo.pins.some((p) => p.id === id));
  const log = await pool.query(`SELECT detalhe FROM logs WHERE usuario_id = $1 AND acao = 'anotacao'`, [c.editor.id]);
  assert.ok(log.rows.some((l) => l.detalhe.includes(id)));
});

test("leitor e usuário sem grupo não podem escrever; sem grupo não lê", async () => {
  const id = randomUUID();
  assert.equal((await req(url(c.mapa.id, id), tLeitor, { method: "PUT", body: corpo() })).status, 403);
  assert.equal((await req(url(c.mapa.id, id), tSemGrupo, { method: "PUT", body: corpo() })).status, 403);
  assert.equal((await req(url(c.mapa.id), tSemGrupo)).status, 404);
});

test("admin escreve mesmo sem grupo; mapa inexistente é 404", async () => {
  assert.equal((await req(url(c.mapa.id, randomUUID()), tAdmin, { method: "PUT", body: corpo() })).status, 200);
  assert.equal((await req(url(999999999, randomUUID()), tAdmin, { method: "PUT", body: corpo() })).status, 404);
});

test("PUT repetido é idempotente e edição mais antiga é ignorada", async () => {
  const id = randomUUID();
  const t0 = new Date(Date.now() - 60000).toISOString();
  const t1 = new Date().toISOString();
  await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo({ criadoEm: t0, atualizadoEm: t0 }) });
  await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo({ criadoEm: t0, atualizadoEm: t0 }) });
  const novo = await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo({ criadoEm: t0, atualizadoEm: t1, titulo: "Novo" }) });
  assert.equal(novo.corpo.pin.titulo, "Novo");
  const velho = await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo({ criadoEm: t0, atualizadoEm: t0, titulo: "Velho" }) });
  assert.equal(velho.status, 200);
  assert.equal(velho.corpo.pin.titulo, "Novo");
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM pins WHERE id = $1`, [id]);
  assert.equal(rows[0].n, 1);
});

test("pin removido não ressuscita e DELETE é idempotente", async () => {
  const id = randomUUID();
  await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo() });
  const rem = new Date().toISOString();
  const d1 = await req(`${url(c.mapa.id, id)}?removidoEm=${encodeURIComponent(rem)}`, tEditor, { method: "DELETE" });
  assert.equal(d1.status, 200);
  assert.ok(d1.corpo.pin.removidoEm);
  const d2 = await req(`${url(c.mapa.id, id)}?removidoEm=${encodeURIComponent(rem)}`, tEditor, { method: "DELETE" });
  assert.equal(d2.status, 200);
  const futuro = new Date(Date.now() + 60000).toISOString();
  const put = await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo({ atualizadoEm: futuro, titulo: "Zumbi" }) });
  assert.equal(put.corpo.pin.titulo, "Pedra");
  assert.ok(put.corpo.pin.removidoEm);
});

test("DELETE de pin que nunca chegou ao servidor responde 200 com pin null", async () => {
  const r = await req(`${url(c.mapa.id, randomUUID())}?removidoEm=${encodeURIComponent(new Date().toISOString())}`, tEditor, { method: "DELETE" });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.pin, null);
});

test("PUT de um pin de outro mapa responde 409 e não move o pin", async () => {
  const id = randomUUID();
  await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo() });
  const r = await req(url(c.mapaOutro.id, id), tEditor, { method: "PUT", body: corpo({ atualizadoEm: new Date(Date.now() + 1000).toISOString() }) });
  assert.equal(r.status, 409);
  const { rows } = await pool.query(`SELECT mapa_id FROM pins WHERE id = $1`, [id]);
  assert.equal(rows[0].mapa_id, c.mapa.id);
});

test("validação: ícone fora do catálogo, cor, título vazio, coordenada, uuid", async () => {
  const id = randomUUID();
  for (const ruim of [{ icone: "nave" }, { cor: "verde" }, { titulo: "   " }, { lat: 91 }, { lng: "x" }, { atualizadoEm: "ontem" }, { nota: "a".repeat(2001) }]) {
    const r = await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo(ruim) });
    assert.equal(r.status, 400, JSON.stringify(ruim));
  }
  assert.equal((await req(url(c.mapa.id, "nao-e-uuid"), tEditor, { method: "PUT", body: corpo() })).status, 400);
});

test("?desde= devolve só alterados, inclui removidos, e o cursor fica no passado", async () => {
  const antes = await req(url(c.mapa.id), tLeitor);
  const cursor = antes.corpo.agora;
  assert.ok(new Date(cursor).getTime() < Date.now(), "cursor recua para cobrir commits concorrentes");
  const id = randomUUID();
  await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo() });
  await req(`${url(c.mapa.id, id)}?removidoEm=${encodeURIComponent(new Date().toISOString())}`, tEditor, { method: "DELETE" });
  const depois = await req(`${url(c.mapa.id)}?desde=${encodeURIComponent(cursor)}`, tLeitor);
  const achado = depois.corpo.pins.find((p) => p.id === id);
  assert.ok(achado && achado.removidoEm);
  assert.equal((await req(`${url(c.mapa.id)}?desde=abc`, tLeitor)).status, 400);
});

test("relógio adiantado do aparelho não congela o pin: datas futuras são limitadas a agora + 5 min", async () => {
  const id = randomUUID();
  const doisDias = new Date(Date.now() + 2 * 24 * 3600 * 1000).toISOString();
  const r = await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo({ criadoEm: doisDias, atualizadoEm: doisDias, titulo: "Futuro" }) });
  assert.equal(r.status, 200);
  const { rows } = await pool.query(
    `SELECT criado_em <= now() + interval '5 minutes 1 second' AS criado_ok,
            atualizado_em <= now() + interval '5 minutes 1 second' AS atualizado_ok
     FROM pins WHERE id = $1`,
    [id]
  );
  assert.ok(rows[0].criado_ok, "criado_em limitado");
  assert.ok(rows[0].atualizado_ok, "atualizado_em limitado");
  // Uma edição real feita depois (relógio certo, só além da janela de 5 min
  // do servidor) ainda vence — antes da limitação, a data de +2 dias
  // bloqueava qualquer edição de todo mundo até lá.
  await new Promise((ok) => setTimeout(ok, 20));
  const depois = new Date(Date.now() + 6 * 60 * 1000).toISOString();
  const ed = await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo({ criadoEm: doisDias, atualizadoEm: depois, titulo: "Corrigido" }) });
  assert.equal(ed.status, 200);
  assert.equal(ed.corpo.pin.titulo, "Corrigido");

  const del = await req(`${url(c.mapa.id, id)}?removidoEm=${encodeURIComponent(doisDias)}`, tEditor, { method: "DELETE" });
  assert.equal(del.status, 200);
  const rem = await pool.query(`SELECT removido_em <= now() + interval '5 minutes 1 second' AS ok FROM pins WHERE id = $1`, [id]);
  assert.ok(rem.rows[0].ok, "removido_em limitado");
});
