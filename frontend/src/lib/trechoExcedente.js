import turfArea from "@turf/area";
import { importarArquivoTemporario } from "./importadorTemporario.js";

// Trecho excedente vindo de arquivo (.kml ou .zip do shapefile) ou do
// desenho: vira um Polygon/MultiPolygon de [lng, lat] e a área em hectares
// sai da própria geometria. Mesmo limite de pontos do servidor
// (backend/src/routes/excedente.js).
export const MAX_VERTICES_TRECHO = 5000;

const so2d = (anel) => anel.map((p) => [p[0], p[1]]);

export function geometriaDoTrecho(geojson) {
  const poligonos = [];
  for (const f of geojson?.features || []) {
    const g = f?.geometry;
    if (g?.type === "Polygon") poligonos.push(g.coordinates.map(so2d));
    else if (g?.type === "MultiPolygon") for (const p of g.coordinates) poligonos.push(p.map(so2d));
  }
  if (poligonos.length === 0) throw new Error("O arquivo não tem nenhum polígono (área).");
  const pontos = poligonos.flat(2);
  if (pontos.length > MAX_VERTICES_TRECHO) {
    throw new Error(`O trecho tem ${pontos.length} pontos (máximo ${MAX_VERTICES_TRECHO}). Simplifique a geometria antes de enviar.`);
  }
  if (!pontos.every(([x, y]) => Math.abs(x) <= 180 && Math.abs(y) <= 90)) {
    throw new Error("As coordenadas não estão em graus. No shapefile, inclua o .prj no .zip (ou exporte em SIRGAS 2000/WGS 84).");
  }
  return poligonos.length === 1
    ? { type: "Polygon", coordinates: poligonos[0] }
    : { type: "MultiPolygon", coordinates: poligonos };
}

export function areaTrechoHa(geometria) {
  return Math.round(turfArea(geometria) / 100) / 100; // m² -> ha, 2 casas
}

export async function lerTrechoDeArquivo(file) {
  const { geojson } = await importarArquivoTemporario(file);
  return geometriaDoTrecho(geojson);
}
