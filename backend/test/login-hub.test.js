import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import http from "node:http";
import { pool, iniciarServidor, req, tokenPara } from "./helpers.js";
import { limparCacheAtivos } from "../src/middleware/auth.js";

// Supabase do Hub de mentira: token "ok-<email>" vale; "prov-<email>" é senha provisória.
let hubFalso, srv;
const sufixo = `t${Date.now()}`;
before(async () => {
  hubFalso = http.createServer((rq, rs) => {
    const token = (rq.headers.authorization || "").replace("Bearer ", "");
    const [tipo, email] = token.split(/-(.+)/);
    rs.setHeader("Content-Type", "application/json");
    if (rq.url.startsWith("/auth/v1/user")) {
      if (tipo !== "ok" && tipo !== "prov") { rs.statusCode = 401; return rs.end("{}"); }
      return rs.end(JSON.stringify({ id: "00000000-0000-0000-0000-000000000001", email }));
    }
    if (rq.url.startsWith("/rest/v1/usuarios")) return rs.end(JSON.stringify([{ precisa_trocar_senha: tipo === "prov" }]));
    rs.statusCode = 404; rs.end("{}");
  });
  await new Promise((r) => hubFalso.listen(0, r));
  process.env.HUB_SUPABASE_URL = `http://127.0.0.1:${hubFalso.address().port}`;
  process.env.HUB_SUPABASE_ANON_KEY = "chave-publica";
  delete process.env.LOGIN_LOCAL;
  srv = await iniciarServidor();
});
after(async () => {
  await pool.query("DELETE FROM usuarios WHERE email LIKE $1", [`%${sufixo}%`]);
  await srv.fechar();
  hubFalso.close();
});

async function criar(nome, status = "ativo") {
  const { rows } = await pool.query(
    "INSERT INTO usuarios (nome, email, senha_hash, papel, status) VALUES ($1, $2, '!hub', 'usuario', $3) RETURNING id, nome, papel",
    [nome, `${nome}-${sufixo}@t.local`, status]);
  return rows[0];
}

test("token válido do Hub vira token do GeoMap", async () => {
  await criar("ana");
  const r = await req(`${srv.url}/auth/hub`, null, { method: "POST", body: { accessToken: `ok-ANA-${sufixo}@t.local` } });
  assert.equal(r.status, 200);
  assert.ok(r.corpo.token);
  assert.equal(r.corpo.usuario.email, `ana-${sufixo}@t.local`);
  const mapas = await req(`${srv.url}/mapas`, r.corpo.token);
  assert.equal(mapas.status, 200);
});

test("token inválido: 401", async () => {
  const r = await req(`${srv.url}/auth/hub`, null, { method: "POST", body: { accessToken: "lixo" } });
  assert.equal(r.status, 401);
});

test("senha provisória: 403 com precisaTrocarSenha", async () => {
  await criar("beto");
  const r = await req(`${srv.url}/auth/hub`, null, { method: "POST", body: { accessToken: `prov-beto-${sufixo}@t.local` } });
  assert.equal(r.status, 403);
  assert.equal(r.corpo.precisaTrocarSenha, true);
});

test("sem cadastro ativo no GeoMap: 403", async () => {
  await criar("caio", "inativo");
  const r = await req(`${srv.url}/auth/hub`, null, { method: "POST", body: { accessToken: `ok-caio-${sufixo}@t.local` } });
  assert.equal(r.status, 403);
  const r2 = await req(`${srv.url}/auth/hub`, null, { method: "POST", body: { accessToken: `ok-ninguem-${sufixo}@t.local` } });
  assert.equal(r2.status, 403);
});

test("login antigo desligado sem LOGIN_LOCAL", async () => {
  const r = await req(`${srv.url}/login`, null, { method: "POST", body: { email: "a@b", senha: "x" } });
  assert.equal(r.status, 410);
});

test("desativado perde o acesso mesmo com token válido", async () => {
  const u = await criar("duda");
  const token = tokenPara(u);
  limparCacheAtivos();
  assert.equal((await req(`${srv.url}/mapas`, token)).status, 200);
  await pool.query("UPDATE usuarios SET status = 'inativo' WHERE id = $1", [u.id]);
  limparCacheAtivos();
  const r = await req(`${srv.url}/mapas`, token);
  assert.equal(r.status, 401);
  assert.equal(r.corpo.erro, "acesso desativado");
});
