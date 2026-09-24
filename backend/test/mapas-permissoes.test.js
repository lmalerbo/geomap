import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarCenario, limparCenario, iniciarServidor, tokenPara, req, pool } from "./helpers.js";

let c, srv;
before(async () => {
  c = await criarCenario();
  srv = await iniciarServidor();
});
after(async () => {
  await srv.fechar();
  await limparCenario(c);
  await pool.end();
});

test("GET /mapas informa podeEditar por usuário", async () => {
  const doEditor = await req(`${srv.url}/mapas`, tokenPara(c.editor));
  const doLeitor = await req(`${srv.url}/mapas`, tokenPara(c.leitor));
  assert.equal(doEditor.corpo.find((m) => m.id === c.mapa.id).podeEditar, true);
  assert.equal(doLeitor.corpo.find((m) => m.id === c.mapa.id).podeEditar, false);
  assert.equal(doEditor.corpo.filter((m) => m.id === c.mapa.id).length, 1, "sem duplicar mapa");
});

test("admin grava e lê permissoes com podeEditar; grupoIds antigo continua aceito", async () => {
  const t = tokenPara(c.admin);
  const put = await req(`${srv.url}/admin/mapas/${c.mapa.id}`, t, {
    method: "PUT",
    body: { nome: `__mapa_${c.sufixo}`, permissoes: [{ grupoId: c.grupoLeitor.id, podeEditar: true }, { grupoId: c.grupoEditor.id, podeEditar: false }] },
  });
  assert.equal(put.status, 200);
  const lista = await req(`${srv.url}/admin/mapas`, t);
  const m = lista.corpo.find((x) => x.id === c.mapa.id);
  assert.deepEqual(
    m.permissoes.sort((a, b) => a.grupoId - b.grupoId),
    [{ grupoId: c.grupoEditor.id, podeEditar: false }, { grupoId: c.grupoLeitor.id, podeEditar: true }].sort((a, b) => a.grupoId - b.grupoId)
  );
  const legado = await req(`${srv.url}/admin/mapas/${c.mapa.id}`, t, { method: "PUT", body: { nome: `__mapa_${c.sufixo}`, grupoIds: [c.grupoEditor.id] } });
  assert.deepEqual(legado.corpo.permissoes, [{ grupoId: c.grupoEditor.id, podeEditar: false }]);
  // restaura o cenário
  await req(`${srv.url}/admin/mapas/${c.mapa.id}`, t, {
    method: "PUT",
    body: { nome: `__mapa_${c.sufixo}`, permissoes: [{ grupoId: c.grupoEditor.id, podeEditar: true }, { grupoId: c.grupoLeitor.id, podeEditar: false }] },
  });
});

test("duplicar mapa copia pode_editar e não copia pins", async () => {
  const t = tokenPara(c.admin);
  const agora = new Date().toISOString();
  await req(`${srv.url}/mapas/${c.mapa.id}/pins/${randomUUID()}`, tokenPara(c.editor), {
    method: "PUT",
    body: { icone: "toco", cor: "#000000", titulo: "Toco", nota: "", lng: -47, lat: -21, criadoEm: agora, atualizadoEm: agora },
  });
  const dup = await req(`${srv.url}/admin/mapas/${c.mapa.id}/duplicar`, t, { method: "POST" });
  assert.equal(dup.status, 201);
  assert.ok(dup.corpo.permissoes.some((p) => p.grupoId === c.grupoEditor.id && p.podeEditar === true));
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM pins WHERE mapa_id = $1`, [dup.corpo.id]);
  assert.equal(rows[0].n, 0);
  await pool.query(`DELETE FROM mapas WHERE id = $1`, [dup.corpo.id]);
});
