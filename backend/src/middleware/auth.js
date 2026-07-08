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
    req.usuarioPapel = payload.papel;
    next();
  } catch {
    return res.status(401).json({ erro: "token inválido ou expirado" });
  }
}

// Usar sempre depois de exigirAutenticacao (depende de req.usuarioPapel).
export function exigirAdmin(req, res, next) {
  if (req.usuarioPapel !== "admin") {
    return res.status(403).json({ erro: "acesso restrito a administradores" });
  }
  next();
}
