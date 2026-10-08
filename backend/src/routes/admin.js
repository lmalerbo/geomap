import { Router } from "express";
import path from "node:path";
import fs from "node:fs";
import os from "node:os";
import crypto from "node:crypto";
import multer from "multer";
import bcrypt from "bcrypt";
import AdmZip from "adm-zip";
import { pool } from "../db/pool.js";
import { exigirAutenticacao, exigirAdmin } from "../middleware/auth.js";
import { SENHA_TEMPORARIA_PADRAO } from "../lib/senhaTemporaria.js";
import { testarLogin, buscarUsuarioPorLogin } from "../lib/dronemgmt.js";
import { validarShapefileNaPasta, converterPastaShapefileParaPmtiles } from "../lib/conversaoShapefile.js";
import { resumirAutomacao, DIAS_HISTORICO } from "../lib/saudeAutomacao.js";
import { ponte } from "../lib/ponteDroneMgmt.js";
import {
  salvarArquivo,
  apagarArquivo,
  duplicarArquivo,
  gerarUrlAssinada,
} from "../lib/storage.js";

export const adminRouter = Router();

// memoryStorage (não diskStorage): o arquivo fica só em req.file.buffer —
// nunca toca disco local, que num host free-tier (Render) não é
// persistente entre deploys/restarts. Destino final é sempre o R2 (ver
// lib/storage.js).
//
// Dois campos multipart: "arquivo" (um .pmtiles pronto ou, ainda
// suportado por baixo do capô, um .zip com o shapefile) e "arquivos"
// (plural — os arquivos soltos do shapefile selecionados de uma vez, sem
// precisar zipar; ver processarArquivoRecebido). A tela de admin hoje só
// usa um dos dois por envio, nunca os dois juntos.
const EXTENSOES_ARQUIVO_UNICO = new Set([".pmtiles", ".zip"]);
const EXTENSOES_ARQUIVOS_SHAPEFILE = new Set([".shp", ".dbf", ".shx", ".prj", ".cpg", ".qmd"]);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 300 * 1024 * 1024 }, // 300MB — folga generosa pro tamanho típico de .pmtiles/.zip
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (file.fieldname === "arquivo" && EXTENSOES_ARQUIVO_UNICO.has(ext)) {
      return cb(null, true);
    }
    if (file.fieldname === "arquivos" && EXTENSOES_ARQUIVOS_SHAPEFILE.has(ext)) {
      return cb(null, true);
    }
    cb(new Error(`"${file.originalname}" não é um tipo de arquivo aceito aqui`));
  },
});

// Middleware compartilhado pelas duas rotas que recebem arquivo de camada
// (criar e atualizar) — mesma configuração de campos nos dois casos.
const uploadArquivoCamada = upload.fields([
  { name: "arquivo", maxCount: 1 },
  { name: "arquivos", maxCount: 10 },
]);

// Popula pastaTemp com um shapefile a partir de um .zip enviado como
// arquivo único — caminho ainda suportado (baixo custo manter, AdmZip já
// é dependência), mesmo a tela de admin não pedindo mais isso do admin.
async function extrairZipShapefile(pastaTemp, bufferZip) {
  const caminhoZipTemp = path.join(os.tmpdir(), `geomap-upload-${crypto.randomUUID()}.zip`);
  await fs.promises.writeFile(caminhoZipTemp, bufferZip);
  try {
    new AdmZip(caminhoZipTemp).extractAllTo(pastaTemp, true);
  } finally {
    await fs.promises.unlink(caminhoZipTemp).catch(() => {});
  }
}

// Popula pastaTemp com os arquivos soltos do shapefile selecionados de
// uma vez no navegador (sem zip) — grava cada um com o nome original,
// preservando a base compartilhada, essencial pro ogr2ogr achar os
// arquivos irmãos pela convenção de nomenclatura do shapefile.
async function gravarArquivosSoltos(pastaTemp, arquivos) {
  for (const arquivo of arquivos) {
    await fs.promises.writeFile(path.join(pastaTemp, arquivo.originalname), arquivo.buffer);
  }
}

// Decide, pelo que chegou no multipart, se usa o .pmtiles direto (valida
// a assinatura), converte um .zip de shapefile, ou converte arquivos
// soltos do shapefile (upload sem zip) — sempre sobe o resultado pro R2
// com uma chave nova (UUID). Retorna a chave final (o que salvar em
// arquivo_path). Arquivo(s) chegam inteiros em memória (buffer, ver
// multer.memoryStorage acima) — só a conversão usa disco temporário
// (os.tmpdir()), porque tippecanoe/ogr2ogr exigem arquivo de verdade via
// execFile.
async function processarArquivoRecebido({ arquivoUnico, arquivosShapefile }, nomeCamada) {
  if (arquivoUnico) {
    const ext = path.extname(arquivoUnico.originalname).toLowerCase();

    if (ext === ".pmtiles") {
      if (arquivoUnico.buffer.subarray(0, 7).toString("utf8") !== "PMTiles") {
        throw new Error("arquivo não parece ser um .pmtiles válido");
      }
      const chave = `${crypto.randomUUID()}.pmtiles`;
      await salvarArquivo(chave, arquivoUnico.buffer);
      return chave;
    }

    if (ext === ".zip") {
      const pastaTemp = path.join(os.tmpdir(), `geomap-shp-${crypto.randomUUID()}`);
      await fs.promises.mkdir(pastaTemp, { recursive: true });
      let bufferPmtiles;
      try {
        await extrairZipShapefile(pastaTemp, arquivoUnico.buffer);
        const nomeShp = await validarShapefileNaPasta(pastaTemp);
        bufferPmtiles = await converterPastaShapefileParaPmtiles(pastaTemp, nomeShp, nomeCamada);
      } finally {
        await fs.promises.rm(pastaTemp, { recursive: true, force: true });
      }
      const chave = `${crypto.randomUUID()}.pmtiles`;
      await salvarArquivo(chave, bufferPmtiles);
      return chave;
    }

    throw new Error("arquivo precisa ser .pmtiles ou .zip");
  }

  if (arquivosShapefile.length > 0) {
    const pastaTemp = path.join(os.tmpdir(), `geomap-shp-${crypto.randomUUID()}`);
    await fs.promises.mkdir(pastaTemp, { recursive: true });
    let bufferPmtiles;
    try {
      await gravarArquivosSoltos(pastaTemp, arquivosShapefile);
      const nomeShp = await validarShapefileNaPasta(pastaTemp);
      bufferPmtiles = await converterPastaShapefileParaPmtiles(pastaTemp, nomeShp, nomeCamada);
    } finally {
      await fs.promises.rm(pastaTemp, { recursive: true, force: true });
    }
    const chave = `${crypto.randomUUID()}.pmtiles`;
    await salvarArquivo(chave, bufferPmtiles);
    return chave;
  }

  throw new Error("selecione um .pmtiles ou os arquivos do shapefile (.shp/.dbf/.shx/.prj)");
}

adminRouter.use(exigirAutenticacao, exigirAdmin);

// Placeholder: confirma que a proteção por papel funciona ponta a ponta.
adminRouter.get("/admin/ping", (req, res) => {
  res.json({ ok: true });
});

// TEMPORÁRIO — spike de validação da integração DroneManagement (ver
// docs/INTEGRACAO_DRONEMANAGEMENT.md, Etapa 1): confirma que o login via
// Playwright/SSO aguenta rodar dentro do ambiente real do Render (free
// tier, ~0.1 CPU) antes de construir o resto da integração em cima disso.
// Remover esta rota depois de validado — não é uma feature, é diagnóstico.
adminRouter.get("/admin/dronemgmt/teste-login", async (req, res) => {
  try {
    const resultado = await testarLogin();
    res.json({ ok: true, ...resultado });
  } catch (err) {
    res.status(500).json({ ok: false, erro: err.message });
  }
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
    `SELECT id, nome, email, departamento, status, papel, criado_em, precisa_trocar_senha
     FROM usuarios ORDER BY nome`
  );
  const { rows: membros } = await pool.query(`SELECT usuario_id, grupo_id FROM usuarios_grupos`);
  const { rows: acessos } = await pool.query(
    `SELECT usuario_id, max(data_hora) AS ultimo FROM logs WHERE acao = 'login' GROUP BY usuario_id`
  );
  const { rows: pilotos } = await pool.query("SELECT usuario_id, pilot_user_ad_id, login_dronemgmt FROM pilotos_dronemgmt");
  const ultimoAcessoPorUsuario = new Map(acessos.map((a) => [a.usuario_id, a.ultimo]));
  const pilotoPorUsuario = new Map(pilotos.map((p) => [p.usuario_id, p]));

  const gruposPorUsuario = new Map();
  for (const m of membros) {
    if (!gruposPorUsuario.has(m.usuario_id)) gruposPorUsuario.set(m.usuario_id, []);
    gruposPorUsuario.get(m.usuario_id).push(m.grupo_id);
  }

  res.json(
    usuarios.map((u) => ({
      ...u,
      grupoIds: gruposPorUsuario.get(u.id) || [],
      ultimoAcesso: ultimoAcessoPorUsuario.get(u.id) || null,
      pilotUserADId: pilotoPorUsuario.get(u.id)?.pilot_user_ad_id || null,
      pilotoLogin: pilotoPorUsuario.get(u.id)?.login_dronemgmt || null,
    }))
  );
});

// Vínculo com o piloto do DroneManagement (necessário pra apontar voo pelo
// mapa Voos). O admin digita o login da pessoa na plataforma (`login`) e o
// backend busca o id lá; `pilotUserADId` direto continua aceito como
// alternativa. Corpo vazio desvincula.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
adminRouter.put("/admin/usuarios/:id/piloto", async (req, res) => {
  const usuarioId = Number(req.params.id);
  if (!Number.isInteger(usuarioId)) {
    return res.status(400).json({ erro: "id de usuário inválido" });
  }
  const login = String(req.body?.login || "").trim();
  let pilotId = String(req.body?.pilotUserADId || "").trim();
  if (login.includes("@")) {
    return res.status(400).json({ erro: "use o usuário do DroneManagement (ex.: lmalerbo), não o e-mail" });
  }
  if (pilotId && !UUID_RE.test(pilotId)) {
    return res.status(400).json({ erro: "o id do piloto no DroneManagement tem o formato 00000000-0000-0000-0000-000000000000" });
  }
  const { rows } = await pool.query("SELECT id FROM usuarios WHERE id = $1", [usuarioId]);
  if (!rows[0]) {
    return res.status(404).json({ erro: "usuário não encontrado" });
  }

  let loginConfirmado = null;
  if (login) {
    let conta;
    try {
      conta = await buscarUsuarioPorLogin(login);
    } catch (err) {
      console.error("Falha ao buscar usuário no DroneManagement:", err);
      const msg = err.name === "ErroPonte" ? err.message : "O DroneManagement não respondeu agora. Tente de novo em alguns minutos.";
      return res.status(502).json({ erro: msg });
    }
    if (!conta) {
      return res.status(400).json({ erro: `Não achei o usuário "${login}" no DroneManagement. Confira o login (o mesmo da tela de entrada da plataforma).` });
    }
    pilotId = conta.id;
    loginConfirmado = conta.login;
  }

  if (pilotId) {
    await pool.query(
      `INSERT INTO pilotos_dronemgmt (usuario_id, pilot_user_ad_id, login_dronemgmt) VALUES ($1, $2, $3)
       ON CONFLICT (usuario_id) DO UPDATE SET pilot_user_ad_id = EXCLUDED.pilot_user_ad_id, login_dronemgmt = EXCLUDED.login_dronemgmt`,
      [usuarioId, pilotId, loginConfirmado]
    );
  } else {
    await pool.query("DELETE FROM pilotos_dronemgmt WHERE usuario_id = $1", [usuarioId]);
  }
  await registrarAuditoria(
    req.usuarioId,
    "piloto_dronemgmt",
    `usuário ${usuarioId}: ${loginConfirmado || pilotId || "desvinculado"}`,
    req.ip
  );
  res.json({ ok: true, pilotUserADId: pilotId || null, pilotoLogin: loginConfirmado });
});

adminRouter.post("/admin/usuarios", async (req, res) => {
  const nome = (req.body.nome || "").trim();
  const email = (req.body.email || "").trim().toLowerCase();
  const departamento = (req.body.departamento || "").trim() || null;
  const papel = req.body.papel === "admin" ? "admin" : "usuario";
  const grupoIds = Array.isArray(req.body.grupoIds) ? req.body.grupoIds : [];

  if (!nome || !email) {
    return res.status(400).json({ erro: "nome e email são obrigatórios" });
  }

  const { rows: existentes } = await pool.query("SELECT id FROM usuarios WHERE email = $1", [email]);
  if (existentes[0]) {
    return res.status(409).json({ erro: "já existe um usuário com esse email" });
  }

  // Senha sempre a temporária fixa — nunca escolhida pelo admin — o
  // usuário troca por uma própria antes de entrar de verdade (ver
  // precisa_trocar_senha, checado em POST /login).
  const senhaHash = await bcrypt.hash(SENHA_TEMPORARIA_PADRAO, 10);
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, departamento, papel, precisa_trocar_senha)
     VALUES ($1, $2, $3, $4, $5, true)
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

// Redefine pra senha temporária fixa (nunca uma escolhida pelo admin) e
// marca precisa_trocar_senha — o usuário só troca de novo por uma senha
// própria ao logar, na mesma tela usada no 1º login.
adminRouter.put("/admin/usuarios/:id/senha", async (req, res) => {
  const usuarioId = Number(req.params.id);
  if (!Number.isInteger(usuarioId)) {
    return res.status(400).json({ erro: "id de usuário inválido" });
  }

  const senhaHash = await bcrypt.hash(SENHA_TEMPORARIA_PADRAO, 10);
  const { rows } = await pool.query(
    "UPDATE usuarios SET senha_hash = $1, precisa_trocar_senha = true WHERE id = $2 RETURNING id",
    [senhaHash, usuarioId]
  );
  if (!rows[0]) {
    return res.status(404).json({ erro: "usuário não encontrado" });
  }

  await registrarAuditoria(req.usuarioId, "redefinir_senha", `usuário ${usuarioId}`, req.ip);
  res.json({ ok: true });
});

// Exclusão de verdade (antes só existia "status = inativo") — mesmas duas
// travas do PUT acima (não apagar a si mesmo, não zerar o último admin
// ativo). logs.usuario_id vira NULL pro histórico de quem já baixou/logou
// (migration 010) — nunca perde o registro de auditoria em si, só a
// referência ao usuário apagado. usuarios_grupos já tinha ON DELETE
// CASCADE desde o schema original, limpa sozinho.
adminRouter.delete("/admin/usuarios/:id", async (req, res) => {
  const usuarioId = Number(req.params.id);
  if (!Number.isInteger(usuarioId)) {
    return res.status(400).json({ erro: "id de usuário inválido" });
  }

  if (usuarioId === req.usuarioId) {
    return res.status(400).json({ erro: "não é possível excluir a própria conta" });
  }

  const { rows: atualRows } = await pool.query("SELECT papel, status, email FROM usuarios WHERE id = $1", [
    usuarioId,
  ]);
  const atual = atualRows[0];
  if (!atual) {
    return res.status(404).json({ erro: "usuário não encontrado" });
  }

  if (atual.papel === "admin" && atual.status === "ativo") {
    const { rows: contagem } = await pool.query(
      `SELECT count(*)::int AS total FROM usuarios
       WHERE papel = 'admin' AND status = 'ativo' AND id != $1`,
      [usuarioId]
    );
    if (contagem[0].total === 0) {
      return res.status(400).json({ erro: "não é possível excluir o último admin ativo" });
    }
  }

  await pool.query("DELETE FROM usuarios WHERE id = $1", [usuarioId]);
  await registrarAuditoria(req.usuarioId, "excluir_usuario", `usuário ${usuarioId} (${atual.email})`, req.ip);
  res.json({ ok: true });
});

// --- Mapas (projetos: "Usina da Pedra", etc — o que aparece na tela
// inicial). Permissão vive aqui, não mais por camada individual. ---

// Aceita o formato novo (permissoes: [{grupoId, podeEditar}]) e o antigo
// (grupoIds: number[] — equivale a podeEditar false), pra não quebrar um
// cliente desatualizado.
function lerPermissoesDoCorpo(body) {
  let entradas;
  if (Array.isArray(body.permissoes)) {
    entradas = body.permissoes
      .filter((p) => Number.isInteger(p?.grupoId))
      .map((p) => ({ grupoId: p.grupoId, podeEditar: p.podeEditar === true }));
  } else {
    const grupoIds = Array.isArray(body.grupoIds) ? body.grupoIds.filter(Number.isInteger) : [];
    entradas = grupoIds.map((grupoId) => ({ grupoId, podeEditar: false }));
  }
  // Dedupe por grupoId (mantém a última ocorrência) — um payload com o
  // mesmo grupoId repetido faria gravarPermissoes tentar dar upsert na
  // mesma linha duas vezes na mesma instrução, e o Postgres rejeita isso
  // com "ON CONFLICT DO UPDATE command cannot affect row a second time".
  const porGrupo = new Map();
  for (const e of entradas) porGrupo.set(e.grupoId, e);
  return [...porGrupo.values()];
}

async function gravarPermissoes(mapaId, permissoes) {
  if (permissoes.length === 0) return;
  await pool.query(
    `INSERT INTO permissoes (mapa_id, grupo_id, pode_editar)
     SELECT $1, g, e FROM unnest($2::int[], $3::bool[]) AS t(g, e)
     ON CONFLICT (mapa_id, grupo_id) DO UPDATE SET pode_editar = EXCLUDED.pode_editar`,
    [mapaId, permissoes.map((p) => p.grupoId), permissoes.map((p) => p.podeEditar)]
  );
}

// Lista todos os mapas com os grupos que têm permissão em cada um —
// admin gerencia qualquer mapa, independente do próprio grupo dele.
adminRouter.get("/admin/mapas", async (req, res) => {
  const { rows: mapas } = await pool.query(
    `SELECT id, nome, descricao, criado_em FROM mapas ORDER BY nome`
  );
  const { rows: permissoes } = await pool.query(`SELECT mapa_id, grupo_id, pode_editar FROM permissoes`);
  const { rows: contagens } = await pool.query(
    `SELECT mapa_id, count(*)::int AS total FROM camadas GROUP BY mapa_id`
  );

  const gruposPorMapa = new Map();
  const permissoesPorMapa = new Map();
  for (const p of permissoes) {
    if (!gruposPorMapa.has(p.mapa_id)) gruposPorMapa.set(p.mapa_id, []);
    gruposPorMapa.get(p.mapa_id).push(p.grupo_id);
    if (!permissoesPorMapa.has(p.mapa_id)) permissoesPorMapa.set(p.mapa_id, []);
    permissoesPorMapa.get(p.mapa_id).push({ grupoId: p.grupo_id, podeEditar: p.pode_editar });
  }
  const camadasPorMapa = new Map(contagens.map((c) => [c.mapa_id, c.total]));

  res.json(
    mapas.map((m) => ({
      ...m,
      grupoIds: gruposPorMapa.get(m.id) || [],
      permissoes: permissoesPorMapa.get(m.id) || [],
      camadaCount: camadasPorMapa.get(m.id) || 0,
    }))
  );
});

adminRouter.post("/admin/mapas", async (req, res) => {
  const nome = (req.body.nome || "").trim();
  const descricao = (req.body.descricao || "").trim() || null;
  const permissoes = lerPermissoesDoCorpo(req.body);

  if (!nome) {
    return res.status(400).json({ erro: "nome é obrigatório" });
  }

  const { rows } = await pool.query(
    `INSERT INTO mapas (nome, descricao) VALUES ($1, $2)
     RETURNING id, nome, descricao, criado_em`,
    [nome, descricao]
  );
  const mapa = rows[0];

  await gravarPermissoes(mapa.id, permissoes);

  res.status(201).json({ ...mapa, grupoIds: permissoes.map((p) => p.grupoId), permissoes });
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
  const permissoes = lerPermissoesDoCorpo(req.body);

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
  await gravarPermissoes(mapaId, permissoes);

  res.json({ ...rows[0], grupoIds: permissoes.map((p) => p.grupoId), permissoes });
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
    "SELECT grupo_id, pode_editar FROM permissoes WHERE mapa_id = $1",
    [mapaId]
  );
  const { rows: camadasOrigem } = await pool.query(
    `SELECT nome, versao, categoria, arquivo_path, atributos_config, estilo_config, ordem
     FROM camadas WHERE mapa_id = $1 ORDER BY ordem`,
    [mapaId]
  );

  const nomeCopia = `${mapaOrigem.nome} (cópia)`;
  const { rows: novoMapaRows } = await pool.query(
    `INSERT INTO mapas (nome, descricao) VALUES ($1, $2)
     RETURNING id, nome, descricao, criado_em`,
    [nomeCopia, mapaOrigem.descricao]
  );
  const novoMapa = novoMapaRows[0];

  const permissoesCopia = permissoesOrigem.map((p) => ({ grupoId: p.grupo_id, podeEditar: p.pode_editar }));
  await gravarPermissoes(novoMapa.id, permissoesCopia);
  const grupoIds = permissoesCopia.map((p) => p.grupoId);

  // Pins (anotações) NÃO são copiados: um mapa duplicado começa sem anotações.

  // Sequencial (não Promise.all) — mais fácil de saber exatamente qual
  // camada falhou se o R2 rejeitar alguma cópia no meio do caminho.
  for (const c of camadasOrigem) {
    const novaChave = `${crypto.randomUUID()}.pmtiles`;
    await duplicarArquivo(c.arquivo_path, novaChave);
    await pool.query(
      `INSERT INTO camadas (mapa_id, nome, versao, categoria, arquivo_path, atributos_config, estilo_config, ordem)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
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
        // Mesma ordem relativa da camada de origem — o mapa novo nasce
        // vazio, então não há risco de empate de `ordem` com nada que já
        // exista nele.
        c.ordem,
      ]
    );
  }

  await registrarAuditoria(
    req.usuarioId,
    "duplicar_mapa",
    `mapa ${mapaId} (${mapaOrigem.nome}) → mapa ${novoMapa.id} (${nomeCopia}), ${camadasOrigem.length} camada(s)`,
    req.ip
  );

  res.status(201).json({ ...novoMapa, grupoIds, permissoes: permissoesCopia, camadaCount: camadasOrigem.length });
});

// Duplica uma única camada (diferente de duplicar mapa inteiro acima) —
// pensado pra criar a réplica "Talhões — Voos" a partir da camada
// "Talhões" real, num mapa "Voos" separado (ver
// docs/INTEGRACAO_DRONEMANAGEMENT.md). `mapaId` no corpo é opcional: sem
// ele, duplica pro mesmo mapa da camada de origem; com ele, precisa
// apontar pra um mapa que já existe. Mesmo miolo de cópia server-side no
// R2 já usado em "duplicar mapa" acima, sem repetir a lógica de
// permissões/mapa (aqui é só a camada).
adminRouter.post("/admin/camadas/:id/duplicar", async (req, res) => {
  const camadaId = Number(req.params.id);
  if (!Number.isInteger(camadaId)) {
    return res.status(400).json({ erro: "id de camada inválido" });
  }

  const { rows: camadaRows } = await pool.query(
    `SELECT mapa_id, nome, versao, categoria, arquivo_path, atributos_config, estilo_config
     FROM camadas WHERE id = $1`,
    [camadaId]
  );
  const camadaOrigem = camadaRows[0];
  if (!camadaOrigem) {
    return res.status(404).json({ erro: "camada não encontrada" });
  }

  let mapaDestinoId = camadaOrigem.mapa_id;
  if (req.body?.mapaId !== undefined) {
    mapaDestinoId = Number(req.body.mapaId);
    if (!Number.isInteger(mapaDestinoId)) {
      return res.status(400).json({ erro: "mapaId inválido" });
    }
    const { rows: mapaDestinoRows } = await pool.query("SELECT id FROM mapas WHERE id = $1", [mapaDestinoId]);
    if (!mapaDestinoRows[0]) {
      return res.status(404).json({ erro: "mapa de destino não encontrado" });
    }
  }

  const novaChave = `${crypto.randomUUID()}.pmtiles`;
  await duplicarArquivo(camadaOrigem.arquivo_path, novaChave);

  const { rows: novaCamadaRows } = await pool.query(
    `INSERT INTO camadas (mapa_id, nome, versao, categoria, arquivo_path, atributos_config, estilo_config, ordem)
     VALUES ($1, $2, $3, $4, $5, $6, $7, COALESCE((SELECT MAX(ordem) + 1 FROM camadas WHERE mapa_id = $1), 0))
     RETURNING id, mapa_id, nome, versao, categoria, publicado_em`,
    [
      mapaDestinoId,
      `${camadaOrigem.nome} (cópia)`,
      camadaOrigem.versao,
      camadaOrigem.categoria,
      novaChave,
      camadaOrigem.atributos_config === null ? null : JSON.stringify(camadaOrigem.atributos_config),
      camadaOrigem.estilo_config === null ? null : JSON.stringify(camadaOrigem.estilo_config),
    ]
  );
  const novaCamada = novaCamadaRows[0];

  await registrarAuditoria(
    req.usuarioId,
    "duplicar_camada",
    `camada ${camadaId} (${camadaOrigem.nome}) → camada ${novaCamada.id}, mapa destino ${mapaDestinoId}`,
    req.ip
  );

  res.status(201).json(novaCamada);
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
    `SELECT id, mapa_id, nome, versao, categoria, publicado_em, estilo_config, ordem
     FROM camadas ORDER BY mapa_id, ordem`
  );
  res.json(rows);
});

// Ordem de exibição das camadas de um mapa (menor = mais acima no mapa) —
// pedido do Leo (2026-09-30). `camadaIds` é a lista COMPLETA de camadas do
// mapa, já na ordem desejada de cima pra baixo (índice do array vira
// `ordem`) — exige bater exatamente com o conjunto de camadas do mapa
// (nem a mais nem a menos) pra nunca deixar uma camada esquecida com
// `ordem` desatualizada ou apontar id de outro mapa por engano.
adminRouter.put("/admin/mapas/:id/ordem-camadas", async (req, res) => {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "id de mapa inválido" });
  }
  const camadaIds = req.body?.camadaIds;
  if (!Array.isArray(camadaIds) || camadaIds.length === 0 || !camadaIds.every(Number.isInteger)) {
    return res.status(400).json({ erro: "camadaIds deve ser uma lista de ids" });
  }

  const { rows: existentes } = await pool.query("SELECT id FROM camadas WHERE mapa_id = $1", [mapaId]);
  const idsExistentes = new Set(existentes.map((c) => c.id));
  const idsRecebidos = new Set(camadaIds);
  if (
    idsExistentes.size !== idsRecebidos.size ||
    ![...idsExistentes].every((id) => idsRecebidos.has(id))
  ) {
    return res.status(400).json({ erro: "camadaIds precisa conter exatamente as camadas deste mapa" });
  }

  await pool.query(
    `UPDATE camadas SET ordem = nova.ordem
     FROM (SELECT unnest($1::int[]) AS id, unnest($2::int[]) AS ordem) nova
     WHERE camadas.id = nova.id`,
    [camadaIds, camadaIds.map((_, i) => i)]
  );

  res.json({ ok: true });
});

// Adicionar camada: recebe o .pmtiles já gerado pelo pipeline (fora do
// escopo desta rota — o admin roda o pipeline localmente e faz upload do
// resultado), cria o registro em camadas associado a um mapa. Permissão
// não entra mais aqui — vive no mapa (ver /admin/mapas acima).
// Conversão de shapefile grande pode levar minutos (ver TIMEOUT_CONVERSAO em
// lib/conversaoShapefile.js) — POST/PUT de camada não seguram mais a conexão HTTP esse tempo
// todo. Validam tudo que é rápido de checar de forma síncrona (arquivo
// presente, campos obrigatórios, mapa/camada existe) e devolvem um jobId
// na hora; a conversão em si roda em segundo plano (funções abaixo, sem
// await no handler) e quem chamou consulta GET /admin/jobs/:id até o
// status virar concluido/erro. Contrato uniforme (sempre 202+jobId,
// mesmo pra .pmtiles pronto que resolve em <1s) — importante pra uma
// futura automação não precisar ramificar por tipo de arquivo.
async function criarJob(tipo, camadaId, usuarioId) {
  const id = crypto.randomUUID();
  await pool.query(`INSERT INTO jobs_conversao (id, tipo, camada_id, usuario_id) VALUES ($1, $2, $3, $4)`, [
    id,
    tipo,
    camadaId,
    usuarioId ?? null,
  ]);
  return id;
}

async function concluirJob(jobId, camadaId) {
  await pool.query(
    `UPDATE jobs_conversao SET status = 'concluido', camada_id = $2, atualizado_em = now() WHERE id = $1`,
    [jobId, camadaId]
  );
}

async function falharJob(jobId, erro) {
  await pool.query(
    `UPDATE jobs_conversao SET status = 'erro', erro = $2, atualizado_em = now() WHERE id = $1`,
    [jobId, erro]
  );
}

async function processarCriacaoEmSegundoPlano(jobId, { arquivoUnico, arquivosShapefile, mapaId, nome, versao, categoria }) {
  let nomeArquivoFinal;
  try {
    nomeArquivoFinal = await processarArquivoRecebido({ arquivoUnico, arquivosShapefile }, nome);
  } catch (err) {
    return falharJob(jobId, err.message);
  }

  try {
    // Camada nova entra no FUNDO do stack do mapa (maior `ordem` já usada
    // + 1), não empatada no topo (ordem 0 do default da coluna) — um admin
    // adicionando uma camada nova não espera que ela cubra as que já
    // existiam.
    const { rows } = await pool.query(
      `INSERT INTO camadas (mapa_id, nome, versao, categoria, arquivo_path, ordem)
       VALUES ($1, $2, $3, $4, $5, COALESCE((SELECT MAX(ordem) + 1 FROM camadas WHERE mapa_id = $1), 0))
       RETURNING id`,
      [mapaId, nome, versao, categoria, nomeArquivoFinal]
    );
    await concluirJob(jobId, rows[0].id);
  } catch (err) {
    await apagarArquivo(nomeArquivoFinal);
    await falharJob(jobId, err.code === "23503" ? "mapa não encontrado" : err.message);
  }
}

adminRouter.post("/admin/camadas", uploadArquivoCamada, async (req, res) => {
  const arquivoUnico = req.files?.arquivo?.[0] || null;
  const arquivosShapefile = req.files?.arquivos || [];
  if (!arquivoUnico && arquivosShapefile.length === 0) {
    return res
      .status(400)
      .json({ erro: "selecione um .pmtiles ou os arquivos do shapefile (.shp/.dbf/.shx/.prj)" });
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
  const { rows: mapaRows } = await pool.query("SELECT id FROM mapas WHERE id = $1", [mapaId]);
  if (!mapaRows[0]) {
    return res.status(400).json({ erro: "mapa não encontrado" });
  }

  const jobId = await criarJob("criar_camada", null, req.usuarioId);
  res.status(202).json({ jobId });
  processarCriacaoEmSegundoPlano(jobId, { arquivoUnico, arquivosShapefile, mapaId, nome, versao, categoria }).catch(
    (err) => console.error(`Job ${jobId} (criar_camada) falhou:`, err)
  );
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

  const { rows: versoes } = await pool.query("SELECT chave FROM versoes_camada WHERE camada_id = $1", [camadaId]);
  await pool.query("DELETE FROM camadas WHERE id = $1", [camadaId]);
  await apagarArquivo(camada.arquivo_path);
  for (const v of versoes) await apagarArquivo(v.chave);

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

  // Mesma mudança de streaming pra URL assinada da rota de download normal
  // (ver mapas.js/storage.js) — o admin lê o .pmtiles inteiro só pra tirar
  // metadata (campos disponíveis), e isso também passava pela banda do
  // Render antes.
  const url = await gerarUrlAssinada(camada.arquivo_path);
  res.json({ url });
});

// Controle de versão: atualiza o .pmtiles de uma camada já existente
// (nova versão), sem mudar id/nome/config/mapa. O arquivo antigo não é
// apagado — fica renomeado com sufixo de timestamp como backup leve,
// caso o upload novo seja ruim (sem UI de navegação por versões antigas,
// só a garantia de não perder o anterior de imediato).
// Quantas versões anteriores cada camada guarda. A automação substitui
// Talhões (~20 MB) todo dia em 4 mapas — sem limite, os backups enchiam os
// 10 GB grátis do R2 em poucos meses.
const MAX_VERSOES_ANTERIORES = 3;

// Guarda o arquivo atual como versão anterior (cópia server-side no R2) e
// apaga as que passaram do limite. Só grava a linha se a cópia deu certo —
// uma versão apontando pra uma chave inexistente não serviria pra restaurar.
async function guardarVersaoAnterior(camadaId, { chave, versao, usuarioId }) {
  const chaveBackup = `${chave}.bak-${Date.now()}`;
  try {
    await duplicarArquivo(chave, chaveBackup);
  } catch (err) {
    console.warn(`Camada ${camadaId}: não deu pra guardar a versão anterior (${err.message})`);
    return;
  }
  await pool.query(
    "INSERT INTO versoes_camada (camada_id, chave, versao, usuario_id) VALUES ($1, $2, $3, $4)",
    [camadaId, chaveBackup, versao, usuarioId ?? null]
  );
  const { rows: excedentes } = await pool.query(
    `SELECT id, chave FROM versoes_camada WHERE camada_id = $1
     ORDER BY substituida_em DESC, id DESC OFFSET $2`,
    [camadaId, MAX_VERSOES_ANTERIORES]
  );
  for (const v of excedentes) {
    await apagarArquivo(v.chave);
    await pool.query("DELETE FROM versoes_camada WHERE id = $1", [v.id]);
  }
}

async function processarAtualizacaoEmSegundoPlano(jobId, camadaId, { arquivoUnico, arquivosShapefile, versao, nomeCamadaAtual, arquivoPathAtual, versaoAtual, usuarioId }) {
  let nomeArquivoFinal;
  try {
    nomeArquivoFinal = await processarArquivoRecebido({ arquivoUnico, arquivosShapefile }, nomeCamadaAtual);
  } catch (err) {
    return falharJob(jobId, err.message);
  }

  // O arquivo atual vira versão anterior (restaurável pela tela de
  // Camadas, ver /admin/camadas/:id/versoes) antes de ser substituído.
  await guardarVersaoAnterior(camadaId, { chave: arquivoPathAtual, versao: versaoAtual, usuarioId });
  await apagarArquivo(arquivoPathAtual);

  await pool.query(`UPDATE camadas SET arquivo_path = $1, versao = $2 WHERE id = $3`, [
    nomeArquivoFinal,
    versao,
    camadaId,
  ]);
  await concluirJob(jobId, camadaId);
}

adminRouter.put("/admin/camadas/:id/arquivo", uploadArquivoCamada, async (req, res) => {
  const camadaId = Number(req.params.id);
  if (!Number.isInteger(camadaId)) {
    return res.status(400).json({ erro: "id de camada inválido" });
  }
  const arquivoUnico = req.files?.arquivo?.[0] || null;
  const arquivosShapefile = req.files?.arquivos || [];
  if (!arquivoUnico && arquivosShapefile.length === 0) {
    return res
      .status(400)
      .json({ erro: "selecione um .pmtiles ou os arquivos do shapefile (.shp/.dbf/.shx/.prj)" });
  }

  const versao = (req.body.versao || "").trim();
  if (!versao) {
    return res.status(400).json({ erro: "versão é obrigatória" });
  }

  const { rows } = await pool.query("SELECT arquivo_path, nome, versao FROM camadas WHERE id = $1", [camadaId]);
  const camadaAtual = rows[0];
  if (!camadaAtual) {
    return res.status(404).json({ erro: "camada não encontrada" });
  }

  const jobId = await criarJob("atualizar_arquivo", camadaId, req.usuarioId);
  res.status(202).json({ jobId });
  processarAtualizacaoEmSegundoPlano(jobId, camadaId, {
    arquivoUnico,
    arquivosShapefile,
    versao,
    nomeCamadaAtual: camadaAtual.nome,
    arquivoPathAtual: camadaAtual.arquivo_path,
    versaoAtual: camadaAtual.versao,
    usuarioId: req.usuarioId,
  }).catch((err) => console.error(`Job ${jobId} (atualizar_arquivo) falhou:`, err));
});

// Versões anteriores de uma camada (as mais recentes primeiro).
adminRouter.get("/admin/camadas/:id/versoes", async (req, res) => {
  const camadaId = Number(req.params.id);
  if (!Number.isInteger(camadaId)) {
    return res.status(400).json({ erro: "id de camada inválido" });
  }
  const { rows } = await pool.query(
    `SELECT v.id, v.versao, v.substituida_em AS "substituidaEm", u.nome AS "usuarioNome"
     FROM versoes_camada v LEFT JOIN usuarios u ON u.id = v.usuario_id
     WHERE v.camada_id = $1 ORDER BY v.substituida_em DESC, v.id DESC`,
    [camadaId]
  );
  res.json(rows);
});

// Volta uma versão anterior: o arquivo atual vira versão anterior (dá pra
// desfazer a restauração) e a cópia restaurada ganha uma chave nova. A
// versão muda de nome pra os aparelhos baixarem de novo no próximo
// sincronismo (eles comparam a versão local com a do servidor).
adminRouter.post("/admin/camadas/:id/versoes/:versaoId/restaurar", async (req, res) => {
  const camadaId = Number(req.params.id);
  const versaoId = Number(req.params.versaoId);
  if (!Number.isInteger(camadaId) || !Number.isInteger(versaoId)) {
    return res.status(400).json({ erro: "id inválido" });
  }
  const { rows: camadaRows } = await pool.query("SELECT arquivo_path, versao FROM camadas WHERE id = $1", [camadaId]);
  const camada = camadaRows[0];
  if (!camada) {
    return res.status(404).json({ erro: "camada não encontrada" });
  }
  const { rows: versaoRows } = await pool.query(
    "SELECT chave, versao FROM versoes_camada WHERE id = $1 AND camada_id = $2",
    [versaoId, camadaId]
  );
  const anterior = versaoRows[0];
  if (!anterior) {
    return res.status(404).json({ erro: "versão não encontrada" });
  }

  const novaChave = `${crypto.randomUUID()}.pmtiles`;
  await duplicarArquivo(anterior.chave, novaChave);
  await guardarVersaoAnterior(camadaId, { chave: camada.arquivo_path, versao: camada.versao, usuarioId: req.usuarioId });
  const agora = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
  const novaVersao = `${anterior.versao || "anterior"} (restaurada ${agora})`;
  await pool.query("UPDATE camadas SET arquivo_path = $1, versao = $2 WHERE id = $3", [novaChave, novaVersao, camadaId]);
  await apagarArquivo(camada.arquivo_path);
  await registrarAuditoria(req.usuarioId, "restaurar_versao", `camada ${camadaId}: ${novaVersao}`, req.ip);
  res.json({ ok: true, versao: novaVersao });
});

// Visão geral do admin: números gerais, saúde da automação diária,
// situação de cada camada e atividade recente. A conta de serviço da
// automação é identificada pelo e-mail (AUTOMACAO_EMAIL).
const AUTOMACAO_EMAIL = process.env.AUTOMACAO_EMAIL || "automacao@geoportal.local";

adminRouter.get("/admin/visao-geral", async (req, res) => {
  const desde = new Date(Date.now() - 30 * 86400000);
  const [{ rows: autoRows }, { rows: camadas }, { rows: contagens }, { rows: atividade }] = await Promise.all([
    pool.query("SELECT id FROM usuarios WHERE lower(email) = lower($1)", [AUTOMACAO_EMAIL]),
    pool.query(
      `SELECT c.id, c.nome, c.versao, c.publicado_em AS "publicadoEm", c.mapa_id AS "mapaId", m.nome AS "mapaNome"
       FROM camadas c JOIN mapas m ON m.id = c.mapa_id ORDER BY m.nome, c.ordem`
    ),
    pool.query(
      `SELECT (SELECT count(*)::int FROM mapas) AS mapas,
              (SELECT count(*)::int FROM camadas) AS camadas,
              (SELECT count(*)::int FROM usuarios WHERE status = 'ativo') AS usuarios`
    ),
    pool.query(
      `SELECT l.detalhe, l.data_hora AS "quando", u.nome AS "usuarioNome"
       FROM logs l LEFT JOIN usuarios u ON u.id = l.usuario_id
       WHERE l.acao = 'admin' ORDER BY l.data_hora DESC LIMIT 8`
    ),
  ]);
  const automacaoId = autoRows[0]?.id ?? null;
  const [{ rows: logins }, { rows: jobs }] = await Promise.all([
    automacaoId == null
      ? { rows: [] }
      : pool.query(
          "SELECT data_hora FROM logs WHERE usuario_id = $1 AND acao = 'login' AND data_hora >= $2",
          [automacaoId, desde]
        ),
    pool.query(
      `SELECT camada_id AS "camadaId", tipo, status, erro, criado_em AS "criadoEm",
              atualizado_em AS "atualizadoEm", usuario_id AS "usuarioId"
       FROM jobs_conversao WHERE criado_em >= $1`,
      [desde]
    ),
  ]);

  const automacao = resumirAutomacao({
    agora: new Date(),
    automacaoId,
    logins: logins.map((l) => l.data_hora),
    jobs,
    camadas,
  });
  res.json({
    totais: contagens[0],
    automacao: { ...automacao, email: AUTOMACAO_EMAIL, diasHistorico: DIAS_HISTORICO },
    // Ponte do DroneManagement pelo servidor geo (só faz sentido com
    // DM_VIA_PONTE=1 — sem ela o backend chama a plataforma direto).
    ponteDm: { emUso: process.env.DM_VIA_PONTE === "1", ...ponte.estado() },
    atividade,
  });
});

adminRouter.get("/admin/jobs/:id", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT id, tipo, status, erro, camada_id AS "camadaId" FROM jobs_conversao WHERE id = $1`,
    [req.params.id]
  );
  if (!rows[0]) {
    return res.status(404).json({ erro: "job não encontrado" });
  }
  res.json(rows[0]);
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
