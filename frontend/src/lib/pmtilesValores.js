import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";

// Converte lon/lat pro tile x/y da grade slippy-map num zoom dado — mesmo
// cálculo usado em Mapa.jsx pra montar o índice de busca.
function lonLatParaTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return [x, y];
}

async function lerPropriedadesNoZoom(pmtiles, sourceLayerId, header, z) {
  const [x0, y0] = lonLatParaTile(header.minLon, header.maxLat, z);
  const [x1, y1] = lonLatParaTile(header.maxLon, header.minLat, z);

  const propriedades = [];
  for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
      const resp = await pmtiles.getZxy(z, x, y);
      if (!resp) continue;
      const tile = new VectorTile(new PbfReader(new Uint8Array(resp.data)));
      const camada = tile.layers[sourceLayerId];
      if (!camada) continue;
      for (let i = 0; i < camada.length; i++) {
        propriedades.push(camada.feature(i).properties);
      }
    }
  }
  return propriedades;
}

// Lê as propriedades de toda feição de uma source-layer, direto dos tiles
// da lib pmtiles (não via MapLibre — o mapa só carregou o que está no
// viewport atual, não o dataset inteiro). Tenta a partir do menor zoom do
// tileset (área inteira cabe em poucos tiles nesse zoom, caso normal com
// dado real) e escala zoom acima se não achar nada — datasets muito
// pequenos (ex: fixture sintético de teste) podem ter a geometria
// simplificada a nada pelo tippecanoe justamente nos zooms mais baixos, e
// o header `minZoom` nem sempre corresponde ao zoom onde o tile realmente
// tem conteúdo. Usado só pelo admin (gerar categorias/faixas) — não mexe
// no índice de busca do visualizador, que já tem sua própria versão deste
// mesmo padrão e está testado (com dado real, onde o zoom mínimo sempre
// tem conteúdo).
async function lerPropriedadesDoMenorZoom(pmtiles, sourceLayerId) {
  const header = await pmtiles.getHeader();
  for (let z = header.minZoom; z <= header.maxZoom; z++) {
    const propriedades = await lerPropriedadesNoZoom(pmtiles, sourceLayerId, header, z);
    if (propriedades.length > 0) return propriedades;
  }
  return [];
}

// Valores únicos de um campo, ordenados — pra montar as categorias do modo
// "categorizado". `limite` corta cedo se o campo tiver valores demais
// (provavelmente um campo tipo ID, não uma categoria de verdade).
export async function lerValoresUnicos(pmtiles, sourceLayerId, campo, limite = 200) {
  const propriedades = await lerPropriedadesDoMenorZoom(pmtiles, sourceLayerId);
  const vistos = new Set();
  for (const props of propriedades) {
    if (props[campo] == null) continue;
    vistos.add(props[campo]);
    if (vistos.size > limite) break;
  }
  return [...vistos].sort();
}

// Min/máx de um campo numérico — pra sugerir as faixas do modo "graduado".
export async function lerMinMax(pmtiles, sourceLayerId, campo) {
  const propriedades = await lerPropriedadesDoMenorZoom(pmtiles, sourceLayerId);
  let min = Infinity;
  let max = -Infinity;
  for (const props of propriedades) {
    const valor = Number(props[campo]);
    if (Number.isNaN(valor)) continue;
    if (valor < min) min = valor;
    if (valor > max) max = valor;
  }
  if (min === Infinity) return null;
  return { min, max };
}

// Tipo de geometria (1=ponto, 2=linha, 3=polígono, spec MVT) da primeira
// feição encontrada — usado só pelo admin (decidir se mostra a seção
// "Símbolo", só relevante pra camada de ponto). Mapa.jsx tem sua própria
// versão já testada (lê só no header.minZoom, sem escalonar); esta escala
// zoom acima se não achar nada, mesmo motivo de lerPropriedadesDoMenorZoom.
export async function detectarTipoGeometria(pmtiles, sourceLayerId) {
  const header = await pmtiles.getHeader();
  for (let z = header.minZoom; z <= header.maxZoom; z++) {
    const [x0, y0] = lonLatParaTile(header.minLon, header.maxLat, z);
    const [x1, y1] = lonLatParaTile(header.maxLon, header.minLat, z);
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        const resp = await pmtiles.getZxy(z, x, y);
        if (!resp) continue;
        const tile = new VectorTile(new PbfReader(new Uint8Array(resp.data)));
        const camada = tile.layers[sourceLayerId];
        if (camada && camada.length > 0) return camada.feature(0).type;
      }
    }
  }
  return null;
}
