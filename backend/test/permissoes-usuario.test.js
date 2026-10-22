import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { criarCenario, limparCenario, iniciarServidor, tokenPara, req, pool } from "./helpers.js";
import { usuarioPodeEditarMapa } from "../src/lib/permissoes.js";

// O download assina a URL offline: precisa de valores de R2, mas não toca na rede.
process.env.R2_BUCKET_NAME ||= "teste-local";
process.env.R2_ACCOUNT_ID ||= "teste-local";
process.env.R2_ACCESS_KEY_ID ||= "teste-local";
process.env.R2_SECRET_ACCESS_KEY ||= "teste-local";

// Acesso individual (permissoes_usuario) soma ao dos grupos. O cenário já
// tem leitor e editor por grupo em `mapa`; `mapa2` é só deste arquivo (sem grupo).
let c, srv, mapa2, camada2;
before(async () => {
  c = await criarCenario();
  srv = await iniciarServidor();
  mapa2 = (await pool.query(`INSERT INTO mapas (nome) VALUES ($1) RETURNING id`, [`__mapa2_${c.sufixo}`])).rows[0];
  camada2 = (
    await pool.query(`INSERT INTO camadas (mapa_id, nome, versao, arquivo_path) VALUES ($1, $2, '1', $3) RETURNING id`, [
      mapa2.id,
      `__camada2_${c.sufixo}`,
      `__camada2_${c.sufixo}.pmtiles`,
    ])
  ).rows[0];
});
after(async () => {
  await pool.query("DELETE FROM permissoes_usuario WHERE mapa_id = $1", [mapa2.id]);
  await pool.query("DELETE FROM logs WHERE camada_id = $1", [camada2.id]);
  await pool.query("DELETE FROM camadas WHERE id = $1", [camada2.id]);
  await srv.fechar();
  await limparCenario(c);
  await pool.query("DELETE FROM mapas WHERE id = $1", [mapa2.id]);
  await pool.end();
});

async function concederIndividual(usuario, mapa, podeEditar) {
  await pool.query("INSERT INTO permissoes_usuario (usuario_id, mapa_id, pode_editar) VALUES ($1, $2, $3)", [usuario, mapa, podeEditar]);
}
async function retirarIndividual(usuario, mapa) {
  await pool.query("DELETE FROM permissoes_usuario WHERE usuario_id = $1 AND mapa_id = $2", [usuario, mapa]);
}

test("individual dá acesso a um mapa que nenhum grupo dá", async () => {
  await concederIndividual(c.leitor.id, mapa2.id, false);
  try {
    const lista = await req(`${srv.url}/mapas`, tokenPara(c.leitor));
    const m = lista.corpo.find((x) => x.id === mapa2.id);
    assert.ok(m, "mapa2 aparece no catálogo");
    assert.equal(m.podeEditar, false);
    const download = await req(`${srv.url}/camadas/${camada2.id}/download`, tokenPara(c.leitor));
    assert.equal(download.status, 200);
  } finally {
    await retirarIndividual(c.leitor.id, mapa2.id);
  }
});

test("individual com pode_editar libera edição", async () => {
  await concederIndividual(c.leitor.id, mapa2.id, true);
  try {
    assert.equal(await usuarioPodeEditarMapa(c.leitor.id, mapa2.id, "usuario"), true);
  } finally {
    await retirarIndividual(c.leitor.id, mapa2.id);
  }
});

test("individual não rebaixa quem já edita pelo grupo, e não duplica o mapa", async () => {
  await concederIndividual(c.editor.id, c.mapa.id, false);
  try {
    const lista = await req(`${srv.url}/mapas`, tokenPara(c.editor));
    const iguais = lista.corpo.filter((x) => x.id === c.mapa.id);
    assert.equal(iguais.length, 1, "sem duplicar mapa");
    assert.equal(iguais[0].podeEditar, true);
  } finally {
    await retirarIndividual(c.editor.id, c.mapa.id);
  }
});

test("sem individual, nada muda: o mapa some do catálogo depois de apagar a linha", async () => {
  await concederIndividual(c.leitor.id, mapa2.id, false);
  await retirarIndividual(c.leitor.id, mapa2.id);
  const lista = await req(`${srv.url}/mapas`, tokenPara(c.leitor));
  assert.equal(lista.corpo.some((x) => x.id === mapa2.id), false);
  const download = await req(`${srv.url}/camadas/${camada2.id}/download`, tokenPara(c.leitor));
  assert.equal(download.status, 404);
});
