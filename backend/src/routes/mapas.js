import { Router } from "express";
import { pool } from "../db/pool.js";
import { exigirAutenticacao } from "../middleware/auth.js";
import { streamArquivo } from "../lib/storage.js";

export const mapasRouter = Router();

mapasRouter.use(exigirAutenticacao);

// Só retorna mapas que algum grupo do usuário tem permissão de ver, cada
// um já com as camadas dele aninhadas — o frontend sincroniza tudo (todos
// os mapas permitidos, mesmo os que o usuário ainda não abriu) com uma
// chamada só, sem N+1.
mapasRouter.get("/mapas", async (req, res) => {
  const { rows: mapas } = await pool.query(
    `SELECT DISTINCT m.id, m.nome, m.descricao
     FROM mapas m
     JOIN permissoes p ON p.mapa_id = m.id
     JOIN usuarios_grupos ug ON ug.grupo_id = p.grupo_id
     WHERE ug.usuario_id = $1
     ORDER BY m.nome`,
    [req.usuarioId]
  );

  if (mapas.length === 0) {
    return res.json([]);
  }

  const idsMapas = mapas.map((m) => m.id);
  const { rows: camadas } = await pool.query(
    `SELECT id, mapa_id, nome, versao, categoria, publicado_em, atributos_config, estilo_config
     FROM camadas
     WHERE mapa_id = ANY($1)
     ORDER BY nome`,
    [idsMapas]
  );

  const camadasPorMapa = new Map();
  for (const c of camadas) {
    if (!camadasPorMapa.has(c.mapa_id)) camadasPorMapa.set(c.mapa_id, []);
    camadasPorMapa.get(c.mapa_id).push(c);
  }

  res.json(mapas.map((m) => ({ ...m, camadas: camadasPorMapa.get(m.id) || [] })));
});

// Confirma permissão de novo (não confia só em ter aparecido no catálogo,
// e a permissão agora vale pro mapa inteiro — a camada herda do mapa
// dela), registra o log de download e libera o .pmtiles.
mapasRouter.get("/camadas/:id/download", async (req, res) => {
  const camadaId = Number(req.params.id);
  if (!Number.isInteger(camadaId)) {
    return res.status(400).json({ erro: "id de camada inválido" });
  }

  const { rows } = await pool.query(
    `SELECT DISTINCT c.id, c.nome, c.arquivo_path
     FROM camadas c
     JOIN mapas m ON m.id = c.mapa_id
     JOIN permissoes p ON p.mapa_id = m.id
     JOIN usuarios_grupos ug ON ug.grupo_id = p.grupo_id
     WHERE ug.usuario_id = $1 AND c.id = $2`,
    [req.usuarioId, camadaId]
  );
  const camada = rows[0];

  if (!camada) {
    return res.status(404).json({ erro: "camada não encontrada" });
  }

  await pool.query(
    "INSERT INTO logs (usuario_id, camada_id, acao, ip) VALUES ($1, $2, 'download', $3)",
    [req.usuarioId, camada.id, req.ip]
  );

  let objeto;
  try {
    objeto = await streamArquivo(camada.arquivo_path);
  } catch (err) {
    if (err.name === "NoSuchKey") {
      return res.status(404).json({ erro: "arquivo da camada não encontrado no servidor" });
    }
    throw err;
  }
  res.setHeader("Content-Type", objeto.ContentType || "application/octet-stream");
  res.setHeader("Content-Disposition", `attachment; filename="${camada.arquivo_path}"`);
  if (objeto.ContentLength) res.setHeader("Content-Length", objeto.ContentLength);
  objeto.Body.pipe(res);
});
