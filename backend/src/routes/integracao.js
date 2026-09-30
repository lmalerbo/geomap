import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { chamarApi } from "../lib/dronemgmt.js";

// Integração servidor-a-servidor com o Hub Geotech (Regra B da Colheita:
// revoo de linhas). Só o agente do Hub chama estas rotas — nunca um
// navegador —, autenticado por uma chave de serviço (HUB_INTEGRACAO_TOKEN,
// env do Render), não pelo login de usuário do GeoMap. O Hub não guarda a
// senha do DroneManagement: quem fala com ele é este backend, com a mesma
// sessão de serviço de routes/voos.js.
//
// Escopo propositalmente estreito: agendar SÓ no projeto de voo "Linhas de
// Colheita" e ler a situação de registros pelo id. Nada de PUT/DELETE.
//
// Montado ANTES dos outros routers em app.js: voosRouter/adminRouter aplicam
// middleware sem prefixo e interceptariam /integracao/*. Aqui o middleware
// fica preso ao prefixo /integracao.

export const integracaoRouter = Router();

const TOKEN = process.env.HUB_INTEGRACAO_TOKEN || "";
const UNIT_ID = process.env.DRONEMGMT_UNIT_ID || "";

// Projeto de voo "Linhas de Colheita" (lista de projetos do DroneManagement,
// conferida em 2026-09-30). Único projeto em que o Hub pode agendar.
const PROJETO_LINHAS_COLHEITA = "f0bf6424-d183-492f-939a-ccaef087fbd4";

// Valores que o formulário "Agendamento de Voo" do próprio DroneManagement
// grava ao salvar (capturados de um agendamento manual real em 2026-09-30):
// flightType 3, Status 2 = "A voar", Verificar porte 5 = "Voo liberado".
const FLIGHT_TYPE = 3;
const STATUS_A_VOAR = 2;
const PORTE_VOO_LIBERADO = 5;

function exigirTokenHub(req, res, next) {
  const recebido = Buffer.from(req.get("x-hub-token") || "");
  const esperado = Buffer.from(TOKEN);
  if (!TOKEN || recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) {
    return res.status(401).json({ erro: "não autorizado" });
  }
  next();
}

integracaoRouter.use("/integracao", exigirTokenHub);

// Agenda um voo de Linhas de Colheita por talhão, do mesmo jeito que o
// formulário web: busca o talhão (layer) da safra e cria o registro.
// body: { harvest: 2026, itens: [{ section: "10119", landPlot: "1" }, ...] }
// Melhor-esforço por item (a API não tem transação entre registros).
integracaoRouter.post("/integracao/dronemgmt/linhas-colheita/agendar", async (req, res) => {
  const { harvest, itens } = req.body || {};
  if (!Number.isInteger(harvest) || !Array.isArray(itens) || !itens.length || itens.length > 200) {
    return res.status(400).json({ erro: "informe harvest (ano) e itens (1 a 200)" });
  }
  const resultados = [];
  for (const item of itens) {
    const section = String(item?.section || "").trim();
    const landPlot = String(item?.landPlot || "").trim();
    if (!/^\d{5}$/.test(section) || !/^\d{1,3}$/.test(landPlot)) {
      resultados.push({ section, landPlot, erro: "seção/talhão inválidos" });
      continue;
    }
    try {
      const busca = await chamarApi("/portal/api/v1/gateway/dronemanagement/layer/filter", {
        params: { harvestYear: harvest, section, landPlot },
      });
      if (!busca.ok) {
        resultados.push({ section, landPlot, erro: `busca do talhão respondeu ${busca.status}` });
        continue;
      }
      const talhao = await busca.json();
      if (!talhao?.id) {
        resultados.push({ section, landPlot, erro: "talhão não encontrado no DroneManagement para essa safra" });
        continue;
      }
      const criado = await chamarApi("/portal/api/v1/gateway/formbuilder/formdata", {
        method: "POST",
        body: {
          landPlot,
          flightProject: PROJETO_LINHAS_COLHEITA,
          harvest,
          section,
          unitId: UNIT_ID,
          layer: talhao.id,
          flightType: FLIGHT_TYPE,
          controlStatus: STATUS_A_VOAR,
          verifyFlightSize: PORTE_VOO_LIBERADO,
          scheduledDate: new Date().toISOString(),
        },
      });
      if (!criado.ok) {
        resultados.push({ section, landPlot, erro: `DroneManagement respondeu ${criado.status}: ${(await criado.text()).slice(0, 200)}` });
        continue;
      }
      const registro = await criado.json();
      resultados.push({
        section, landPlot, id: registro.id,
        estagio: talhao.internship ?? null, dataCorte: talhao.cutDate ?? null,
      });
    } catch (err) {
      resultados.push({ section, landPlot, erro: err.message });
    }
  }
  res.json({ resultados });
});

// Situação atual de registros (por id), pra o Hub acompanhar
// agendado → voado → divulgado. body: { ids: [...] } (até 200).
integracaoRouter.post("/integracao/dronemgmt/situacao", async (req, res) => {
  const { ids } = req.body || {};
  if (!Array.isArray(ids) || !ids.length || ids.length > 200) {
    return res.status(400).json({ erro: "informe ids (1 a 200)" });
  }
  const resultados = [];
  for (const id of ids) {
    if (!/^[0-9a-f-]{36}$/i.test(String(id))) {
      resultados.push({ id, erro: "id inválido" });
      continue;
    }
    try {
      const r = await chamarApi(`/portal/api/v1/gateway/formbuilder/formdata/${id}`);
      if (!r.ok) {
        resultados.push({ id, erro: `DroneManagement respondeu ${r.status}` });
        continue;
      }
      const d = await r.json();
      resultados.push({
        id,
        flightProject: d.flightProject,
        controlStatus: d.controlStatus,
        verifyFlightSize: d.verifyFlightSize,
        startDateFlight: d.startDateFlight ?? null,
        dateDisclosureProcessing: d.dateDisclosureProcessing ?? null,
        modifiedUtc: d.modifiedUtc ?? null,
      });
    } catch (err) {
      resultados.push({ id, erro: err.message });
    }
  }
  res.json({ resultados });
});
