import crypto from "node:crypto";
import express, { Router } from "express";
import { ponte } from "../lib/ponteDroneMgmt.js";

// Rotas usadas só pelo programa da ponte no servidor geo (ver
// docs/PONTE_DRONEMGMT.md e automacao/ponte-dronemgmt/). Autenticadas por um
// token compartilhado (PONTE_DM_TOKEN), não por login de usuário.
export const ponteDmRouter = Router();

// Uma página de pendências do DroneManagement passa dos 100 KB do
// express.json() global — por isso este router tem o próprio leitor e é
// montado antes dele em app.js.
ponteDmRouter.use("/ponte-dm", express.json({ limit: "50mb" }));

function tokenValido(recebido) {
  const esperado = process.env.PONTE_DM_TOKEN || "";
  if (!esperado || typeof recebido !== "string") return false;
  const a = Buffer.from(recebido);
  const b = Buffer.from(esperado);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

ponteDmRouter.use("/ponte-dm", (req, res, next) => {
  if (!tokenValido(req.get("x-ponte-token"))) {
    return res.status(401).json({ erro: "token da ponte inválido" });
  }
  next();
});

// Long-poll: devolve as tarefas pendentes ou espera até 25 s por alguma.
ponteDmRouter.get("/ponte-dm/tarefas", async (req, res) => {
  const tarefas = await ponte.pegarTarefas(25_000);
  res.json({ tarefas });
});

ponteDmRouter.post("/ponte-dm/tarefas/:id", (req, res) => {
  const { status, contentType, corpo } = req.body || {};
  if (!Number.isInteger(status)) {
    return res.status(400).json({ erro: "status obrigatório" });
  }
  const entregue = ponte.responder(req.params.id, { status, contentType, corpo });
  res.json({ ok: entregue });
});
