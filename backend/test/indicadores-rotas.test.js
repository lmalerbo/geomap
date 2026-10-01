import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarCenario, limparCenario, iniciarServidor, tokenPara, req, pool } from "./helpers.js";
import { definirFonteParaTestes } from "../src/lib/fonteIndicadoresVoo.js";

process.env.INDICADORES_TOKEN = "chave-indicadores-teste";
process.env.HUB_INTEGRACAO_TOKEN = "chave-hub-teste";

const PILOTO_EDITOR = randomUUID();
const PILOTO_OUTRO = randomUUID();
let c, srv, tPiloto, tLeitor, tAdmin;
let falhar = false;

before(async () => {
  c = await criarCenario();
  await pool.query("INSERT INTO pilotos_dronemgmt (usuario_id, pilot_user_ad_id) VALUES ($1, $2)", [c.editor.id, PILOTO_EDITOR]);
  definirFonteParaTestes(() => {
    if (falhar) throw new Error("fora do ar");
    return {
      atualizadoEm: "2026-10-01T12:00:00.000Z",
      desatualizado: false,
      realizados: [
        { id: "1", dataVoo: new Date().toISOString(), pilotoId: PILOTO_EDITOR, tipo: "Falhas Soca", areaHa: 10, propriedade: "PROPRIA" },
        { id: "2", dataVoo: new Date().toISOString(), pilotoId: PILOTO_OUTRO, tipo: "Falhas Soca", areaHa: 30, propriedade: "PROPRIA" },
      ],
      pendentes: [{ id: "p", projeto: "Falhas Soca", areaHa: 60, propriedade: "PROPRIA" }],
    };
  });
  srv = await iniciarServidor();
  tPiloto = tokenPara(c.editor);
  tLeitor = tokenPara(c.leitor);
  tAdmin = tokenPara(c.admin);
});
after(async () => {
  definirFonteParaTestes(null);
  await srv.fechar();
  await pool.query("DELETE FROM pilotos_dronemgmt WHERE usuario_id = $1", [c.editor.id]);
  await limparCenario(c);
  await pool.end();
});

const url = (q = "") => `${srv.url}/voos/indicadores${q}`;

test("acesso: piloto e admin podem ver; usuário comum não", async () => {
  assert.deepEqual((await req(`${srv.url}/voos/indicadores/acesso`, tPiloto)).corpo, { podeVer: true, ehAdmin: false, ehPiloto: true });
  assert.deepEqual((await req(`${srv.url}/voos/indicadores/acesso`, tAdmin)).corpo, { podeVer: true, ehAdmin: true, ehPiloto: false });
  assert.deepEqual((await req(`${srv.url}/voos/indicadores/acesso`, tLeitor)).corpo, { podeVer: false, ehAdmin: false, ehPiloto: false });
});

test("usuário comum recebe 403", async () => {
  assert.equal((await req(url(), tLeitor)).status, 403);
});

test("piloto recebe painel da equipe + o próprio rendimento, sem porPiloto, mesmo pedindo outro piloto", async () => {
  const r = await req(url(`?piloto=${PILOTO_OUTRO}`), tPiloto);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.resumo.realizadoHa, 40);
  assert.equal(r.corpo.meuRendimento.pilotoId, PILOTO_EDITOR);
  assert.equal(r.corpo.meuRendimento.ha, 10);
  assert.equal(r.corpo.meuRendimento.piloto, c.editor.nome);
  assert.equal(r.corpo.porPiloto, undefined);
  assert.equal(r.corpo.atualizadoEm, "2026-10-01T12:00:00.000Z");
});

test("admin recebe porPiloto e pode escolher um piloto", async () => {
  const r = await req(url(`?piloto=${PILOTO_OUTRO}`), tAdmin);
  assert.equal(r.status, 200);
  assert.equal(r.corpo.porPiloto.length, 2);
  assert.equal(r.corpo.meuRendimento.ha, 30);
  const semPiloto = await req(url(), tAdmin);
  assert.equal(semPiloto.corpo.meuRendimento, undefined);
});

test("período e piloto inválidos dão 400", async () => {
  assert.equal((await req(url("?de=2026-06-01&ate=2026-05-01"), tAdmin)).status, 400);
  assert.equal((await req(url("?de=ontem&ate=hoje"), tAdmin)).status, 400);
  assert.equal((await req(url("?piloto=nao-e-uuid"), tAdmin)).status, 400);
});

test("DroneManagement sem cache vira 502 com mensagem amigável", async () => {
  falhar = true;
  try {
    const r = await req(url(), tAdmin);
    assert.equal(r.status, 502);
    assert.match(r.corpo.erro, /DroneManagement/);
  } finally {
    falhar = false;
  }
});

async function reqAgente(token, caminho = "/integracao/voos/indicadores") {
  const resp = await fetch(`${srv.url}${caminho}`, { headers: token ? { "x-indicadores-token": token } : {} });
  return { status: resp.status, corpo: await resp.json() };
}

test("API do agente: exige a chave própria e devolve porPiloto sem meuRendimento", async () => {
  assert.equal((await reqAgente(null)).status, 401);
  assert.equal((await reqAgente("chave-hub-teste")).status, 401);
  const r = await reqAgente("chave-indicadores-teste");
  assert.equal(r.status, 200);
  assert.equal(r.corpo.porPiloto.length, 2);
  assert.equal(r.corpo.meuRendimento, undefined);
  assert.equal(r.corpo.resumo.aVoarHa, 60);
});

test("a chave de indicadores não abre as rotas do Hub", async () => {
  const resp = await fetch(`${srv.url}/integracao/dronemgmt/situacao`, {
    method: "POST",
    headers: { "x-hub-token": "chave-indicadores-teste", "Content-Type": "application/json" },
    body: "{}",
  });
  assert.equal(resp.status, 401);
});
