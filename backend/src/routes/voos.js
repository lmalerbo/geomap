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

  async function buscarPagina(pagina) {
    const resp = await chamarApi("/portal/api/v1/gateway/formbuilder/formdata/query", {
      params: { pageNumber: pagina, pageSize: TAMANHO_PAGINA, filter: filtro, expand: "layer,flightProject" },
    });
    if (!resp.ok) throw new Error(`DroneManagement respondeu ${resp.status}`);
    return resp.json();
  }

  let registros, count;
  try {
    // Página 1 primeiro (sozinha) pra saber `count` — só depois disso dá
    // pra saber quantas páginas faltam. Concorrência 5 nas seguintes:
    // troca N idas-e-voltas sequenciais por ⌈N/5⌉, mesma técnica já usada
    // nos scripts de limpeza desta sessão (ver backend/_achar_voos_duplicados.mjs)
    // — o DroneManagement aguentou concorrência 8 sem erro nesses scripts.
    const primeira = await buscarPagina(1);
    registros = primeira.value || [];
    count = primeira.count || 0;
    const totalPaginas = Math.ceil(count / TAMANHO_PAGINA);
    const CONCORRENCIA = 5;
    for (let inicio = 2; inicio <= totalPaginas; inicio += CONCORRENCIA) {
      const lote = [];
      for (let p = inicio; p < inicio + CONCORRENCIA && p <= totalPaginas; p++) lote.push(buscarPagina(p));
      const resultados = await Promise.all(lote);
      for (const dados of resultados) registros.push(...(dados.value || []));
    }
  } catch (err) {
    return res.status(502).json({ erro: err.message });
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
      // Área do talhão em hectares (layerDetails.totalArea, vem de
      // expand=layer acima) — pedido do Leo (2026-08-20) pra mostrar
      // hectares pendentes em vez de contagem de talhões no painel do
      // mapa (ver useApontamentoVoo.js).
      areaHa: r.layerDetails?.totalArea ?? null,
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
          // Sem isso o registro fica com os campos de data preenchidos mas
          // continua "pendente" pro próprio DroneManagement — confirmado
          // via formstructure (formbuilder/formstructure/:id): verifyFlightSize
          // 9 = "Voado", controlStatus 4 = "Voado, processar imagens" (o
          // status que a mobile app real seta ao apontar um voo, antes do
          // pipeline de processamento de imagens avançar isso mais pra
          // frente). Faltava nesta chamada — 2 apontamentos reais
          // (2026-08-20, secao 10104/10105) sumiram do GeoMap mas nunca
          // apareceram como voados no DroneManagement por causa disso.
          controlStatus: 4,
          verifyFlightSize: 9,
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
