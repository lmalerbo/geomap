import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { exigirAutenticacao, exigirAdmin } from "../middleware/auth.js";
import { usuarioPodeVerMapa, mapaExiste } from "../lib/permissoes.js";
import { validarPlanejamento, dataValida, hojeEmSaoPaulo } from "../lib/planejamentoVoo.js";

// Planejamento de voos no mapa — ver
// docs/superpowers/specs/2026-10-16-planejamento-voos-design.md.
// Montado antes do adminRouter (que intercepta tudo sem prefixo).
export const planejamentosRouter = Router();

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SELECT = `
  SELECT p.*, to_char(p.data, 'YYYY-MM-DD') AS data_texto, u.nome AS criado_por_nome
  FROM planejamentos_voo p LEFT JOIN usuarios u ON u.id = p.criado_por`;

function mapear(r) {
  return {
    id: r.id,
    mapaId: r.mapa_id,
    data: r.data_texto,
    poligono: r.poligono,
    talhoes: r.talhoes,
    criadoPorNome: r.criado_por_nome,
    criadoEm: r.criado_em,
    atualizadoEm: r.atualizado_em,
  };
}

async function auditar(usuarioId, detalhe, ip) {
  await pool.query("INSERT INTO logs (usuario_id, acao, detalhe, ip) VALUES ($1, 'admin', $2, $3)", [usuarioId, detalhe, ip]);
}

planejamentosRouter.get("/mapas/:mapaId/planejamentos", exigirAutenticacao, async (req, res) => {
  const mapaId = Number(req.params.mapaId);
  if (!Number.isInteger(mapaId) || !(await usuarioPodeVerMapa(req.usuarioId, mapaId, req.usuarioPapel))) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }
  const { rows } = await pool.query(`${SELECT} WHERE p.mapa_id = $1 AND p.data >= $2::date ORDER BY p.data, p.criado_em`, [mapaId, hojeEmSaoPaulo()]);
  res.json({ planejamentos: rows.map(mapear) });
});

planejamentosRouter.post("/admin/mapas/:mapaId/planejamentos", exigirAutenticacao, exigirAdmin, async (req, res) => {
  const mapaId = Number(req.params.mapaId);
  if (!Number.isInteger(mapaId) || !(await mapaExiste(mapaId))) return res.status(404).json({ erro: "mapa não encontrado" });
  const erro = validarPlanejamento(req.body);
  if (erro) return res.status(400).json({ erro });
  const { data, poligono, talhoes } = req.body;
  const id = randomUUID();
  await pool.query(
    "INSERT INTO planejamentos_voo (id, mapa_id, data, poligono, talhoes, criado_por) VALUES ($1, $2, $3, $4, $5, $6)",
    [id, mapaId, data, JSON.stringify(poligono), JSON.stringify(talhoes), req.usuarioId]
  );
  await auditar(req.usuarioId, `planejamento criado: mapa ${mapaId}, ${data}, ${talhoes.length} talhões`, req.ip);
  const { rows } = await pool.query(`${SELECT} WHERE p.id = $1`, [id]);
  res.status(201).json({ planejamento: mapear(rows[0]) });
});

planejamentosRouter.put("/admin/planejamentos/:id", exigirAutenticacao, exigirAdmin, async (req, res) => {
  if (!REGEX_UUID.test(req.params.id)) return res.status(404).json({ erro: "planejamento não encontrado" });
  const data = req.body?.data;
  if (!dataValida(data)) {
    return res.status(400).json({ erro: "data inválida (use AAAA-MM-DD)" });
  }
  const r = await pool.query("UPDATE planejamentos_voo SET data = $2, atualizado_em = now() WHERE id = $1", [req.params.id, data]);
  if (r.rowCount === 0) return res.status(404).json({ erro: "planejamento não encontrado" });
  await auditar(req.usuarioId, `planejamento ${req.params.id} mudou para ${data}`, req.ip);
  const { rows } = await pool.query(`${SELECT} WHERE p.id = $1`, [req.params.id]);
  res.json({ planejamento: mapear(rows[0]) });
});

planejamentosRouter.delete("/admin/planejamentos/:id", exigirAutenticacao, exigirAdmin, async (req, res) => {
  if (!REGEX_UUID.test(req.params.id)) return res.status(404).json({ erro: "planejamento não encontrado" });
  const r = await pool.query("DELETE FROM planejamentos_voo WHERE id = $1 RETURNING mapa_id, to_char(data, 'YYYY-MM-DD') AS data", [req.params.id]);
  if (r.rowCount === 0) return res.status(404).json({ erro: "planejamento não encontrado" });
  await auditar(req.usuarioId, `planejamento apagado: mapa ${r.rows[0].mapa_id}, ${r.rows[0].data}`, req.ip);
  res.json({ ok: true });
});
