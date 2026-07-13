import { kml } from "@tmcw/togeojson";
import shp from "shpjs";

// KML/Shapefile importados pelo usuário pra visualização temporária — nunca
// tocam IndexedDB/backend, somem ao recarregar a página ou remover
// manualmente (ver "fonte-temporaria" em Mapa.jsx).

function importarKml(texto) {
  const dom = new DOMParser().parseFromString(texto, "text/xml");
  if (dom.querySelector("parsererror")) {
    throw new Error("Arquivo KML inválido (XML malformado).");
  }
  const geojson = kml(dom);
  if (!geojson.features || geojson.features.length === 0) {
    throw new Error("Nenhuma geometria encontrada no KML.");
  }
  return geojson;
}

async function importarShapefile(arrayBuffer) {
  let resultado;
  try {
    resultado = await shp(arrayBuffer);
  } catch {
    throw new Error("Não foi possível ler o .zip — confira se contém .shp/.dbf/.shx.");
  }
  // shpjs devolve um array quando o zip tem mais de um shapefile dentro —
  // pra visualização temporária, só a primeira camada encontrada é usada.
  const geojson = Array.isArray(resultado) ? resultado[0] : resultado;
  if (!geojson?.features || geojson.features.length === 0) {
    throw new Error("Nenhuma geometria encontrada no shapefile.");
  }
  return geojson;
}

// Decide pela extensão real do arquivo (mesmo critério do upload do admin,
// ver backend/src/routes/admin.js) — nunca lança pra fora sem uma mensagem
// legível, quem chama só precisa mostrar `err.message`.
export async function importarArquivoTemporario(file) {
  const ext = file.name.toLowerCase().split(".").pop();
  if (ext === "kml") {
    const texto = await file.text();
    return { nome: file.name, geojson: importarKml(texto) };
  }
  if (ext === "zip") {
    const buffer = await file.arrayBuffer();
    return { nome: file.name, geojson: await importarShapefile(buffer) };
  }
  throw new Error("Formato não suportado — envie um .kml ou um .zip com o shapefile (.shp/.dbf/.shx).");
}
