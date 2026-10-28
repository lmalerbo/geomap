import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarCenario, limparCenario, iniciarServidor, tokenPara, req, pool } from "./helpers.js";

// Com a ponte do DroneManagement desligada, o apontamento não pode sair
// como sucesso/falha por item: responde 503 e o app guarda o lote na fila.
const DM_VIA_PONTE_ANTERIOR = process.env.DM_VIA_PONTE;
let c, srv, tPiloto;

before(async () => {
  c = await criarCenario();
  await pool.query("INSERT INTO pilotos_dronemgmt (usuario_id, pilot_user_ad_id) VALUES ($1, $2)", [c.editor.id, randomUUID()]);
  srv = await iniciarServidor();
  tPiloto = tokenPara(c.editor);
});
after(async () => {
  if (DM_VIA_PONTE_ANTERIOR === undefined) delete process.env.DM_VIA_PONTE;
  else process.env.DM_VIA_PONTE = DM_VIA_PONTE_ANTERIOR;
  await srv.fechar();
  await pool.query("DELETE FROM pilotos_dronemgmt WHERE usuario_id = $1", [c.editor.id]);
  await limparCenario(c);
  await pool.end();
});

test("ponte desligada: apontamento responde 503 com ponteDesligada, sem chamar o DroneManagement", async () => {
  process.env.DM_VIA_PONTE = "1";
  const r = await req(`${srv.url}/voos/apontamentos`, tPiloto, {
    method: "POST",
    body: {
      mapaId: c.mapa.id,
      dataVoo: new Date().toISOString(),
      registros: [{ id: "123", secao: "10", talhao: "1" }],
    },
  });
  assert.equal(r.status, 503);
  assert.equal(r.corpo.ponteDesligada, true);
  assert.match(r.corpo.erro, /ponte/);
});
