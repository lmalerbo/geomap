import { Router } from "express";
import { pool } from "../db/pool.js";
import { exigirAutenticacao } from "../middleware/auth.js";
import { chamarApi } from "../lib/dronemgmt.js";
import { usuarioTemPermissaoMapa } from "../lib/permissoes.js";
import { motivoParaNaoApontar, VERSAO_REGRA_PENDENTES } from "../lib/regrasApontamento.js";
import { contarRegistros, buscarTodosRegistros } from "../lib/consultaDroneMgmt.js";
import { filtroPendentesDroneMgmt, filtrarEMapearPendentes } from "../lib/pendentesVoo.js";

// Proxy pra integração DroneManagement (apontamento de voo pelo mapa) —
// ver docs/INTEGRACAO_DRONEMANAGEMENT.md pro contrato completo da API de
// terceiros. O frontend nunca fala direto com o DroneManagement: só com
// essas rotas, que guardam a sessão de serviço e nunca expõem
// cookie/token/credencial pro navegador do usuário.

export const voosRouter = Router();

voosRouter.use(exigirAutenticacao);

const UNIT_ID = process.env.DRONEMGMT_UNIT_ID || "";

// Lista os talhões pendentes de voo pra unidade configurada
// (DRONEMGMT_UNIT_ID) — devolve só os campos que o mapa precisa pra
// cruzar com SECAO/TALHAO e colorir por status; nunca cookie/token.
//
// Cache persistente (voos_pendentes_cache, migration 013): buscar e
// processar os ~3700 registros pendentes leva uns 18s (medido em
// produção, 2026-09-21), mesmo com a sessão de login já em cache — pedido
// do Leo pra só pagar esse custo quando algo de fato mudou. A cada
// chamada, primeiro faz uma checagem barata (pageSize:1, só pra saber o
// `count` atual — medido em ~0.5s com sessão quente, contra ~18s da busca
// completa) e só refaz a busca completa se esse número for diferente do
// que está salvo. `?forcar=1` pula essa checagem e busca tudo de novo na
// hora — escape hatch pro caso raro em que um registro é removido e outro
// adicionado no mesmo intervalo (count bate por coincidência, mas o
// conteúdo mudou).
voosRouter.get("/voos/pendentes/:mapaId", async (req, res) => {
  const mapaId = Number(req.params.mapaId);
  if (!Number.isInteger(mapaId)) {
    return res.status(400).json({ erro: "mapaId inválido" });
  }
  if (!(await usuarioTemPermissaoMapa(req.usuarioId, mapaId))) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }

  const filtro = filtroPendentesDroneMgmt(UNIT_ID);
  const forcar = req.query.forcar === "1";

  try {
    const countAtual = await contarRegistros(filtro);

    if (!forcar) {
      const { rows } = await pool.query(
        "SELECT count_dronemgmt, registros FROM voos_pendentes_cache WHERE mapa_id = $1",
        [mapaId]
      );
      // Cache novo guarda {regra, itens}; o formato antigo (array puro) ou
      // uma regra diferente da atual contam como cache vencido.
      const cache = rows[0]?.registros;
      if (rows[0]?.count_dronemgmt === countAtual && cache?.regra === VERSAO_REGRA_PENDENTES) {
        return res.json(cache.itens);
      }
    }

    const { count, registros: registrosBrutos } = await buscarTodosRegistros(filtro);
    const registros = filtrarEMapearPendentes(registrosBrutos);
    await pool.query(
      `INSERT INTO voos_pendentes_cache (mapa_id, count_dronemgmt, registros, atualizado_em)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (mapa_id) DO UPDATE SET count_dronemgmt = $2, registros = $3, atualizado_em = now()`,
      [mapaId, count, JSON.stringify({ regra: VERSAO_REGRA_PENDENTES, itens: registros })]
    );
    res.json(registros);
  } catch (err) {
    return res.status(502).json({ erro: err.message });
  }
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
      const atual = await getResp.json();
      const motivo = motivoParaNaoApontar(atual);
      if (motivo) {
        falha.push({ id: registro.id, erro: motivo });
        continue;
      }
      const { id: _id, isEnabled, userId, createdUtc, modifiedUtc, ...camposEditaveis } = atual;
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
