import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";
import { exigirAutenticacao } from "../middleware/auth.js";
import { lerContaHub } from "../lib/contaHub.js";

export const authRouter = Router();

// Contas de serviço (ex.: automação diária) que mantêm o login próprio mesmo
// com LOGIN_LOCAL desligado. Lista em CONTAS_LOGIN_LOCAL, separada por vírgula.
function contaComLoginLocal(email) {
  const lista = (process.env.CONTAS_LOGIN_LOCAL || "").split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
  return lista.includes(String(email || "").trim().toLowerCase());
}

authRouter.post("/login", async (req, res) => {
  if (process.env.LOGIN_LOCAL !== "1" && !contaComLoginLocal(req.body?.email)) {
    // Quem cai aqui está com o app antigo em cache: a mensagem diz o que fazer (o app novo entra pelo Hub).
    return res.status(410).json({ erro: "O GeoMap foi atualizado. Feche e abra o app (ou recarregue a página) e entre com a mesma senha." });
  }

  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ erro: "email e senha são obrigatórios" });
  }

  const { rows } = await pool.query(
    "SELECT id, nome, email, senha_hash, status, papel, precisa_trocar_senha FROM usuarios WHERE email = $1",
    [email]
  );
  const usuario = rows[0];

  if (!usuario || usuario.status !== "ativo") {
    return res.status(401).json({ erro: "credenciais inválidas" });
  }

  const senhaValida = await bcrypt.compare(senha, usuario.senha_hash);
  if (!senhaValida) {
    return res.status(401).json({ erro: "credenciais inválidas" });
  }

  // 30 dias em vez de 12h — pedido do usuário pra não precisar logar de
  // novo toda hora em campo (Android e iOS). O frontend já lê o `exp` do
  // próprio token pra decidir se a sessão salva em localStorage ainda
  // vale (ver tokenExpirado em AuthContext.jsx) — só mudar o expiresIn
  // aqui já estende a persistência, sem precisar mexer no frontend.
  const token = jwt.sign(
    { sub: usuario.id, email: usuario.email, papel: usuario.papel },
    process.env.JWT_SECRET,
    { expiresIn: "30d" }
  );

  await pool.query(
    "INSERT INTO logs (usuario_id, acao, ip) VALUES ($1, 'login', $2)",
    [usuario.id, req.ip]
  );

  res.json({
    token,
    usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel },
    precisaTrocarSenha: usuario.precisa_trocar_senha,
  });
});

// Troca de senha auto-atendida — mesma tela serve tanto o 1º login quanto
// um reset feito pelo admin (os dois só diferem em QUEM disparou a senha
// temporária, nunca no fluxo em si). Precisa estar autenticado (a senha
// temporária já provou que o usuário é quem diz ser); não pede a senha
// atual de novo — o próprio JWT válido já cobre essa prova.
authRouter.put("/senha", exigirAutenticacao, async (req, res) => {
  if (process.env.LOGIN_LOCAL !== "1") {
    return res.status(410).json({ erro: "a senha agora é trocada na conta do Hub Geotech" });
  }

  const novaSenha = req.body.novaSenha || "";
  if (novaSenha.length < 6) {
    return res.status(400).json({ erro: "senha precisa ter ao menos 6 caracteres" });
  }

  const senhaHash = await bcrypt.hash(novaSenha, 10);
  await pool.query(
    "UPDATE usuarios SET senha_hash = $1, precisa_trocar_senha = false WHERE id = $2",
    [senhaHash, req.usuarioId]
  );

  res.json({ ok: true });
});

// Login único: o frontend entra no Supabase do Hub e troca o token dele pelo
// JWT do GeoMap (o resto do GeoMap continua igual). Acesso = cadastro ativo
// aqui, que o Hub mantém por /integracao/contas/usuario.
authRouter.post("/auth/hub", async (req, res) => {
  const conta = await lerContaHub(req.body?.accessToken);
  if (!conta) return res.status(401).json({ erro: "login do Hub inválido ou expirado" });
  if (conta.precisaTrocarSenha) {
    return res.status(403).json({ erro: "defina sua senha antes de continuar", precisaTrocarSenha: true });
  }
  const { rows } = await pool.query("SELECT id, nome, email, status, papel FROM usuarios WHERE lower(email) = $1", [conta.email]);
  const usuario = rows[0];
  if (!usuario || usuario.status !== "ativo") {
    return res.status(403).json({ erro: "sem acesso ao GeoMap — peça ao administrador do Hub" });
  }
  const token = jwt.sign({ sub: usuario.id, email: usuario.email, papel: usuario.papel }, process.env.JWT_SECRET, { expiresIn: "30d" });
  await pool.query("INSERT INTO logs (usuario_id, acao, ip) VALUES ($1, 'login', $2)", [usuario.id, req.ip]);
  res.json({ token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email, papel: usuario.papel } });
});
