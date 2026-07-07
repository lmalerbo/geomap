import { Router } from "express";
import path from "node:path";
import { pool } from "../db/pool.js";
import { exigirAutenticacao } from "../middleware/auth.js";

export const mapasRouter = Router();

const storageDir = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");

mapasRouter.use(exigirAutenticacao);

// Só retorna mapas que algum grupo do usuário tem permissão de ver.
mapasRouter.get("/mapas", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT DISTINCT m.id, m.nome, m.versao, m.categoria, m.publicado_em
     FROM mapas m
     JOIN permissoes p ON p.mapa_id = m.id
     JOIN usuarios_grupos ug ON ug.grupo_id = p.grupo_id
     WHERE ug.usuario_id = $1
     ORDER BY m.nome`,
    [req.usuarioId]
  );

  res.json(rows);
});

// Confirma permissão de novo (não confia só em ter aparecido no catálogo),
// registra o log de download e libera o .pmtiles.
mapasRouter.get("/mapas/:id/download", async (req, res) => {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "id de mapa inválido" });
  }

  const { rows } = await pool.query(
    `SELECT DISTINCT m.id, m.nome, m.arquivo_path
     FROM mapas m
     JOIN permissoes p ON p.mapa_id = m.id
     JOIN usuarios_grupos ug ON ug.grupo_id = p.grupo_id
     WHERE ug.usuario_id = $1 AND m.id = $2`,
    [req.usuarioId, mapaId]
  );
  const mapa = rows[0];

  if (!mapa) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }

  await pool.query(
    "INSERT INTO logs (usuario_id, mapa_id, acao, ip) VALUES ($1, $2, 'download', $3)",
    [req.usuarioId, mapa.id, req.ip]
  );

  const arquivoAbsoluto = path.join(storageDir, mapa.arquivo_path);
  res.download(arquivoAbsoluto, mapa.arquivo_path, (err) => {
    if (err && !res.headersSent) {
      res.status(404).json({ erro: "arquivo do mapa não encontrado no servidor" });
    }
  });
});
