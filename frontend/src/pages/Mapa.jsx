import { useEffect, useRef, useState } from "react";
import { useNavigate, useParams, Link } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { PMTiles, Protocol } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import { listarMapasBaixados, listarMapasDisponiveis } from "../lib/db.js";
import { sincronizarMapas } from "../lib/sync.js";
import { BlobSource } from "../lib/pmtilesBlobSource.js";
import { corDaCamada } from "../lib/paleta.js";
import {
  normalizarEstiloConfig,
  expressaoCorPreenchimento,
  expressaoCorContorno,
  expressaoTracoLinha,
  expressaoIconePorCategoria,
  usaIconeSimbolo,
  corHaloIcone,
  desenharBitmapForma,
  nomeImagemForma,
  FORMAS_PONTO,
} from "../lib/estiloCamada.js";
import { useAuth } from "../context/AuthContext.jsx";
import { CORES_FERRAMENTAS } from "../lib/coresFerramentas.js";
import { useMedicao } from "../hooks/useMedicao.js";
import { useTrackLog } from "../hooks/useTrackLog.js";
import { useImportacaoTemporaria } from "../hooks/useImportacaoTemporaria.js";
import MenuLateral, { IconeMapas } from "../components/MenuLateral.jsx";
import IconeEstadoVazio from "../components/IconeEstadoVazio.jsx";
import AvisoPrimeiraSincronizacao from "../components/AvisoPrimeiraSincronizacao.jsx";

function IconeMenu() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <line x1="3" y1="6" x2="21" y2="6" />
      <line x1="3" y1="12" x2="21" y2="12" />
      <line x1="3" y1="18" x2="21" y2="18" />
    </svg>
  );
}

// Botão "Home" — volta pra extensão combinada de todas as camadas carregadas.
class HomeControl {
  constructor(aoClicar) {
    this._aoClicar = aoClicar;
  }
  onAdd() {
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const botao = document.createElement("button");
    botao.type = "button";
    botao.title = "Voltar à visão inicial";
    botao.setAttribute("aria-label", "Voltar à visão inicial");
    botao.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:auto"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9a1 1 0 0 0 1 1H9a1 1 0 0 0 1-1v-4a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v4a1 1 0 0 0 1 1h2.5a1 1 0 0 0 1-1v-9"/></svg>';
    botao.onclick = () => this._aoClicar();
    this._container.appendChild(botao);
    return this._container;
  }
  onRemove() {
    this._container.parentNode?.removeChild(this._container);
  }
}

// Botão "Medir" — liga/desliga o modo medição (distância/área). A lógica
// mora em React (precisa de estado pra desenhar o painel/resultado); este
// controle só dispara o callback, igual o HomeControl.
class MedicaoControl {
  constructor(aoClicar) {
    this._aoClicar = aoClicar;
  }
  onAdd() {
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const botao = document.createElement("button");
    botao.type = "button";
    botao.title = "Medir distância/área";
    botao.setAttribute("aria-label", "Medir distância/área");
    botao.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:auto"><path d="M21.3 8.7 8.7 21.3a1 1 0 0 1-1.4 0l-4.6-4.6a1 1 0 0 1 0-1.4L15.3 2.7a1 1 0 0 1 1.4 0l4.6 4.6a1 1 0 0 1 0 1.4Z"/><path d="m14.5 5.5 2 2M11.5 8.5l2 2M8.5 11.5l2 2M5.5 14.5l2 2"/></svg>';
    botao.onclick = () => this._aoClicar();
    this._container.appendChild(botao);
    return this._container;
  }
  onRemove() {
    this._container.parentNode?.removeChild(this._container);
  }
}

// Botão "Fundo satélite" — alterna entre o fundo padrão (cor sólida) e
// imagem de satélite (Esri World Imagery, tiles raster online). Só o
// próprio botão é criado uma vez aqui (fora do ciclo de render do React);
// `atualizar()` é chamado de um efeito sempre que o estado muda, pra
// manter ícone/título/bloqueio em sincronia sem recriar o controle.
class FundoControl {
  constructor(aoClicar) {
    this._aoClicar = aoClicar;
  }
  onAdd() {
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const botao = document.createElement("button");
    botao.type = "button";
    botao.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:auto"><path d="m3.5 8.5 6-3 5 2.5 6-3"/><path d="M9.5 5.5v13M14.5 8v13"/><path d="m3.5 18.5 6-3 5 2.5 6-3"/></svg>';
    botao.onclick = () => this._aoClicar();
    this._container.appendChild(botao);
    this._botao = botao;
    return this._container;
  }
  atualizar(satelite, offline) {
    const bloqueado = offline && !satelite;
    this._botao.disabled = bloqueado;
    this._botao.classList.toggle("ctrl-ativo", satelite);
    const titulo = bloqueado
      ? "Fundo satélite exige internet"
      : satelite
        ? "Voltar ao fundo padrão"
        : "Ver fundo de satélite";
    this._botao.title = titulo;
    this._botao.setAttribute("aria-label", titulo);
  }
  onRemove() {
    this._container.parentNode?.removeChild(this._container);
  }
}

// Botão "Track log" — abre/fecha o painel de gravação de percurso (item 4).
// Mesmo molde de MedicaoControl: só dispara o callback, toda a lógica de
// GPS/gravação mora em React (precisa de estado).
class TrackControl {
  constructor(aoClicar) {
    this._aoClicar = aoClicar;
  }
  onAdd() {
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const botao = document.createElement("button");
    botao.type = "button";
    botao.title = "Gravar percurso";
    botao.setAttribute("aria-label", "Gravar percurso");
    botao.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:auto"><path d="M3 17c3-6 6 4 9-2s6 4 9-2"/><circle cx="4" cy="17.5" r="1.4" fill="currentColor" stroke="none"/><circle cx="20" cy="12.5" r="1.4" fill="currentColor" stroke="none"/></svg>';
    botao.onclick = () => this._aoClicar();
    this._container.appendChild(botao);
    return this._container;
  }
  onRemove() {
    this._container.parentNode?.removeChild(this._container);
  }
}

// Nome de camada convencionado, gerado pelo pipeline (ver
// pipeline/rotulos/gerar_rotulos.py e gerar_rotulos_por_atributo.py):
// "rotulos" = 1 ponto por feição lógica
// (mesmo quando a geometria original tem várias partes desconexas —
// MapLibre/tippecanoe rotulariam cada parte separadamente, causando
// número repetido no mapa). Não é obrigatória — um .pmtiles sem ela
// simplesmente não ganha rótulo.
const CAMADA_ROTULOS = "rotulos";

// Fundo satélite (Esri World Imagery) — só existem quando o toggle está
// ativo, ver efeito "1c" em Mapa().
const FUNDO_SATELITE_SOURCE_ID = "fundo-satelite-fonte";
const FUNDO_SATELITE_LAYER_ID = "fundo-satelite";

// Filtro que nunca casa com nenhuma feição — usado pra "desligar" o
// highlight de grupo sem precisar remover/recriar a camada.
const FILTRO_NENHUM = ["==", ["literal", 1], ["literal", 2]];

// Monta o filtro que seleciona todas as partes do mesmo talhão/seção, a
// partir dos campos que já existem na camada principal (sem precisar de
// nenhum id estável — tippecanoe não gera um por padrão).
function construirFiltroGrupo(propriedades) {
  if (!propriedades) return null;
  if ("TALHAO" in propriedades && "SECAO" in propriedades) {
    return [
      "all",
      ["==", ["get", "SECAO"], propriedades.SECAO],
      ["==", ["get", "TALHAO"], propriedades.TALHAO],
    ];
  }
  if ("DESC_SECAO" in propriedades) {
    return ["==", ["get", "DESC_SECAO"], propriedades.DESC_SECAO];
  }
  return null;
}

// Filtra/ordena/renomeia os atributos exibidos no painel conforme
// configurado no painel de admin. Sem config (mapa ainda não configurado)
// mostra tudo, na ordem bruta do vector tile, rótulo = nome do campo —
// comportamento de sempre. Devolve uma lista (não mais um objeto chaveado
// por campo) porque o rótulo exibido é editável pelo admin e não é
// garantidamente único — usar como chave de objeto arriscaria duas linhas
// diferentes colidirem se acabassem com o mesmo texto.
function aplicarConfigAtributos(propriedades, config) {
  if (!config || config.length === 0) {
    return Object.entries(propriedades).map(([campo, valor]) => ({ campo, rotulo: campo, valor }));
  }
  const resultado = [];
  for (const { campo, visivel, rotulo } of [...config].sort((a, b) => a.ordem - b.ordem)) {
    if (visivel && campo in propriedades) {
      resultado.push({ campo, rotulo: rotulo || campo, valor: propriedades[campo] });
    }
  }
  return resultado;
}

// Id do rótulo mais antigo já no mapa (topo mais baixo entre os rótulos) —
// usado como beforeId ao adicionar preenchimento/borda/ponto/destaque de
// uma nova camada, pra ela entrar SEMPRE abaixo de qualquer rótulo já
// existente. Sem isso, `map.addLayer()` (sem beforeId) empilha no topo do
// style inteiro — como as camadas são processadas em ordem alfabética
// ("Limites" antes de "Talhões"), o preenchimento de Talhões acabava
// cobrindo o rótulo de nome da fazenda (DESC_SECAO) que "Limites" já tinha
// desenhado. O próprio rótulo de cada camada continua sendo adicionado
// por último e sem beforeId (vai pro topo de tudo, inclusive acima de
// rótulos de outras camadas já existentes).
function primeiroRotuloExistente(map) {
  for (const layer of map.getStyle().layers) {
    if (layer.id.endsWith("-rotulo")) return layer.id;
  }
  return undefined;
}

// Converte lon/lat pro tile x/y da grade slippy-map num zoom dado.
function lonLatParaTile(lon, lat, z) {
  const n = 2 ** z;
  const x = Math.floor(((lon + 180) / 360) * n);
  const rad = (lat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(rad) + 1 / Math.cos(rad)) / Math.PI) / 2) * n
  );
  return [x, y];
}

async function detectarTipoGeometria(pmtiles, sourceLayer, header) {
  try {
    const lon = (header.minLon + header.maxLon) / 2;
    const lat = (header.minLat + header.maxLat) / 2;
    const [x, y] = lonLatParaTile(lon, lat, header.minZoom);
    const resp = await pmtiles.getZxy(header.minZoom, x, y);
    if (!resp) return null;
    const tile = new VectorTile(new PbfReader(new Uint8Array(resp.data)));
    const layer = tile.layers[sourceLayer];
    if (!layer || layer.length === 0) return null;
    return layer.feature(0).type;
  } catch {
    return null;
  }
}

// Sem acento, minúsculo — pra buscar "Sao Joao" e achar "São João".
function normalizarTexto(texto) {
  return texto
    .normalize("NFD")
    .replace(new RegExp("[\\u0300-\\u036f]", "g"), "")
    .toLowerCase();
}

// Monta o índice de busca lendo os tiles do menor zoom disponível
// DIRETO da lib pmtiles (não via MapLibre — querySourceFeatures só
// enxerga tiles que o mapa já carregou pro viewport/zoom atual, não o
// dataset inteiro). No zoom mais baixo a área inteira cabe em poucos
// tiles, e como os rótulos foram gerados com -r1 (sem thinning por
// densidade), cada talhão/fazenda aparece garantido em algum tile.
// Desce recursivamente por coordenadas GeoJSON de qualquer tipo de
// geometria (Point/LineString/Polygon/MultiPolygon/...) expandindo
// `bounds` ([minLng, minLat, maxLng, maxLat]) em lugar — termina ao achar
// um par numérico [lng, lat] (uma folha), não importa o nível de aninhamento.
function expandirBoundsComCoords(bounds, coords) {
  if (typeof coords[0] === "number") {
    const [lng, lat] = coords;
    if (lng < bounds[0]) bounds[0] = lng;
    if (lat < bounds[1]) bounds[1] = lat;
    if (lng > bounds[2]) bounds[2] = lng;
    if (lat > bounds[3]) bounds[3] = lat;
  } else {
    for (const c of coords) expandirBoundsComCoords(bounds, c);
  }
}

async function montarIndiceBusca(infos) {
  // Passagem 1: agrega os códigos SECAO de QUALQUER camada (Talhões,
  // Limites, etc.) por nome de fazenda/seção (DESC_SECAO) — cada camada só
  // enxerga os códigos que aparecem no próprio polígono, e Limites nem
  // sempre repete todos os códigos SECAO que existem nos Talhões (uma
  // fazenda pode ter talhões em seções com código só registrado ali). Sem
  // essa agregação cruzada, um código visível no painel de atributos de um
  // Talhão (ex: SECAO 10003) podia não bater com nenhum código coletado a
  // partir do polígono de Limites, e a busca por esse código não achava a
  // fazenda mesmo ela existindo.
  const codigosPorDesc = new Map(); // DESC_SECAO -> Set(SECAO)
  // Extensão real (união de todos os polígonos, de qualquer camada, que
  // tenham esse DESC_SECAO) — usada pra enquadrar a fazenda inteira ao
  // selecionar um resultado de busca, em vez de só voar pro ponto do
  // rótulo (que fica só na maior peça, ver polylabel em
  // gerar_rotulos_por_atributo.py — uma fazenda com peças espalhadas
  // parecia "aproximar de lugar aleatório" porque só a maior peça ficava
  // visível no zoom fixo de antes).
  const boundsPorDesc = new Map(); // DESC_SECAO -> [minLng, minLat, maxLng, maxLat]
  for (const info of infos) {
    const { pmtiles, header } = info;
    // A camada principal (polígono/ponto) é gerada SEM a flag -r1 do
    // tippecanoe (só a camada de rótulos usa -r1, ver pipeline/rotulos/
    // README.md) — no minZoom (0 na prática) o "drop-rate" padrão do
    // tippecanoe descarta a esmagadora maioria das feições pra caber no
    // limite de bytes do tile (medido: de 1053 códigos SECAO reais em
    // "Usina da Pedra", só 3 sobreviviam em z0). Zoom 8 já recupera a
    // cobertura completa (mesmos 1053) gastando só 1-2 tiles — usar
    // minZoom aqui é o motivo raiz de códigos existentes (ex: SECAO
    // 10003) não aparecerem na busca mesmo a fazenda existindo de verdade.
    const z = Math.max(header.minZoom, Math.min(8, header.maxZoom));
    const [x0, y0] = lonLatParaTile(header.minLon, header.maxLat, z);
    const [x1, y1] = lonLatParaTile(header.maxLon, header.minLat, z);

    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        const resp = await pmtiles.getZxy(z, x, y);
        if (!resp) continue;
        const tile = new VectorTile(new PbfReader(new Uint8Array(resp.data)));
        const camadaPrincipal = tile.layers[info.sourceLayerPrincipal];
        if (!camadaPrincipal) continue;
        for (let i = 0; i < camadaPrincipal.length; i++) {
          const feature = camadaPrincipal.feature(i);
          const props = feature.properties;
          if (!("DESC_SECAO" in props)) continue;
          if ("SECAO" in props) {
            if (!codigosPorDesc.has(props.DESC_SECAO)) codigosPorDesc.set(props.DESC_SECAO, new Set());
            codigosPorDesc.get(props.DESC_SECAO).add(props.SECAO);
          }
          if (!boundsPorDesc.has(props.DESC_SECAO)) {
            boundsPorDesc.set(props.DESC_SECAO, [Infinity, Infinity, -Infinity, -Infinity]);
          }
          expandirBoundsComCoords(
            boundsPorDesc.get(props.DESC_SECAO),
            feature.toGeoJSON(x, y, z).geometry.coordinates,
          );
        }
      }
    }
  }

  // Passagem 2: monta o índice só com os rótulos de fazenda/seção (nunca
  // talhão isolado — buscar o número de um talhão específico misturava
  // resultados de fazendas diferentes e atrapalhava achar a fazenda certa),
  // já usando o mapa de códigos completo da passagem 1.
  const indice = [];
  for (const info of infos) {
    if (!info.temRotulos) continue;
    const { pmtiles, header } = info;
    const z = header.minZoom;
    const [x0, y0] = lonLatParaTile(header.minLon, header.maxLat, z);
    const [x1, y1] = lonLatParaTile(header.maxLon, header.minLat, z);

    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) {
      for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) {
        const resp = await pmtiles.getZxy(z, x, y);
        if (!resp) continue;
        const tile = new VectorTile(new PbfReader(new Uint8Array(resp.data)));

        const camadaRotulos = tile.layers[CAMADA_ROTULOS];
        if (!camadaRotulos) continue;
        for (let i = 0; i < camadaRotulos.length; i++) {
          const feature = camadaRotulos.feature(i);
          const props = feature.properties;

          if ("talhao" in props && "secao" in props) continue;

          const [lng, lat] = feature.toGeoJSON(x, y, z).geometry.coordinates;
          const texto = String(props.rotulo);
          const codigos = codigosPorDesc.get(props.rotulo);
          const buscavelExtra = codigos ? ` ${[...codigos].join(" ")}` : "";
          const bounds = boundsPorDesc.get(props.rotulo) || null;

          indice.push({
            texto,
            buscavel: normalizarTexto(texto + buscavelExtra),
            lng,
            lat,
            bounds,
            mapaId: info.id,
          });
        }
      }
    }
  }

  return indice;
}

async function adicionarCamada(map, protocol, mapa) {
  const source = new BlobSource(`mapa-${mapa.id}-${mapa.versao}`, mapa.blob);
  const pmtiles = new PMTiles(source);
  protocol.add(pmtiles);

  const header = await pmtiles.getHeader();
  const metadata = await pmtiles.getMetadata();
  const todasCamadas = metadata?.vector_layers || [];
  const camadaPrincipal = todasCamadas.find((l) => l.id !== CAMADA_ROTULOS);
  if (!camadaPrincipal) return null;

  const temRotulosPipeline = todasCamadas.some((l) => l.id === CAMADA_ROTULOS);

  // Sem config salva (mapa ainda não editado no admin), decide pela presença
  // do campo TALHAO no próprio metadata: camadas de talhão ganham
  // preenchimento + rótulo com zoom mais alto; as demais (limites/contornos)
  // ficam só com a linha + rótulo (nome) a partir de um zoom mais baixo.
  const campos = camadaPrincipal.fields || {};
  const ehTalhao = "TALHAO" in campos;
  const geometryType = await detectarTipoGeometria(pmtiles, camadaPrincipal.id, header);
  const ehPonto = geometryType === 1;
  const consultavel = ehTalhao || ehPonto;
  const estilo = normalizarEstiloConfig(mapa.estiloConfig, {
    ehTalhao,
    ehPonto,
    corPadrao: corDaCamada(mapa.id),
  });
  const { preenchimento, contorno, rotulo, visibilidade, simbolo, tipoDesenho } = estilo;
  // tipoDesenho ("preenchimento" | "contorno" | "ambos") só se aplica a
  // camada não-ponto — zera a opacidade do lado suprimido na origem, antes
  // de qualquer leitura dela abaixo. Como todo o resto da função (paint
  // inicial e o opacidadePreenchimento/opacidadeContorno devolvidos pro
  // efeito de liga/desliga camada) já usa preenchimento.opacidade/
  // contorno.opacidade como única fonte da verdade, isso basta pra
  // tipoDesenho valer nos dois lugares sem mexer em mais nada.
  if (!ehPonto && tipoDesenho === "contorno") preenchimento.opacidade = 0;
  if (!ehPonto && tipoDesenho === "preenchimento") contorno.opacidade = 0;
  const corPreenchimento = expressaoCorPreenchimento(preenchimento);
  const corContorno = expressaoCorContorno(contorno);
  const traco = expressaoTracoLinha(contorno.estiloTraco);
  // Rótulo "direto de atributo" não depende da camada rotulos do pipeline —
  // funciona em qualquer camada; "pipeline" só fica disponível se ela existir.
  const mostrarRotulo = rotulo.mostrar && (rotulo.origem === "atributo" || temRotulosPipeline);

  const sourceId = `fonte-${mapa.id}`;
  const fillLayerId = `camada-${mapa.id}-preenchimento`;
  const lineLayerId = `camada-${mapa.id}-borda`;
  const circleLayerId = `camada-${mapa.id}-ponto`;
  const rotuloLayerId = `camada-${mapa.id}-rotulo`;
  const highlightLayerId = `camada-${mapa.id}-highlight`;
  const highlightCircleLayerId = `camada-${mapa.id}-highlight-circle`;

  // Idempotente: efeitos concorrentes (carga inicial offline-first + sync em
  // segundo plano) podem tentar aplicar a mesma camada quase ao mesmo tempo.
  for (const id of [rotuloLayerId, highlightCircleLayerId, highlightLayerId, circleLayerId, fillLayerId, lineLayerId]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(sourceId)) map.removeSource(sourceId);

  // Calculado depois de remover as camadas antigas desta mesma fonte (senão
  // o próprio rótulo antigo dela poderia se contar como "já existente").
  const beforeId = primeiroRotuloExistente(map);

  // minzoom/maxzoom da fonte precisam bater com o da CAMADA PRINCIPAL
  // (polígono/ponto), não com o header.maxZoom do arquivo inteiro: quando
  // o .pmtiles tem a camada "rotulos" junto (gerada com -z17, mais alta
  // que o maximum-zoom automático do tippecanoe pra geometria, tipicamente
  // 14), o header reporta o maior valor entre as duas (17) — mas os tiles
  // da geometria não existem de fato além do maxzoom dela. Usar o header
  // fazia o MapLibre acreditar que existia tile real até 17 e pedir esses
  // tiles direto (voltam vazios de verdade, a lib pmtiles não faz overzoom
  // sozinha), sumindo a camada em vez de ampliar o tile mais detalhado que
  // existe. `vector_layers[].maxzoom` no metadata é por camada (rotulos
  // continua funcionando igual mesmo limitado ao maxzoom da geometria — é
  // só um ponto, sem perda de precisão ao ser overzoomed).
  map.addSource(sourceId, {
    type: "vector",
    url: `pmtiles://${source.getKey()}`,
    minzoom: camadaPrincipal.minzoom ?? header.minZoom,
    maxzoom: camadaPrincipal.maxzoom ?? header.maxZoom,
  });
  if (!ehPonto) {
    map.addLayer(
      {
        id: fillLayerId,
        type: "fill",
        source: sourceId,
        "source-layer": camadaPrincipal.id,
        minzoom: visibilidade.zoomMinimo,
        maxzoom: visibilidade.zoomMaximo,
        paint: {
          "fill-color": corPreenchimento,
          "fill-opacity": preenchimento.opacidade,
          "fill-opacity-transition": { duration: 300 },
        },
      },
      beforeId
    );
    map.addLayer(
      {
        id: lineLayerId,
        type: "line",
        source: sourceId,
        "source-layer": camadaPrincipal.id,
        minzoom: visibilidade.zoomMinimo,
        maxzoom: visibilidade.zoomMaximo,
        layout: { "line-cap": traco.cap },
        paint: {
          "line-color": corContorno,
          "line-width": contorno.largura,
          "line-opacity": contorno.opacidade,
          "line-opacity-transition": { duration: 300 },
          ...(traco.dasharray ? { "line-dasharray": traco.dasharray } : {}),
        },
      },
      beforeId
    );
  } else if (!usaIconeSimbolo(simbolo)) {
    map.addLayer(
      {
        id: circleLayerId,
        type: "circle",
        source: sourceId,
        "source-layer": camadaPrincipal.id,
        minzoom: visibilidade.zoomMinimo,
        maxzoom: visibilidade.zoomMaximo,
        paint: {
          "circle-color": corPreenchimento,
          "circle-radius": 5,
          // Antes ignorava contorno.* por completo (só cor/raio do
          // preenchimento) — contorno vira o stroke do círculo, com
          // opacidade própria (não amarrada à do preenchimento): dá pra
          // zerar o preenchimento e deixar só o contorno representando o
          // ponto, ou vice-versa.
          "circle-opacity": preenchimento.opacidade,
          "circle-stroke-color": corContorno,
          "circle-stroke-width": contorno.largura,
          "circle-stroke-opacity": contorno.opacidade,
          "circle-opacity-transition": { duration: 300 },
          "circle-stroke-opacity-transition": { duration: 300 },
        },
      },
      beforeId
    );
  } else {
    // Forma diferente de círculo (ou categorizada por atributo) só existe
    // como ícone SDF — ver usaIconeSimbolo em estiloCamada.js pro porquê de
    // não usar "circle" aqui. icon-opacity é uma única propriedade pro
    // símbolo inteiro (preenchimento+contorno juntos, sem o
    // fill/contorno-independentes do circle acima); contorno.opacidade
    // ainda tem efeito próprio porque corHaloIcone já embute essa opacidade
    // no alpha da cor do halo.
    map.addLayer(
      {
        id: circleLayerId,
        type: "symbol",
        source: sourceId,
        "source-layer": camadaPrincipal.id,
        minzoom: visibilidade.zoomMinimo,
        maxzoom: visibilidade.zoomMaximo,
        layout: {
          "icon-image": expressaoIconePorCategoria(simbolo),
          "icon-size": 0.5,
          "icon-allow-overlap": true,
        },
        paint: {
          "icon-color": corPreenchimento,
          "icon-halo-color": corHaloIcone(contorno),
          "icon-halo-width": contorno.largura,
          "icon-opacity": preenchimento.opacidade,
          "icon-opacity-transition": { duration: 300 },
        },
      },
      beforeId
    );
  }
  const tipoPonto = ehPonto ? (usaIconeSimbolo(simbolo) ? "symbol" : "circle") : null;

  // Highlight de grupo: suporta tanto polígonos/linhas quanto pontos.
  if (!ehPonto) {
    map.addLayer(
      {
        id: highlightLayerId,
        type: "line",
        source: sourceId,
        "source-layer": camadaPrincipal.id,
        paint: { "line-color": CORES_FERRAMENTAS.destaqueGrupo, "line-width": 3 },
        filter: FILTRO_NENHUM,
      },
      beforeId
    );
  } else {
    map.addLayer(
      {
        id: highlightCircleLayerId,
        type: "circle",
        source: sourceId,
        "source-layer": camadaPrincipal.id,
        paint: {
          "circle-color": CORES_FERRAMENTAS.destaqueGrupo,
          "circle-radius": 10,
          "circle-opacity": 0.5,
        },
        filter: FILTRO_NENHUM,
      },
      beforeId
    );
  }

  if (mostrarRotulo) {
    // "pipeline": camada rotulos pré-gerada (pole of inaccessibility, texto
    // fixo no campo "rotulo"). "atributo": texto direto de um campo do
    // próprio polígono — MapLibre posiciona sozinho, sem depender do
    // pipeline de rótulos ter rodado pra essa camada.
    const usaPipeline = rotulo.origem === "pipeline" && temRotulosPipeline;
    const campoTexto = usaPipeline ? "rotulo" : rotulo.campo || camadaPrincipal.id;
    map.addLayer({
      id: rotuloLayerId,
      type: "symbol",
      source: sourceId,
      "source-layer": usaPipeline ? CAMADA_ROTULOS : camadaPrincipal.id,
      minzoom: rotulo.zoomMinimo,
      layout: {
        "text-field": ["get", campoTexto],
        "text-font": ["Noto Sans Regular"],
        "text-size": [
          "interpolate",
          ["linear"],
          ["zoom"],
          rotulo.zoomMinimo,
          Math.max(rotulo.tamanhoFonte - 3, 6),
          rotulo.zoomMinimo + 4,
          rotulo.tamanhoFonte + 3,
        ],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": rotulo.cor,
        "text-halo-color": "#ffffff",
        "text-halo-width": 1.2,
        "text-opacity-transition": { duration: 300 },
      },
    });
  }

  return {
    id: mapa.id,
    nome: mapa.nome,
    versao: mapa.versao,
    // versao só muda quando a geometria muda; atributos/estilo podem mudar
    // independente disso (painel de admin) — a assinatura cobre os três,
    // pra saber quando vale reconstruir a camada sem rebaixar nada.
    assinatura: `${mapa.versao}|${JSON.stringify(mapa.atributosConfig)}|${JSON.stringify(mapa.estiloConfig)}`,
    // Modos categorizado/graduado não têm 1 cor representativa — usa a cor
    // de fallback deles como aproximação pra legenda/swatch.
    cor:
      preenchimento.modo === "simples"
        ? preenchimento.cor
        : preenchimento.corSemCategoria || preenchimento.corAbaixoDoMinimo,
    // Cor real do contorno — camada só-contorno (ex: Rio, Limites) usa essa
    // cor no swatch da legenda, não a de preenchimento (que pode ter sido
    // configurada com uma cor totalmente diferente e nunca aparece no mapa).
    corContorno: contorno.modo === "simples" ? contorno.cor : contorno.corSemCategoria,
    opacidadePreenchimento: preenchimento.opacidade,
    opacidadeContorno: contorno.opacidade,
    // "circle" (fill/contorno independentes) ou "symbol" (ícone SDF, uma
    // única opacidade pro símbolo inteiro) — só relevante quando ehPonto;
    // o efeito de liga/desliga (item 5 de Mapa()) precisa saber qual pra
    // chamar o nome de paint property certo.
    tipoPonto,
    sourceId,
    fillLayerId,
    lineLayerId,
    circleLayerId,
    highlightLayerId,
    highlightCircleLayerId,
    rotuloLayerId: mostrarRotulo ? rotuloLayerId : null,
    // Camadas de contorno (sem preenchimento, ex: Limites) são só visuais +
    // rótulo de nome — não abrem painel de atributos ao clicar.
    consultavel,
    atributosConfig: mapa.atributosConfig,
    // Pra montar o índice de busca (a partir dos dados já baixados, sem
    // pipeline/back-end extra): temRotulosPipeline independe de mostrarRotulo
    // (o texto/posição existe no tile mesmo com o rótulo visual desligado),
    // e sourceLayerPrincipal permite consultar DESC_SECAO/TALHAO direto
    // do polígono.
    temRotulos: temRotulosPipeline,
    sourceLayerPrincipal: camadaPrincipal.id,
    header,
    // Mantém a instância pra montar o índice de busca lendo tiles direto
    // (querySourceFeatures só enxerga o que o MapLibre já carregou pro
    // viewport/zoom atual — não serve pra indexar o dataset inteiro).
    pmtiles,
  };
}

function removerCamada(map, info) {
  if (info.rotuloLayerId && map.getLayer(info.rotuloLayerId)) map.removeLayer(info.rotuloLayerId);
  if (map.getLayer(info.highlightCircleLayerId)) map.removeLayer(info.highlightCircleLayerId);
  if (map.getLayer(info.highlightLayerId)) map.removeLayer(info.highlightLayerId);
  if (map.getLayer(info.circleLayerId)) map.removeLayer(info.circleLayerId);
  if (map.getLayer(info.fillLayerId)) map.removeLayer(info.fillLayerId);
  if (map.getLayer(info.lineLayerId)) map.removeLayer(info.lineLayerId);
  if (map.getSource(info.sourceId)) map.removeSource(info.sourceId);
}

export default function Mapa() {
  const { sessao, sair } = useAuth();
  const navigate = useNavigate();
  const { mapaId: mapaIdParam } = useParams();
  const mapaId = Number(mapaIdParam);
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const protocolRef = useRef(null);
  const camadasCarregadasRef = useRef(new Map());
  // Assinatura combinada das camadas pras quais o índice de busca já foi
  // construído com sucesso — ver efeito 4 (busca). Só atualizada dentro do
  // .then() não cancelado, então uma corrida (índice de busca cancelado
  // antes de terminar) nunca fica "esquecida": a assinatura continua
  // diferente da atual, e a próxima rodada do efeito tenta de novo.
  const indiceBuscaAssinaturaRef = useRef(null);
  const jaEnquadrouRef = useRef(false);
  const extensaoAtualRef = useRef(null);
  const marcadorRef = useRef(null);
  const fundoControlRef = useRef(null);

  const [mapaPronto, setMapaPronto] = useState(false);
  const [mapasLocais, setMapasLocais] = useState([]);
  const [camadasVisiveis, setCamadasVisiveis] = useState(new Set());
  // Camada com dado problemático (estilo malformado, metadata inesperada)
  // não pode sumir do mapa sem explicação — id -> mensagem de erro, exibida
  // como aviso na linha correspondente do painel de camadas.
  const [errosCamada, setErrosCamada] = useState({});
  const [sincronizando, setSincronizando] = useState(true);
  const [ultimaSincronizacao, setUltimaSincronizacao] = useState(null);
  const [offline, setOffline] = useState(false);
  // Nada baixado localmente pra este mapa ainda — mesmo raciocínio de
  // Inicio.jsx (ver AvisoPrimeiraSincronizacao): baseado no estado real do
  // IndexedDB, não num "já vi isso" salvo em localStorage.
  const [semCamadasLocais, setSemCamadasLocais] = useState(false);
  const [avisoSincronizacaoFechado, setAvisoSincronizacaoFechado] = useState(false);
  const [selecao, setSelecao] = useState(null);
  // Recolhido por padrão em qualquer tamanho de tela — antes só recolhia
  // no mobile (aberto por padrão no desktop), comportamento inconsistente
  // entre plataformas.
  const [painelCamadasAberto, setPainelCamadasAberto] = useState(false);
  const [indiceBusca, setIndiceBusca] = useState([]);
  const [buscaTexto, setBuscaTexto] = useState("");
  // Item destacado na lista de resultados — navegável por ↑/↓ no desktop;
  // Enter sem nunca ter mexido nas setas seleciona o primeiro (índice 0).
  const [indiceDestacadoBusca, setIndiceDestacadoBusca] = useState(0);
  // Fundo satélite é só uma preferência visual do navegador (não é dado do
  // mapa) — persistida em localStorage pra continuar do jeito que o
  // usuário deixou entre sessões, sem precisar de coluna nova no backend.
  const [fundoSatelite, setFundoSatelite] = useState(
    () => typeof window !== "undefined" && window.localStorage.getItem("geomap_fundo_satelite") === "1"
  );
  const [menuAberto, setMenuAberto] = useState(false);

  // Medição, track log e importação temporária viraram hooks próprios
  // (frontend/src/hooks/) — cada um cuida do próprio state + efeitos que
  // criam/destroem source/layers no mapa. `mapRef`/`mapaPronto` são
  // repassados porque o mapa em si é criado uma vez só, aqui embaixo (efeito
  // 1) — os hooks não criam mapa nenhum, só desenham em cima do existente.
  const medicao = useMedicao(mapRef, mapaPronto, () => setSelecao(null));
  const track = useTrackLog(mapRef, mapaPronto, mapaId);
  const temporaria = useImportacaoTemporaria(mapRef, mapaPronto);

  // 1) cria o mapa uma única vez, com controles de navegação e localização
  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    protocolRef.current = protocol;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        // Hospedado localmente (public/fonts/) pra funcionar 100% offline —
        // sem isso, symbol layers com text-field não renderizam nada.
        // BASE_URL prefixa "/geomap/" no build do GitHub Pages (project
        // page, sem domínio próprio) — um "/fonts/..." absoluto sem esse
        // prefixo bate 404 em produção (confirmado via Lighthouse), porque
        // o arquivo real fica em "/geomap/fonts/...", não na raiz do domínio.
        glyphs: `${import.meta.env.BASE_URL}fonts/{fontstack}/{range}.pbf`,
        sources: {},
        layers: [
          {
            id: "fundo",
            type: "background",
            paint: { "background-color": CORES_FERRAMENTAS.fundoMapaPadrao },
          },
        ],
      },
      center: [-47.9, -22.0],
      zoom: 9,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) window.__map = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    const geolocate = new maplibregl.GeolocateControl({
      positionOptions: { enableHighAccuracy: true },
      trackUserLocation: true,
      showUserHeading: true,
      // Sem isso, o padrão do MapLibre é maxZoom:15 (chega bem perto, quase
      // rua) — o Leo pediu pra nunca aproximar além de uma escala de ~5km,
      // suficiente pra situar o dispositivo dentro da fazenda sem perder o
      // contexto ao redor.
      fitBoundsOptions: { maxZoom: 10 },
    });
    map.addControl(geolocate, "top-right");
    map.addControl(
      new HomeControl(() => {
        if (extensaoAtualRef.current) {
          map.fitBounds(extensaoAtualRef.current, { padding: 40, duration: 800 });
        }
      }),
      "top-right"
    );
    map.addControl(new MedicaoControl(() => medicao.setMedindo((m) => !m)), "top-right");
    map.addControl(new TrackControl(() => track.setMostrarPainelTrack((m) => !m)), "top-right");
    const fundoControl = new FundoControl(() => setFundoSatelite((s) => !s));
    fundoControlRef.current = fundoControl;
    map.addControl(fundoControl, "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

    map.on("load", () => {
      // Ícones de forma pra camadas de ponto com símbolo categorizado/não
      // circular (ver usaIconeSimbolo em estiloCamada.js) — registrados uma
      // vez só aqui, genéricos (não por camada), recolorido por feição via
      // icon-color/icon-halo-color (sdf: true).
      for (const { valor: forma } of FORMAS_PONTO) {
        const id = nomeImagemForma(forma);
        if (!map.hasImage(id)) {
          map.addImage(id, desenharBitmapForma(forma), { sdf: true });
        }
      }
      setMapaPronto(true);
    });

    return () => {
      map.remove();
      maplibregl.removeProtocol("pmtiles");
    };
  }, []);

  // 1b) mantém o botão de fundo satélite em sincronia com o estado (ícone
  // ativo/inativo, bloqueado quando offline) e persiste a preferência.
  useEffect(() => {
    fundoControlRef.current?.atualizar(fundoSatelite, offline);
    window.localStorage.setItem("geomap_fundo_satelite", fundoSatelite ? "1" : "0");
  }, [fundoSatelite, offline]);

  // 1c) fundo satélite: fonte/camada raster (Esri World Imagery, só
  // funciona online — daí o botão ficar bloqueado no efeito acima quando
  // `offline`). Inserida logo acima do "fundo" sólido e abaixo de qualquer
  // camada vetorial já carregada, pra não tampar talhões/limites.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto) return;

    if (map.getLayer(FUNDO_SATELITE_LAYER_ID)) map.removeLayer(FUNDO_SATELITE_LAYER_ID);
    if (map.getSource(FUNDO_SATELITE_SOURCE_ID)) map.removeSource(FUNDO_SATELITE_SOURCE_ID);

    if (!fundoSatelite) return;

    map.addSource(FUNDO_SATELITE_SOURCE_ID, {
      type: "raster",
      tiles: [
        "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
      ],
      tileSize: 256,
      // Esri anuncia até z19/20, mas isso só existe de verdade em áreas
      // urbanas de alta resolução — em zona rural (o caso de fazenda), a
      // imagem real geralmente para bem antes disso, e pedir um z acima do
      // que existe não dá erro: a Esri devolve um tile válido (200) com um
      // aviso "Map data not yet available" desenhado como se fosse a
      // imagem, e o MapLibre não tem como saber que aquilo é só um
      // placeholder — ele exibe igual, achando que é imagem de verdade, em
      // vez de reaproveitar (overzoom) o último tile que tinha imagem
      // real. 17 é o teto confiável pra a maioria das áreas rurais globais;
      // além dele o MapLibre amplia o último tile real (mais desfocado,
      // mas com foto de verdade, nunca o aviso).
      maxzoom: 17,
      attribution: "Esri, Maxar, Earthstar Geographics",
    });
    const primeiraCamadaId = map.getStyle().layers.find((l) => l.id !== "fundo")?.id;
    map.addLayer(
      { id: FUNDO_SATELITE_LAYER_ID, type: "raster", source: FUNDO_SATELITE_SOURCE_ID },
      primeiraCamadaId
    );
  }, [mapaPronto, fundoSatelite]);

  // 2) offline-first: assim que o mapa carrega, mostra o que já existe
  // localmente — filtrado pras camadas deste mapa (projeto) específico, já
  // que a sincronização baixa TUDO de uma vez (todos os mapas permitidos).
  useEffect(() => {
    if (!mapaPronto) return;
    listarMapasBaixados().then((locais) => {
      const doMapa = locais.filter((c) => c.mapaId === mapaId);
      setMapasLocais(doMapa);
      setCamadasVisiveis(new Set(doMapa.map((m) => m.id)));
      setSemCamadasLocais(doMapa.length === 0);
    });
  }, [mapaPronto, mapaId]);

  // 3) sincroniza em segundo plano, sem UI de bloqueio
  useEffect(() => {
    if (!mapaPronto) return;
    let cancelado = false;

    sincronizarMapas(sessao.token).then(async (resultado) => {
      if (cancelado) return;
      const doMapa = resultado.mapas.filter((c) => c.mapaId === mapaId);
      setMapasLocais(doMapa);
      setCamadasVisiveis((atual) => {
        const nova = new Set(atual);
        for (const m of doMapa) nova.add(m.id);
        return nova;
      });
      setOffline(!resultado.online);
      if (resultado.online) setUltimaSincronizacao(resultado.sincronizadoEm);
      setSincronizando(false);

      // Sincronizou online e esse mapaId não está mais entre os permitidos
      // (removido pelo admin, ou o usuário perdeu permissão) — não faz
      // sentido deixar a aba presa numa tela vazia, volta pra tela inicial.
      if (resultado.online) {
        const disponiveis = await listarMapasDisponiveis();
        const aindaExiste = disponiveis.some((m) => m.id === mapaId);
        if (!cancelado && !aindaExiste) {
          navigate("/inicio", { replace: true });
        }
      }
    });

    return () => {
      cancelado = true;
    };
  }, [mapaPronto, mapaId, sessao.token, navigate]);

  // 4) reflete mapasLocais como sources/layers do MapLibre
  useEffect(() => {
    const map = mapRef.current;
    const protocol = protocolRef.current;
    if (!map || !mapaPronto) return;

    let cancelado = false;

    async function aplicar() {
      const carregadas = camadasCarregadasRef.current;
      const idsAtuais = new Set(mapasLocais.map((m) => m.id));
      let mudou = false;

      // Limpa erro de camada que saiu do catálogo por completo (admin
      // removeu, usuário perdeu permissão) — não faz sentido continuar
      // mostrando o aviso pra algo que nem existe mais.
      setErrosCamada((atual) => {
        const filtrado = Object.fromEntries(
          Object.entries(atual).filter(([id]) => idsAtuais.has(Number(id)))
        );
        return Object.keys(filtrado).length === Object.keys(atual).length ? atual : filtrado;
      });

      for (const [id, info] of carregadas) {
        if (!idsAtuais.has(id)) {
          removerCamada(map, info);
          carregadas.delete(id);
          mudou = true;
        }
      }

      for (const mapa of mapasLocais) {
        const existente = carregadas.get(mapa.id);
        const assinaturaAtual = `${mapa.versao}|${JSON.stringify(mapa.atributosConfig)}|${JSON.stringify(mapa.estiloConfig)}`;
        if (existente && existente.assinatura === assinaturaAtual) continue;
        if (existente) removerCamada(map, existente);

        // Uma camada com dado problemático (estilo malformado, metadata
        // inesperada) não pode derrubar a exibição de todas as outras — sem
        // isso, uma exceção aqui interrompe o loop e as camadas seguintes
        // nunca chegam a ser adicionadas. O erro também precisa aparecer
        // pro usuário (não só no console) — sem isso, uma camada some do
        // mapa sem nenhuma explicação visível.
        let info = null;
        try {
          info = await adicionarCamada(map, protocol, mapa);
        } catch (err) {
          console.error(`Falha ao aplicar a camada "${mapa.nome}" (id ${mapa.id}):`, err);
          setErrosCamada((atual) => ({ ...atual, [mapa.id]: "Não foi possível carregar esta camada." }));
        }
        if (cancelado) return;
        if (info) {
          carregadas.set(mapa.id, info);
          mudou = true;
          setErrosCamada((atual) => {
            if (!(mapa.id in atual)) return atual;
            const { [mapa.id]: _removido, ...resto } = atual;
            return resto;
          });
        }
      }

      const headers = [...carregadas.values()].map((c) => c.header);
      if (headers.length > 0) {
        const minLon = Math.min(...headers.map((h) => h.minLon));
        const minLat = Math.min(...headers.map((h) => h.minLat));
        const maxLon = Math.max(...headers.map((h) => h.maxLon));
        const maxLat = Math.max(...headers.map((h) => h.maxLat));
        extensaoAtualRef.current = [
          [minLon, minLat],
          [maxLon, maxLat],
        ];
        if (!jaEnquadrouRef.current) {
          map.fitBounds(extensaoAtualRef.current, { padding: 40, duration: 900 });
          jaEnquadrouRef.current = true;
        }
      }

      // Índice de busca: só remonta quando a combinação de camadas carregadas
      // muda de verdade — comparado por assinatura (não pelo booleano `mudou`
      // deste efeito), porque `mudou` só reflete a ÚLTIMA rodada: efeito 2
      // (leitura local do IndexedDB) e efeito 3 (sincronização de rede) MUDAM
      // `mapasLocais` de forma independente e quase simultânea, cada mudança
      // re-executando este efeito — se a leitura local terminar primeiro e já
      // tiver as mesmas camadas, essa 1ª rodada dispara montarIndiceBusca
      // (`mudou: true`), mas a sincronização de rede chega logo em seguida e
      // cancela essa rodada antes dela terminar; a 2ª rodada (`mudou: false`,
      // nada realmente novo pra adicionar) não tentava de novo — o índice de
      // busca nunca era construído (busca ficava "não disponível" pra
      // sempre). Comparar pela assinatura das camadas já carregadas, só
      // atualizada dentro do .then() não cancelado, garante que uma rodada
      // cancelada sempre deixa a próxima rodada tentar de novo.
      const assinaturaCombinada = [...carregadas.entries()]
        .sort(([a], [b]) => a - b)
        .map(([id, info]) => `${id}:${info.assinatura}`)
        .join("|");
      if (assinaturaCombinada !== indiceBuscaAssinaturaRef.current) {
        montarIndiceBusca([...carregadas.values()]).then((novo) => {
          if (cancelado) return;
          indiceBuscaAssinaturaRef.current = assinaturaCombinada;
          setIndiceBusca(novo);
        });
      }
    }

    aplicar();
    return () => {
      cancelado = true;
    };
  }, [mapasLocais, mapaPronto]);

  // 5) liga/desliga camadas com transição suave (opacidade, não visibilidade)
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto) return;
    for (const [id, info] of camadasCarregadasRef.current) {
      const visivel = camadasVisiveis.has(id);
      // Antes só mexia em fillLayerId/lineLayerId (com "continue" se
      // fillLayerId não existisse) — pra uma camada de ponto (só
      // circleLayerId, sem fill/linha), isso pulava a camada inteira: o
      // checkbox de liga/desliga simplesmente não fazia nada nela. Cada
      // layer agora é tratado de forma independente (só mexe no que de
      // fato existe pra essa camada), e a opacidade "ligada" de cada um
      // vem do que foi configurado (nunca mais um "1" fixo que ignorava
      // contorno.opacidade).
      if (map.getLayer(info.fillLayerId)) {
        map.setPaintProperty(info.fillLayerId, "fill-opacity", visivel ? info.opacidadePreenchimento : 0);
      }
      if (map.getLayer(info.lineLayerId)) {
        map.setPaintProperty(info.lineLayerId, "line-opacity", visivel ? info.opacidadeContorno : 0);
      }
      if (map.getLayer(info.circleLayerId)) {
        // "circle" e "symbol" (ícone SDF, ver usaIconeSimbolo) têm nomes de
        // paint property diferentes — setPaintProperty com o nome errado
        // pro tipo do layer lança exceção.
        if (info.tipoPonto === "symbol") {
          map.setPaintProperty(info.circleLayerId, "icon-opacity", visivel ? info.opacidadePreenchimento : 0);
        } else {
          map.setPaintProperty(info.circleLayerId, "circle-opacity", visivel ? info.opacidadePreenchimento : 0);
          map.setPaintProperty(info.circleLayerId, "circle-stroke-opacity", visivel ? info.opacidadeContorno : 0);
        }
      }
      if (info.rotuloLayerId) {
        map.setPaintProperty(info.rotuloLayerId, "text-opacity", visivel ? 1 : 0);
      }
    }
  }, [camadasVisiveis, mapaPronto, mapasLocais]);

  // 6) clique consolidado nas camadas visíveis — junta todas as feições no
  // ponto clicado (mesmo de camadas diferentes sobrepostas) com paginação.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto) return;

    function handleClick(e) {
      if (medicao.medindo) {
        medicao.adicionarPonto([e.lngLat.lng, e.lngLat.lat]);
        return;
      }

      const layerIds = [...camadasCarregadasRef.current.entries()]
        .filter(([id, info]) => camadasVisiveis.has(id) && info.consultavel)
        .flatMap(([, info]) => [info.fillLayerId, info.circleLayerId].filter(Boolean))
        .filter((id) => map.getLayer(id));
      if (layerIds.length === 0) {
        setSelecao(null);
        return;
      }

      const features = map.queryRenderedFeatures(e.point, { layers: layerIds });
      if (features.length === 0) {
        setSelecao(null);
        return;
      }

      // Tiles vizinhos podem repetir a mesma feição na borda — deduplica.
      const vistos = new Set();
      const itens = [];
      for (const feature of features) {
        const chave = `${feature.layer.id}:${JSON.stringify(feature.properties)}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        const info = [...camadasCarregadasRef.current.values()].find(
          (c) => c.fillLayerId === feature.layer.id || c.circleLayerId === feature.layer.id
        );
        itens.push({
          mapaId: info?.id,
          camada: info?.nome,
          cor: info?.cor,
          propriedades: aplicarConfigAtributos(feature.properties, info?.atributosConfig),
          grupoFiltro: construirFiltroGrupo(feature.properties),
        });
      }
      if (itens.length === 0) return;

      setSelecao({ lngLat: e.lngLat, itens, indice: 0 });
    }

    map.on("click", handleClick);
    return () => map.off("click", handleClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapaPronto, camadasVisiveis, medicao.medindo]);

  // 7) highlight de grupo: destaca todas as partes do talhão/seção
  // selecionado (mesma SECAO+TALHAO ou DESC_SECAO), sem desenhar nada
  // extra além da borda amarela nas partes irmãs já carregadas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto) return;

    for (const info of camadasCarregadasRef.current.values()) {
      if (map.getLayer(info.highlightLayerId)) {
        map.setFilter(info.highlightLayerId, FILTRO_NENHUM);
      }
      if (map.getLayer(info.highlightCircleLayerId)) {
        map.setFilter(info.highlightCircleLayerId, FILTRO_NENHUM);
      }
    }

    const atual = selecao?.itens[selecao.indice];
    if (atual?.grupoFiltro && atual.mapaId != null) {
      const info = camadasCarregadasRef.current.get(atual.mapaId);
      if (info) {
        if (map.getLayer(info.highlightLayerId)) {
          map.setFilter(info.highlightLayerId, atual.grupoFiltro);
        }
        if (map.getLayer(info.highlightCircleLayerId)) {
          map.setFilter(info.highlightCircleLayerId, atual.grupoFiltro);
        }
      }
    }
  }, [selecao, mapaPronto]);

  // 8) marcador no ponto exato clicado
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    marcadorRef.current?.remove();
    marcadorRef.current = null;
    if (selecao) {
      marcadorRef.current = new maplibregl.Marker({ color: CORES_FERRAMENTAS.marcadorSelecao })
        .setLngLat(selecao.lngLat)
        .addTo(map);
    }
    return () => {
      marcadorRef.current?.remove();
      marcadorRef.current = null;
    };
  }, [selecao]);

  function alternarCamada(id) {
    setCamadasVisiveis((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  function irParaItem(delta) {
    setSelecao((atual) => {
      if (!atual) return atual;
      const total = atual.itens.length;
      const indice = (atual.indice + delta + total) % total;
      return { ...atual, indice };
    });
  }

  function handleSair() {
    sair();
    navigate("/login");
  }

  function selecionarResultadoBusca(resultado) {
    const map = mapRef.current;
    if (!map) return;
    // Enquadra a extensão real da fazenda (união de todos os polígonos
    // dela, ver montarIndiceBusca) em vez de só voar pro ponto do
    // rótulo — esse ponto fica só na maior peça de uma fazenda com
    // peças espalhadas (polylabel em gerar_rotulos_por_atributo.py), e
    // um zoom fixo nele deixava de fora o resto da fazenda, parecendo
    // "aproximar de lugar aleatório".
    const [minLng, minLat, maxLng, maxLat] = resultado.bounds || [];
    if (resultado.bounds && Number.isFinite(minLng) && Number.isFinite(maxLng)) {
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 60, duration: 1200, maxZoom: 16 },
      );
    } else {
      map.flyTo({ center: [resultado.lng, resultado.lat], zoom: 16, duration: 1200 });
    }
    setBuscaTexto("");
  }

  // ↑/↓ navegam a lista (desktop); Enter confirma o destacado — sem
  // nunca mexer nas setas, Enter já seleciona o primeiro (índice 0),
  // sem precisar clicar num item da lista.
  function aoTeclarBusca(e, resultados, indiceDestacado) {
    if (resultados.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setIndiceDestacadoBusca((i) => Math.min(i + 1, resultados.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setIndiceDestacadoBusca((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const resultado = resultados[indiceDestacado];
      if (resultado) selecionarResultadoBusca(resultado);
    }
  }

  const itemSelecionado = selecao?.itens[selecao.indice];

  const buscaNormalizada = normalizarTexto(buscaTexto.trim());
  const resultadosBusca =
    buscaNormalizada.length >= 2
      ? indiceBusca
          .filter((r) => r.buscavel.includes(buscaNormalizada))
          // Buscar "Santa Lydia" deveria achar a fazenda em si, não só os
          // 20+ talhões que têm esse nome no texto — texto mais curto
          // (mais específico) primeiro.
          .sort((a, b) => a.texto.length - b.texto.length)
          .slice(0, 8)
      : [];
  // A lista é recalculada a cada tecla — se encolher, o índice destacado
  // de uma busca anterior pode ficar fora dos limites.
  const indiceDestacadoValido = Math.min(indiceDestacadoBusca, Math.max(resultadosBusca.length - 1, 0));

  return (
    <main className="tela-mapa">
      <header className="barra-mapa">
        <strong>GeoMap</strong>
        <span className="status-sync">
          {sincronizando && <span className="spinner" aria-hidden="true" />}
          {sincronizando
            ? "Sincronizando…"
            : offline
              ? "Offline — usando último mapa salvo"
              : ultimaSincronizacao
                ? `Atualizado às ${ultimaSincronizacao.toLocaleTimeString("pt-BR", {
                    hour: "2-digit",
                    minute: "2-digit",
                  })}`
                : null}
        </span>
        {medicao.medindo && (
          <span className="status-medicao" aria-live="polite">
            Medição ativa: {medicao.modoMedicao === "area" ? "área" : "distância"}
          </span>
        )}
        <Link to="/inicio" className="botao-circular" aria-label="Trocar mapa" title="Trocar mapa">
          <IconeMapas />
        </Link>
        <button
          type="button"
          className="botao-circular"
          onClick={() => setMenuAberto(true)}
          aria-label="Abrir menu"
          title="Menu"
        >
          <IconeMenu />
        </button>
      </header>

      <MenuLateral
        aberto={menuAberto}
        aoFechar={() => setMenuAberto(false)}
        ehAdmin={sessao.usuario.papel === "admin"}
        aoSair={handleSair}
      />

      <AvisoPrimeiraSincronizacao
        mostrar={sincronizando && semCamadasLocais && !avisoSincronizacaoFechado}
        aoFechar={() => setAvisoSincronizacaoFechado(true)}
      />

      <div className="area-mapa">
        <div ref={containerRef} className="mapa-container" />

        {!mapaPronto && (
          <div className="carregando-mapa">
            <span className="spinner spinner--grande" aria-hidden="true" />
            <p>Carregando mapa…</p>
          </div>
        )}

        {mapasLocais.length > 0 && (
          <div className="painel-busca">
            <input
              type="search"
              placeholder={
                indiceBusca.length > 0
                  ? "Buscar fazenda (nome ou código)…"
                  : "Busca não disponível para este mapa"
              }
              value={buscaTexto}
              onChange={(e) => {
                setBuscaTexto(e.target.value);
                setIndiceDestacadoBusca(0);
              }}
              onKeyDown={(e) => aoTeclarBusca(e, resultadosBusca, indiceDestacadoValido)}
              disabled={indiceBusca.length === 0}
              aria-disabled={indiceBusca.length === 0}
            />
            {indiceBusca.length === 0 ? (
              <p className="ajuda-busca">
                A busca não está disponível para o mapa carregado. Use o clique no mapa para ver atributos.
              </p>
            ) : (
              <>
                {resultadosBusca.length > 0 && (
                  <ul className="resultados-busca">
                    {resultadosBusca.map((r, i) => (
                      <li key={`${r.mapaId}-${i}`}>
                        <button
                          type="button"
                          className={i === indiceDestacadoValido ? "resultado-busca--destacado" : ""}
                          onMouseEnter={() => setIndiceDestacadoBusca(i)}
                          onClick={() => selecionarResultadoBusca(r)}
                        >
                          {r.texto}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {buscaNormalizada.length >= 2 && resultadosBusca.length === 0 && (
                  <p className="sem-resultados-busca">
                    <IconeEstadoVazio tamanho={16} /> Nada encontrado.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {mapasLocais.length > 0 && (
          <aside className="painel-camadas">
            <button
              type="button"
              className="cabecalho-painel-camadas"
              onClick={() => setPainelCamadasAberto((a) => !a)}
              aria-expanded={painelCamadasAberto}
            >
              <span>Camadas</span>
              <span className={`seta${painelCamadasAberto ? " seta--aberta" : ""}`} aria-hidden="true">
                ›
              </span>
            </button>
            <div className={`conteudo-painel-camadas${painelCamadasAberto ? " aberto" : ""}`}>
              <div className="conteudo-painel-camadas-interno">
                {mapasLocais.map((m) => {
                  // Legenda dinâmica: camada com preenchimento (ex: Talhões)
                  // ganha swatch sólido; camada só-contorno (ex: Limites)
                  // ganha swatch vazado — reflete o que aparece de fato no
                  // mapa, não só uma cor genérica. Lê de `info` (já resolvido
                  // por adicionarCamada, cobre os modos categorizado/graduado
                  // via cor de fallback) — só cai no cálculo direto antes da
                  // camada terminar de carregar.
                  const info = camadasCarregadasRef.current.get(m.id);
                  const cor = info?.cor || m.estiloConfig?.cor || corDaCamada(m.id);
                  const preenchido = (info?.opacidadePreenchimento ?? 0) > 0;
                  // Swatch vazado (só-contorno) precisa da cor do CONTORNO,
                  // não da de preenchimento — são independentes desde a
                  // simbologia estilo QGIS, e o preenchimento nem chega a
                  // aparecer no mapa quando a camada é só-contorno.
                  const corSwatch = preenchido ? cor : info?.corContorno || cor;
                  return (
                    <label key={m.id} className="linha-camada">
                      <input
                        type="checkbox"
                        checked={camadasVisiveis.has(m.id)}
                        onChange={() => alternarCamada(m.id)}
                      />
                      <span
                        className={`swatch-camada${preenchido ? "" : " swatch-camada--contorno"}`}
                        style={preenchido ? { backgroundColor: corSwatch } : { borderColor: corSwatch }}
                      />
                      <span className="nome-camada">{m.nome}</span>
                      {errosCamada[m.id] && (
                        <span
                          className="aviso-camada"
                          role="img"
                          aria-label={errosCamada[m.id]}
                          title={errosCamada[m.id]}
                        >
                          ⚠
                        </span>
                      )}
                    </label>
                  );
                })}

                {temporaria.arquivoTemporario && (
                  <label className="linha-camada linha-camada--temporaria">
                    <input
                      type="checkbox"
                      checked={temporaria.temporariaVisivel}
                      onChange={() => temporaria.setTemporariaVisivel((v) => !v)}
                    />
                    <span className="swatch-camada" style={{ backgroundColor: CORES_FERRAMENTAS.temporaria }} />
                    <span className="nome-camada">Temporária: {temporaria.arquivoTemporario.nome}</span>
                    <button
                      type="button"
                      className="fechar"
                      onClick={temporaria.removerArquivoTemporario}
                      aria-label="Remover camada temporária"
                      title="Remover camada temporária"
                    >
                      ×
                    </button>
                  </label>
                )}

                <label className="botao importar-arquivo-temporario">
                  {temporaria.importandoArquivo ? "Importando…" : "+ Importar arquivo (KML/SHP)"}
                  <input
                    type="file"
                    accept=".kml,.zip"
                    onChange={temporaria.aoImportarArquivo}
                    disabled={temporaria.importandoArquivo}
                  />
                </label>
                {temporaria.erroImportacao && <p className="erro">{temporaria.erroImportacao}</p>}
              </div>
            </div>
          </aside>
        )}

        {mapasLocais.length === 0 && !sincronizando && (
          <p className="aviso-sem-mapas">
            <IconeEstadoVazio tamanho={28} />
            {offline
              ? "Nenhum mapa disponível ainda. Conecte-se à internet pra sincronizar."
              : "Este mapa ainda não tem camadas publicadas."}
          </p>
        )}

        <aside className={`painel-flutuante painel-medicao${medicao.medindo ? " aberto" : ""}`}>
          {medicao.medindo && (
            <>
              <button
                type="button"
                className="fechar"
                onClick={() => medicao.setMedindo(false)}
                aria-label="Fechar medição"
                title="Fechar medição"
              >
                ×
              </button>
              <div className="opcoes-modo-medicao">
                <button
                  type="button"
                  className={medicao.modoMedicao === "distancia" ? "ativo" : ""}
                  onClick={() => medicao.trocarModoMedicao("distancia")}
                >
                  Distância
                </button>
                <button
                  type="button"
                  className={medicao.modoMedicao === "area" ? "ativo" : ""}
                  onClick={() => medicao.trocarModoMedicao("area")}
                >
                  Área
                </button>
              </div>
              <p className="resultado-medicao">
                {medicao.resultadoMedicaoAtual ??
                  (medicao.modoMedicao === "area"
                    ? "Clique pra marcar o polígono (mín. 3 pontos)"
                    : "Clique pra marcar os pontos")}
              </p>
              {medicao.pontosMedicao.length > 0 && (
                <button
                  type="button"
                  className="botao-limpar-medicao"
                  onClick={() => medicao.setPontosMedicao([])}
                >
                  Limpar
                </button>
              )}
            </>
          )}
        </aside>

        <aside className={`painel-flutuante painel-track${track.mostrarPainelTrack ? " aberto" : ""}`}>
          {track.mostrarPainelTrack && (
            <>
              <div className="cabecalho-painel-track">
                <h3>Gravar percurso</h3>
                <button
                  type="button"
                  className="fechar"
                  onClick={() => track.setMostrarPainelTrack(false)}
                  aria-label="Fechar gravação de percurso"
                  title="Fechar gravação de percurso"
                >
                  ×
                </button>
              </div>

              {track.gravandoPercurso && (
                <p className="aviso-track">
                  Mantenha o app aberto — trocar de app ou travar a tela manualmente interrompe a gravação.
                </p>
              )}

              {track.gravandoPercurso && (
                <label className="opcao-seguir-camera">
                  <input
                    type="checkbox"
                    checked={track.seguirCamera}
                    onChange={() => track.setSeguirCamera((s) => !s)}
                  />
                  📍 Seguir minha localização
                </label>
              )}

              {!track.gravandoPercurso ? (
                <button type="button" onClick={track.iniciarGravacaoPercurso}>
                  Iniciar gravação
                </button>
              ) : (
                <div className="acoes-painel-track">
                  {track.pausado ? (
                    <button type="button" onClick={track.continuarGravacaoPercurso}>
                      ▶ Continuar
                    </button>
                  ) : (
                    <button type="button" className="botao-secundario" onClick={track.pausarGravacaoPercurso}>
                      ⏸ Pausar
                    </button>
                  )}
                  <button
                    type="button"
                    className={track.pausado ? "botao-secundario" : "botao-track-gravando"}
                    onClick={track.pararGravacaoPercurso}
                  >
                    ● Parar gravação
                  </button>
                </div>
              )}

              <p className={`resultado-medicao${track.gravandoPercurso ? " resultado-track-ativo" : ""}`}>
                {track.gravandoPercurso
                  ? `${track.pausado ? "Pausado…" : "Gravando…"} ${track.distanciaPercursoAtual ?? "0 m"}`
                  : track.distanciaPercursoAtual
                    ? `Percurso gravado: ${track.distanciaPercursoAtual}`
                    : "Clique em \"Iniciar gravação\" e mantenha o app aberto durante o percurso."}
              </p>
              {track.erroTrack && <p className="erro">{track.erroTrack}</p>}
              {track.avisoCompartilhar && <p className="aviso-track">{track.avisoCompartilhar}</p>}
              {!track.gravandoPercurso && track.distanciaPercursoAtual && (
                <div className="acoes-painel-track acoes-painel-track--grade">
                  <button type="button" className="botao-secundario" onClick={track.exportarPercurso}>
                    Exportar KML
                  </button>
                  <button type="button" className="botao-secundario" onClick={track.compartilharPercurso}>
                    Compartilhar
                  </button>
                  <button
                    type="button"
                    className="botao-secundario"
                    onClick={() => {
                      temporaria.setArquivoTemporario({
                        nome: `Percurso — ${new Date().toLocaleString("pt-BR")}`,
                        geojson: track.geojsonPercursoAtual,
                      });
                      temporaria.setTemporariaVisivel(true);
                    }}
                  >
                    Ver no mapa
                  </button>
                  <button type="button" className="botao-limpar-medicao" onClick={track.limparPercurso}>
                    Limpar
                  </button>
                </div>
              )}
            </>
          )}
        </aside>

        <aside className={`painel-flutuante painel-atributos${selecao ? " aberto" : ""}`}>
          {itemSelecionado && (
            <>
              <button
                type="button"
                className="fechar"
                onClick={() => setSelecao(null)}
                aria-label="Fechar painel de atributos"
                title="Fechar painel de atributos"
              >
                ×
              </button>
              <h2>
                <span className="swatch-camada" style={{ backgroundColor: itemSelecionado.cor }} />
                {itemSelecionado.camada}
              </h2>
              <dl className="atributos-grid" key={selecao.indice}>
                {itemSelecionado.propriedades.map(({ campo, rotulo, valor }) => (
                  <div key={campo} className="linha-atributo">
                    <dt>{rotulo}</dt>
                    <dd>{String(valor)}</dd>
                  </div>
                ))}
              </dl>
              {selecao.itens.length > 1 && (
                <div className="paginacao-atributos">
                  <button type="button" onClick={() => irParaItem(-1)} aria-label="Feição anterior">
                    ‹
                  </button>
                  <span>
                    {selecao.indice + 1} / {selecao.itens.length}
                  </span>
                  <button type="button" onClick={() => irParaItem(1)} aria-label="Próxima feição">
                    ›
                  </button>
                </div>
              )}
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
