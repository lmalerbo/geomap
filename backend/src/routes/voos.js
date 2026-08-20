import { Router } from "express";
import { pool } from "../db/pool.js";
import { exigirAutenticacao } from "../middleware/auth.js";
import { chamarApi } from "../lib/dronemgmt.js";

// Proxy pra integração DroneManagement (apontamento de voo pelo mapa) —
// ver docs/INTEGRACAO_DRONEMANAGEMENT.md pro contrato completo da API de
// terceiros. O frontend nunca fala direto com o DroneManagement: só com
// essas rotas, que guardam a sessão de serviço e nunca expõem
// cookie/token/credencial pro navegador do usuário.

export const voosRouter = Router();

voosRouter.use(exigirAutenticacao);

const UNIT_ID = process.env.DRONEMGMT_UNIT_ID || "";

// Mesmo critério de "pendente" já usado pela tela "Agendamento de Voos"
// do DroneManagement (2 Aguardar porte .. 6 Voar urgente — tudo antes de
// 9 Voado), confirmado capturando a requisição real dessa tela.
const VERIFY_FLIGHT_SIZE_PENDENTES = [2, 3, 4, 5, 6];

const TAMANHO_PAGINA = 500;

// Mesmo JOIN já usado em mapas.js (GET /mapas, GET /camadas/:id/download)
// — permissão vale pro mapa inteiro, não por camada.
async function usuarioTemPermissaoMapa(usuarioId, mapaId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM mapas m
     JOIN permissoes p ON p.mapa_id = m.id
     JOIN usuarios_grupos ug ON ug.grupo_id = p.grupo_id
     WHERE ug.usuario_id = $1 AND m.id = $2
     LIMIT 1`,
    [usuarioId, mapaId]
  );
  return rows.length > 0;
}

// Lista os talhões pendentes de voo pra unidade configurada
// (DRONEMGMT_UNIT_ID) — devolve só os campos que o mapa precisa pra
// cruzar com SECAO/TALHAO e colorir por status; nunca cookie/token.
voosRouter.get("/voos/pendentes/:mapaId", async (req, res) => {
  const mapaId = Number(req.params.mapaId);
  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "mapaId inválido" });
  }
  if (!(await usuarioTemPermissaoMapa(req.usuarioId, mapaId))) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }

  const filtro = JSON.stringify({
    $and: [
      { unitId: `UUID('${UNIT_ID}')` },
      { $or: VERIFY_FLIGHT_SIZE_PENDENTES.map((v) => ({ verifyFlightSize: v })) },
    ],
  });

  const registros = [];
  let pagina = 1;
  while (true) {
    const resp = await chamarApi("/portal/api/v1/gateway/formbuilder/formdata/query", {
      params: { pageNumber: pagina, pageSize: TAMANHO_PAGINA, filter: filtro, expand: "layer,flightProject" },
    });
    if (!resp.ok) {
      return res.status(502).json({ erro: `DroneManagement respondeu ${resp.status}` });
    }
    const dados = await resp.json();
    const registrosPagina = dados.value || [];
    registros.push(...registrosPagina);
    if (!registrosPagina.length || registros.length >= (dados.count || 0)) break;
    pagina += 1;
  }

  res.json(
    registros.map((r) => ({
      id: r.id,
      // Nome do projeto/campanha de voo (ex: "Falhas Plantio", "Projeto
      // Plantio") — vem de flightProjectDetails porque pedimos
      // expand=flightProject na query acima; sem isso só teríamos o uuid
      // de flightProject, inútil pra mostrar/filtrar na tela.
      projeto: r.flightProjectDetails?.description || null,
      secao: r.section,
      talhao: r.landPlot,
      controlStatus: r.controlStatus,
      verifyFlightSize: r.verifyFlightSize,
    }))
  );
});

// Apontamento em lote — o piloto seleciona vários talhões pendentes no
// mapa (modo de apontamento, ver docs/INTEGRACAO_DRONEMANAGEMENT.md) e
// confirma uma data única pro lote inteiro. Melhor-esforço por item: a
// API do DroneManagement não tem transação entre registros, então um
// item falhar não aborta os outros — a resposta separa sucesso de falha
// pro frontend refletir por talhão.
voosRouter.post("/voos/apontamentos", async (req, res) => {
  const { mapaId, dataVoo, registros } = req.body || {};

  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "mapaId inválido" });
  }
  if (!dataVoo || Number.isNaN(Date.parse(dataVoo))) {
    return res.status(400).json({ erro: "dataVoo inválida" });
  }
  if (!Array.isArray(registros) || registros.length === 0) {
    return res.status(400).json({ erro: "registros deve ser uma lista não-vazia" });
  }
  for (const r of registros) {
    if (!r?.id || !r?.secao || !r?.talhao) {
      return res.status(400).json({ erro: "cada item de registros precisa de id, secao e talhao" });
    }
  }

  if (!(await usuarioTemPermissaoMapa(req.usuarioId, mapaId))) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }

  const { rows: pilotoRows } = await pool.query(
    "SELECT pilot_user_ad_id FROM pilotos_dronemgmt WHERE usuario_id = $1",
    [req.usuarioId]
  );
  const pilotUserADId = pilotoRows[0]?.pilot_user_ad_id;
  if (!pilotUserADId) {
    return res.status(400).json({ erro: "seu usuário não está associado a um piloto do DroneManagement" });
  }

  const dataIso = new Date(dataVoo).toISOString();
  const sucesso = [];
  const falha = [];

  for (const registro of registros) {
    try {
      // O PUT do DroneManagement valida o corpo inteiro como se fosse
      // substituir o registro (campos obrigatórios como flightProject
      // continuam exigidos mesmo numa "atualização") — não é PATCH
      // parcial. Precisa buscar o registro atual primeiro e mesclar as
      // mudanças nele, senão volta 400 "Projeto voo deve ser preenchido"
      // (confirmado testando). Os 5 campos de metadado do registro
      // (id/isEnabled/userId/createdUtc/modifiedUtc) são geridos pelo
      // próprio servidor e precisam ser removidos antes do PUT, senão
      // volta 400 "campos ... são inválidos para esse formulário"
      // (confirmado testando).
      const getResp = await chamarApi(`/portal/api/v1/gateway/formbuilder/formdata/${registro.id}`);
      if (!getResp.ok) {
        falha.push({ id: registro.id, erro: `DroneManagement (GET) respondeu ${getResp.status}` });
        continue;
      }
      const { id: _id, isEnabled, userId, createdUtc, modifiedUtc, ...camposEditaveis } = await getResp.json();
      const resp = await chamarApi(`/portal/api/v1/gateway/formbuilder/formdata/${registro.id}`, {
        method: "PUT",
        body: {
          ...camposEditaveis,
          startDateFlight: dataIso,
          endDateFlight: dataIso,
          source: 2,
          pilotUserADId,
        },
      });
      if (!resp.ok) {
        falha.push({ id: registro.id, erro: `DroneManagement respondeu ${resp.status}` });
        continue;
      }
      await pool.query(
        "INSERT INTO apontamentos_voo (usuario_id, mapa_id, dronemgmt_id, secao, talhao) VALUES ($1, $2, $3, $4, $5)",
        [req.usuarioId, mapaId, registro.id, registro.secao, registro.talhao]
      );
      sucesso.push(registro.id);
    } catch (err) {
      falha.push({ id: registro.id, erro: err.message });
    }
  }

  res.json({ sucesso, falha });
});
