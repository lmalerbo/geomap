import { Router } from "express";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";
import { pool } from "../db/pool.js";

export const authRouter = Router();

authRouter.post("/login", async (req, res) => {
  const { email, senha } = req.body;

  if (!email || !senha) {
    return res.status(400).json({ erro: "email e senha são obrigatórios" });
  }

  const { rows } = await pool.query(
    "SELECT id, nome, email, senha_hash, status, papel FROM usuarios WHERE email = $1",
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
  });
});
