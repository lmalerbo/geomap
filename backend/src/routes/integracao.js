import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { chamarApi } from "../lib/dronemgmt.js";
import { calcularIndicadores, lerPeriodo, hojeLocal } from "../lib/indicadoresVoo.js";
import { obterDadosIndicadores } from "../lib/fonteIndicadoresVoo.js";
import { lerNomesPilotos } from "../lib/nomesPilotos.js";

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
// do Hub fica preso ao prefixo /integracao/dronemgmt.
//
// Também mora aqui GET /integracao/voos/indicadores (2026-10-01): só
// leitura, para o agente que monta a apresentação do gerente, com chave
// própria (INDICADORES_TOKEN) — a chave do Hub não abre essa rota e vice-versa.

export const integracaoRouter = Router();

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

// Lê a variável a cada pedido (não no carregamento do módulo) e compara em
// tempo constante. Variável vazia = rota fechada.
function exigirChave(cabecalho, variavel) {
  return (req, res, next) => {
    const esperado = Buffer.from(process.env[variavel] || "");
    const recebido = Buffer.from(req.get(cabecalho) || "");
    if (!esperado.length || recebido.length !== esperado.length || !timingSafeEqual(recebido, esperado)) {
      return res.status(401).json({ erro: "não autorizado" });
    }
    next();
  };
}

// Só as rotas do Hub (agendar/consultar Linhas de Colheita). Antes era
// "/integracao" inteiro; os indicadores de voo usam outra chave.
integracaoRouter.use("/integracao/dronemgmt", exigirChave("x-hub-token", "HUB_INTEGRACAO_TOKEN"));

// Registros de Linhas de Colheita já existentes para o talhão na safra (menos
// os cancelados: controlStatus 11). Usado pra NÃO duplicar: um voo agendado
// à mão no DroneManagement, ou uma chamada anterior que caiu no meio (a
// conexão pode cair depois do POST e antes da resposta chegar ao Hub).
async function registrosLinhasColheita(harvest, section, landPlot) {
  const filtro = { $and: [
    { unitId: `UUID('${UNIT_ID}')` },
    { flightProject: `UUID('${PROJETO_LINHAS_COLHEITA}')` },
    { section },
    { landPlot },
    { harvest },
  ] };
  const r = await chamarApi("/portal/api/v1/gateway/formbuilder/formdata/query", {
    params: { pageNumber: 1, pageSize: 50, filter: JSON.stringify(filtro) },
  });
  if (!r.ok) throw new Error(`consulta de registros respondeu ${r.status}`);
  const dados = await r.json();
  return (dados.value || [])
    .filter((x) => x.section === section && String(x.landPlot) === landPlot && x.controlStatus !== 11)
    .map((x) => ({ id: x.id, controlStatus: x.controlStatus, verifyFlightSize: x.verifyFlightSize,
                   createdUtc: x.createdUtc, scheduledDate: x.scheduledDate }));
}

// Só leitura: o que já existe de Linhas de Colheita pra cada talhão.
// body: { harvest: 2026, itens: [{ section, landPlot }, ...] } (até 200)
integracaoRouter.post("/integracao/dronemgmt/linhas-colheita/consultar", async (req, res) => {
  const { harvest, itens } = req.body || {};
  if (!Number.isInteger(harvest) || !Array.isArray(itens) || !itens.length || itens.length > 200) {
    return res.status(400).json({ erro: "informe harvest (ano) e itens (1 a 200)" });
  }
  const resultados = [];
  for (const item of itens) {
    const section = String(item?.section || "").trim();
    const landPlot = String(item?.landPlot || "").trim();
    try {
      resultados.push({ section, landPlot, registros: await registrosLinhasColheita(harvest, section, landPlot) });
    } catch (err) {
      resultados.push({ section, landPlot, erro: err.message });
    }
  }
  res.json({ resultados });
});

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
      // Já existe voo de Linhas de Colheita ativo pra esse talhão na safra?
      // Devolve o existente em vez de criar outro.
      const existentes = await registrosLinhasColheita(harvest, section, landPlot);
      if (existentes.length) {
        const maisRecente = existentes.sort((a, b) => String(b.createdUtc).localeCompare(String(a.createdUtc)))[0];
        resultados.push({ section, landPlot, id: maisRecente.id, existente: true, totalExistentes: existentes.length });
        continue;
      }
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

// --- Indicadores de voo para o agente de apresentação ---
// Só leitura, chave própria (INDICADORES_TOKEN). Mesmo cálculo da página
// /indicadores, sempre com a lista por piloto e sem "meu rendimento".
// Contrato documentado em docs/INTEGRACAO_DRONEMANAGEMENT.md.
integracaoRouter.get(
  "/integracao/voos/indicadores",
  exigirChave("x-indicadores-token", "INDICADORES_TOKEN"),
  async (req, res) => {
    const hoje = hojeLocal();
    const periodo = lerPeriodo(req.query, hoje);
    if (periodo.erro) return res.status(400).json({ erro: periodo.erro });

    let dados;
    try {
      dados = await obterDadosIndicadores({ forcar: req.query.forcar === "1" });
    } catch (err) {
      console.error("Indicadores de voo (agente): falha ao consultar o DroneManagement:", err);
      return res.status(502).json({ erro: "Não foi possível consultar o DroneManagement agora." });
    }

    res.json({
      ...calcularIndicadores({
        realizados: dados.realizados,
        pendentes: dados.pendentes,
        ...periodo,
        hoje,
        nomesPilotos: await lerNomesPilotos(),
        incluirPorPiloto: true,
      }),
      atualizadoEm: dados.atualizadoEm,
      desatualizado: dados.desatualizado,
    });
  }
);
