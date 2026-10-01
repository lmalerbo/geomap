import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { criarCenario, limparCenario, iniciarServidor, tokenPara, req, pool } from "./helpers.js";

let c, srv;
before(async () => {
  c = await criarCenario();
  srv = await iniciarServidor();
});
after(async () => {
  await srv.fechar();
  await pool.query("DELETE FROM camadas WHERE mapa_id = $1", [c.mapa.id]);
  await limparCenario(c);
  await pool.end();
});

test("usuário comum não acessa a Visão geral", async () => {
  const r = await req(`${srv.url}/admin/visao-geral`, tokenPara(c.leitor));
  assert.equal(r.status, 403);
});

test("Visão geral devolve totais, saúde da automação e atividade", async () => {
  const r = await req(`${srv.url}/admin/visao-geral`, tokenPara(c.admin));
  assert.equal(r.status, 200);
  assert.ok(Number.isInteger(r.corpo.totais.mapas));
  assert.equal(r.corpo.automacao.dias.length, r.corpo.automacao.diasHistorico);
  assert.ok(Array.isArray(r.corpo.automacao.camadas));
  assert.ok(Array.isArray(r.corpo.atividade));
});

test("lista de usuários traz último acesso e piloto; vínculo de piloto grava e desfaz", async () => {
  const t = tokenPara(c.admin);
  await pool.query("INSERT INTO logs (usuario_id, acao, ip) VALUES ($1, 'login', '127.0.0.1')", [c.leitor.id]);

  const invalido = await req(`${srv.url}/admin/usuarios/${c.leitor.id}/piloto`, t, { method: "PUT", body: { pilotUserADId: "abc" } });
  assert.equal(invalido.status, 400);

  const id = "11111111-2222-3333-4444-555555555555";
  const ok = await req(`${srv.url}/admin/usuarios/${c.leitor.id}/piloto`, t, { method: "PUT", body: { pilotUserADId: id } });
  assert.equal(ok.status, 200);

  let lista = await req(`${srv.url}/admin/usuarios`, t);
  let u = lista.corpo.find((x) => x.id === c.leitor.id);
  assert.equal(u.pilotUserADId, id);
  assert.ok(u.ultimoAcesso, "último acesso vem do login registrado");

  await req(`${srv.url}/admin/usuarios/${c.leitor.id}/piloto`, t, { method: "PUT", body: { pilotUserADId: "" } });
  lista = await req(`${srv.url}/admin/usuarios`, t);
  u = lista.corpo.find((x) => x.id === c.leitor.id);
  assert.equal(u.pilotUserADId, null);
});

test("versões de camada: lista as guardadas e recusa versão de outra camada", async () => {
  const t = tokenPara(c.admin);
  const ins = (nome) =>
    pool.query(`INSERT INTO camadas (mapa_id, nome, versao, arquivo_path) VALUES ($1, $2, '1', $3) RETURNING id`, [
      c.mapa.id,
      nome,
      `__${nome}_${c.sufixo}.pmtiles`,
    ]);
  const a = (await ins("a")).rows[0];
  const b = (await ins("b")).rows[0];
  const { rows } = await pool.query(
    `INSERT INTO versoes_camada (camada_id, chave, versao, usuario_id) VALUES ($1, 'x.bak-1', '0.9', $2) RETURNING id`,
    [a.id, c.admin.id]
  );

  const lista = await req(`${srv.url}/admin/camadas/${a.id}/versoes`, t);
  assert.equal(lista.status, 200);
  assert.equal(lista.corpo.length, 1);
  assert.equal(lista.corpo[0].versao, "0.9");
  assert.ok(lista.corpo[0].usuarioNome);

  const errada = await req(`${srv.url}/admin/camadas/${b.id}/versoes/${rows[0].id}/restaurar`, t, { method: "POST" });
  assert.equal(errada.status, 404);
});
