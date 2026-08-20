// Precisa ser importado antes das rotas — corrige um problema real do
// Express 4: uma Promise rejeitada dentro de um handler async (ex: uma
// query falha, ou agora a chamada ao R2 falha por falta de credencial)
// não é capturada pelo Express sozinho, vira uma "unhandled rejection" e
// **derruba o processo inteiro** (não só aquela requisição). Confirmado
// na prática ao testar a rota de download sem R2_* configurado ainda —
// o servidor caiu de verdade, não voltou um erro HTTP. Isso já era uma
// lacuna pré-existente em qualquer rota (ex: uma falha transitória do
// Postgres já causaria o mesmo crash), só ficou mais provável de
// acontecer agora que toda rota de arquivo depende do R2. Sem
// dependências (é só um monkey-patch de ~50 linhas no Router do
// Express), zero risco de cadeia de dependência vulnerável.
import "express-async-errors";
import express from "express";
import cors from "cors";
import { authRouter } from "./routes/auth.js";
import { mapasRouter } from "./routes/mapas.js";
import { adminRouter } from "./routes/admin.js";
import { voosRouter } from "./routes/voos.js";

export const app = express();

app.use(cors());
app.use(express.json());

app.get("/health", (req, res) => res.json({ status: "ok" }));
app.use(authRouter);
app.use(mapasRouter);
// voosRouter precisa vir ANTES do adminRouter: adminRouter registra
// `router.use(exigirAdmin)` sem prefixo de caminho (linha logo abaixo de
// onde ele é definido) — como os dois são montados na raiz do app (sem
// app.use("/admin", ...)), esse middleware intercepta QUALQUER requisição
// que chegue até ele, não só as que batem nalguma rota /admin/* definida
// depois. Com adminRouter antes, todo usuário não-admin tomava 403 em
// /voos/* mesmo a rota existindo em voosRouter — só não apareceu antes
// porque só foi testado logado como admin.
app.use(voosRouter);
app.use(adminRouter);

// Rede de segurança final — sem isso, o erro capturado por
// express-async-errors ainda cairia no handler de erro padrão do Express,
// que devolve uma página HTML de stack trace (em dev) em vez de JSON, e
// não registra nada no log do servidor.
app.use((err, req, res, next) => {
  console.error(err);
  if (res.headersSent) return next(err);
  res.status(500).json({ erro: "erro interno do servidor" });
});
