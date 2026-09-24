import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { criarCenario, limparCenario, pool } from "./helpers.js";
import { usuarioPodeVerMapa, usuarioPodeEditarMapa, usuarioTemPermissaoMapa, mapaExiste } from "../src/lib/permissoes.js";

let c;
before(async () => {
  c = await criarCenario();
});
after(async () => {
  await limparCenario(c);
  await pool.end();
});

test("leitor vê mas não edita", async () => {
  assert.equal(await usuarioPodeVerMapa(c.leitor.id, c.mapa.id, "usuario"), true);
  assert.equal(await usuarioPodeEditarMapa(c.leitor.id, c.mapa.id, "usuario"), false);
});

test("editor vê e edita", async () => {
  assert.equal(await usuarioPodeVerMapa(c.editor.id, c.mapa.id, "usuario"), true);
  assert.equal(await usuarioPodeEditarMapa(c.editor.id, c.mapa.id, "usuario"), true);
});

test("usuário sem grupo não vê nem edita", async () => {
  assert.equal(await usuarioPodeVerMapa(c.semGrupo.id, c.mapa.id, "usuario"), false);
  assert.equal(await usuarioPodeEditarMapa(c.semGrupo.id, c.mapa.id, "usuario"), false);
  assert.equal(await usuarioTemPermissaoMapa(c.semGrupo.id, c.mapa.id), false);
});

test("admin vê e edita qualquer mapa existente, mas não mapa inexistente", async () => {
  assert.equal(await usuarioPodeEditarMapa(c.admin.id, c.mapa.id, "admin"), true);
  assert.equal(await usuarioPodeVerMapa(c.admin.id, c.mapa.id, "admin"), true);
  assert.equal(await usuarioPodeEditarMapa(c.admin.id, 999999999, "admin"), false);
  assert.equal(await mapaExiste(999999999), false);
});
