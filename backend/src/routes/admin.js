import { Router } from "express";
import { exigirAutenticacao, exigirAdmin } from "../middleware/auth.js";

export const adminRouter = Router();

adminRouter.use(exigirAutenticacao, exigirAdmin);

// Placeholder: confirma que a proteção por papel funciona ponta a ponta.
// As seções reais (camadas, atributos, simbologia) entram nas próximas etapas.
adminRouter.get("/admin/ping", (req, res) => {
  res.json({ ok: true });
});
