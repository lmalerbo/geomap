// Conversão .shp -> .pmtiles (geometria + rótulos), compartilhada entre o
// backend (upload de shapefile pela tela de admin) e a automação diária
// (automacao/vigiar-talhoes-limites), que importa este arquivo direto do
// repositório clonado — por isso só usa módulos nativos do Node.
//
// A automação converte no servidor geo e manda pro backend só o .pmtiles
// pronto (2026-09-28): converter Talhões no Render (512MB) derrubava o
// processo por falta de memória no meio do job (20/09, 22/09, 26/09).
import path from "node:path";
import fs from "node:fs";
import crypto from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);

// Testado contra produção real (Render free tier, só 0.1 CPU): o Talhões
// completo (~7500 feições) levou ~8min de ponta a ponta, e o script de
// rótulos sozinho não termina dentro de 5min nessa instância.
const TIMEOUT_CONVERSAO = 15 * 60 * 1000;

// Lido a cada conversão (não no import) — a automação só carrega o .env
// depois de importar este módulo.
//
// Sem essas variáveis, assume que os binários estão no PATH (caso normal
// na imagem Docker de produção). No Windows, tippecanoe/tile-join/ogr2ogr
// são binários Cygwin — CYGWIN_BIN_DIR vai pro PATH do processo filho pra
// eles acharem cygwin1.dll e as outras DLLs do runtime.
function lerConfig() {
  return {
    ogr2ogr: process.env.OGR2OGR_PATH || "ogr2ogr",
    tippecanoe: process.env.TIPPECANOE_PATH || "tippecanoe",
    tileJoin: process.env.TILEJOIN_PATH || "tile-join",
    python: process.env.PYTHON_PATH || "python3",
    cygwinBinDir: process.env.CYGWIN_BIN_DIR || null,
    // pipeline/rotulos fica 3 níveis acima deste arquivo (lib -> src ->
    // backend -> raiz do repo) — igual em dev, na imagem Docker e no
    // clone do repositório no servidor geo.
    rotulosDir:
      process.env.ROTULOS_SCRIPTS_DIR ||
      path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../pipeline/rotulos"),
  };
}

// Variáveis de dados de projeção que outros programas de GIS deixam no
// Windows (ArcGIS, QGIS, Pix4D…) apontando pros arquivos deles. Herdadas,
// fazem o ogr2ogr do Cygwin procurar o proj.db no lugar errado ("Cannot find
// proj.db" no servidor geo, 2026-10-09) e o pyproj dos rótulos também. Sem
// elas, cada um usa os próprios arquivos (o Cygwin, /usr/share/proj da
// pasta dele; o pyproj, os que vêm no pacote).
const VARIAVEIS_GIS_HERDADAS = /^(PROJ_LIB|PROJ_DATA|GDAL_DATA)$/i;

function envParaConversao(config) {
  if (!config.cygwinBinDir) return process.env;
  const env = Object.fromEntries(Object.entries(process.env).filter(([chave]) => !VARIAVEIS_GIS_HERDADAS.test(chave)));
  return { ...env, PATH: `${config.cygwinBinDir}${path.delimiter}${process.env.PATH}` };
}

// Confere .shp + os obrigatórios (.dbf/.shx/.prj) numa pasta já populada —
// aponta especificamente o que falta. .prj é obrigatório: sem ele, tanto o
// ogr2ogr quanto os scripts de rótulo dependem de adivinhar a projeção —
// já causou geometria/rótulo em posição errada antes.
export async function validarShapefileNaPasta(pasta) {
  const arquivos = await fs.promises.readdir(pasta);
  const shp = arquivos.find((f) => f.toLowerCase().endsWith(".shp"));
  if (!shp) {
    throw new Error("nenhum arquivo .shp encontrado");
  }
  const base = shp.slice(0, -4).toLowerCase();
  const faltando = [".dbf", ".shx", ".prj"].filter(
    (ext) => !arquivos.some((f) => f.toLowerCase() === `${base}${ext}`)
  );
  if (faltando.length > 0) {
    throw new Error(`faltando: ${faltando.join(", ")}`);
  }
  return shp;
}

// Decide se gera rótulos e com qual estratégia, pelos campos do próprio
// GeoJSON — mesmo critério que o frontend usa pra `ehTalhao` em Mapa.jsx
// (presença do campo TALHAO). null = camada sem rótulo (Municípios, Malhas
// Viárias, Unidades, Pontos de Captação), só geometria.
async function decidirEstrategiaRotulos(caminhoGeojson) {
  const geojson = JSON.parse(await fs.promises.readFile(caminhoGeojson, "utf8"));
  const campos = Object.keys(geojson.features?.[0]?.properties || {});
  if (campos.includes("TALHAO") && campos.includes("SECAO")) {
    return { script: "gerar_rotulos.py", argsExtras: [] };
  }
  if (campos.includes("DESC_SECAO")) {
    return { script: "gerar_rotulos_por_atributo.py", argsExtras: ["DESC_SECAO"] };
  }
  return null;
}

// .shp (numa pasta já populada, com .dbf/.shx/.prj do lado) -> Buffer do
// .pmtiles. Mesmos passos de pipeline/shp_para_pmtiles.sh (ogr2ogr pra
// GeoJSON, tippecanoe pra geometria); depois decide se gera rótulos
// (pipeline/rotulos/README.md): script Python, tippecanoe `-r1` (desliga o
// drop-rate que apagaria a maioria dos rótulos em zooms intermediários) e
// tile-join juntando os dois. Escreve os intermediários na própria pasta.
export async function converterPastaShapefileParaPmtiles(pasta, nomeShp, nomeCamadaArquivo) {
  const config = lerConfig();
  const env = envParaConversao(config);
  const base = nomeShp.slice(0, -4);
  const caminhoShp = path.join(pasta, nomeShp);
  const caminhoGeojson = path.join(pasta, `${base}.geojson`);
  const caminhoPmtilesGeometria = path.join(pasta, `${crypto.randomUUID()}.pmtiles`);

  try {
    await execFileAsync(
      config.ogr2ogr,
      ["-f", "GeoJSON", "-t_srs", "EPSG:4326", caminhoGeojson, caminhoShp],
      { env, timeout: TIMEOUT_CONVERSAO }
    );
  } catch (err) {
    throw new Error(
      err.code === "ENOENT"
        ? `ogr2ogr não encontrado (OGR2OGR_PATH=${config.ogr2ogr}) — confira a configuração no .env`
        : `falha ao converter .shp pra GeoJSON: ${err.stderr || err.message}`
    );
  }

  try {
    await execFileAsync(
      config.tippecanoe,
      [
        `--output=${caminhoPmtilesGeometria}`,
        `--layer=${nomeCamadaArquivo || base}`,
        // maximum-zoom FIXO (não "g"/guess): pra dado pouco denso o guess
        // escolhe um maxzoom absurdamente baixo (chegou a 0), o que
        // quantiza as coordenadas num grid de ~9km e grava a feição no
        // lugar errado dentro do .pmtiles. 16 preserva precisão de poucos
        // metros pra qualquer densidade de feição.
        "--maximum-zoom=16",
        "--drop-densest-as-needed",
        "--force",
        caminhoGeojson,
      ],
      { env, timeout: TIMEOUT_CONVERSAO }
    );
  } catch (err) {
    throw new Error(
      err.code === "ENOENT"
        ? `tippecanoe não encontrado (TIPPECANOE_PATH=${config.tippecanoe}) — confira a configuração no .env`
        : `falha ao gerar .pmtiles: ${err.stderr || err.message}`
    );
  }

  const estrategiaRotulos = await decidirEstrategiaRotulos(caminhoGeojson);
  if (!estrategiaRotulos) {
    return fs.promises.readFile(caminhoPmtilesGeometria);
  }

  const caminhoRotulosGeojson = path.join(pasta, `${crypto.randomUUID()}-rotulos.geojson`);
  const caminhoRotulosPmtiles = path.join(pasta, `${crypto.randomUUID()}-rotulos.pmtiles`);
  const caminhoPmtilesFinal = path.join(pasta, `${crypto.randomUUID()}-final.pmtiles`);

  try {
    await execFileAsync(
      config.python,
      [path.join(config.rotulosDir, estrategiaRotulos.script), caminhoShp, ...estrategiaRotulos.argsExtras, caminhoRotulosGeojson],
      { env, timeout: TIMEOUT_CONVERSAO }
    );
  } catch (err) {
    throw new Error(
      err.code === "ENOENT"
        ? `python não encontrado (PYTHON_PATH=${config.python}) — confira a configuração no .env`
        : `falha ao gerar rótulos: ${err.stderr || err.message}`
    );
  }

  try {
    await execFileAsync(
      config.tippecanoe,
      [`--output=${caminhoRotulosPmtiles}`, "--layer=rotulos", "-z17", "-r1", "--force", caminhoRotulosGeojson],
      { env, timeout: TIMEOUT_CONVERSAO }
    );
  } catch (err) {
    throw new Error(`falha ao gerar .pmtiles de rótulos: ${err.stderr || err.message}`);
  }

  try {
    await execFileAsync(
      config.tileJoin,
      ["-f", "-o", caminhoPmtilesFinal, caminhoPmtilesGeometria, caminhoRotulosPmtiles],
      { env, timeout: TIMEOUT_CONVERSAO }
    );
  } catch (err) {
    throw new Error(
      err.code === "ENOENT"
        ? `tile-join não encontrado (TILEJOIN_PATH=${config.tileJoin}) — confira a configuração no .env`
        : `falha ao juntar geometria e rótulos: ${err.stderr || err.message}`
    );
  }

  return fs.promises.readFile(caminhoPmtilesFinal);
}
