import { Router } from "express";
import { pool } from "../db/pool.js";
import { exigirAutenticacao } from "../middleware/auth.js";
import { chamarApi } from "../lib/dronemgmt.js";
import { usuarioTemPermissaoMapa } from "../lib/permissoes.js";

// Proxy pra integração DroneManagement (apontamento de voo pelo mapa) —
// ver docs/INTEGRACAO_DRONEMANAGEMENT.md pro contrato completo da API de
// terceiros. O frontend nunca fala direto com o DroneManagement: só com
// essas rotas, que guardam a sessão de serviço e nunca expõem
// cookie/token/credencial pro navegador do usuário.

export const voosRouter = Router();

voosRouter.use(exigirAutenticacao);

const UNIT_ID = process.env.DRONEMGMT_UNIT_ID || "";

// Critério de "pendente pra voar de verdade" — pedido explícito do Leo
// (2026-09-22), depois de reparar que talhões com Verificar Porte
// "Aguardar porte"/"Verificar porte" (valores 2/3) apareciam no mapa como
// se estivessem prontos, mesmo Status já mostrando "A voar": esses dois
// valores só significam "na fila, esperando o porte da cana", não "pode
// voar agora" — só 4 (Voar), 5 (Voo liberado) e 6 (Voar urgente) são de
// verdade acionáveis. Restrito ainda mais aqui (só 5/6, sem o 4) porque
// foi exatamente o que o Leo pediu ao descrever a regra.
const CONTROL_STATUS_A_VOAR = 2; // "Status" = A voar
const VERIFY_FLIGHT_SIZE_PRONTOS = [5, 6]; // "Verificar Porte" = Voo liberado, Voar urgente

// Falhas Soca tem uma trava extra: só considerar pendente quem está em
// 02º ou 03º Corte (layerDetails.internship) — mesmo critério de negócio
// já usado nos scripts de limpeza desta sessão (ver
// backend/_cancelar_estagio_soca.mjs), agora também aplicado no que o
// piloto vê no mapa, não só na limpeza administrativa.
const FINALIDADE_FALHAS_SOCA = "Falhas Soca";
const ESTAGIOS_FALHAS_SOCA = new Set([2, 3]); // 02º Corte, 03º Corte

// Falhas Soca também não voa em área de fornecedor (Propriedade =
// layerDetails.transferProperty) — pedido do Leo (2026-09-24), mesmo
// critério do script de limpeza _cancelar_fornecedores_soca.mjs. Precisa
// estar aqui também porque o DroneManagement reagenda sozinho o que foi
// cancelado. Só vale pra Falhas Soca: Falhas Plantio voa em fornecedor
// de verdade.
const PROPRIEDADES_FORNECEDOR = new Set(["FORNECEDOR", "FORNEC. SUBPARCERIA", "FORNECEDOR TROCA"]);

const TAMANHO_PAGINA = 500;

function mapearRegistro(r) {
  return {
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
  };
}

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

  const filtro = JSON.stringify({
    $and: [
      { unitId: `UUID('${UNIT_ID}')` },
      { controlStatus: CONTROL_STATUS_A_VOAR },
      { $or: VERIFY_FLIGHT_SIZE_PRONTOS.map((v) => ({ verifyFlightSize: v })) },
    ],
  });

  async function buscarPagina(pagina, tamanhoPagina = TAMANHO_PAGINA) {
    const resp = await chamarApi("/portal/api/v1/gateway/formbuilder/formdata/query", {
      params: { pageNumber: pagina, pageSize: tamanhoPagina, filter: filtro, expand: "layer,flightProject" },
    });
    if (!resp.ok) throw new Error(`DroneManagement respondeu ${resp.status}`);
    return resp.json();
  }

  const forcar = req.query.forcar === "1";

  try {
    const checagem = await buscarPagina(1, 1);
    const countAtual = checagem.count || 0;

    if (!forcar) {
      const { rows } = await pool.query(
        "SELECT count_dronemgmt, registros FROM voos_pendentes_cache WHERE mapa_id = $1",
        [mapaId]
      );
      if (rows[0] && rows[0].count_dronemgmt === countAtual) {
        return res.json(rows[0].registros);
      }
    }

    // Página 1 primeiro (sozinha) pra saber `count`... já sabemos (acima),
    // mas precisamos dos registros de verdade agora, não só count.
    // Concorrência 5 nas seguintes: troca N idas-e-voltas sequenciais por
    // ⌈N/5⌉, mesma técnica já usada nos scripts de limpeza desta sessão
    // (ver backend/_achar_voos_duplicados.mjs) — o DroneManagement
    // aguentou concorrência 8 sem erro nesses scripts.
    const primeira = await buscarPagina(1);
    const registrosBrutos = primeira.value || [];
    const count = primeira.count || 0;
    const totalPaginas = Math.ceil(count / TAMANHO_PAGINA);
    const CONCORRENCIA = 5;
    for (let inicio = 2; inicio <= totalPaginas; inicio += CONCORRENCIA) {
      const lote = [];
      for (let p = inicio; p < inicio + CONCORRENCIA && p <= totalPaginas; p++) lote.push(buscarPagina(p));
      const resultados = await Promise.all(lote);
      for (const dados of resultados) registrosBrutos.push(...(dados.value || []));
    }

    // Falhas Soca fora de 02º/03º Corte ou em área de fornecedor não conta
    // como pendente de verdade (ver ESTAGIOS_FALHAS_SOCA e
    // PROPRIEDADES_FORNECEDOR acima) — as outras finalidades não têm essas
    // travas extras.
    const registrosFiltrados = registrosBrutos.filter((r) => {
      if (r.flightProjectDetails?.description === FINALIDADE_FALHAS_SOCA) {
        return (
          ESTAGIOS_FALHAS_SOCA.has(r.layerDetails?.internship) &&
          !PROPRIEDADES_FORNECEDOR.has(r.layerDetails?.transferProperty)
        );
      }
      return true;
    });

    const registros = registrosFiltrados.map(mapearRegistro);
    await pool.query(
      `INSERT INTO voos_pendentes_cache (mapa_id, count_dronemgmt, registros, atualizado_em)
       VALUES ($1, $2, $3, now())
       ON CONFLICT (mapa_id) DO UPDATE SET count_dronemgmt = $2, registros = $3, atualizado_em = now()`,
      [mapaId, count, JSON.stringify(registros)]
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
