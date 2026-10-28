import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { pool, iniciarServidor, req, tokenPara } from "./helpers.js";

process.env.HUB_INTEGRACAO_TOKEN = "chave-teste-hub";
const H = { "x-hub-token": "chave-teste-hub", "Content-Type": "application/json" };
let srv;
const sufixo = `t${Date.now()}`;

before(async () => { srv = await iniciarServidor(); });
after(async () => {
  await pool.query("DELETE FROM usuarios WHERE email LIKE $1", [`%${sufixo}%`]);
  await pool.query("DELETE FROM grupos WHERE nome LIKE $1", [`%${sufixo}%`]);
  await srv.fechar();
});

async function put(corpo, headers = H) {
  const r = await fetch(`${srv.url}/integracao/contas/usuario`, { method: "PUT", headers, body: JSON.stringify(corpo) });
  return { status: r.status, corpo: await r.json() };
}

test("sem a chave do Hub: 401", async () => {
  const r = await put({ email: `x-${sufixo}@t.local`, nome: "X", ativo: true }, { "Content-Type": "application/json" });
  assert.equal(r.status, 401);
});

test("cria pessoa ativa com grupos, sem senha utilizável", async () => {
  const g = (await pool.query("INSERT INTO grupos (nome) VALUES ($1) RETURNING id", [`g-${sufixo}`])).rows[0];
  const r = await put({ email: ` Nova-${sufixo}@T.local `, nome: "Nova", ativo: true, admin: false, grupoIds: [g.id, 999999] });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.criado, true);
  const u = (await pool.query("SELECT status, papel, senha_hash FROM usuarios WHERE email = $1", [`nova-${sufixo}@t.local`])).rows[0];
  assert.deepEqual([u.status, u.papel, u.senha_hash], ["ativo", "usuario", "!hub"]);
  const gs = (await pool.query("SELECT grupo_id FROM usuarios_grupos WHERE usuario_id = $1", [r.corpo.id])).rows.map((x) => x.grupo_id);
  assert.deepEqual(gs, [g.id]); // grupo inexistente é ignorado
});

test("pessoa inexistente e inativa: não cria nada", async () => {
  const r = await put({ email: `nada-${sufixo}@t.local`, nome: "Nada", ativo: false });
  assert.deepEqual(r.corpo, { ok: true, criado: false });
  assert.equal((await pool.query("SELECT 1 FROM usuarios WHERE email = $1", [`nada-${sufixo}@t.local`])).rowCount, 0);
});

test("desativar existente mantém a pessoa e tira os grupos", async () => {
  await put({ email: `sai-${sufixo}@t.local`, nome: "Sai", ativo: true, grupoIds: [] });
  const r = await put({ email: `sai-${sufixo}@t.local`, nome: "Sai", ativo: false, grupoIds: [] });
  assert.equal(r.status, 200);
  assert.equal((await pool.query("SELECT status FROM usuarios WHERE email = $1", [`sai-${sufixo}@t.local`])).rows[0].status, "inativo");
});

test("não tira o último admin ativo", async () => {
  const { rows } = await pool.query("SELECT email FROM usuarios WHERE papel = 'admin' AND status = 'ativo'");
  await pool.query("UPDATE usuarios SET papel = 'usuario' WHERE papel = 'admin' AND status = 'ativo'");
  try {
    await put({ email: `adm-${sufixo}@t.local`, nome: "Adm", ativo: true, admin: true });
    const r = await put({ email: `adm-${sufixo}@t.local`, nome: "Adm", ativo: true, admin: false });
    assert.equal(r.status, 400);
    assert.match(r.corpo.erro, /último admin/);
  } finally {
    if (rows.length) await pool.query("UPDATE usuarios SET papel = 'admin' WHERE email = ANY($1)", [rows.map((x) => x.email)]);
  }
});

test("lista grupos e usuários", async () => {
  const g = await (await fetch(`${srv.url}/integracao/contas/grupos`, { headers: H })).json();
  assert.ok(g.some((x) => x.nome === `g-${sufixo}`));
  const u = await (await fetch(`${srv.url}/integracao/contas/usuarios`, { headers: H })).json();
  const nova = u.find((x) => x.email === `nova-${sufixo}@t.local`);
  assert.equal(nova.grupoIds.length, 1);
});

test("telas de usuário do admin travadas sem LOGIN_LOCAL", async () => {
  delete process.env.LOGIN_LOCAL;
  const adm = (await pool.query(
    "INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES ('Adm T', $1, 'x', 'admin') RETURNING id, nome, papel",
    [`admt-${sufixo}@t.local`])).rows[0];
  const r = await req(`${srv.url}/admin/usuarios`, tokenPara(adm), { method: "POST", body: { nome: "Z", email: `z-${sufixo}@t.local` } });
  assert.equal(r.status, 410);
});

test("PUT com mapas grava acesso individual; sem mapas mantém; ativo false apaga", async () => {
  const mapa = (await pool.query("INSERT INTO mapas (nome) VALUES ($1) RETURNING id", [`__mapa_put_${sufixo}`])).rows[0];
  const email = `mapas-${sufixo}@t.local`;
  const linhas = async (usuarioId) =>
    (await pool.query("SELECT mapa_id, pode_editar FROM permissoes_usuario WHERE usuario_id = $1", [usuarioId])).rows;
  try {
    const r1 = await put({ email, nome: "Mapas", ativo: true, grupoIds: [], mapas: [{ mapaId: mapa.id, podeEditar: true }] });
    assert.equal(r1.status, 200);
    assert.deepEqual(await linhas(r1.corpo.id), [{ mapa_id: mapa.id, pode_editar: true }]);

    const r2 = await put({ email, nome: "Mapas", ativo: true, grupoIds: [] });
    assert.equal(r2.status, 200);
    assert.deepEqual(await linhas(r1.corpo.id), [{ mapa_id: mapa.id, pode_editar: true }], "sem mapas: mantém");

    const r3 = await put({ email, nome: "Mapas", ativo: false, grupoIds: [] });
    assert.equal(r3.status, 200);
    assert.deepEqual(await linhas(r1.corpo.id), [], "ativo false: apaga");
  } finally {
    await pool.query("DELETE FROM mapas WHERE id = $1", [mapa.id]);
  }
});

test("GET usuarios devolve os mapas individuais de cada pessoa", async () => {
  const mapa = (await pool.query("INSERT INTO mapas (nome) VALUES ($1) RETURNING id", [`__mapa_lista_${sufixo}`])).rows[0];
  const email = `lista-mapas-${sufixo}@t.local`;
  try {
    await put({ email, nome: "Lista Mapas", ativo: true, grupoIds: [], mapas: [{ mapaId: mapa.id, podeEditar: false }] });
    const u = await (await fetch(`${srv.url}/integracao/contas/usuarios`, { headers: H })).json();
    const linha = u.find((x) => x.email === email);
    assert.deepEqual(linha.mapas, [{ mapaId: mapa.id, podeEditar: false }]);
  } finally {
    await pool.query("DELETE FROM mapas WHERE id = $1", [mapa.id]);
  }
});

test("GET contas/mapas lista cada mapa com os grupos e podeEditar", async () => {
  const g = (await pool.query("INSERT INTO grupos (nome) VALUES ($1) RETURNING id", [`gm-${sufixo}`])).rows[0];
  const mapa = (await pool.query("INSERT INTO mapas (nome) VALUES ($1) RETURNING id", [`__mapa_gm_${sufixo}`])).rows[0];
  await pool.query("INSERT INTO permissoes (mapa_id, grupo_id, pode_editar) VALUES ($1, $2, true)", [mapa.id, g.id]);
  try {
    const lista = await (await fetch(`${srv.url}/integracao/contas/mapas`, { headers: H })).json();
    const m = lista.find((x) => x.id === mapa.id);
    assert.equal(m.nome, `__mapa_gm_${sufixo}`);
    assert.deepEqual(m.grupos, [{ grupoId: g.id, podeEditar: true }]);
  } finally {
    await pool.query("DELETE FROM mapas WHERE id = $1", [mapa.id]);
    await pool.query("DELETE FROM grupos WHERE id = $1", [g.id]);
  }
});

test("rotas de mapas e usuários sem x-hub-token: 401", async () => {
  for (const rota of ["/integracao/contas/mapas", "/integracao/contas/usuarios"]) {
    const r = await fetch(`${srv.url}${rota}`);
    assert.equal(r.status, 401, rota);
  }
});
