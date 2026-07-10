import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import multer from "multer";
import { pool } from "../db/pool.js";
import { exigirAutenticacao, exigirAdmin } from "../middleware/auth.js";

export const adminRouter = Router();

const storageDir = process.env.STORAGE_DIR || path.join(process.cwd(), "storage");

const upload = multer({
  storage: multer.diskStorage({
    destination: storageDir,
    filename: (req, file, cb) => cb(null, `${crypto.randomUUID()}.pmtiles`),
  }),
  limits: { fileSize: 300 * 1024 * 1024 }, // 300MB — folga generosa pro tamanho típico de .pmtiles
  fileFilter: (req, file, cb) => {
    if (!file.originalname.toLowerCase().endsWith(".pmtiles")) {
      return cb(new Error("arquivo precisa ter extensão .pmtiles"));
    }
    cb(null, true);
  },
});

// Confere a assinatura do arquivo ("PMTiles" nos primeiros bytes) — não dá
// pra confiar só na extensão, o navegador não valida o conteúdo.
async function ehPmtilesValido(caminho) {
  const buffer = Buffer.alloc(7);
  const fd = await fs.promises.open(caminho, "r");
  try {
    await fd.read(buffer, 0, 7, 0);
  } finally {
    await fd.close();
  }
  return buffer.toString("utf8") === "PMTiles";
}

adminRouter.use(exigirAutenticacao, exigirAdmin);

// Placeholder: confirma que a proteção por papel funciona ponta a ponta.
adminRouter.get("/admin/ping", (req, res) => {
  res.json({ ok: true });
});

// Lista TODOS os mapas, sem filtro de grupo — admin gerencia qualquer
// camada, independente de pertencer aos grupos dele próprio.
adminRouter.get("/admin/mapas", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, nome, versao, categoria, publicado_em, estilo_config FROM mapas ORDER BY nome`
  );
  res.json(rows);
});

// Grupos disponíveis pra atribuir permissão no upload de um mapa novo.
adminRouter.get("/admin/grupos", async (req, res) => {
  const { rows } = await pool.query(`SELECT id, nome FROM grupos ORDER BY nome`);
  res.json(rows);
});

// Adicionar camada: recebe o .pmtiles já gerado pelo pipeline (fora do
// escopo desta rota — o admin roda o pipeline localmente e faz upload do
// resultado), cria o registro em mapas e concede permissão aos grupos
// escolhidos.
adminRouter.post("/admin/mapas", upload.single("arquivo"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ erro: "arquivo .pmtiles é obrigatório" });
  }

  const nome = (req.body.nome || "").trim();
  const versao = (req.body.versao || "").trim();
  const categoria = (req.body.categoria || "").trim() || null;
  let grupoIds = [];
  try {
    grupoIds = JSON.parse(req.body.grupoIds || "[]");
  } catch {
    grupoIds = [];
  }

  if (!nome || !versao) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ erro: "nome e versão são obrigatórios" });
  }

  if (!(await ehPmtilesValido(req.file.path))) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ erro: "arquivo não parece ser um .pmtiles válido" });
  }

  const { rows } = await pool.query(
    `INSERT INTO mapas (nome, versao, categoria, arquivo_path)
     VALUES ($1, $2, $3, $4) RETURNING id, nome, versao, categoria, publicado_em`,
    [nome, versao, categoria, req.file.filename]
  );
  const mapa = rows[0];

  if (Array.isArray(grupoIds) && grupoIds.length > 0) {
    const valores = grupoIds.map((_, i) => `($1, $${i + 2})`).join(", ");
    await pool.query(
      `INSERT INTO permissoes (mapa_id, grupo_id) VALUES ${valores} ON CONFLICT DO NOTHING`,
      [mapa.id, ...grupoIds]
    );
  }

  res.status(201).json(mapa);
});

// Remover camada: apaga o registro (permissões somem em cascata) e o
// arquivo físico do storage.
adminRouter.delete("/admin/mapas/:id", async (req, res) => {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "id de mapa inválido" });
  }

  const { rows } = await pool.query("SELECT arquivo_path FROM mapas WHERE id = $1", [mapaId]);
  const mapa = rows[0];
  if (!mapa) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }

  await pool.query("DELETE FROM mapas WHERE id = $1", [mapaId]);
  await fs.promises.unlink(path.join(storageDir, mapa.arquivo_path)).catch(() => {});

  res.json({ ok: true });
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

// Controle de versão: atualiza o .pmtiles de um mapa já existente (nova
// versão), sem mudar id/nome/config/permissões. O arquivo antigo não é
// apagado — fica renomeado com sufixo de timestamp como backup leve,
// caso o upload novo seja ruim (sem UI de navegação por versões antigas,
// só a garantia de não perder o anterior de imediato).
adminRouter.put("/admin/mapas/:id/arquivo", upload.single("arquivo"), async (req, res) => {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) {
    if (req.file) await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ erro: "id de mapa inválido" });
  }
  if (!req.file) {
    return res.status(400).json({ erro: "arquivo .pmtiles é obrigatório" });
  }

  const versao = (req.body.versao || "").trim();
  if (!versao) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ erro: "versão é obrigatória" });
  }

  if (!(await ehPmtilesValido(req.file.path))) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(400).json({ erro: "arquivo não parece ser um .pmtiles válido" });
  }

  const { rows } = await pool.query("SELECT arquivo_path FROM mapas WHERE id = $1", [mapaId]);
  const mapaAtual = rows[0];
  if (!mapaAtual) {
    await fs.promises.unlink(req.file.path).catch(() => {});
    return res.status(404).json({ erro: "mapa não encontrado" });
  }

  const antigoAbsoluto = path.join(storageDir, mapaAtual.arquivo_path);
  await fs.promises
    .rename(antigoAbsoluto, `${antigoAbsoluto}.bak-${Date.now()}`)
    .catch(() => {}); // se o arquivo antigo já não existir no disco, segue o baile

  const atualizado = await pool.query(
    `UPDATE mapas SET arquivo_path = $1, versao = $2 WHERE id = $3
     RETURNING id, nome, versao, categoria, publicado_em`,
    [req.file.filename, versao, mapaId]
  );

  res.json(atualizado.rows[0]);
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

// Nomenclatura — renomeia o mapa (nome de exibição, não o arquivo).
adminRouter.put("/admin/mapas/:id", async (req, res) => {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "id de mapa inválido" });
  }
  const nome = (req.body.nome || "").trim();
  if (!nome) {
    return res.status(400).json({ erro: "nome não pode ser vazio" });
  }

  const { rows } = await pool.query(
    `UPDATE mapas SET nome = $1 WHERE id = $2 RETURNING id, nome`,
    [nome, mapaId]
  );
  if (!rows[0]) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }
  res.json(rows[0]);
});

// Simbologia/rótulo — cor, opacidade de preenchimento, exibir rótulo e o
// zoom mínimo em que ele aparece. NULL = usa a heurística padrão (ver
// adicionarCamada em Mapa.jsx).
adminRouter.get("/admin/mapas/:id/estilo", async (req, res) => {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "id de mapa inválido" });
  }

  const { rows } = await pool.query("SELECT estilo_config FROM mapas WHERE id = $1", [mapaId]);
  if (!rows[0]) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }
  res.json({ estilo: rows[0].estilo_config || null });
});

adminRouter.put("/admin/mapas/:id/estilo", async (req, res) => {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "id de mapa inválido" });
  }
  const { estilo } = req.body;
  if (!estilo || typeof estilo !== "object" || Array.isArray(estilo)) {
    return res.status(400).json({ erro: "estilo precisa ser um objeto" });
  }

  const { rows } = await pool.query(
    `UPDATE mapas SET estilo_config = $1 WHERE id = $2 RETURNING estilo_config`,
    [JSON.stringify(estilo), mapaId]
  );
  if (!rows[0]) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }
  res.json({ estilo: rows[0].estilo_config });
});

// Erros do multer (arquivo grande demais, extensão errada) chegam aqui em
// vez de virar um 500 genérico do Express.
adminRouter.use((err, req, res, next) => {
  if (err instanceof multer.MulterError || err) {
    return res.status(400).json({ erro: err.message });
  }
  next();
});
