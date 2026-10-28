import { chamarApi } from "./dronemgmt.js";

// Paginação genérica do formdata/query do DroneManagement — antes vivia
// dentro da rota /voos/pendentes; agora também serve os indicadores de voo
// (lib/fonteIndicadoresVoo.js). Concorrência 5 nas páginas seguintes, mesma
// técnica dos scripts de limpeza (o DroneManagement aguentou 8 sem erro).

const CAMINHO_QUERY = "/portal/api/v1/gateway/formbuilder/formdata/query";
const TAMANHO_PAGINA = 500;
const CONCORRENCIA = 5;

async function buscarPagina(filtro, pagina, tamanhoPagina = TAMANHO_PAGINA) {
  const resp = await chamarApi(CAMINHO_QUERY, {
    params: { pageNumber: pagina, pageSize: tamanhoPagina, filter: filtro, expand: "layer,flightProject" },
  });
  if (!resp.ok) throw new Error(`DroneManagement respondeu ${resp.status}`);
  return resp.json();
}

// Checagem barata (pageSize 1) — só o total, pra decidir se um cache vale.
export async function contarRegistros(filtro) {
  const dados = await buscarPagina(filtro, 1, 1);
  return dados.count || 0;
}

export async function buscarTodosRegistros(filtro) {
  const primeira = await buscarPagina(filtro, 1);
  const registros = primeira.value || [];
  const count = primeira.count || 0;
  const totalPaginas = Math.ceil(count / TAMANHO_PAGINA);
  for (let inicio = 2; inicio <= totalPaginas; inicio += CONCORRENCIA) {
    const lote = [];
    for (let p = inicio; p < inicio + CONCORRENCIA && p <= totalPaginas; p++) lote.push(buscarPagina(filtro, p));
    for (const dados of await Promise.all(lote)) registros.push(...(dados.value || []));
  }
  return { count, registros };
}
