import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { iniciarServidor, pool } from "./helpers.js";
import { ponte } from "../src/lib/ponteDroneMgmt.js";

const TOKEN = "token-de-teste-da-ponte";
let srv;
before(async () => {
  process.env.PONTE_DM_TOKEN = TOKEN;
  srv = await iniciarServidor();
});
after(async () => {
  await srv.fechar();
  await pool.end();
});

test("sem token (ou com token errado) a ponte recusa", async () => {
  const sem = await fetch(`${srv.url}/ponte-dm/tarefas`);
  assert.equal(sem.status, 401);
  const errado = await fetch(`${srv.url}/ponte-dm/tarefas`, { headers: { "x-ponte-token": "outro" } });
  assert.equal(errado.status, 401);
});

test("pedido vai pela ponte e a resposta grande (> 100 KB) volta inteira", async () => {
  const consulta = fetch(`${srv.url}/ponte-dm/tarefas`, { headers: { "x-ponte-token": TOKEN } }).then((r) => r.json());
  await new Promise((r) => setTimeout(r, 50)); // o long-poll chega primeiro e conecta a ponte
  const resposta = ponte.chamar({ method: "GET", caminho: "/portal/api/teste", params: { pageNumber: 1 } });
  const { tarefas } = await consulta;
  assert.equal(tarefas.length, 1);
  assert.equal(tarefas[0].caminho, "/portal/api/teste");

  const grande = JSON.stringify({ value: Array.from({ length: 4000 }, (_, i) => ({ id: i, texto: "x".repeat(40) })) });
  assert.ok(grande.length > 100_000);
  const post = await fetch(`${srv.url}/ponte-dm/tarefas/${tarefas[0].id}`, {
    method: "POST",
    headers: { "x-ponte-token": TOKEN, "Content-Type": "application/json" },
    body: JSON.stringify({ status: 200, contentType: "application/json", corpo: grande }),
  });
  assert.equal(post.status, 200);
  const resultado = await resposta;
  assert.equal(resultado.status, 200);
  assert.equal(JSON.parse(resultado.corpo).value.length, 4000);
});
