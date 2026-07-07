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
    "SELECT id, nome, email, senha_hash, status FROM usuarios WHERE email = $1",
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

  const token = jwt.sign(
    { sub: usuario.id, email: usuario.email },
    process.env.JWT_SECRET,
    { expiresIn: "12h" }
  );

  await pool.query(
    "INSERT INTO logs (usuario_id, acao, ip) VALUES ($1, 'login', $2)",
    [usuario.id, req.ip]
  );

  res.json({ token, usuario: { id: usuario.id, nome: usuario.nome, email: usuario.email } });
});
