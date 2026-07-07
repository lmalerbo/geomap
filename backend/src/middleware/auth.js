import jwt from "jsonwebtoken";

export function exigirAutenticacao(req, res, next) {
  const cabecalho = req.headers.authorization || "";
  const [tipo, token] = cabecalho.split(" ");

  if (tipo !== "Bearer" || !token) {
    return res.status(401).json({ erro: "token ausente" });
  }

  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.usuarioId = payload.sub;
    next();
  } catch {
    return res.status(401).json({ erro: "token inválido ou expirado" });
  }
}
