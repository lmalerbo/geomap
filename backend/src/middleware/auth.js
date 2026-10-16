import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";

// Quem foi desativado (pelo Hub) perde o acesso em até 60 s, mesmo com o
// token de 30 dias ainda válido.
const CACHE_MS = 60_000;
const ativos = new Map(); // usuarioId -> { ativo, ate }
export function limparCacheAtivos() { ativos.clear(); }
async function usuarioAtivo(id) {
  const c = ativos.get(id);
  if (c && c.ate > Date.now()) return c.ativo;
  const { rows } = await pool.query("SELECT status FROM usuarios WHERE id = $1", [id]);
  const ativo = rows[0]?.status === "ativo";
  ativos.set(id, { ativo, ate: Date.now() + CACHE_MS });
  return ativo;
}

export async function exigirAutenticacao(req, res, next) {
  const cabecalho = req.headers.authorization || "";
  const [tipo, token] = cabecalho.split(" ");
  if (tipo !== "Bearer" || !token) {
    return res.status(401).json({ erro: "token ausente" });
  }
  let payload;
  try {
    payload = jwt.verify(token, process.env.JWT_SECRET);
  } catch {
    return res.status(401).json({ erro: "token inválido ou expirado" });
  }
  if (!(await usuarioAtivo(payload.sub))) {
    return res.status(401).json({ erro: "acesso desativado" });
  }
  req.usuarioId = payload.sub;
  req.usuarioPapel = payload.papel;
  next();
}

// Usar sempre depois de exigirAutenticacao (depende de req.usuarioPapel).
export function exigirAdmin(req, res, next) {
  if (req.usuarioPapel !== "admin") {
    return res.status(403).json({ erro: "acesso restrito a administradores" });
  }
  next();
}
