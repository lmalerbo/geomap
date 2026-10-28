import { test } from "node:test";
import assert from "node:assert/strict";
import { criarPonte, resultadoParaResponse } from "../src/lib/ponteDroneMgmt.js";

test("sem o servidor geo consultando, o pedido falha na hora com mensagem clara", async () => {
  const p = criarPonte();
  await assert.rejects(p.chamar({ method: "GET", caminho: "/x" }), /ponte .* desligada/);
});

test("pedido feito com a ponte esperando é entregue na hora e a resposta volta pra quem pediu", async () => {
  const p = criarPonte();
  const espera = p.pegarTarefas(1000);
  const resposta = p.chamar({ method: "GET", caminho: "/portal/x", params: { a: 1 } });
  const [tarefa] = await espera;
  assert.equal(tarefa.caminho, "/portal/x");
  assert.deepEqual(tarefa.params, { a: 1 });
  assert.equal(p.responder(tarefa.id, { status: 200, contentType: "application/json", corpo: '{"ok":1}' }), true);
  const r = resultadoParaResponse(await resposta);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { ok: 1 });
});

test("pedidos feitos entre duas consultas saem juntos no próximo lote", async () => {
  const p = criarPonte();
  await p.pegarTarefas(5); // conecta e volta vazio
  const a = p.chamar({ caminho: "/a" });
  const b = p.chamar({ caminho: "/b" });
  const lote = await p.pegarTarefas(1000);
  assert.deepEqual(lote.map((t) => t.caminho), ["/a", "/b"]);
  for (const t of lote) p.responder(t.id, { status: 200, corpo: t.caminho });
  assert.equal((await a).corpo, "/a");
  assert.equal((await b).corpo, "/b");
});

test("pedido sem resposta expira e sai da fila", async () => {
  const p = criarPonte({ tempoRespostaMs: 30 });
  await p.pegarTarefas(5);
  await assert.rejects(p.chamar({ caminho: "/lento" }), /não respondeu a tempo/);
  assert.deepEqual(await p.pegarTarefas(5), [], "tarefa expirada não é entregue depois");
});

test("ponte que parou de consultar volta a contar como desligada", async () => {
  let t = 1000;
  const p = criarPonte({ tempoConectadaMs: 100, agora: () => t });
  await p.pegarTarefas(1);
  assert.equal(p.estado().conectada, true);
  t += 500;
  assert.equal(p.estado().conectada, false);
  await assert.rejects(p.chamar({ caminho: "/x" }), /desligada/);
});

test("resposta para pedido já expirado é ignorada", () => {
  const p = criarPonte();
  assert.equal(p.responder("nao-existe", { status: 200 }), false);
});

// Caso real (2026-10-09): o PUT do apontamento volta 204 sem conteúdo; o
// servidor geo repassa corpo "" e o Response quebrava com "Invalid response
// status code 204" — 11 apontamentos gravados no DroneManagement apareceram
// como falha no app.
test("resposta sem conteúdo (204) vira Response ok", async () => {
  const r = resultadoParaResponse({ status: 204, contentType: null, corpo: "" });
  assert.equal(r.status, 204);
  assert.equal(r.ok, true);
  assert.equal(await r.text(), "");
});
