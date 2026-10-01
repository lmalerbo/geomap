import { pool } from "../db/pool.js";
import { contarRegistros, buscarTodosRegistros } from "./consultaDroneMgmt.js";
import { filtroPendentesDroneMgmt, filtrarEMapearPendentes } from "./pendentesVoo.js";
import { VERSAO_REGRA_PENDENTES } from "./regrasApontamento.js";

// Dados crus dos indicadores de voo: voos realizados (Verificar porte =
// Voado) e pendentes (regra do mapa de Voos), com cache no Postgres
// (indicadores_voo_cache, migration 016). Buscar os ~4.400 voados leva ~9s
// local e bem mais no Render; o cache é reusado se a contagem do
// DroneManagement não mudou E tem menos de 1h — o limite de tempo pega
// edição de registro que não muda a contagem (ex.: data do voo corrigida).

export const VALIDADE_CACHE_MS = 60 * 60 * 1000;
export const VERSAO_CACHE = `indicadores-v1+${VERSAO_REGRA_PENDENTES}`;
const VERIFY_FLIGHT_SIZE_VOADO = 9;

export function filtroRealizadosDroneMgmt(unitId) {
  return JSON.stringify({ $and: [{ unitId: `UUID('${unitId}')` }, { verifyFlightSize: VERIFY_FLIGHT_SIZE_VOADO }] });
}

export function mapearRegistroRealizado(r) {
  return {
    id: r.id,
    dataVoo: r.startDateFlight,
    pilotoId: String(r.pilotUserADId || "").toLowerCase(),
    tipo: r.flightProjectDetails?.description || null,
    secao: r.section,
    talhao: r.landPlot,
    fazenda: r.layerDetails?.descriptionSection ?? null,
    areaHa: r.layerDetails?.totalArea ?? null,
    propriedade: r.layerDetails?.transferProperty ?? null,
  };
}

export function cacheAindaValido(cache, countAtual, agoraMs) {
  return (
    !!cache &&
    cache.versao === VERSAO_CACHE &&
    cache.count === countAtual &&
    agoraMs - cache.atualizadoEmMs < VALIDADE_CACHE_MS
  );
}

async function lerCache(chave) {
  const { rows } = await pool.query(
    "SELECT count_dronemgmt, registros, atualizado_em FROM indicadores_voo_cache WHERE chave = $1",
    [chave]
  );
  if (!rows[0]) return null;
  const { count_dronemgmt, registros, atualizado_em } = rows[0];
  return {
    count: count_dronemgmt,
    versao: registros?.versao,
    itens: registros?.itens || [],
    atualizadoEmMs: atualizado_em.getTime(),
    atualizadoEm: atualizado_em.toISOString(),
  };
}

async function gravarCache(chave, count, itens) {
  const { rows } = await pool.query(
    `INSERT INTO indicadores_voo_cache (chave, count_dronemgmt, registros, atualizado_em)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (chave) DO UPDATE SET count_dronemgmt = $2, registros = $3, atualizado_em = now()
     RETURNING atualizado_em`,
    [chave, count, JSON.stringify({ versao: VERSAO_CACHE, itens })]
  );
  return rows[0].atualizado_em.toISOString();
}

// `consulta`/`armazenamento` injetáveis só pra teste (sem rede nem banco).
export async function obterConjunto({
  chave,
  filtro,
  transformar,
  forcar,
  consulta = { contarRegistros, buscarTodosRegistros },
  armazenamento = { lerCache, gravarCache },
}) {
  const cache = await armazenamento.lerCache(chave);
  try {
    const countAtual = await consulta.contarRegistros(filtro);
    if (!forcar && cacheAindaValido(cache, countAtual, Date.now())) {
      return { itens: cache.itens, atualizadoEm: cache.atualizadoEm, desatualizado: false };
    }
    const { count, registros } = await consulta.buscarTodosRegistros(filtro);
    const itens = transformar(registros);
    const atualizadoEm = await armazenamento.gravarCache(chave, count, itens);
    return { itens, atualizadoEm, desatualizado: false };
  } catch (err) {
    if (!cache) throw err;
    console.error(`Indicadores de voo: usando cache antigo de '${chave}':`, err);
    return { itens: cache.itens, atualizadoEm: cache.atualizadoEm, desatualizado: true };
  }
}

let emAndamento = null;
let fonteDeTeste = null;

export function definirFonteParaTestes(fn) {
  fonteDeTeste = fn;
}

// Sequencial de propósito (não Promise.all): sem sessão em cache, duas
// buscas em paralelo abririam dois Chromium pra logar no DroneManagement —
// o container do Render tem só 512MB (ver lib/dronemgmt.js).
// Pedidos simultâneos compartilham a mesma busca em andamento.
export function obterDadosIndicadores({ forcar = false } = {}) {
  if (fonteDeTeste) return Promise.resolve(fonteDeTeste({ forcar }));
  if (emAndamento) return emAndamento;
  const unitId = process.env.DRONEMGMT_UNIT_ID || "";
  emAndamento = (async () => {
    const realizados = await obterConjunto({
      chave: "realizados",
      filtro: filtroRealizadosDroneMgmt(unitId),
      transformar: (rs) => rs.map(mapearRegistroRealizado),
      forcar,
    });
    const pendentes = await obterConjunto({
      chave: "pendentes",
      filtro: filtroPendentesDroneMgmt(unitId),
      transformar: filtrarEMapearPendentes,
      forcar,
    });
    return {
      realizados: realizados.itens,
      pendentes: pendentes.itens,
      // o mais antigo dos dois — é o que limita o quão atual o painel está
      atualizadoEm: realizados.atualizadoEm < pendentes.atualizadoEm ? realizados.atualizadoEm : pendentes.atualizadoEm,
      desatualizado: realizados.desatualizado || pendentes.desatualizado,
    };
  })().finally(() => {
    emAndamento = null;
  });
  return emAndamento;
}
