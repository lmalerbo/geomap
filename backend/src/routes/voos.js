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
      secao: r.section,
      talhao: r.landPlot,
      controlStatus: r.controlStatus,
      verifyFlightSize: r.verifyFlightSize,
    }))
  );
});
