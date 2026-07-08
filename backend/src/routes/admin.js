import { Router } from "express";
import path from "node:path";
import { pool } from "../db/pool.js";
import { exigirAutenticacao, exigirAdmin } from "../middleware/auth.js";

export const adminRouter = Router();

const storageDir = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");

adminRouter.use(exigirAutenticacao, exigirAdmin);

// Placeholder: confirma que a proteção por papel funciona ponta a ponta.
adminRouter.get("/admin/ping", (req, res) => {
  res.json({ ok: true });
});

// Lista TODOS os mapas, sem filtro de grupo — admin gerencia qualquer
// camada, independente de pertencer aos grupos dele próprio.
adminRouter.get("/admin/mapas", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nome, versao, categoria, publicado_em FROM mapas ORDER BY nome`
  );
  res.json(rows);
});

// Baixa o .pmtiles de qualquer mapa (sem checar permissão de grupo) — o
// painel de admin usa isso só pra ler o metadata (campos disponíveis),
// não conta como download de usuário final (não grava log).
adminRouter.get("/admin/mapas/:id/arquivo", async (req, res) => {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "id de mapa inválido" });
  }

  const { rows } = await pool.query("SELECT arquivo_path FROM mapas WHERE id = $1", [mapaId]);
  const mapa = rows[0];
  if (!mapa) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }

  const arquivoAbsoluto = path.join(storageDir, mapa.arquivo_path);
  res.sendFile(arquivoAbsoluto, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ erro: "arquivo do mapa não encontrado no servidor" });
    }
  });
});

adminRouter.get("/admin/mapas/:id/atributos", async (req, res) => {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "id de mapa inválido" });
  }

  const { rows } = await pool.query("SELECT atributos_config FROM mapas WHERE id = $1", [mapaId]);
  if (!rows[0]) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }
  res.json({ atributos: rows[0].atributos_config || [] });
});

adminRouter.put("/admin/mapas/:id/atributos", async (req, res) => {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "id de mapa inválido" });
  }
  const { atributos } = req.body;
  if (!Array.isArray(atributos)) {
    return res.status(400).json({ erro: "atributos precisa ser uma lista" });
  }

  const { rows } = await pool.query(
    `UPDATE mapas SET atributos_config = $1 WHERE id = $2
     RETURNING atributos_config`,
    [JSON.stringify(atributos), mapaId]
  );
  if (!rows[0]) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }
  res.json({ atributos: rows[0].atributos_config });
});
