import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import multer from "multer";
import bcrypt from "bcrypt";
import AdmZip from "adm-zip";
import { pool } from "../db/pool.js";
import { exigirAutenticacao, exigirAdmin } from "../middleware/auth.js";
import {
  salvarArquivo,
  apagarArquivo,
  copiarArquivo,
  duplicarArquivo,
  streamArquivo,
} from "../lib/storage.js";

export const adminRouter = Router();

const execFileAsync = promisify(execFile);

// Sem essas variáveis, assume que "ogr2ogr"/"tippecanoe" já estão no PATH
// (é o caso normal num host Linux de produção). No Windows local, tippecanoe
// não compila nativamente — usa os binários Cygwin-compilados apontados
// nessas variáveis (ver .env.example). Em produção na nuvem (Render), esses
// binários não existem — upload de .zip (conversão shapefile) falha com
// mensagem clara (ENOENT), mas .pmtiles já pronto continua funcionando
// normalmente (ver processarArquivoRecebido).
const OGR2OGR_PATH = process.env.OGR2OGR_PATH || "ogr2ogr";
const TIPPECANOE_PATH = process.env.TIPPECANOE_PATH || "tippecanoe";
const CYGWIN_BIN_DIR = process.env.CYGWIN_BIN_DIR || null;

// PATH do processo filho: binários Cygwin-compilados precisam achar
// cygwin1.dll e as outras DLLs do runtime, que não estão no PATH normal
// do Windows.
function envParaConversao() {
  if (!CYGWIN_BIN_DIR) return process.env;
  return { ...process.env, PATH: `${CYGWIN_BIN_DIR}${path.delimiter}${process.env.PATH}` };
}

// memoryStorage (não diskStorage): o arquivo fica só em req.file.buffer —
// nunca toca disco local, que num host free-tier (Render) não é
// persistente entre deploys/restarts. Destino final é sempre o R2 (ver
// lib/storage.js).
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 }, // 300MB — folga generosa pro tamanho típico de .pmtiles/.zip
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ext !== ".pmtiles" && ext !== ".zip") {
      return cb(new Error("arquivo precisa ser .pmtiles ou um .zip com o shapefile (.shp/.dbf/.shx)"));
    }
    cb(null, true);
  },
});

// .zip (shapefile) -> .pmtiles, mesmos passos de pipeline/shp_para_pmtiles.sh
// (ogr2ogr pra GeoJSON, depois tippecanoe), só que orquestrado a partir do
// Node em vez de rodado manualmente. V1 cobre só geometria — rótulos
// (número do talhão no mapa) continuam um passo manual à parte, ver
// pipeline/rotulos/README.md.
async function converterShapefileParaPmtiles(caminhoZip, nomeCamadaArquivo) {
  const pastaTemp = path.join(os.tmpdir(), `geomap-shp-${crypto.randomUUID()}`);
  await fs.promises.mkdir(pastaTemp, { recursive: true });

  try {
    const zip = new AdmZip(caminhoZip);
    zip.extractAllTo(pastaTemp, true);

    const arquivos = await fs.promises.readdir(pastaTemp);
    const shp = arquivos.find((f) => f.toLowerCase().endsWith(".shp"));
    if (!shp) {
      throw new Error("o .zip não contém nenhum arquivo .shp");
    }
    const base = shp.slice(0, -4);
    const temDbf = arquivos.some((f) => f.toLowerCase() === `${base.toLowerCase()}.dbf`);
    const temShx = arquivos.some((f) => f.toLowerCase() === `${base.toLowerCase()}.shx`);
    if (!temDbf || !temShx) {
      throw new Error("o .zip precisa conter .shp, .dbf e .shx (shapefile é multi-arquivo)");
    }

    const caminhoShp = path.join(pastaTemp, shp);
    const caminhoGeojson = path.join(pastaTemp, `${base}.geojson`);
    // Escreve dentro da própria pastaTemp (nunca em STORAGE_DIR, que não
    // existe mais) — tippecanoe precisa de um caminho de disco de verdade
    // pra rodar via execFile; o resultado sobe pro R2 como Buffer depois.
    const caminhoPmtiles = path.join(pastaTemp, `${crypto.randomUUID()}.pmtiles`);
    const env = envParaConversao();

    try {
      await execFileAsync(
        OGR2OGR_PATH,
        ["-f", "GeoJSON", "-t_srs", "EPSG:4326", caminhoGeojson, caminhoShp],
        { env, timeout: 5 * 60 * 1000 }
      );
    } catch (err) {
      throw new Error(
        err.code === "ENOENT"
          ? `ogr2ogr não encontrado (OGR2OGR_PATH=${OGR2OGR_PATH}) — confira a configuração no .env`
          : `falha ao converter .shp pra GeoJSON: ${err.stderr || err.message}`
      );
    }

    try {
      await execFileAsync(
        TIPPECANOE_PATH,
        [
          `--output=${caminhoPmtiles}`,
          `--layer=${nomeCamadaArquivo || base}`,
          // maximum-zoom FIXO (não "g"/guess): o "guess" escolhe o maxzoom
          // com base no espaçamento entre features pra deixá-las
          // visualmente distinguíveis — pra um dado pouco denso (poucos
          // pontos bem espaçados, ex: sedes de unidade), escolhe um
          // maxzoom absurdamente baixo (chegou a 0 num teste real), o que
          // quantiza as coordenadas num grid gigante (~9km no zoom 0) e
          // faz a feição gravar num lugar bem diferente da posição real —
          // não é bug de exibição, o dado já fica errado dentro do
          // .pmtiles. 16 preserva precisão de poucos metros pra qualquer
          // densidade de feição (ponto/linha/polígono).
          "--maximum-zoom=16",
          "--drop-densest-as-needed",
          "--force",
          caminhoGeojson,
        ],
        { env, timeout: 5 * 60 * 1000 }
      );
    } catch (err) {
      throw new Error(
        err.code === "ENOENT"
          ? `tippecanoe não encontrado (TIPPECANOE_PATH=${TIPPECANOE_PATH}) — confira a configuração no .env`
          : `falha ao gerar .pmtiles: ${err.stderr || err.message}`
      );
    }

    return fs.promises.readFile(caminhoPmtiles);
  } finally {
    await fs.promises.rm(pastaTemp, { recursive: true, force: true });
  }
}

// Decide, pela extensão real do upload, se usa o .pmtiles direto (valida a
// assinatura) ou converte um .zip de shapefile — sempre sobe o resultado
// pro R2 com uma chave nova (UUID). Retorna a chave final (o que salvar em
// arquivo_path). Arquivo chega inteiro em memória (file.buffer, ver
// multer.memoryStorage acima) — nunca precisa tocar disco pro caso comum
// (.pmtiles pronto); só o caminho de conversão de .zip usa disco
// temporário (os.tmpdir()), porque tippecanoe/ogr2ogr exigem arquivo de
// verdade via execFile.
async function processarArquivoRecebido(file, nomeCamada) {
  const ext = path.extname(file.originalname).toLowerCase();

  if (ext === ".pmtiles") {
    if (file.buffer.subarray(0, 7).toString("utf8") !== "PMTiles") {
      throw new Error("arquivo não parece ser um .pmtiles válido");
    }
    const chave = `${crypto.randomUUID()}.pmtiles`;
    await salvarArquivo(chave, file.buffer);
    return chave;
  }

  if (ext === ".zip") {
    // converterShapefileParaPmtiles precisa de um caminho de disco de
    // verdade (ogr2ogr/tippecanoe rodam via execFile) — grava o buffer
    // recebido num zip temporário só pra isso, nunca em STORAGE_DIR.
    const caminhoZipTemp = path.join(os.tmpdir(), `geomap-upload-${crypto.randomUUID()}.zip`);
    await fs.promises.writeFile(caminhoZipTemp, file.buffer);
    let bufferPmtiles;
    try {
      bufferPmtiles = await converterShapefileParaPmtiles(caminhoZipTemp, nomeCamada);
    } finally {
      await fs.promises.unlink(caminhoZipTemp).catch(() => {});
    }
    const chave = `${crypto.randomUUID()}.pmtiles`;
    await salvarArquivo(chave, bufferPmtiles);
    return chave;
  }

  throw new Error("arquivo precisa ser .pmtiles ou .zip");
}

adminRouter.use(exigirAutenticacao, exigirAdmin);

// Placeholder: confirma que a proteção por papel funciona ponta a ponta.
adminRouter.get("/admin/ping", (req, res) => {
  res.json({ ok: true });
});

// Ações administrativas sensíveis (criar/editar usuário, redefinir senha,
// mexer em grupo) deixam rastro em logs — depois da confusão recente entre
// dado de teste e dado real inserido via seed/SQL direto, ter registro de
// quem fez o quê pelo painel evita repetir o problema. acao='admin' (a
// coluna tem CHECK restrito a login/download/admin, ver migration 007) +
// detalhe em texto livre, em vez de uma acao por tipo de operação.
async function registrarAuditoria(usuarioId, acao, detalhe, ip) {
  await pool.query(
    "INSERT INTO logs (usuario_id, acao, detalhe, ip) VALUES ($1, 'admin', $2, $3)",
    [usuarioId, `${acao}: ${detalhe}`, ip]
  );
}

adminRouter.get("/admin/grupos", async (req, res) => {
  const { rows } = await pool.query(`SELECT id, nome FROM grupos ORDER BY nome`);
  res.json(rows);
});

adminRouter.post("/admin/grupos", async (req, res) => {
  const nome = (req.body.nome || "").trim();
  if (!nome) {
    return res.status(400).json({ erro: "nome é obrigatório" });
  }
  try {
    const { rows } = await pool.query(
      `INSERT INTO grupos (nome) VALUES ($1) RETURNING id, nome`,
      [nome]
    );
    await registrarAuditoria(req.usuarioId, "criar_grupo", `grupo ${rows[0].id} (${nome})`, req.ip);
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ erro: "já existe um grupo com esse nome" });
    }
    throw err;
  }
});

adminRouter.put("/admin/grupos/:id", async (req, res) => {
  const grupoId = Number(req.params.id);
  if (!Number.isInteger(grupoId)) {
    return res.status(400).json({ erro: "id de grupo inválido" });
  }
  const nome = (req.body.nome || "").trim();
  if (!nome) {
    return res.status(400).json({ erro: "nome não pode ser vazio" });
  }
  try {
    const { rows } = await pool.query(
      `UPDATE grupos SET nome = $1 WHERE id = $2 RETURNING id, nome`,
      [nome, grupoId]
    );
    if (!rows[0]) {
      return res.status(404).json({ erro: "grupo não encontrado" });
    }
    await registrarAuditoria(req.usuarioId, "renomear_grupo", `grupo ${grupoId} → ${nome}`, req.ip);
    res.json(rows[0]);
  } catch (err) {
    if (err.code === "23505") {
      return res.status(409).json({ erro: "já existe um grupo com esse nome" });
    }
    throw err;
  }
});

// Cascata é segura pelo schema: usuarios_grupos.grupo_id e
// permissoes.grupo_id são ON DELETE CASCADE (001_schema_inicial.sql e
// migration 006) — remover o grupo tira automaticamente as associações
// de usuário e as permissões de mapa que dependiam dele. O aviso do que
// vai ser perdido fica a cargo do frontend antes de confirmar.
adminRouter.delete("/admin/grupos/:id", async (req, res) => {
  const grupoId = Number(req.params.id);
  if (!Number.isInteger(grupoId)) {
    return res.status(400).json({ erro: "id de grupo inválido" });
  }
  const { rows } = await pool.query("DELETE FROM grupos WHERE id = $1 RETURNING nome", [grupoId]);
  if (!rows[0]) {
    return res.status(404).json({ erro: "grupo não encontrado" });
  }
  await registrarAuditoria(req.usuarioId, "remover_grupo", `grupo ${grupoId} (${rows[0].nome})`, req.ip);
  res.json({ ok: true });
});

// --- Usuários ---

adminRouter.get("/admin/usuarios", async (req, res) => {
  const { rows: usuarios } = await pool.query(
    `SELECT id, nome, email, departamento, status, papel, criado_em FROM usuarios ORDER BY nome`
  );
  const { rows: membros } = await pool.query(`SELECT usuario_id, grupo_id FROM usuarios_grupos`);

  const gruposPorUsuario = new Map();
  for (const m of membros) {
    if (!gruposPorUsuario.has(m.usuario_id)) gruposPorUsuario.set(m.usuario_id, []);
    gruposPorUsuario.get(m.usuario_id).push(m.grupo_id);
  }

  res.json(usuarios.map((u) => ({ ...u, grupoIds: gruposPorUsuario.get(u.id) || [] })));
});

adminRouter.post("/admin/usuarios", async (req, res) => {
  const nome = (req.body.nome || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const senha = req.body.senha || "";
  const departamento = (req.body.departamento || "").trim() || null;
  const papel = req.body.papel === "admin" ? "admin" : "usuario";
  const grupoIds = Array.isArray(req.body.grupoIds) ? req.body.grupoIds : [];

  if (!nome || !email || !senha) {
    return res.status(400).json({ erro: "nome, email e senha são obrigatórios" });
  }

  const { rows: existentes } = await pool.query("SELECT id FROM usuarios WHERE email = $1", [email]);
  if (existentes[0]) {
    return res.status(409).json({ erro: "já existe um usuário com esse email" });
  }

  const senhaHash = await bcrypt.hash(senha, 10);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, departamento, papel)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id, nome, email, departamento, status, papel, criado_em`,
    [nome, email, senhaHash, departamento, papel]
  );
  const usuario = rows[0];

  if (grupoIds.length > 0) {
    const valores = grupoIds.map((_, i) => `($1, $${i + 2})`).join(", ");
    await pool.query(
      `INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES ${valores} ON CONFLICT DO NOTHING`,
      [usuario.id, ...grupoIds]
    );
  }

  await registrarAuditoria(req.usuarioId, "criar_usuario", `usuário ${usuario.id} (${email})`, req.ip);
  res.status(201).json({ ...usuario, grupoIds });
});

// Nunca edita email (é a chave de login). Duas travas contra o admin se
// trancar fora do próprio painel: (1) não pode mudar o próprio papel/
// status; (2) não pode rebaixar/desativar o último admin ativo restante
// — a trava visual equivalente no frontend evita o clique acidental, mas
// só a validação aqui impede uma chamada direta à API.
adminRouter.put("/admin/usuarios/:id", async (req, res) => {
  const usuarioId = Number(req.params.id);
  if (!Number.isInteger(usuarioId)) {
    return res.status(400).json({ erro: "id de usuário inválido" });
  }

  const nome = (req.body.nome || "").trim();
  const departamento = (req.body.departamento || "").trim() || null;
  const papel = req.body.papel === "admin" ? "admin" : "usuario";
  const status = req.body.status === "inativo" ? "inativo" : "ativo";
  const grupoIds = Array.isArray(req.body.grupoIds) ? req.body.grupoIds : [];

  if (!nome) {
    return res.status(400).json({ erro: "nome não pode ser vazio" });
  }

  const { rows: atualRows } = await pool.query(
    "SELECT papel, status FROM usuarios WHERE id = $1",
    [usuarioId]
  );
  const atual = atualRows[0];
  if (!atual) {
    return res.status(404).json({ erro: "usuário não encontrado" });
  }

  const mudandoPapelOuStatus = papel !== atual.papel || status !== atual.status;

  if (usuarioId === req.usuarioId && mudandoPapelOuStatus) {
    return res.status(400).json({ erro: "não é possível alterar o próprio papel ou status" });
  }

  if (atual.papel === "admin" && mudandoPapelOuStatus && (papel !== "admin" || status !== "ativo")) {
    const { rows: contagem } = await pool.query(
      `SELECT count(*)::int AS total FROM usuarios
       WHERE papel = 'admin' AND status = 'ativo' AND id != $1`,
      [usuarioId]
    );
    if (contagem[0].total === 0) {
      return res.status(400).json({ erro: "não é possível remover o último admin ativo" });
    }
  }

  const { rows } = await pool.query(
    `UPDATE usuarios SET nome = $1, departamento = $2, papel = $3, status = $4 WHERE id = $5
     RETURNING id, nome, email, departamento, status, papel, criado_em`,
    [nome, departamento, papel, status, usuarioId]
  );

  await pool.query("DELETE FROM usuarios_grupos WHERE usuario_id = $1", [usuarioId]);
  if (grupoIds.length > 0) {
    const valores = grupoIds.map((_, i) => `($1, $${i + 2})`).join(", ");
    await pool.query(
      `INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES ${valores} ON CONFLICT DO NOTHING`,
      [usuarioId, ...grupoIds]
    );
  }

  if (mudandoPapelOuStatus) {
    await registrarAuditoria(
      req.usuarioId,
      "editar_usuario",
      `usuário ${usuarioId}: papel=${papel}, status=${status}`,
      req.ip
    );
  }

  res.json({ ...rows[0], grupoIds });
});

adminRouter.put("/admin/usuarios/:id/senha", async (req, res) => {
  const usuarioId = Number(req.params.id);
  if (!Number.isInteger(usuarioId)) {
    return res.status(400).json({ erro: "id de usuário inválido" });
  }
  const senha = req.body.senha || "";
  if (senha.length < 6) {
    return res.status(400).json({ erro: "senha precisa ter ao menos 6 caracteres" });
  }

  const senhaHash = await bcrypt.hash(senha, 10);
  const { rows } = await pool.query(
    "UPDATE usuarios SET senha_hash = $1 WHERE id = $2 RETURNING id",
    [senhaHash, usuarioId]
  );
  if (!rows[0]) {
    return res.status(404).json({ erro: "usuário não encontrado" });
  }

  await registrarAuditoria(req.usuarioId, "redefinir_senha", `usuário ${usuarioId}`, req.ip);
  res.json({ ok: true });
});

// --- Mapas (projetos: "Usina da Pedra", etc — o que aparece na tela
// inicial). Permissão vive aqui, não mais por camada individual. ---

// Lista todos os mapas com os grupos que têm permissão em cada um —
// admin gerencia qualquer mapa, independente do próprio grupo dele.
adminRouter.get("/admin/mapas", async (req, res) => {
  const { rows: mapas } = await pool.query(
    `SELECT id, nome, descricao, criado_em FROM mapas ORDER BY nome`
  );
  const { rows: permissoes } = await pool.query(`SELECT mapa_id, grupo_id FROM permissoes`);
  const { rows: contagens } = await pool.query(
    `SELECT mapa_id, count(*)::int AS total FROM camadas GROUP BY mapa_id`
  );

  const gruposPorMapa = new Map();
  for (const p of permissoes) {
    if (!gruposPorMapa.has(p.mapa_id)) gruposPorMapa.set(p.mapa_id, []);
    gruposPorMapa.get(p.mapa_id).push(p.grupo_id);
  }
  const camadasPorMapa = new Map(contagens.map((c) => [c.mapa_id, c.total]));

  res.json(
    mapas.map((m) => ({
      ...m,
      grupoIds: gruposPorMapa.get(m.id) || [],
      camadaCount: camadasPorMapa.get(m.id) || 0,
    }))
  );
});

adminRouter.post("/admin/mapas", async (req, res) => {
  const nome = (req.body.nome || "").trim();
  const descricao = (req.body.descricao || "").trim() || null;
  const grupoIds = Array.isArray(req.body.grupoIds) ? req.body.grupoIds : [];

  if (!nome) {
    return res.status(400).json({ erro: "nome é obrigatório" });
  }

  const { rows } = await pool.query(
    `INSERT INTO mapas (nome, descricao) VALUES ($1, $2)
     RETURNING id, nome, descricao, criado_em`,
    [nome, descricao]
  );
  const mapa = rows[0];

  if (grupoIds.length > 0) {
    const valores = grupoIds.map((_, i) => `($1, $${i + 2})`).join(", ");
    await pool.query(
      `INSERT INTO permissoes (mapa_id, grupo_id) VALUES ${valores} ON CONFLICT DO NOTHING`,
      [mapa.id, ...grupoIds]
    );
  }

  res.status(201).json({ ...mapa, grupoIds });
});

// Edita nome/descrição e substitui o conjunto de grupos com permissão
// (mais simples que calcular diff — apaga e recria as permissões desse
// mapa a cada salvamento).
adminRouter.put("/admin/mapas/:id", async (req, res) => {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "id de mapa inválido" });
  }
  const nome = (req.body.nome || "").trim();
  const descricao = (req.body.descricao || "").trim() || null;
  const grupoIds = Array.isArray(req.body.grupoIds) ? req.body.grupoIds : [];

  if (!nome) {
    return res.status(400).json({ erro: "nome não pode ser vazio" });
  }

  const { rows } = await pool.query(
    `UPDATE mapas SET nome = $1, descricao = $2 WHERE id = $3
     RETURNING id, nome, descricao, criado_em`,
    [nome, descricao, mapaId]
  );
  if (!rows[0]) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }

  await pool.query("DELETE FROM permissoes WHERE mapa_id = $1", [mapaId]);
  if (grupoIds.length > 0) {
    const valores = grupoIds.map((_, i) => `($1, $${i + 2})`).join(", ");
    await pool.query(
      `INSERT INTO permissoes (mapa_id, grupo_id) VALUES ${valores} ON CONFLICT DO NOTHING`,
      [mapaId, ...grupoIds]
    );
  }

  res.json({ ...rows[0], grupoIds });
});

// Só remove se o mapa não tiver camadas — evita apagar `.pmtiles` grandes
// (e os registros que dependem deles) em cascata sem querer. O admin
// precisa remover as camadas primeiro, uma a uma, em Gerenciar camadas.
adminRouter.delete("/admin/mapas/:id", async (req, res) => {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "id de mapa inválido" });
  }

  const { rows: camadas } = await pool.query(
    "SELECT count(*)::int AS total FROM camadas WHERE mapa_id = $1",
    [mapaId]
  );
  if (camadas[0].total > 0) {
    return res.status(400).json({ erro: "remova as camadas desse mapa antes de removê-lo" });
  }

  const { rows } = await pool.query("DELETE FROM mapas WHERE id = $1 RETURNING nome", [mapaId]);
  if (!rows[0]) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }

  await registrarAuditoria(req.usuarioId, "remover_mapa", `mapa ${mapaId} (${rows[0].nome})`, req.ip);
  res.json({ ok: true });
});

// Duplica um mapa inteiro: cria um novo registro em mapas (nome com
// sufixo "(cópia)", mesma descrição), copia as permissões (mesmos grupos
// com acesso) e duplica cada camada — arquivo incluso, via cópia
// server-side no R2 (nunca baixa/reenvia o .pmtiles pelo backend), com
// uma chave nova por camada. Pensado pra criar um novo mapa/fazenda
// partindo de uma estrutura já pronta (mesmas camadas/estilos), sem
// precisar montar tudo de novo na mão.
adminRouter.post("/admin/mapas/:id/duplicar", async (req, res) => {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "id de mapa inválido" });
  }

  const { rows: mapaRows } = await pool.query(
    "SELECT nome, descricao FROM mapas WHERE id = $1",
    [mapaId]
  );
  const mapaOrigem = mapaRows[0];
  if (!mapaOrigem) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }

  const { rows: permissoesOrigem } = await pool.query(
    "SELECT grupo_id FROM permissoes WHERE mapa_id = $1",
    [mapaId]
  );
  const { rows: camadasOrigem } = await pool.query(
    `SELECT nome, versao, categoria, arquivo_path, atributos_config, estilo_config
     FROM camadas WHERE mapa_id = $1 ORDER BY nome`,
    [mapaId]
  );

  const nomeCopia = `${mapaOrigem.nome} (cópia)`;
  const { rows: novoMapaRows } = await pool.query(
    `INSERT INTO mapas (nome, descricao) VALUES ($1, $2)
     RETURNING id, nome, descricao, criado_em`,
    [nomeCopia, mapaOrigem.descricao]
  );
  const novoMapa = novoMapaRows[0];

  const grupoIds = permissoesOrigem.map((p) => p.grupo_id);
  if (grupoIds.length > 0) {
    const valores = grupoIds.map((_, i) => `($1, $${i + 2})`).join(", ");
    await pool.query(
      `INSERT INTO permissoes (mapa_id, grupo_id) VALUES ${valores} ON CONFLICT DO NOTHING`,
      [novoMapa.id, ...grupoIds]
    );
  }

  // Sequencial (não Promise.all) — mais fácil de saber exatamente qual
  // camada falhou se o R2 rejeitar alguma cópia no meio do caminho.
  for (const c of camadasOrigem) {
    const novaChave = `${crypto.randomUUID()}.pmtiles`;
    await duplicarArquivo(c.arquivo_path, novaChave);
    await pool.query(
      `INSERT INTO camadas (mapa_id, nome, versao, categoria, arquivo_path, atributos_config, estilo_config)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        novoMapa.id,
        c.nome,
        c.versao,
        c.categoria,
        novaChave,
        // pg devolve jsonb já parseado em JS (atributos_config vira Array,
        // estilo_config vira Object) — passar isso direto de volta como
        // parâmetro faz o driver serializar pelas regras de tipo JS (Array
        // vira literal de array do Postgres, não JSON), quebrando com
        // "invalid input syntax for type json". Precisa stringify explícito,
        // mesmo padrão já usado em PUT /admin/camadas/:id/atributos e /estilo.
        c.atributos_config === null ? null : JSON.stringify(c.atributos_config),
        c.estilo_config === null ? null : JSON.stringify(c.estilo_config),
      ]
    );
  }

  await registrarAuditoria(
    req.usuarioId,
    "duplicar_mapa",
    `mapa ${mapaId} (${mapaOrigem.nome}) → mapa ${novoMapa.id} (${nomeCopia}), ${camadasOrigem.length} camada(s)`,
    req.ip
  );

  res.status(201).json({ ...novoMapa, grupoIds, camadaCount: camadasOrigem.length });
});

// Dashboard: agrega a tabela logs (já existia desde o MVP, guarda
// login/download por usuário+camada+data) — sem schema novo.
adminRouter.get("/admin/estatisticas", async (req, res) => {
  const [totais, maisBaixados, usuariosMaisAtivos] = await Promise.all([
    pool.query(`
      SELECT
        (SELECT count(*)::int FROM camadas) AS total_camadas,
        (SELECT count(*)::int FROM usuarios WHERE status = 'ativo') AS total_usuarios,
        (SELECT count(*)::int FROM logs WHERE acao = 'download') AS total_downloads
    `),
    pool.query(`
      SELECT c.nome, count(*)::int AS downloads
      FROM logs l
      JOIN camadas c ON c.id = l.camada_id
      WHERE l.acao = 'download'
      GROUP BY c.nome
      ORDER BY downloads DESC
      LIMIT 10
    `),
    pool.query(`
      SELECT u.nome, u.email, count(*)::int AS downloads
      FROM logs l
      JOIN usuarios u ON u.id = l.usuario_id
      WHERE l.acao = 'download'
      GROUP BY u.id, u.nome, u.email
      ORDER BY downloads DESC
      LIMIT 10
    `),
  ]);

  res.json({
    totais: totais.rows[0],
    camadasMaisBaixadas: maisBaixados.rows,
    usuariosMaisAtivos: usuariosMaisAtivos.rows,
  });
});

// --- Camadas (arquivos .pmtiles individuais dentro de um mapa —
// Talhões, Limites, etc). Renomeado de /admin/mapas*. ---

adminRouter.get("/admin/camadas", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, mapa_id, nome, versao, categoria, publicado_em, estilo_config FROM camadas ORDER BY nome`
  );
  res.json(rows);
});

// Adicionar camada: recebe o .pmtiles já gerado pelo pipeline (fora do
// escopo desta rota — o admin roda o pipeline localmente e faz upload do
// resultado), cria o registro em camadas associado a um mapa. Permissão
// não entra mais aqui — vive no mapa (ver /admin/mapas acima).
adminRouter.post("/admin/camadas", upload.single("arquivo"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ erro: "arquivo .pmtiles ou .zip (shapefile) é obrigatório" });
  }

  const mapaId = Number(req.body.mapaId);
  const nome = (req.body.nome || "").trim();
  const versao = (req.body.versao || "").trim();
  const categoria = (req.body.categoria || "").trim() || null;

  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "mapaId é obrigatório" });
  }
  if (!nome || !versao) {
    return res.status(400).json({ erro: "nome e versão são obrigatórios" });
  }

  let nomeArquivoFinal;
  try {
    nomeArquivoFinal = await processarArquivoRecebido(req.file, nome);
  } catch (err) {
    return res.status(400).json({ erro: err.message });
  }

  try {
    const { rows } = await pool.query(
      `INSERT INTO camadas (mapa_id, nome, versao, categoria, arquivo_path)
       VALUES ($1, $2, $3, $4, $5) RETURNING id, mapa_id, nome, versao, categoria, publicado_em`,
      [mapaId, nome, versao, categoria, nomeArquivoFinal]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    await apagarArquivo(nomeArquivoFinal);
    if (err.code === "23503") {
      return res.status(400).json({ erro: "mapa não encontrado" });
    }
    throw err;
  }
});

// Remover camada: apaga o registro (logs ficam com camada_id NULL, ver
// migration 005/006) e o arquivo físico do storage.
adminRouter.delete("/admin/camadas/:id", async (req, res) => {
  const camadaId = Number(req.params.id);
  if (!Number.isInteger(camadaId)) {
    return res.status(400).json({ erro: "id de camada inválido" });
  }

  const { rows } = await pool.query("SELECT arquivo_path FROM camadas WHERE id = $1", [camadaId]);
  const camada = rows[0];
  if (!camada) {
    return res.status(404).json({ erro: "camada não encontrada" });
  }

  await pool.query("DELETE FROM camadas WHERE id = $1", [camadaId]);
  await apagarArquivo(camada.arquivo_path);

  res.json({ ok: true });
});

// Baixa o .pmtiles de qualquer camada (sem checar permissão de grupo) —
// o painel de admin usa isso só pra ler o metadata (campos disponíveis),
// não conta como download de usuário final (não grava log).
adminRouter.get("/admin/camadas/:id/arquivo", async (req, res) => {
  const camadaId = Number(req.params.id);
  if (!Number.isInteger(camadaId)) {
    return res.status(400).json({ erro: "id de camada inválido" });
  }

  const { rows } = await pool.query("SELECT arquivo_path FROM camadas WHERE id = $1", [camadaId]);
  const camada = rows[0];
  if (!camada) {
    return res.status(404).json({ erro: "camada não encontrada" });
  }

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
  if (objeto.ContentLength) res.setHeader("Content-Length", objeto.ContentLength);
  objeto.Body.pipe(res);
});

// Controle de versão: atualiza o .pmtiles de uma camada já existente
// (nova versão), sem mudar id/nome/config/mapa. O arquivo antigo não é
// apagado — fica renomeado com sufixo de timestamp como backup leve,
// caso o upload novo seja ruim (sem UI de navegação por versões antigas,
// só a garantia de não perder o anterior de imediato).
adminRouter.put("/admin/camadas/:id/arquivo", upload.single("arquivo"), async (req, res) => {
  const camadaId = Number(req.params.id);
  if (!Number.isInteger(camadaId)) {
    return res.status(400).json({ erro: "id de camada inválido" });
  }
  if (!req.file) {
    return res.status(400).json({ erro: "arquivo .pmtiles ou .zip (shapefile) é obrigatório" });
  }

  const versao = (req.body.versao || "").trim();
  if (!versao) {
    return res.status(400).json({ erro: "versão é obrigatória" });
  }

  const { rows } = await pool.query("SELECT arquivo_path, nome FROM camadas WHERE id = $1", [camadaId]);
  const camadaAtual = rows[0];
  if (!camadaAtual) {
    return res.status(404).json({ erro: "camada não encontrada" });
  }

  let nomeArquivoFinal;
  try {
    nomeArquivoFinal = await processarArquivoRecebido(req.file, camadaAtual.nome);
  } catch (err) {
    return res.status(400).json({ erro: err.message });
  }

  // Arquivo antigo não é apagado — copiado (cópia server-side no R2, sem
  // baixar/reenviar) com sufixo de timestamp como backup leve, caso o
  // upload novo seja ruim (sem UI de navegação por versões antigas, só a
  // garantia de não perder o anterior de imediato). Ambas as chamadas
  // toleram o arquivo antigo já não existir (mesmo comportamento de
  // antes com fs.rename).
  await copiarArquivo(camadaAtual.arquivo_path, `${camadaAtual.arquivo_path}.bak-${Date.now()}`);
  await apagarArquivo(camadaAtual.arquivo_path);

  const atualizado = await pool.query(
    `UPDATE camadas SET arquivo_path = $1, versao = $2 WHERE id = $3
     RETURNING id, mapa_id, nome, versao, categoria, publicado_em`,
    [nomeArquivoFinal, versao, camadaId]
  );

  res.json(atualizado.rows[0]);
});

adminRouter.get("/admin/camadas/:id/atributos", async (req, res) => {
  const camadaId = Number(req.params.id);
  if (!Number.isInteger(camadaId)) {
    return res.status(400).json({ erro: "id de camada inválido" });
  }

  const { rows } = await pool.query("SELECT atributos_config FROM camadas WHERE id = $1", [camadaId]);
  if (!rows[0]) {
    return res.status(404).json({ erro: "camada não encontrada" });
  }
  res.json({ atributos: rows[0].atributos_config || [] });
});

adminRouter.put("/admin/camadas/:id/atributos", async (req, res) => {
  const camadaId = Number(req.params.id);
  if (!Number.isInteger(camadaId)) {
    return res.status(400).json({ erro: "id de camada inválido" });
  }
  const { atributos } = req.body;
  if (!Array.isArray(atributos)) {
    return res.status(400).json({ erro: "atributos precisa ser uma lista" });
  }

  const { rows } = await pool.query(
    `UPDATE camadas SET atributos_config = $1 WHERE id = $2
     RETURNING atributos_config`,
    [JSON.stringify(atributos), camadaId]
  );
  if (!rows[0]) {
    return res.status(404).json({ erro: "camada não encontrada" });
  }
  res.json({ atributos: rows[0].atributos_config });
});

// Nomenclatura — renomeia a camada (nome de exibição, não o arquivo).
adminRouter.put("/admin/camadas/:id", async (req, res) => {
  const camadaId = Number(req.params.id);
  if (!Number.isInteger(camadaId)) {
    return res.status(400).json({ erro: "id de camada inválido" });
  }
  const nome = (req.body.nome || "").trim();
  if (!nome) {
    return res.status(400).json({ erro: "nome não pode ser vazio" });
  }

  const { rows } = await pool.query(
    `UPDATE camadas SET nome = $1 WHERE id = $2 RETURNING id, nome`,
    [nome, camadaId]
  );
  if (!rows[0]) {
    return res.status(404).json({ erro: "camada não encontrada" });
  }
  res.json(rows[0]);
});

// Simbologia/rótulo — cor, opacidade de preenchimento, exibir rótulo e o
// zoom mínimo em que ele aparece. NULL = usa a heurística padrão (ver
// adicionarCamada em Mapa.jsx).
adminRouter.get("/admin/camadas/:id/estilo", async (req, res) => {
  const camadaId = Number(req.params.id);
  if (!Number.isInteger(camadaId)) {
    return res.status(400).json({ erro: "id de camada inválido" });
  }

  const { rows } = await pool.query("SELECT estilo_config FROM camadas WHERE id = $1", [camadaId]);
  if (!rows[0]) {
    return res.status(404).json({ erro: "camada não encontrada" });
  }
  res.json({ estilo: rows[0].estilo_config || null });
});

adminRouter.put("/admin/camadas/:id/estilo", async (req, res) => {
  const camadaId = Number(req.params.id);
  if (!Number.isInteger(camadaId)) {
    return res.status(400).json({ erro: "id de camada inválido" });
  }
  const { estilo } = req.body;
  if (!estilo || typeof estilo !== "object" || Array.isArray(estilo)) {
    return res.status(400).json({ erro: "estilo precisa ser um objeto" });
  }

  const { rows } = await pool.query(
    `UPDATE camadas SET estilo_config = $1 WHERE id = $2 RETURNING estilo_config`,
    [JSON.stringify(estilo), camadaId]
  );
  if (!rows[0]) {
    return res.status(404).json({ erro: "camada não encontrada" });
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
