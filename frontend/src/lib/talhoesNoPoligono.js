// Lê os talhões dentro de um polígono direto do .pmtiles da camada de voos.
// Ponto de rótulo sempre cai dentro do talhão; leitura do arquivo já guardado
// no aparelho, sem servidor.
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { talhoesDentro } from "./planejamentoVoo.js";

function lonLatParaTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n);
  return [x, y];
}

export async function lerTalhoesNoPoligono(voosInfo, poligono) {
  const z = Math.min(voosInfo.header.maxZoom, 13);

  const anel = poligono.coordinates[0];
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const [lon, lat] of anel) {
    if (lon < minLon) minLon = lon;
    if (lon > maxLon) maxLon = lon;
    if (lat < minLat) minLat = lat;
    if (lat > maxLat) maxLat = lat;
  }

  const [x0, y0] = lonLatParaTile(minLon, maxLat, z);
  const [x1, y1] = lonLatParaTile(maxLon, minLat, z);
  const xMin = Math.min(x0, x1);
  const xMax = Math.max(x0, x1);
  const yMin = Math.min(y0, y1);
  const yMax = Math.max(y0, y1);

  const pmtiles = voosInfo.pmtiles;
  const sourceLayerPrincipal = voosInfo.sourceLayerPrincipal;
  const nomes = new Map();
  const pontos = [];
  let temRotulos = false;

  for (let x = xMin; x <= xMax; x++) {
    for (let y = yMin; y <= yMax; y++) {
      const resp = await pmtiles.getZxy(z, x, y);
      if (!resp) continue;
      const tile = new VectorTile(new PbfReader(new Uint8Array(resp.data)));

      const camadaRotulos = tile.layers["rotulos"];
      if (camadaRotulos) {
        temRotulos = true;
        for (let i = 0; i < camadaRotulos.length; i++) {
          const f = camadaRotulos.feature(i);
          const geo = f.toGeoJSON(x, y, z);
          const props = f.properties;
          if (!geo.geometry || geo.geometry.type !== "Point") continue;
          const [lon, lat] = geo.geometry.coordinates;
          const secao = String(props.secao);
          const talhao = String(props.talhao);
          pontos.push({ secao, talhao, lon, lat });
        }
      }

      const camadaPrincipal = tile.layers[sourceLayerPrincipal];
      if (camadaPrincipal) {
        for (let i = 0; i < camadaPrincipal.length; i++) {
          const f = camadaPrincipal.feature(i);
          const props = f.properties;
          const secao = String(props.SECAO);
          const talhao = String(props.TALHAO);
          const descSecao = props.DESC_SECAO;
          if (secao && talhao && descSecao) {
            nomes.set(`${secao}-${talhao}`, descSecao);
          }
        }
      }
    }
  }

  const pontosComFazenda = pontos.map((p) => ({
    secao: p.secao,
    talhao: p.talhao,
    fazenda: nomes.get(`${p.secao}-${p.talhao}`) || p.secao,
    lon: p.lon,
    lat: p.lat,
  }));

  const talhoes = talhoesDentro(pontosComFazenda, poligono);
  return { talhoes, semRotulos: !temRotulos };
}