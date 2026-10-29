import { Router } from "express";
import { timingSafeEqual } from "node:crypto";
import { chamarApi } from "../lib/dronemgmt.js";
import { calcularIndicadores, lerPeriodo, hojeLocal } from "../lib/indicadoresVoo.js";
import { obterDadosIndicadores } from "../lib/fonteIndicadoresVoo.js";
import { lerNomesPilotos } from "../lib/nomesPilotos.js";
import { pool } from "../db/pool.js";
import { buscarTodosRegistros } from "../lib/consultaDroneMgmt.js";
import { filtroVoosPreparo, mapearVoosPreparo, secaoValida } from "../lib/voosPreparo.js";

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

// Voos de Sistematização/Expansão por fazenda, pra fase de voo do Preparo no Hub.
// Só leitura. body: { secoes: ["10724", ...] } (até 50).
integracaoRouter.post("/integracao/dronemgmt/preparo/voos", async (req, res) => {
  const { secoes } = req.body || {};
  if (!Array.isArray(secoes) || !secoes.length || secoes.length > 50 || !secoes.every(secaoValida)) {
    return res.status(400).json({ erro: "informe secoes (1 a 50, só dígitos)" });
  }
  const resultados = [];
  for (const section of secoes) {
    try {
      const { registros } = await buscarTodosRegistros(filtroVoosPreparo(UNIT_ID, section));
      resultados.push({ section, registros: mapearVoosPreparo(registros) });
    } catch (err) {
      resultados.push({ section, erro: err.message });
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

// ── Contas (login único, 2026-10) ─────────────────────────────────────────
// O Hub Geotech é o dono das contas e senhas: o GeoMap só guarda quem está
// ativo, se é admin, em quais grupos está e os mapas individuais. Quem chama
// é a função "contas" do Hub, com a mesma chave do Hub. Grupos e mapas
// continuam definidos aqui.
integracaoRouter.use("/integracao/contas", exigirChave("x-hub-token", "HUB_INTEGRACAO_TOKEN"));

integracaoRouter.get("/integracao/contas/grupos", async (req, res) => {
  const { rows } = await pool.query("SELECT id, nome FROM grupos ORDER BY nome");
  res.json(rows);
});

integracaoRouter.get("/integracao/contas/mapas", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT m.id, m.nome,
            coalesce(json_agg(json_build_object('grupoId', p.grupo_id, 'podeEditar', p.pode_editar)
                              ORDER BY p.grupo_id) FILTER (WHERE p.grupo_id IS NOT NULL), '[]') AS grupos
       FROM mapas m LEFT JOIN permissoes p ON p.mapa_id = m.id
      GROUP BY m.id ORDER BY m.nome`
  );
  res.json(rows);
});

integracaoRouter.get("/integracao/contas/usuarios", async (req, res) => {
  const { rows } = await pool.query(
    `SELECT lower(u.email) AS email, u.nome, u.status, u.papel, u.precisa_trocar_senha AS "precisaTrocarSenha",
            coalesce(array_agg(ug.grupo_id) FILTER (WHERE ug.grupo_id IS NOT NULL), '{}') AS "grupoIds",
            (SELECT coalesce(json_agg(json_build_object('mapaId', pu.mapa_id, 'podeEditar', pu.pode_editar) ORDER BY pu.mapa_id), '[]')
               FROM permissoes_usuario pu WHERE pu.usuario_id = u.id) AS mapas
       FROM usuarios u LEFT JOIN usuarios_grupos ug ON ug.usuario_id = u.id
      GROUP BY u.id ORDER BY u.nome`
  );
  res.json(rows);
});

integracaoRouter.put("/integracao/contas/usuario", async (req, res) => {
  const email = String(req.body?.email || "").trim().toLowerCase();
  const nome = String(req.body?.nome || "").trim();
  const ativo = req.body?.ativo === true;
  const papel = req.body?.admin === true ? "admin" : "usuario";
  const status = ativo ? "ativo" : "inativo";
  const pedidos = Array.isArray(req.body?.grupoIds) ? req.body.grupoIds.map(Number).filter(Number.isInteger) : [];
  if (!email.includes("@") || !nome) return res.status(400).json({ erro: "email e nome são obrigatórios" });

  const atual = (await pool.query("SELECT id, papel, status FROM usuarios WHERE lower(email) = $1", [email])).rows[0];
  if (!atual && !ativo) return res.json({ ok: true, criado: false });

  if (atual && atual.papel === "admin" && atual.status === "ativo" && (papel !== "admin" || status !== "ativo")) {
    const { rows } = await pool.query(
      "SELECT count(*)::int AS n FROM usuarios WHERE papel = 'admin' AND status = 'ativo' AND id <> $1", [atual.id]);
    if (rows[0].n === 0) return res.status(400).json({ erro: "não é possível remover o último admin ativo do GeoMap" });
  }

  const grupoIds = ativo && pedidos.length
    ? (await pool.query("SELECT id FROM grupos WHERE id = ANY($1::int[])", [pedidos])).rows.map((g) => g.id)
    : [];

  let id = atual?.id;
  if (atual) {
    await pool.query("UPDATE usuarios SET nome = $1, papel = $2, status = $3 WHERE id = $4", [nome, papel, status, id]);
  } else {
    // "!hub" não é um hash bcrypt: ninguém entra pelo login antigo com essa conta.
    id = (await pool.query(
      `INSERT INTO usuarios (nome, email, senha_hash, papel, status, precisa_trocar_senha)
       VALUES ($1, $2, '!hub', $3, $4, false) RETURNING id`, [nome, email, papel, status])).rows[0].id;
  }
  await pool.query("DELETE FROM usuarios_grupos WHERE usuario_id = $1", [id]);
  if (grupoIds.length) {
    await pool.query(
      "INSERT INTO usuarios_grupos (usuario_id, grupo_id) SELECT $1, unnest($2::int[]) ON CONFLICT DO NOTHING", [id, grupoIds]);
  }

  // "mapas" é opcional: um Hub antigo não manda e os mapas individuais ficam como estão.
  if (!ativo || Array.isArray(req.body?.mapas)) {
    // Mapa repetido: vale a última ocorrência (o ON CONFLICT não aceita duas no mesmo INSERT).
    const pedidosMapa = [...new Map(ativo ? req.body.mapas
      .map((m) => ({ mapaId: Number(m?.mapaId), podeEditar: m?.podeEditar === true }))
      .filter((m) => Number.isInteger(m.mapaId))
      .map((m) => [m.mapaId, m]) : []).values()];
    await pool.query("DELETE FROM permissoes_usuario WHERE usuario_id = $1", [id]);
    if (pedidosMapa.length) {
      await pool.query(
        `INSERT INTO permissoes_usuario (usuario_id, mapa_id, pode_editar)
         SELECT $1, x.mapa_id, x.pode_editar
           FROM unnest($2::int[], $3::bool[]) AS x(mapa_id, pode_editar)
           JOIN mapas m ON m.id = x.mapa_id
         ON CONFLICT (usuario_id, mapa_id) DO UPDATE SET pode_editar = excluded.pode_editar`,
        [id, pedidosMapa.map((m) => m.mapaId), pedidosMapa.map((m) => m.podeEditar)]);
    }
  }
  res.json({ ok: true, criado: !atual, id });
});
