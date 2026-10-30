import { Router } from "express";
import { randomUUID } from "node:crypto";
import { pool } from "../db/pool.js";
import { exigirAutenticacao } from "../middleware/auth.js";
import { usuarioPodeVerMapa, usuarioPodeEditarMapa } from "../lib/permissoes.js";
import { obterDadosIndicadores } from "../lib/fonteIndicadoresVoo.js";
import { selecionarVoosFLP, transicaoPermitida, limitarFeitoEm, STATUS_EXCEDENTE } from "../lib/casosExcedente.js";

// Plantio Excedente — ver docs/superpowers/specs/2026-10-30-plantio-excedente-design.md.
// Casos vêm dos voos realizados que os Indicadores já buscam e guardam em
// cache (mesma fonte, nenhuma consulta nova ao DroneManagement).
export const excedenteRouter = Router();
excedenteRouter.use("/mapas/:id/excedente", exigirAutenticacao);

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_DIA = /^\d{4}-\d{2}-\d{2}$/;
const INTERVALO_SINCRONIZACAO_MS = 2 * 60 * 1000;
const ultimaSincronizacao = new Map(); // mapaId -> ms

export function esquecerSincronizacoesParaTestes() {
  ultimaSincronizacao.clear();
}

async function ehMapaExcedente(mapaId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM camadas WHERE mapa_id = $1 AND estilo_config->>'tipoCamada' = 'excedente' LIMIT 1`,
    [mapaId]
  );
  return rows.length > 0;
}

// Devolve "ok" ou "falhou". Nunca lança: ponte fora não impede ver os casos.
async function sincronizarCasos(mapaId) {
  const agora = Date.now();
  if (agora - (ultimaSincronizacao.get(mapaId) || 0) < INTERVALO_SINCRONIZACAO_MS) return "ok";
  let dados;
  try {
    dados = await obterDadosIndicadores();
  } catch (err) {
    console.error("Plantio Excedente: sem voos do DroneManagement:", err.message);
    return "falhou";
  }
  const voos = selecionarVoosFLP(dados.realizados || []);
  for (const v of voos) {
    await pool.query(
      `INSERT INTO analises_excedente (id, mapa_id, voo_id, secao, talhao, fazenda, fornecedor, data_voo)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       ON CONFLICT (mapa_id, voo_id) DO NOTHING`,
      [randomUUID(), mapaId, v.vooId, v.secao, v.talhao, v.fazenda, v.fornecedor, v.dataVoo]
    );
  }
  // Cache antigo (desatualizado) pode não ter voo novo nem cancelamento —
  // só marca cancelado com a lista atual de verdade.
  if (!dados.desatualizado) {
    const ids = voos.map((v) => v.vooId);
    await pool.query(
      `UPDATE analises_excedente SET voo_cancelado = NOT (voo_id = ANY($2::text[])) WHERE mapa_id = $1`,
      [mapaId, ids]
    );
  }
  ultimaSincronizacao.set(mapaId, agora);
  return dados.desatualizado ? "falhou" : "ok";
}

function mapearCaso(r, historico) {
  return {
    id: r.id,
    vooId: r.voo_id,
    secao: r.secao,
    talhao: r.talhao,
    fazenda: r.fazenda,
    fornecedor: r.fornecedor,
    dataVoo: r.data_voo_txt,
    status: r.status,
    areaExcedenteHa: r.area_excedente_ha === null ? null : Number(r.area_excedente_ha),
    observacao: r.observacao,
    poligonoExcedente: r.poligono_excedente,
    dataAjuste: r.data_ajuste_txt,
    vooCancelado: r.voo_cancelado,
    atualizadoEm: r.atualizado_em ? r.atualizado_em.toISOString() : null,
    atualizadoPorNome: r.atualizado_por_nome,
    historico,
  };
}

async function listarCasos(mapaId) {
  const { rows } = await pool.query(
    `SELECT a.*, to_char(a.data_voo, 'YYYY-MM-DD') AS data_voo_txt,
            to_char(a.data_ajuste, 'YYYY-MM-DD') AS data_ajuste_txt, u.nome AS atualizado_por_nome
     FROM analises_excedente a LEFT JOIN usuarios u ON u.id = a.atualizado_por
     WHERE a.mapa_id = $1 ORDER BY a.data_voo DESC, a.secao, a.talhao`,
    [mapaId]
  );
  const { rows: hist } = await pool.query(
    `SELECT h.*, u.nome AS usuario_nome FROM historico_excedente h
     JOIN analises_excedente a ON a.id = h.analise_id
     LEFT JOIN usuarios u ON u.id = h.usuario_id
     WHERE a.mapa_id = $1 ORDER BY h.feito_em`,
    [mapaId]
  );
  const porCaso = new Map();
  for (const h of hist) {
    if (!porCaso.has(h.analise_id)) porCaso.set(h.analise_id, []);
    porCaso.get(h.analise_id).push({
      id: h.id,
      usuarioNome: h.usuario_nome,
      feitoEm: h.feito_em.toISOString(),
      statusAnterior: h.status_anterior,
      statusNovo: h.status_novo,
      campos: h.campos,
      substituido: h.substituido,
    });
  }
  return rows.map((r) => mapearCaso(r, porCaso.get(r.id) || []));
}

async function prepararMapa(req, res, exigirEdicao) {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) {
    res.status(400).json({ erro: "id de mapa inválido" });
    return null;
  }
  const pode = await usuarioPodeVerMapa(req.usuarioId, mapaId, req.usuarioPapel);
  if (!pode || !(await ehMapaExcedente(mapaId))) {
    res.status(404).json({ erro: "mapa não encontrado" });
    return null;
  }
  if (exigirEdicao && !(await usuarioPodeEditarMapa(req.usuarioId, mapaId, req.usuarioPapel))) {
    res.status(403).json({ erro: "sem permissão para apontar neste mapa" });
    return null;
  }
  return mapaId;
}

excedenteRouter.get("/mapas/:id/excedente", async (req, res) => {
  const mapaId = await prepararMapa(req, res, false);
  if (mapaId === null) return;
  const atualizacao = await sincronizarCasos(mapaId);
  res.json({ casos: await listarCasos(mapaId), atualizacao });
});

function validarCampos(campos) {
  if (campos === undefined || campos === null) return { dados: {} };
  if (typeof campos !== "object" || Array.isArray(campos)) return { erro: "campos inválidos" };
  const dados = {};
  if ("areaExcedenteHa" in campos) {
    const v = campos.areaExcedenteHa;
    if (v !== null && (typeof v !== "number" || !Number.isFinite(v) || v < 0)) return { erro: "área inválida" };
    dados.areaExcedenteHa = v;
  }
  if ("observacao" in campos) {
    const v = campos.observacao;
    if (v !== null && (typeof v !== "string" || v.length > 2000)) return { erro: "observação inválida" };
    dados.observacao = v;
  }
  if ("poligonoExcedente" in campos) {
    const v = campos.poligonoExcedente;
    if (v !== null && (v?.type !== "Polygon" || !Array.isArray(v.coordinates))) return { erro: "desenho inválido" };
    dados.poligonoExcedente = v;
  }
  if ("dataAjuste" in campos) {
    const v = campos.dataAjuste;
    if (v !== null && (typeof v !== "string" || !REGEX_DIA.test(v))) return { erro: "data do ajuste inválida" };
    dados.dataAjuste = v;
  }
  return { dados };
}

function validarApontamento(a) {
  if (!REGEX_UUID.test(a?.id || "") || !REGEX_UUID.test(a?.casoId || "")) return { erro: "ids inválidos" };
  if (!STATUS_EXCEDENTE.includes(a.status)) return { erro: "status inválido" };
  const feitoEm = new Date(a.feitoEm);
  if (typeof a.feitoEm !== "string" || Number.isNaN(feitoEm.getTime())) return { erro: "feitoEm inválido" };
  const campos = validarCampos(a.campos);
  if (campos.erro) return campos;
  return { dados: { id: a.id, casoId: a.casoId, status: a.status, feitoEm: limitarFeitoEm(feitoEm), campos: campos.dados } };
}

const COLUNAS = {
  areaExcedenteHa: "area_excedente_ha",
  observacao: "observacao",
  poligonoExcedente: "poligono_excedente",
  dataAjuste: "data_ajuste",
};

async function aplicarApontamento(cliente, mapaId, usuarioId, a) {
  const jaRecebido = await cliente.query(`SELECT substituido FROM historico_excedente WHERE id = $1`, [a.id]);
  if (jaRecebido.rows[0]) return { id: a.id, resultado: jaRecebido.rows[0].substituido ? "substituido" : "aplicado" };

  const { rows } = await cliente.query(
    `SELECT status, atualizado_em FROM analises_excedente WHERE id = $1 AND mapa_id = $2 FOR UPDATE`,
    [a.casoId, mapaId]
  );
  const caso = rows[0];
  if (!caso) return { id: a.id, resultado: "recusado", erro: "caso não encontrado neste mapa" };

  const maisAntigo = caso.atualizado_em && a.feitoEm <= caso.atualizado_em;
  if (!maisAntigo && !transicaoPermitida(caso.status, a.status)) {
    return { id: a.id, resultado: "recusado", erro: `não dá para ir de "${caso.status}" para "${a.status}"` };
  }
  await cliente.query(
    `INSERT INTO historico_excedente (id, analise_id, usuario_id, feito_em, status_anterior, status_novo, campos, substituido)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [a.id, a.casoId, usuarioId, a.feitoEm, caso.status, a.status, JSON.stringify(a.campos), Boolean(maisAntigo)]
  );
  if (maisAntigo) return { id: a.id, resultado: "substituido" };

  const sets = ["status = $3", "atualizado_em = $4", "atualizado_por = $5"];
  const valores = [a.casoId, mapaId, a.status, a.feitoEm, usuarioId];
  for (const [campo, valor] of Object.entries(a.campos)) {
    valores.push(campo === "poligonoExcedente" && valor !== null ? JSON.stringify(valor) : valor);
    sets.push(`${COLUNAS[campo]} = $${valores.length}`);
  }
  await cliente.query(`UPDATE analises_excedente SET ${sets.join(", ")} WHERE id = $1 AND mapa_id = $2`, valores);
  return { id: a.id, resultado: "aplicado" };
}

excedenteRouter.post("/mapas/:id/excedente/apontamentos", async (req, res) => {
  const mapaId = await prepararMapa(req, res, true);
  if (mapaId === null) return;
  const lista = req.body?.apontamentos;
  if (!Array.isArray(lista) || lista.length === 0 || lista.length > 500) {
    return res.status(400).json({ erro: "apontamentos deve ser uma lista de 1 a 500 itens" });
  }
  const validados = [];
  for (const a of lista) {
    const v = validarApontamento(a);
    if (v.erro) return res.status(400).json({ erro: v.erro });
    validados.push(v.dados);
  }
  const resultados = [];
  for (const a of validados) {
    const cliente = await pool.connect();
    try {
      await cliente.query("BEGIN");
      resultados.push(await aplicarApontamento(cliente, mapaId, req.usuarioId, a));
      await cliente.query("COMMIT");
    } catch (err) {
      await cliente.query("ROLLBACK");
      throw err;
    } finally {
      cliente.release();
    }
  }
  res.json({ resultados });
});
