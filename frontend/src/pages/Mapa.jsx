import { useEffect, useMemo, useRef, useState } from "react";
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
import { useApontamentoVoo } from "../hooks/useApontamentoVoo.js";
import { usePins } from "../hooks/usePins.js";
import { usePinsPendentes, sairDescartandoPins } from "../hooks/usePinsPendentes.js";
import { useApontamentosNaFila } from "../hooks/useApontamentosNaFila.js";
import { ICONES_PREPARO, urlSvgPin } from "../lib/iconesPreparo.js";
import {
  linkGoogleMaps,
  linkWaze,
  linkAppleMaps,
  compartilharLocalizacao,
} from "../lib/compartilharLocalizacao.js";
import MenuLateral from "../components/MenuLateral.jsx";
import DockFerramentas, {
  IconeDockCamadas,
  IconeDockMedir,
  IconeDockPercurso,
  IconeDockAnotar,
  IconeDockTipoVoo,
  IconeDockArea,
  IconeDockImportar,
} from "../components/DockFerramentas.jsx";
import PainelVoos from "../components/PainelVoos.jsx";
import BarraApontamento from "../components/BarraApontamento.jsx";
import { useEhCelular } from "../hooks/useEhCelular.js";
import IconeEstadoVazio from "../components/IconeEstadoVazio.jsx";
import LegendaCamada, {
  IconeFormaPonto,
  FaixaCores,
  FaixaGradiente,
  temLegendaDetalhada,
  BlocoLegendaCores,
} from "../components/LegendaCamada.jsx";
import { resumoFeicoesTemporaria } from "../lib/importadorTemporario.js";
import AvisoPrimeiraSincronizacao from "../components/AvisoPrimeiraSincronizacao.jsx";
import CartaoPonto from "../components/CartaoPonto.jsx";
import CartaoPin from "../components/pins/CartaoPin.jsx";
import BarraAnotar from "../components/pins/BarraAnotar.jsx";
import BarraAcaoMedicao from "../components/BarraAcaoMedicao.jsx";
import BarraAcaoPercurso from "../components/BarraAcaoPercurso.jsx";
import {
  IconeCentralizar,
  IconeComoChegar,
  IconeCompartilhar,
  IconeAnterior,
  IconeProximo,
  IconeFechar,
} from "../components/IconesAcao.jsx";
import FormularioPin from "../components/pins/FormularioPin.jsx";
import LinhaCoordenada from "../components/LinhaCoordenada.jsx";
import { copiarTexto } from "../lib/coordenadas.js";
import { useJobs } from "../context/JobsContext.jsx";

// Marca do app no cartão de identidade da barra superior (pino de mapa).
function IconeMarca() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11Z" />
      <circle cx="12" cy="10" r="2.2" />
    </svg>
  );
}

function IconeSetaBaixo() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

function IconeBusca() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" />
    </svg>
  );
}

function iniciaisDoNome(nome) {
  const partes = String(nome || "").trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return "?";
  return (partes[0][0] + (partes.length > 1 ? partes[partes.length - 1][0] : "")).toUpperCase();
}

// Texto do aviso depois de apontar: enviado agora, guardado no aparelho
// (sem sinal) ou enviado depois pela fila (redesenho, fase 4).
function textoResultadoApontamento(r) {
  const plural = (n, um, varios) => `${n} ${n === 1 ? um : varios}`;
  if (r.naFila) {
    return `Guardado no aparelho: ${plural(r.naFila, "apontamento", "apontamentos")} · envia sozinho quando o sinal voltar.`;
  }
  const partes = [];
  if (r.daFila) {
    if (r.sucesso.length > 0) {
      partes.push(`${plural(r.sucesso.length, "apontamento guardado foi enviado", "apontamentos guardados foram enviados")}.`);
    }
    if (r.recusados > 0) {
      partes.push(`${plural(r.recusados, "não foi aceito", "não foram aceitos")} — veja no painel Voos.`);
    }
    return partes.join(" ");
  }
  if (r.sucesso.length > 0) {
    partes.push(`${plural(r.sucesso.length, "apontamento enviado", "apontamentos enviados")} com sucesso.`);
  }
  if (r.falha.length > 0) partes.push(`${r.falha.length} ${r.falha.length === 1 ? "falhou" : "falharam"}.`);
  return partes.join(" ");
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

// Nome de camada convencionado, gerado pelo pipeline (ver
// pipeline/rotulos/gerar_rotulos.py e gerar_rotulos_por_atributo.py):
// "rotulos" = 1 ponto por feição lógica
// (mesmo quando a geometria original tem várias partes desconexas —
// MapLibre/tippecanoe rotulariam cada parte separadamente, causando
// número repetido no mapa). Não é obrigatória — um .pmtiles sem ela
// simplesmente não ganha rótulo.
const CAMADA_ROTULOS = "rotulos";

// KML de campo real pode ter centenas de Placemarks (visto: 320) — sem
// limite, a legenda expandida vira um bloco de milhares de pixels de
// altura empurrando o painel inteiro, parecendo "quebrado" em vez de
// "expandiu". Corta em 40 (a imensa maioria dos casos reais de uso cabe
// nisso — categorias de estilo real raramente passam de uma dúzia) e
// avisa quantos ficaram de fora.
const LIMITE_ITENS_LEGENDA_TEMPORARIA = 40;

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

// Desce recursivamente pela mesma estrutura de coordenadas GeoJSON até
// achar o primeiro par [lng,lat] (uma folha) — usado só pra ter um ponto
// aproximado de cada talhão (ver talhoesPorDesc), suficiente pra centralizar
// o mapa ao clicar um item da lista, sem precisar calcular centroide.
function primeiroPontoComCoords(coords) {
  if (typeof coords[0] === "number") return coords;
  for (const c of coords) {
    const ponto = primeiroPontoComCoords(c);
    if (ponto) return ponto;
  }
  return null;
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
  // Mesma extensão, mas por SECAO individual (DESC_SECAO+"|"+SECAO) — nomes
  // coincidem entre propriedades genuinamente diferentes (ex: duas seções
  // reais chamadas "Belo Horizonte", achado real reportado pelo Leo,
  // 2026-09-22); sem isso a busca por um código específico (ex: 20643)
  // caía na extensão fundida do nome inteiro, que podia estar dominada por
  // OUTRO código (ex: 10016) — "buscar 20643, mas ir parar em 10016".
  const boundsPorChaveSecao = new Map(); // "DESC_SECAO|SECAO" -> [minLng, minLat, maxLng, maxLat]
  // Lista de talhões (número + atributos + ponto aproximado) de cada
  // fazenda/seção, só a partir de camadas com campo TALHAO — alimenta o
  // card "Talhões da fazenda" que aparece ao selecionar um resultado de
  // busca. Chave interna por SECAO+TALHAO evita duplicar o mesmo talhão
  // quando ele aparece em mais de 1 tile do scan (feição multi-parte).
  const talhoesPorDesc = new Map(); // DESC_SECAO -> Map("SECAO-TALHAO" -> item)
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
          const coordsGeoJson = feature.toGeoJSON(x, y, z).geometry.coordinates;
          expandirBoundsComCoords(boundsPorDesc.get(props.DESC_SECAO), coordsGeoJson);

          if ("SECAO" in props) {
            const chaveSecao = `${props.DESC_SECAO}|${props.SECAO}`;
            if (!boundsPorChaveSecao.has(chaveSecao)) {
              boundsPorChaveSecao.set(chaveSecao, [Infinity, Infinity, -Infinity, -Infinity]);
            }
            expandirBoundsComCoords(boundsPorChaveSecao.get(chaveSecao), coordsGeoJson);
          }

          if (info.ehTalhao && "TALHAO" in props) {
            if (!talhoesPorDesc.has(props.DESC_SECAO)) talhoesPorDesc.set(props.DESC_SECAO, new Map());
            const ponto = primeiroPontoComCoords(coordsGeoJson);
            talhoesPorDesc.get(props.DESC_SECAO).set(`${props.SECAO}-${props.TALHAO}`, {
              talhao: props.TALHAO,
              secao: props.SECAO,
              mapaId: info.id,
              lng: ponto?.[0],
              lat: ponto?.[1],
              propriedades: aplicarConfigAtributos(props, info.atributosConfig),
            });
          }
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

          if (codigos && codigos.size > 1) {
            // Nome ambíguo — mais de 1 SECAO real com esse nome (ex: duas
            // seções sem relação nenhuma entre si chamadas "Belo
            // Horizonte", achado real reportado pelo Leo: buscar o código
            // 20643 caía na extensão fundida, dominada pelo código 10016,
            // 2026-09-22). 1 entrada por código, cada uma com a própria
            // extensão (não a fundida de boundsPorDesc) e o código no
            // texto pra desambiguar — mesmo padrão já usado em Talhões
            // ("Talhão N — Fazenda (cód. X)").
            for (const codigo of codigos) {
              const boundsCodigo = boundsPorChaveSecao.get(`${props.rotulo}|${codigo}`) || null;
              const centro = boundsCodigo
                ? [(boundsCodigo[0] + boundsCodigo[2]) / 2, (boundsCodigo[1] + boundsCodigo[3]) / 2]
                : [lng, lat];
              indice.push({
                texto: `${texto} (cód. ${codigo})`,
                // nomeBase (DESC_SECAO real) + codigo próprios — usados
                // pra achar os talhões certos (talhoesPorDesc é indexado
                // pelo nome cru) e destacar só esse código no mapa, não
                // os dois fundidos (ver selecionarResultadoBusca/efeito 7).
                nomeBase: texto,
                codigo,
                buscavel: normalizarTexto(`${texto} ${codigo}`),
                lng: centro[0],
                lat: centro[1],
                bounds: boundsCodigo,
                mapaId: info.id,
              });
            }
          } else {
            const buscavelExtra = codigos ? ` ${[...codigos].join(" ")}` : "";
            const bounds = boundsPorDesc.get(props.rotulo) || null;
            indice.push({
              texto,
              nomeBase: texto,
              codigo: null,
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
  }

  // Converte pra array ordenado por número do talhão (numérico quando dá,
  // senão por texto) — a UI só precisa iterar, não mais mexer no Map.
  const talhoesPorDescOrdenados = new Map();
  for (const [desc, porChave] of talhoesPorDesc) {
    const lista = [...porChave.values()].sort((a, b) => {
      const na = Number(a.talhao);
      const nb = Number(b.talhao);
      if (Number.isFinite(na) && Number.isFinite(nb)) return na - nb;
      return String(a.talhao).localeCompare(String(b.talhao));
    });
    talhoesPorDescOrdenados.set(desc, lista);
  }

  return { indice, talhoesPorDesc: talhoesPorDescOrdenados };
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
  // Camada de voos é só contorno colorido por tipo (ver useApontamentoVoo)
  // — o hook zera o preenchimento, mas o efeito de liga/desliga camadas
  // reaplica opacidadePreenchimento sempre que a sincronização termina;
  // no celular isso costuma acontecer depois do hook e o fundo creme da
  // camada voltava a aparecer. Zerar na origem vale pros dois lugares.
  if (estilo.tipoCamada === "voos") preenchimento.opacidade = 0;
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
          // Sem isso, o Safari/iOS (WebGL via Metal/ANGLE) mostra o
          // preenchimento fragmentado em triângulos/retângulos soltos —
          // bug conhecido do passe de anti-aliasing de fill layers do
          // MapLibre nesse backend específico de WebGL (não acontece no
          // Chrome/Android, que usa outro backend). Desligar antialiasing
          // no contorno do preenchimento não é perceptível visualmente
          // (a borda em si já é desenhada por cima via lineLayerId).
          "fill-antialias": false,
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
    // versao só muda quando a geometria muda; atributos/estilo/ordem podem
    // mudar independente disso (painel de admin) — a assinatura cobre os
    // quatro, pra saber quando vale reconstruir a camada sem rebaixar nada.
    assinatura: `${mapa.versao}|${JSON.stringify(mapa.atributosConfig)}|${JSON.stringify(mapa.estiloConfig)}|${mapa.ordem}`,
    ordem: mapa.ordem ?? 0,
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
    // Config normalizada completa (não só a cor de fallback acima) — usada
    // pelo painel de camadas pra mostrar a simbologia de verdade (forma
    // real do ponto, faixa de cores categorizada/graduada/gradiente,
    // legenda expansível), não só um swatch de 1 cor genérico.
    preenchimento,
    contorno,
    simbolo,
    ehPonto,
    // Decide se essa camada contribui pra lista de talhões da fazenda
    // buscada (ver montarIndiceBusca/talhoesPorDesc) — só camadas com o
    // campo TALHAO fazem sentido aparecer nesse card.
    ehTalhao,
    // "padrao" | "voos" (réplica de talhões pra apontamento de voo, ver
    // docs/INTEGRACAO_DRONEMANAGEMENT.md) — decide se o clique nessa
    // camada abre o painel de atributos normal ou o fluxo de apontamento.
    tipoCamada: estilo.tipoCamada,
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
  // DESC_SECAO (fazenda/seção) -> lista de talhões (ver montarIndiceBusca),
  // montado junto com o índice de busca — não precisa ser state porque só é
  // lido no instante em que um resultado de busca é selecionado
  // (selecionarResultadoBusca), nunca durante o render em si.
  const talhoesPorDescRef = useRef(new Map());
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
  // "dispositivo" (sem internet de verdade) | "servidor" (o aparelho tem
  // internet, mas a chamada ao backend falhou — servidor fora do ar,
  // bloqueio de borda etc, ver sincronizarMapas) | null enquanto não se
  // sabe ainda — muda a mensagem exibida (status no cartão de identidade) pra não
  // o usuário achar que é problema do celular dele quando não é.
  const [motivoOffline, setMotivoOffline] = useState(null);
  // Nada baixado localmente pra este mapa ainda — mesmo raciocínio de
  // Inicio.jsx (ver AvisoPrimeiraSincronizacao): baseado no estado real do
  // IndexedDB, não num "já vi isso" salvo em localStorage.
  const [semCamadasLocais, setSemCamadasLocais] = useState(false);
  const [avisoSincronizacaoFechado, setAvisoSincronizacaoFechado] = useState(false);
  const [selecao, setSelecao] = useState(null);
  // Clique fora de qualquer feição consultável: mostra a coordenada
  // (CartaoPonto). Mutuamente exclusivo com `selecao` — no máximo 1 card
  // de informação aberto por vez.
  const [pontoSelecionado, setPontoSelecionado] = useState(null);
  const [mostrarMenuCompartilhar, setMostrarMenuCompartilhar] = useState(false);
  // Sem Web Share API (desktop), "Compartilhar" copia o link do ponto — o
  // botão confirma por 2s ("Link copiado").
  const [linkCopiado, setLinkCopiado] = useState(false);
  // Celular (redesenho, fase 3): gaveta inferior com abas no lugar da
  // barra de ferramentas e dos painéis laterais; painel do talhão abre
  // compacto e só mostra todos os atributos quando pedido (pedido do Leo
  // no protótipo: "não pode cobrir mais de 50% do mapa").
  const ehCelular = useEhCelular();
  const [gavetaAberta, setGavetaAberta] = useState(false);
  // null = ainda não escolhida: vale a 1ª aba do mapa (Voos no mapa de voos).
  const [abaGaveta, setAbaGaveta] = useState(null);
  const [atributosExpandidos, setAtributosExpandidos] = useState(false);
  // Recolhido por padrão em qualquer tamanho de tela — antes só recolhia
  // no mobile (aberto por padrão no desktop), comportamento inconsistente
  // entre plataformas.
  const [painelCamadasAberto, setPainelCamadasAberto] = useState(false);
  // Painel "Voos" do mapa de voos (redesenho, fase 4): resumo das
  // pendências, filtro por tipo, fila offline e o botão "Apontar voo".
  // Recolhido por padrão, aberto pela barra de ferramentas — mutuamente
  // exclusivo com o painel de camadas.
  const [painelVoosAberto, setPainelVoosAberto] = useState(false);
  // Quais camadas têm a legenda completa expandida (categorizado/graduado/
  // gradiente/forma por atributo) — só existe a setinha de expandir pra
  // camada que tem algo além do swatch simples (ver temLegendaDetalhada).
  const [legendasExpandidas, setLegendasExpandidas] = useState(() => new Set());
  // Legenda da camada temporária (KML/Shapefile importado) — separada de
  // legendasExpandidas porque só existe uma por vez (não é indexada por id
  // de mapa real).
  const [legendaTemporariaExpandida, setLegendaTemporariaExpandida] = useState(false);
  const [indiceBusca, setIndiceBusca] = useState([]);
  // Sobe a cada rodada de aplicar() que adiciona/remove/reconstrói camada.
  // camadasCarregadasRef não dispara render; sem isto, o que é derivado
  // dela no render (voosInfo, legenda) só aparecia por acaso, no próximo
  // render causado por outra coisa (achado na fase 4: na primeira abertura
  // do mapa de voos, o painel Voos e as pendências não apareciam).
  const [, setVersaoCamadas] = useState(0);
  const [buscaTexto, setBuscaTexto] = useState("");
  // Fazenda selecionada pela busca (resultado inteiro, ver
  // selecionarResultadoBusca) — dirige tanto o destaque visual do limite no
  // mapa (efeitos 7/7b) quanto o card "Talhões da fazenda". null quando
  // nenhuma busca foi selecionada ainda ou o card foi fechado manualmente.
  const [buscaSelecionada, setBuscaSelecionada] = useState(null);
  const [talhoesFazenda, setTalhoesFazenda] = useState([]);
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
  // Nome de verdade do mapa (ex: "Geral", "Temático"), lido do IndexedDB
  // (mesma fonte da tela inicial) — aparece no cartão da barra superior e
  // identifica o mapa nos arquivos exportados pela medição (KML/PDF).
  // Vazio até a primeira leitura/sincronização (a barra mostra
  // "Carregando…"; a exportação cai em "mapa-<id>").
  const [nomeMapaAtual, setNomeMapaAtual] = useState("");
  // Vem do catálogo salvo no IndexedDB (GET /mapas.podeEditar) — funciona
  // offline. Libera as ferramentas de anotação (pins).
  const [podeEditar, setPodeEditar] = useState(false);
  // Barra de ferramentas "Anotar" (tocar no mapa / GPS) — aberta/fechada
  // pelo botão Anotar da barra de ferramentas (DockFerramentas).
  const [barraAnotarAberta, setBarraAnotarAberta] = useState(false);

  // Medição, track log e importação temporária viraram hooks próprios
  // (frontend/src/hooks/) — cada um cuida do próprio state + efeitos que
  // criam/destroem source/layers no mapa. `mapRef`/`mapaPronto` são
  // repassados porque o mapa em si é criado uma vez só, aqui embaixo (efeito
  // 1) — os hooks não criam mapa nenhum, só desenham em cima do existente.
  const medicao = useMedicao(
    mapRef,
    mapaPronto,
    () => {
      setSelecao(null);
      setPontoSelecionado(null);
      pins.fecharPin();
    },
    nomeMapaAtual || `mapa-${mapaId}`
  );
  const track = useTrackLog(mapRef, mapaPronto, mapaId);
  const temporaria = useImportacaoTemporaria(mapRef, mapaPronto, mapaId);
  // A camada com tipoCamada:"voos" (réplica de Talhões pra apontamento,
  // ver docs/INTEGRACAO_DRONEMANAGEMENT.md) — null enquanto ela não
  // carregou ou esse mapa não tem uma. Lida direto de camadasCarregadasRef
  // (populado pelo efeito 4 abaixo); refletir sempre que ele muda não
  // precisa de state próprio, já que indiceBusca/errosCamada (usados só
  // como sinal de "algo carregou") já disparam um re-render depois de
  // cada rodada desse efeito.
  const voosInfo = [...camadasCarregadasRef.current.values()].find((info) => info.tipoCamada === "voos") || null;
  const apontamento = useApontamentoVoo(mapRef, mapaPronto, voosInfo, mapaId, sessao.token);
  const { adicionarToast } = useJobs();
  const pins = usePins(mapRef, mapaPronto, mapaId, {
    podeEditar,
    sessao,
    aoAviso: (mensagem) => adicionarToast({ tipo: "erro", mensagem }),
  });
  const pinsPendentes = usePinsPendentes();
  const filaApontamentos = useApontamentosNaFila();
  // Nome + cor real de cada feição do arquivo importado (ver
  // resumoFeicoesTemporaria) — alimenta o swatch (cor única, faixa de cores,
  // ou o magenta padrão quando o arquivo não tem simbologia nenhuma) e a
  // legenda expansível "ver cada item que compõe" pedida pelo usuário.
  const resumoTemporaria = useMemo(
    () => (temporaria.arquivoTemporario ? resumoFeicoesTemporaria(temporaria.arquivoTemporario.geojson) : null),
    [temporaria.arquivoTemporario]
  );
  // Fecha a legenda expandida ao trocar/remover o arquivo — senão um
  // arquivo novo importado logo em seguida herdaria o estado "expandida"
  // do anterior.
  useEffect(() => {
    setLegendaTemporariaExpandida(false);
  }, [temporaria.arquivoTemporario]);

  // Nome de exibição real do mapa (ex: "Geral") pros arquivos exportados
  // pela medição — lido do IndexedDB (mesma fonte da tela inicial),
  // funciona offline já que só depende do que a sincronização já baixou.
  useEffect(() => {
    let cancelado = false;
    listarMapasDisponiveis().then((disponiveis) => {
      if (cancelado) return;
      const atual = disponiveis.find((m) => m.id === mapaId);
      if (atual?.nome) setNomeMapaAtual(atual.nome);
      setPodeEditar(atual?.podeEditar === true);
    });
    return () => {
      cancelado = true;
    };
  }, [mapaId]);

  // Fecha o menu de compartilhar localização sempre que a seleção muda
  // (trocou de feição, paginou entre feições sobrepostas, ou fechou o
  // painel) — sem isso o menu ficava aberto apontando pro ponto antigo.
  useEffect(() => {
    setMostrarMenuCompartilhar(false);
    setLinkCopiado(false);
    setAtributosExpandidos(false);
  }, [selecao]);

  // Arrastar o mapa recolhe a gaveta do celular — o usuário voltou a olhar
  // o mapa, a gaveta aberta (60% da tela) só atrapalharia.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto || !ehCelular) return;
    const recolher = () => setGavetaAberta(false);
    map.on("dragstart", recolher);
    return () => map.off("dragstart", recolher);
  }, [mapaPronto, ehCelular]);

  useEffect(() => {
    if (!linkCopiado) return;
    const t = setTimeout(() => setLinkCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [linkCopiado]);

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
      // Sem isso, capturar o canvas via toDataURL() (relatório em PDF da
      // medição, ver useMedicao/exportarMedicao.js) volta uma imagem preta
      // sólida — o WebGL limpa o drawing buffer a cada frame por padrão, e
      // o browser lê de volta um buffer zerado (RGBA 0,0,0,0), que o
      // encoder JPEG converte pra preto ao descartar o alfa. Precisa ficar
      // aninhado em canvasContextAttributes (não é uma opção de nível
      // raiz do Map nesta versão do MapLibre — colocar direto em
      // options.preserveDrawingBuffer é silenciosamente ignorado).
      canvasContextAttributes: { preserveDrawingBuffer: true },
      // Atribuição (Esri/Maxar, obrigatória pelos termos do fundo satélite
      // — ver seção "Fundo satélite" acima) recolhida por padrão (só o
      // ícone "ⓘ", expande no clique) em vez do texto completo sempre
      // visível — pedido do Leo (2026-09-22), ficava "encavalado" com a
      // barra de escala em telas estreitas. attributionControl:false aqui
      // + addControl manual abaixo porque não dá pra passar `compact`
      // direto nessa opção do construtor, só criando o controle à parte.
      attributionControl: false,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) window.__map = map;

    map.addControl(new maplibregl.AttributionControl({ compact: true }), "bottom-right");
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
    // Medir, Percurso e Anotar saíram daqui pra barra de ferramentas à
    // esquerda (DockFerramentas) — ferramenta não se mistura mais com
    // navegação (redesenho, fase 1).
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

  // Perder a permissão de anotar (ex: sync mudou `podeEditar`) fecha a
  // barra de anotar — antes isso vinha de graça ao remover o controle do
  // MapLibre; agora o botão mora na barra de ferramentas.
  useEffect(() => {
    if (!podeEditar) setBarraAnotarAberta(false);
  }, [podeEditar]);

  // Medição e anotação disputariam o mesmo clique — ligar uma desliga a outra.
  useEffect(() => {
    if (medicao.medindo) {
      setBarraAnotarAberta(false);
      pins.setModoAdicionar(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicao.medindo]);
  useEffect(() => {
    if (barraAnotarAberta && medicao.medindo) medicao.setMedindo(false);
    // Anotar e apontamento de voo também disputam o clique: abrir a barra
    // encerra o apontamento (pedindo confirmação se já há talhões marcados,
    // pra não jogar fora um lote montado pela metade).
    if (barraAnotarAberta && apontamento.modoApontamento) {
      const podeEncerrar =
        apontamento.selecionados.size === 0 ||
        window.confirm("Encerrar o apontamento de voo para anotar? Os talhões marcados serão desmarcados.");
      if (podeEncerrar) apontamento.cancelarModo();
      else setBarraAnotarAberta(false);
    }
    if (!barraAnotarAberta) pins.setModoAdicionar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barraAnotarAberta]);
  // Entrar no apontamento de voo fecha a barra/modo de anotar e o cartão
  // do pin (no máximo 1 ferramenta de clique e 1 card por vez).
  useEffect(() => {
    if (!apontamento.modoApontamento) return;
    setBarraAnotarAberta(false);
    pins.setModoAdicionar(false);
    pins.fecharPin();
    // A tela foca só na tarefa de apontar (pedido do Leo, 2026-09-22):
    // sem talhão/atributos aberto, marcador de clique ou lista da fazenda.
    setSelecao(null);
    setPontoSelecionado(null);
    fecharTalhoesFazenda();
    setPainelVoosAberto(false);
    setGavetaAberta(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apontamento.modoApontamento]);

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
      setMotivoOffline(resultado.online ? null : resultado.motivo);
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
        const atualizado = disponiveis.find((m) => m.id === mapaId);
        if (!cancelado && atualizado) {
          setPodeEditar(atualizado.podeEditar === true);
          // Primeiro acesso neste aparelho: o nome ainda não existia no
          // IndexedDB quando o mapa abriu, só depois da sincronização.
          if (atualizado.nome) setNomeMapaAtual(atualizado.nome);
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
        const assinaturaAtual = `${mapa.versao}|${JSON.stringify(mapa.atributosConfig)}|${JSON.stringify(mapa.estiloConfig)}|${mapa.ordem}`;
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

      // Reaplica a ordem configurada (campo `ordem`: menor = mais acima,
      // ver AdminMapas.jsx) toda vez que aplicar() roda, não só quando uma
      // camada é criada — map.moveLayer() reordena uma camada já existente
      // sem recriar fonte/layer (diferente de removerCamada+adicionarCamada,
      // que já mexe na assinatura acima), então isso não interfere com a
      // lógica de "quando reconstruir" de cima. É preciso reafirmar o stack
      // INTEIRO a cada rodada porque uma atualização parcial (só 1 camada
      // mudou) sempre re-insere essa camada logo abaixo do primeiro rótulo
      // (ver beforeId em adicionarCamada) — sem essa segunda passada, ela
      // sempre pularia pro topo do bloco de corpos, ignorando a posição
      // configurada.
      //
      // Mapa com uma camada "voos" (ex: mapa "Voos", réplica de Talhões pra
      // apontamento — ver useApontamentoVoo) fica de FORA por completo:
      // essa camada não participa do `ordem` (decisão do Leo, 2026-09-30) e
      // seu z-index fica fixo em onde `adicionarCamada` a colocou (beforeId
      // = primeiro rótulo, no momento em que ela foi criada). Se essa
      // passada movesse as camadas IRMÃs dela (Municípios, Malhas Viárias,
      // Limites) em volta dela sem levar essa posição fixa em conta, elas
      // podiam acabar entrando por CIMA da camada de voos — foi exatamente
      // isso que aconteceu (bug real reportado pelo Leo, 2026-09-30, "base
      // de talhões com problema... no mapa de voo": Talhões — Voos sumindo
      // atrás de outra camada). Mais simples e seguro pular a reordenação
      // inteira nesse mapa do que tentar calcular uma âncora — a ordem
      // dessas camadas nunca foi um problema reportado ali, só a posição
      // relativa à camada de voos importa de verdade.
      const temCamadaVoos = [...carregadas.values()].some((info) => info.tipoCamada === "voos");
      if (!temCamadaVoos) {
        const primeiroRotulo = primeiroRotuloExistente(map);
        const ordenadasParaEmpilhar = [...mapasLocais].sort((a, b) => (b.ordem ?? 0) - (a.ordem ?? 0)); // maior ordem (fundo) primeiro, menor (topo) por último
        for (const mapa of ordenadasParaEmpilhar) {
          const info = carregadas.get(mapa.id);
          if (!info) continue;
          for (const layerId of [info.fillLayerId, info.lineLayerId, info.circleLayerId, info.highlightLayerId, info.highlightCircleLayerId]) {
            if (layerId && map.getLayer(layerId)) map.moveLayer(layerId, primeiroRotulo);
          }
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

      if (mudou) setVersaoCamadas((v) => v + 1);

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
          setIndiceBusca(novo.indice);
          talhoesPorDescRef.current = novo.talhoesPorDesc;
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
      if (info.rotuloLayerId && map.getLayer(info.rotuloLayerId)) {
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
        // Em modo GPS os pontos vêm do watchPosition (ver useMedicao) — um
        // clique no mapa nesse modo não deveria também adicionar um ponto
        // manual, senão a medição mistura as duas origens sem querer.
        if (medicao.origemPontos === "clique") {
          medicao.adicionarPonto([e.lngLat.lng, e.lngLat.lat]);
        }
        return;
      }

      // Formulário de anotação aberto: o clique no mapa não faz nada — nem
      // abre outro card por baixo do formulário, nem troca/descarta o
      // rascunho meio preenchido ao tocar num pin existente.
      if (pins.rascunho) return;

      // Modo de apontamento de voo (ver useApontamentoVoo.js): clique num
      // talhão pendente da camada "voos" marca/desmarca ele pro lote em
      // andamento, em vez do fluxo normal de painel de atributos — checado
      // antes do resto pra nunca abrir os dois ao mesmo tempo.
      if (apontamento.modoApontamento && voosInfo?.fillLayerId && map.getLayer(voosInfo.fillLayerId)) {
        const featuresVoos = map.queryRenderedFeatures(e.point, { layers: [voosInfo.fillLayerId] });
        if (featuresVoos.length > 0) {
          apontamento.alternarSelecao(featuresVoos[0].properties);
          return;
        }
      }

      // Anotações (pins): modo "tocar no mapa" cria o pin ali; clique num
      // pin existente abre o cartão dele. Checado antes das camadas para o
      // pin (que fica por cima de tudo) ganhar do talhão embaixo dele.
      if (pins.movendoId) return;
      if (pins.modoAdicionar) {
        setSelecao(null);
        setPontoSelecionado(null);
        pins.abrirNovo(e.lngLat);
        return;
      }
      const idsCamadaPins = pins.layerIds.filter((id) => map.getLayer(id));
      if (idsCamadaPins.length > 0) {
        const clicados = map.queryRenderedFeatures(e.point, { layers: idsCamadaPins });
        if (clicados.length > 0) {
          setSelecao(null);
          setPontoSelecionado(null);
          setPainelCamadasAberto(false);
          setPainelVoosAberto(false);
          pins.selecionarPin(clicados[0].properties.id);
          return;
        }
      }
      pins.fecharPin();

      const layerIds = [...camadasCarregadasRef.current.entries()]
        .filter(([id, info]) => camadasVisiveis.has(id) && info.consultavel)
        .flatMap(([, info]) => [info.fillLayerId, info.circleLayerId].filter(Boolean))
        .filter((id) => map.getLayer(id));
      const features = layerIds.length > 0 ? map.queryRenderedFeatures(e.point, { layers: layerIds }) : [];
      if (features.length === 0) {
        setSelecao(null);
        // Em modo de apontamento, um clique vazio (fora de qualquer
        // talhão pendente ou feição consultável) não deve abrir o
        // CartaoPonto — spec exige que o clique nesse modo não
        // interfira em outra ferramenta (comportamento de antes da
        // Task 7, preservado aqui).
        if (!apontamento.modoApontamento) {
          setPainelCamadasAberto(false);
          setPainelVoosAberto(false);
          setPontoSelecionado({ lngLat: e.lngLat });
        }
        return;
      }
      setPontoSelecionado(null);

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
          bruto: feature.properties,
          grupoFiltro: construirFiltroGrupo(feature.properties),
        });
      }
      if (itens.length === 0) return;

      // Fecha Camadas/Tipo de voo ao abrir Atributos — pedido do Leo
      // (2026-09-22, "muito fácil poluir a tela"): no mobile os 3 cards
      // simultâneos (Camadas/Tipo de voo no topo + Atributos embaixo,
      // que vira full-width nessa largura) já foram flagrados se
      // sobrepondo de verdade, não só poluindo visualmente. No máximo 1
      // card de informação aberto por vez.
      setPainelCamadasAberto(false);
      setPainelVoosAberto(false);
      setSelecao({ lngLat: e.lngLat, itens, indice: 0 });
    }

    map.on("click", handleClick);
    return () => map.off("click", handleClick);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    mapaPronto,
    camadasVisiveis,
    medicao.medindo,
    medicao.origemPontos,
    apontamento.modoApontamento,
    voosInfo,
    pins.modoAdicionar,
    pins.movendoId,
    pins.rascunho,
    podeEditar,
  ]);

  // 7) highlight de grupo: destaca todas as partes do talhão/seção
  // selecionado (mesma SECAO+TALHAO ou DESC_SECAO), sem desenhar nada
  // extra além da borda amarela nas partes irmãs já carregadas. Clicar um
  // talhão (selecao) tem prioridade — só na ausência de seleção por
  // clique é que a fazenda buscada (buscaSelecionada) assume o destaque;
  // diferente do clique (que destaca só dentro da camada clicada),
  // a busca destaca em TODAS as camadas carregadas que tiverem essa
  // DESC_SECAO (Talhões e Limites costumam ter as duas).
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
    } else if (buscaSelecionada) {
      // Resultado ambíguo (codigo preenchido, ver montarIndiceBusca): só
      // destaca esse código específico, não todo mundo com o mesmo nome.
      const filtro = buscaSelecionada.codigo
        ? [
            "all",
            ["==", ["get", "DESC_SECAO"], buscaSelecionada.nomeBase],
            ["==", ["get", "SECAO"], buscaSelecionada.codigo],
          ]
        : construirFiltroGrupo({ DESC_SECAO: buscaSelecionada.nomeBase ?? buscaSelecionada.texto });
      for (const info of camadasCarregadasRef.current.values()) {
        if (map.getLayer(info.highlightLayerId)) {
          map.setFilter(info.highlightLayerId, filtro);
        }
        if (map.getLayer(info.highlightCircleLayerId)) {
          map.setFilter(info.highlightCircleLayerId, filtro);
        }
      }
    }
  }, [selecao, buscaSelecionada, mapaPronto]);

  // 7b) "pulso" no destaque ao selecionar uma fazenda pela busca — chama
  // atenção pro contorno recém-destacado (largura oscila 3x antes de se
  // firmar um pouco mais grossa que o destaque normal de clique). Roda de
  // novo a cada nova seleção de busca (dependência buscaSelecionada), não
  // a cada re-render. O cleanup sempre devolve a largura padrão (3) —
  // essencial, senão um clique de talhão avulso logo depois herdaria a
  // largura "presa" no valor do pulso, já que é a mesma paint property da
  // mesma camada compartilhada com o highlight de clique (efeito 7).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto || !buscaSelecionada) return;

    const LARGURA_BASE = 3;
    const LARGURA_PULSO = 6.5;
    const LARGURA_FIRME = 4.5;
    const infos = [...camadasCarregadasRef.current.values()];

    let passo = 0;
    const intervalo = setInterval(() => {
      const aceso = passo % 2 === 0;
      for (const info of infos) {
        if (map.getLayer(info.highlightLayerId)) {
          map.setPaintProperty(info.highlightLayerId, "line-width", aceso ? LARGURA_PULSO : LARGURA_BASE);
        }
      }
      passo++;
      if (passo >= 6) {
        clearInterval(intervalo);
        for (const info of infos) {
          if (map.getLayer(info.highlightLayerId)) {
            map.setPaintProperty(info.highlightLayerId, "line-width", LARGURA_FIRME);
          }
        }
      }
    }, 280);

    return () => {
      clearInterval(intervalo);
      for (const info of infos) {
        if (map.getLayer(info.highlightLayerId)) {
          map.setPaintProperty(info.highlightLayerId, "line-width", LARGURA_BASE);
        }
      }
    };
  }, [buscaSelecionada, mapaPronto]);

  // 8) marcador no ponto exato clicado
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    marcadorRef.current?.remove();
    marcadorRef.current = null;
    const alvo = selecao?.lngLat || pontoSelecionado?.lngLat;
    if (alvo) {
      marcadorRef.current = new maplibregl.Marker({ color: CORES_FERRAMENTAS.marcadorSelecao })
        .setLngLat(alvo)
        .addTo(map);
    }
    return () => {
      marcadorRef.current?.remove();
      marcadorRef.current = null;
    };
  }, [selecao, pontoSelecionado]);

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

  async function handleSair() {
    if (await sairDescartandoPins(pinsPendentes, sair, undefined, filaApontamentos.qtdPendentes)) navigate("/login");
  }

  function selecionarResultadoBusca(resultado) {
    const map = mapRef.current;
    if (!map) return;
    // Enquadra a extensão real da fazenda (união de todos os polígonos
    // dela, ver montarIndiceBusca) em vez de só voar pro ponto do
    // rótulo — esse ponto fica só na maior peça de uma fazenda com
    // peças espalhadas (polylabel em gerar_rotulos_por_atributo.py), e
    // um zoom fixo nele deixava de fora o resto da fazenda, parecendo
    // "aproximar de lugar aleatório". Fazenda com formato bem alongado
    // (ex: 13km x 5km) sempre fica "mais de longe" que uma compacta de
    // área parecida — é inerente a mostrar a extensão inteira, não dá
    // pra evitar sem voltar a esconder pedaço da fazenda. padding menor
    // (30, era 60) aproveita melhor a tela — ajuda um pouco, mas quem
    // realmente limita é o formato da fazenda em si.
    const [minLng, minLat, maxLng, maxLat] = resultado.bounds || [];
    if (resultado.bounds && Number.isFinite(minLng) && Number.isFinite(maxLng)) {
      map.fitBounds(
        [
          [minLng, minLat],
          [maxLng, maxLat],
        ],
        { padding: 30, duration: 1200, maxZoom: 16 },
      );
    } else {
      map.flyTo({ center: [resultado.lng, resultado.lat], zoom: 16, duration: 1200 });
    }
    setBuscaTexto("");
    // Destaca o limite da fazenda (efeitos 7/7b) e abre o card de talhões
    // — reseta pra [] quando a fazenda buscada não tem talhão nenhum
    // (ex: um Limites sem Talhões correspondente carregado ainda).
    setSelecao(null);
    setPontoSelecionado(null);
    pins.fecharPin();
    setBuscaSelecionada(resultado);
    // talhoesPorDesc é indexado pelo nome cru (nomeBase), não pelo texto
    // decorado ("Nome (cód. X)") de um resultado ambíguo — sem filtrar
    // por código depois, a lista misturava talhões das duas propriedades
    // diferentes que só coincidem no nome (achado real, 2026-09-22).
    const todosTalhoes = talhoesPorDescRef.current.get(resultado.nomeBase ?? resultado.texto) || [];
    const talhoesDoCodigo = resultado.codigo
      ? todosTalhoes.filter((t) => String(t.secao) === String(resultado.codigo))
      : todosTalhoes;
    setTalhoesFazenda(talhoesDoCodigo);
  }

  function fecharTalhoesFazenda() {
    setBuscaSelecionada(null);
    setTalhoesFazenda([]);
  }

  // Clique num talhão da lista do card "Talhões da fazenda" — abre o mesmo
  // painel de atributos de sempre (efeito 6, clique no mapa), sem precisar
  // ter a feição renderizada no viewport atual.
  function selecionarTalhaoDaLista(item) {
    const map = mapRef.current;
    if (map && Number.isFinite(item.lng) && Number.isFinite(item.lat)) {
      map.flyTo({ center: [item.lng, item.lat], zoom: Math.max(map.getZoom(), 15), duration: 600 });
    }
    const info = camadasCarregadasRef.current.get(item.mapaId);
    setPontoSelecionado(null);
    pins.fecharPin();
    setSelecao({
      lngLat: { lng: item.lng, lat: item.lat },
      itens: [
        {
          mapaId: item.mapaId,
          camada: info?.nome,
          cor: info?.cor,
          propriedades: item.propriedades,
          bruto: { TALHAO: item.talhao, SECAO: item.secao, DESC_SECAO: buscaSelecionada?.nomeBase },
          grupoFiltro: construirFiltroGrupo({ TALHAO: item.talhao, SECAO: item.secao }),
        },
      ],
      indice: 0,
    });
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
  // Talhão da camada de voos clicado fora do modo de apontamento: o painel
  // mostra o que falta voar ali e oferece "Apontar este talhão".
  const pendenciasTalhaoSelecionado =
    voosInfo && itemSelecionado?.mapaId === voosInfo.id && itemSelecionado.bruto?.TALHAO != null
      ? apontamento.pendenciasDoTalhao(itemSelecionado.bruto.SECAO, itemSelecionado.bruto.TALHAO)
      : null;

  // Título do painel de atributos (redesenho, fase 2): "Talhão N" e a
  // fazenda/código em destaque quando a feição tem esses campos — lidos das
  // propriedades brutas (`bruto`), não da lista configurada pelo admin, que
  // pode ter escondido TALHAO/SECAO da grade. Sem esses campos, o nome da
  // camada vira o título.
  const cabecalhoSelecao = (() => {
    const b = itemSelecionado?.bruto || {};
    const temValor = (v) => v !== undefined && v !== null && v !== "";
    if (temValor(b.TALHAO)) {
      const sub = [b.DESC_SECAO, temValor(b.SECAO) ? `cód. ${b.SECAO}` : null].filter(Boolean).join(" · ");
      return { titulo: `Talhão ${b.TALHAO}`, subtitulo: sub };
    }
    if (temValor(b.DESC_SECAO)) {
      return { titulo: b.DESC_SECAO, subtitulo: temValor(b.SECAO) ? `cód. ${b.SECAO}` : "" };
    }
    return { titulo: itemSelecionado?.camada || "", subtitulo: "" };
  })();

  // Centraliza no ponto clicado deixando livre a área que o próprio painel
  // ocupa (direita no desktop, rodapé no celular) — senão o ponto ficava
  // escondido atrás dele.
  function centralizarSelecao() {
    const map = mapRef.current;
    if (!map || !selecao) return;
    const celular = window.matchMedia("(max-width: 640px)").matches;
    map.flyTo({
      center: selecao.lngLat,
      zoom: Math.max(map.getZoom(), 15),
      padding: celular ? { bottom: Math.round(window.innerHeight * 0.4) } : { right: 420 },
      duration: 800,
    });
  }

  async function compartilharSelecao() {
    if (!selecao) return;
    const { lat, lng } = selecao.lngLat;
    const titulo = [cabecalhoSelecao.titulo, cabecalhoSelecao.subtitulo].filter(Boolean).join(" — ");
    if (typeof navigator !== "undefined" && navigator.share) {
      try {
        await compartilharLocalizacao(lat, lng, titulo);
      } catch (erro) {
        console.error("Falha ao compartilhar localização:", erro);
      }
      return;
    }
    setLinkCopiado(await copiarTexto(linkGoogleMaps(lat, lng)));
  }

  // Separado por ";" busca várias fazendas de uma vez (ex: "10003;10004" ou
  // "PEDRA;SANTA MARIANA") — cada termo é resolvido independente (mesmo
  // critério de sempre: texto mais curto/específico primeiro, até 8 por
  // termo) e os resultados são concatenados na ordem dos termos digitados,
  // sem repetir a mesma fazenda duas vezes se ela bater em mais de um termo.
  const termosBusca = buscaTexto
    .split(";")
    .map((t) => normalizarTexto(t.trim()))
    .filter((t) => t.length >= 2);
  const resultadosBusca = (() => {
    if (termosBusca.length === 0) return [];
    const vistos = new Set();
    const resultados = [];
    for (const termo of termosBusca) {
      const doTermo = indiceBusca
        .filter((r) => r.buscavel.includes(termo))
        .sort((a, b) => a.texto.length - b.texto.length)
        .slice(0, 8);
      for (const r of doTermo) {
        const chave = `${r.mapaId}-${r.texto}`;
        if (vistos.has(chave)) continue;
        vistos.add(chave);
        resultados.push(r);
      }
    }
    return resultados;
  })();
  // Anotações entram na busca por título/nota (só neste mapa) — mesma
  // normalização (sem acento, minúsculo) de termosBusca acima.
  const resultadosPins =
    termosBusca.length === 0
      ? []
      : pins.pins
          .filter((p) => {
            const alvo = normalizarTexto(`${p.titulo} ${p.nota}`);
            return termosBusca.some((t) => alvo.includes(t));
          })
          .slice(0, 8);
  // Busca fica disponível se houver índice de fazenda OU pelo menos 1
  // anotação neste mapa — antes o campo ficava travado (disabled) em mapas
  // sem índice de fazenda mesmo com anotações buscáveis (achado de revisão,
  // 2026-09-25).
  const buscaDeAnotacaoDisponivel = pins.pins.length > 0;
  const buscaHabilitada = indiceBusca.length > 0 || buscaDeAnotacaoDisponivel;
  // A lista é recalculada a cada tecla — se encolher, o índice destacado
  // de uma busca anterior pode ficar fora dos limites.
  const indiceDestacadoValido = Math.min(indiceDestacadoBusca, Math.max(resultadosBusca.length - 1, 0));

  // Status de sincronização no cartão de identidade — versão curta visível,
  // completa no title (o cartão não tem espaço pra frase inteira).
  const estadoSync = sincronizando ? "sincronizando" : offline ? "offline" : "ok";
  const horaSync = ultimaSincronizacao?.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  const textoSyncCurto = sincronizando
    ? "Sincronizando…"
    : offline
      ? motivoOffline === "servidor"
        ? "Servidor fora · mapa salvo"
        : "Offline · mapa salvo"
      : horaSync
        ? `Sincronizado às ${horaSync}`
        : "";
  const textoSyncCompleto = offline
    ? motivoOffline === "servidor"
      ? "Servidor indisponível — usando último mapa salvo"
      : "Offline — usando último mapa salvo"
    : textoSyncCurto;

  // Painéis de consulta (Camadas, Tipo de voo) continuam mutuamente
  // exclusivos e fecham cartões de informação ao abrir — mesma regra de
  // antes (2026-08-21 / 2026-09-22), só que agora disparada pela barra de
  // ferramentas em vez dos botões circulares.
  function fecharCartoesDeInformacao() {
    setSelecao(null);
    setPontoSelecionado(null);
    pins.fecharPin();
  }
  const mostrarPainelVoos = Boolean(voosInfo) && !apontamento.modoApontamento;
  const gruposDock = [
    [
      {
        id: "camadas",
        rotulo: "Camadas",
        icone: <IconeDockCamadas />,
        visivel: mapasLocais.length > 0,
        ativo: painelCamadasAberto,
        aoClicar: () => {
          if (painelCamadasAberto) {
            setPainelCamadasAberto(false);
            return;
          }
          setPainelCamadasAberto(true);
          setPainelVoosAberto(false);
          fecharCartoesDeInformacao();
        },
      },
      {
        id: "voos",
        rotulo: "Voos",
        rotuloCompleto: "Voos pendentes e apontamento",
        icone: <IconeDockTipoVoo />,
        visivel: mostrarPainelVoos,
        ativo: painelVoosAberto,
        aoClicar: () => {
          if (painelVoosAberto) {
            setPainelVoosAberto(false);
            return;
          }
          setPainelVoosAberto(true);
          setPainelCamadasAberto(false);
          fecharCartoesDeInformacao();
        },
      },
    ],
    [
      {
        id: "medir",
        rotulo: "Medir",
        rotuloCompleto: "Medir distância ou área",
        icone: <IconeDockMedir />,
        ativo: medicao.medindo,
        aoClicar: () => medicao.setMedindo((m) => !m),
      },
      {
        id: "percurso",
        rotulo: "Percurso",
        rotuloCompleto: "Gravar percurso",
        icone: <IconeDockPercurso />,
        // Gravando com a barra escondida continua marcado — o GPS segue
        // gravando por trás, e é por aqui que o usuário reabre a barra.
        ativo: track.mostrarPainelTrack || track.gravandoPercurso,
        aoClicar: () => track.setMostrarPainelTrack((m) => !m),
      },
      {
        id: "anotar",
        rotulo: "Anotar",
        rotuloCompleto: "Anotar no mapa",
        icone: <IconeDockAnotar />,
        visivel: podeEditar,
        ativo: barraAnotarAberta,
        aoClicar: () => setBarraAnotarAberta((a) => !a),
      },
    ],
  ];

  // Conteúdo da lista de camadas e do filtro de tipo de voo — o mesmo JSX
  // aparece no painel lateral (desktop) ou na gaveta inferior (celular,
  // redesenho fase 3); só um dos dois é montado por vez.
  const listaCamadas = (
    <>
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
                  const preenchimento = info?.preenchimento;
                  const simbolo = info?.simbolo;
                  const ehPonto = info?.ehPonto;
                  const temLegenda = info ? temLegendaDetalhada({ preenchimento, contorno: info.contorno, simbolo, ehPonto }) : false;
                  const expandida = legendasExpandidas.has(m.id);

                  let swatch;
                  if (preenchimento?.modo === "gradiente" && preenchimento.corInicial && preenchimento.corFinal) {
                    swatch = <FaixaGradiente corInicial={preenchimento.corInicial} corFinal={preenchimento.corFinal} />;
                  } else if (preenchimento?.modo === "categorizado" && preenchimento.categorias.length > 0) {
                    swatch = <FaixaCores cores={preenchimento.categorias.slice(0, 4).map((c) => c.cor)} />;
                  } else if (preenchimento?.modo === "graduado" && preenchimento.classes.length > 0) {
                    swatch = <FaixaCores cores={preenchimento.classes.slice(0, 4).map((c) => c.cor)} />;
                  } else if (ehPonto && preenchido && simbolo?.modo === "fixo" && simbolo.forma !== "circulo") {
                    // Forma real (quadrado/triângulo/estrela) só faz sentido
                    // mostrar no modo fixo — categorizado já cai na faixa de
                    // cores acima (formas diferentes por categoria ficam só
                    // na legenda expandida, o swatch compacto não tem espaço
                    // pra várias formas ao mesmo tempo).
                    swatch = <IconeFormaPonto forma={simbolo.forma} cor={corSwatch} corBorda="rgba(0,0,0,0.2)" />;
                  } else {
                    swatch = (
                      <span
                        className={`swatch-camada${preenchido ? "" : " swatch-camada--contorno"}`}
                        style={preenchido ? { backgroundColor: corSwatch } : { borderColor: corSwatch }}
                      />
                    );
                  }

                  return (
                    <div key={m.id} className="linha-camada-bloco">
                      <label className="linha-camada">
                        <input
                          type="checkbox"
                          checked={camadasVisiveis.has(m.id)}
                          onChange={() => alternarCamada(m.id)}
                        />
                        {swatch}
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
                        {temLegenda && (
                          <button
                            type="button"
                            className="botao-expandir-legenda"
                            aria-label={expandida ? "Recolher legenda" : "Ver legenda completa"}
                            aria-expanded={expandida}
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setLegendasExpandidas((atual) => {
                                const novo = new Set(atual);
                                if (novo.has(m.id)) novo.delete(m.id);
                                else novo.add(m.id);
                                return novo;
                              });
                            }}
                          >
                            <span className={`seta${expandida ? " seta--aberta" : ""}`} aria-hidden="true">
                              ›
                            </span>
                          </button>
                        )}
                      </label>
                      {temLegenda && expandida && (
                        <LegendaCamada
                          preenchimento={preenchimento}
                          contorno={info.contorno}
                          simbolo={simbolo}
                          ehPonto={ehPonto}
                        />
                      )}
                    </div>
                  );
                })}

                {(pins.pins.length > 0 || podeEditar) && (
                  <div className="linha-camada-bloco">
                    <label className="linha-camada">
                      <input type="checkbox" checked={pins.visivel} onChange={() => pins.setVisivel((v) => !v)} />
                      <img className="swatch-pin" src={urlSvgPin("observacao", CORES_FERRAMENTAS.pinPadrao)} alt="" width="14" height="18" />
                      <span className="nome-camada">Anotações ({pins.pins.length})</span>
                    </label>
                    {pins.pins.length > 0 && (
                      <ul className="legenda-pins">
                        {ICONES_PREPARO.filter((i) => pins.pins.some((p) => p.icone === i.chave)).map((i) => (
                          <li key={i.chave}>
                            <img src={urlSvgPin(i.chave, "#475569")} alt="" width="12" height="16" />
                            {i.nome} ({pins.pins.filter((p) => p.icone === i.chave).length})
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}

                {temporaria.arquivoTemporario && (
                  <div className="linha-camada-bloco">
                    <label className="linha-camada linha-camada--temporaria">
                      <input
                        type="checkbox"
                        checked={temporaria.temporariaVisivel}
                        onChange={() => temporaria.setTemporariaVisivel((v) => !v)}
                      />
                      {resumoTemporaria.coresDistintas.length > 1 ? (
                        <FaixaCores cores={resumoTemporaria.coresDistintas.slice(0, 4)} />
                      ) : (
                        <span
                          className="swatch-camada"
                          style={{ backgroundColor: resumoTemporaria.coresDistintas[0] || CORES_FERRAMENTAS.temporaria }}
                        />
                      )}
                      <span className="nome-camada">Importado: {temporaria.arquivoTemporario.nome}</span>
                      {resumoTemporaria.itens.length > 1 && (
                        <button
                          type="button"
                          className="botao-expandir-legenda"
                          aria-label={legendaTemporariaExpandida ? "Recolher legenda" : "Ver itens do arquivo"}
                          aria-expanded={legendaTemporariaExpandida}
                          onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setLegendaTemporariaExpandida((v) => !v);
                          }}
                        >
                          <span className={`seta${legendaTemporariaExpandida ? " seta--aberta" : ""}`} aria-hidden="true">
                            ›
                          </span>
                        </button>
                      )}
                      <button
                        type="button"
                        className="fechar"
                        onClick={temporaria.removerArquivoTemporario}
                        aria-label="Remover arquivo importado"
                        title="Remover arquivo importado"
                      >
                        ×
                      </button>
                    </label>
                    {legendaTemporariaExpandida && resumoTemporaria.itens.length > 1 && (
                      <>
                        <BlocoLegendaCores
                          titulo={`Itens do arquivo (${resumoTemporaria.itens.length})`}
                          itens={resumoTemporaria.itens.slice(0, LIMITE_ITENS_LEGENDA_TEMPORARIA).map((item) => ({
                            cor: item.cor || CORES_FERRAMENTAS.temporaria,
                            texto: item.quantidade > 1 ? `${item.nome} (×${item.quantidade})` : item.nome,
                          }))}
                        />
                        {resumoTemporaria.itens.length > LIMITE_ITENS_LEGENDA_TEMPORARIA && (
                          <p className="aviso-legenda-truncada">
                            +{resumoTemporaria.itens.length - LIMITE_ITENS_LEGENDA_TEMPORARIA} itens não mostrados
                            (lista muito longa)
                          </p>
                        )}
                      </>
                    )}
                  </div>
                )}

                <label className="botao importar-arquivo-temporario">
                  {temporaria.importandoArquivo ? "Importando…" : "+ Importar arquivo (KML/SHP)"}
                  {/* Sem `accept` restrito a extensão (".kml,.zip") de propósito —
                      no Safari/iOS isso quebra a seleção: o picker "Procurar"
                      resolve `accept` pra um UTI do sistema, e ".kml" não tem um
                      UTI reconhecido de forma confiável no iOS (só se algum app
                      que "dono" desse tipo estiver instalado), deixando todo
                      arquivo acinzentado/não-selecionável. A validação real de
                      extensão já acontece em importarArquivoTemporario() com
                      mensagem de erro clara — o accept aqui era só um filtro
                      cosmético do picker do SO, não uma barreira de segurança. */}
                  <input
                    type="file"
                    onChange={temporaria.aoImportarArquivo}
                    disabled={temporaria.importandoArquivo}
                  />
                </label>
                {temporaria.erroImportacao && <p className="erro">{temporaria.erroImportacao}</p>}
    </>
  );
  // Celular: painel do talhão abre compacto (título, atalhos e 2 atributos)
  // — o resto só com "Ver todos os N atributos".
  const atributosCompactos = ehCelular && !atributosExpandidos;

  // ----- Gaveta inferior do celular (redesenho, fase 3) -----
  // Só aparece quando nada mais está usando o rodapé: um cartão de
  // informação aberto (atributos, ponto, anotação), uma ferramenta em uso
  // (barra de ação no rodapé) ou o apontamento de voo escondem a gaveta.
  const mostrarGaveta =
    ehCelular &&
    mapaPronto &&
    mapasLocais.length > 0 &&
    !selecao &&
    !pontoSelecionado &&
    !pins.pinSelecionado &&
    !pins.rascunho &&
    !pins.movendoId &&
    !medicao.medindo &&
    !track.mostrarPainelTrack &&
    !barraAnotarAberta &&
    !apontamento.modoApontamento;

  const qtdCamadasVisiveis = mapasLocais.filter((m) => camadasVisiveis.has(m.id)).length;
  // Mapa de voos: a 1ª aba é Voos (resumo + filtro por tipo, que já é a
  // legenda das cores) no lugar de Legenda.
  const abasGaveta = voosInfo
    ? [
        { id: "voos", rotulo: "Voos" },
        { id: "camadas", rotulo: "Camadas" },
        { id: "ferramentas", rotulo: "Ferramentas" },
      ]
    : [
        { id: "camadas", rotulo: "Camadas" },
        { id: "legenda", rotulo: "Legenda" },
        { id: "ferramentas", rotulo: "Ferramentas" },
      ];
  const abaGavetaAtual = abasGaveta.some((a) => a.id === abaGaveta) ? abaGaveta : abasGaveta[0].id;
  const qtdNaFila = apontamento.fila.qtdPendentes;
  const resumoGaveta = {
    camadas: {
      titulo: `${qtdCamadasVisiveis} de ${mapasLocais.length} camadas visíveis`,
      sub: "Toque pra ligar, desligar ou importar um arquivo",
    },
    voos: {
      titulo: apontamento.carregandoPendentes
        ? "Carregando pendências…"
        : `${apontamento.areaPendenteHa.toLocaleString("pt-BR", { maximumFractionDigits: 1 })} ha pendentes · ${apontamento.qtdTalhoesPendentes} ${apontamento.qtdTalhoesPendentes === 1 ? "talhão" : "talhões"}`,
      sub:
        qtdNaFila > 0
          ? `${qtdNaFila} ${qtdNaFila === 1 ? "apontamento aguardando" : "apontamentos aguardando"} sinal`
          : apontamento.fila.recusados.length > 0
            ? "Há apontamentos não aceitos — toque pra ver"
            : "Toque pra filtrar por tipo de voo",
    },
    legenda: {
      titulo: "Cores e símbolos",
      sub: "Só do que está visível no mapa agora",
    },
    ferramentas: {
      titulo: podeEditar ? "Medir, gravar percurso, anotar" : "Medir e gravar percurso",
      sub: "Funcionam sem internet",
    },
  }[abaGavetaAtual];

  function entrarNoApontamento() {
    apontamento.iniciarModo();
  }

  function ativarFerramenta(acao) {
    setGavetaAberta(false);
    acao();
  }

  const legendaGaveta = (
    <div className="legenda-gaveta">
      {mapasLocais
        .filter((m) => camadasVisiveis.has(m.id))
        .map((m) => {
          const info = camadasCarregadasRef.current.get(m.id);
          if (!info) return null;
          const preenchido = (info.opacidadePreenchimento ?? 0) > 0;
          const detalhada = temLegendaDetalhada({
            preenchimento: info.preenchimento,
            contorno: info.contorno,
            simbolo: info.simbolo,
            ehPonto: info.ehPonto,
          });
          return (
            <div key={m.id} className="bloco-legenda-gaveta">
              <h3>{m.nome}</h3>
              {detalhada ? (
                <LegendaCamada
                  preenchimento={info.preenchimento}
                  contorno={info.contorno}
                  simbolo={info.simbolo}
                  ehPonto={info.ehPonto}
                />
              ) : (
                <span className="linha-legenda-simples">
                  <span
                    className={`swatch-camada${preenchido ? "" : " swatch-camada--contorno"}`}
                    style={preenchido ? { backgroundColor: info.cor } : { borderColor: info.corContorno || info.cor }}
                  />
                  {m.nome}
                </span>
              )}
            </div>
          );
        })}
      {qtdCamadasVisiveis === 0 && (
        <p className="vazio-legenda-gaveta">Nenhuma camada visível — ligue alguma na aba Camadas.</p>
      )}
    </div>
  );

  const ferramentasGaveta = (
    <div className="grade-ferramentas">
      <button
        type="button"
        className="bloco-ferramenta"
        onClick={() =>
          ativarFerramenta(() => {
            medicao.setMedindo(true);
            medicao.trocarModoMedicao("distancia");
          })
        }
      >
        <IconeDockMedir />
        <span>Medir distância</span>
      </button>
      <button
        type="button"
        className="bloco-ferramenta"
        onClick={() =>
          ativarFerramenta(() => {
            medicao.setMedindo(true);
            medicao.trocarModoMedicao("area");
          })
        }
      >
        <IconeDockArea />
        <span>Medir área</span>
      </button>
      <button
        type="button"
        className="bloco-ferramenta"
        onClick={() => ativarFerramenta(() => track.setMostrarPainelTrack(true))}
      >
        <IconeDockPercurso />
        <span>{track.gravandoPercurso ? "Percurso (gravando)" : "Gravar percurso"}</span>
      </button>
      {podeEditar && (
        <button type="button" className="bloco-ferramenta" onClick={() => ativarFerramenta(() => setBarraAnotarAberta(true))}>
          <IconeDockAnotar />
          <span>Anotar no mapa</span>
        </button>
      )}
      <label className="bloco-ferramenta">
        <IconeDockImportar />
        <span>{temporaria.importandoArquivo ? "Importando…" : "Importar KML/SHP"}</span>
        {/* Mesmo input do painel de camadas — sem `accept` pelo mesmo
            motivo documentado lá (Safari/iOS). */}
        <input type="file" onChange={temporaria.aoImportarArquivo} disabled={temporaria.importandoArquivo} />
      </label>
    </div>
  );

  return (
    <main className="tela-mapa">
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

        <div className="barra-topo">
          <div className="cartao-identidade">
            <span className="marca-app">
              <IconeMarca />
            </span>
            <Link
              to="/inicio"
              className="botao-trocar-mapa"
              aria-label={`Trocar mapa (atual: ${nomeMapaAtual || "carregando"})`}
              title="Trocar mapa"
            >
              <span className="rotulo-app">GeoMap</span>
              <span className="nome-mapa-atual">
                <span className="texto-nome-mapa">{nomeMapaAtual || "Carregando…"}</span>
                <IconeSetaBaixo />
              </span>
            </Link>
            <span className="divisor-vertical" aria-hidden="true" />
            <span className={`status-sincronizacao status-sincronizacao--${estadoSync}`} aria-live="polite" title={textoSyncCompleto}>
              {sincronizando ? (
                <span className="spinner" aria-hidden="true" />
              ) : (
                <span className="ponto-status" aria-hidden="true" />
              )}
              <span className="texto-status-sync">{textoSyncCurto}</span>
            </span>
          </div>

        {mapasLocais.length > 0 && (
          <div className="painel-busca">
            <div className="campo-busca">
            <IconeBusca />
            <input
              type="search"
              aria-label="Buscar"
              // Placeholder mais curto (2026-09-22) — a dica de buscar
              // várias fazendas separando com ";" ficava "poluído" na
              // barra; a funcionalidade continua igual, só não é mais
              // anunciada no texto do campo. Busca de anotação (2026-09-25)
              // usa o mesmo campo — o índice de fazenda pode não existir
              // (mapa sem `.pmtiles` com esse suporte), mas anotações
              // continuam buscáveis nele.
              placeholder={
                indiceBusca.length > 0
                  ? "Buscar fazenda…"
                  : buscaDeAnotacaoDisponivel
                    ? "Buscar anotação…"
                    : "Busca não disponível para este mapa"
              }
              value={buscaTexto}
              onChange={(e) => {
                setBuscaTexto(e.target.value);
                setIndiceDestacadoBusca(0);
              }}
              onKeyDown={(e) => aoTeclarBusca(e, resultadosBusca, indiceDestacadoValido)}
              disabled={!buscaHabilitada}
              aria-disabled={!buscaHabilitada}
            />
            </div>
            {!buscaHabilitada ? (
              <p className="ajuda-busca">
                A busca não está disponível para o mapa carregado. Use o clique no mapa para ver atributos.
              </p>
            ) : (
              <>
                {resultadosPins.length > 0 && (
                  <ul className="resultados-busca resultados-busca-pins">
                    {resultadosPins.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setBuscaTexto("");
                            setSelecao(null);
                            setPontoSelecionado(null);
                            pins.voarParaPin(p.id);
                          }}
                        >
                          <img src={urlSvgPin(p.icone, p.cor)} alt="" width="12" height="16" /> {p.titulo}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
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
                {termosBusca.length > 0 && resultadosBusca.length === 0 && resultadosPins.length === 0 && (
                  <p className="sem-resultados-busca">
                    <IconeEstadoVazio tamanho={16} /> Nada encontrado.
                  </p>
                )}
              </>
            )}
          </div>
        )}

          <div className="barra-topo-direita">
            {pinsPendentes > 0 && (
              <span className="chip-status chip-status--alerta" aria-live="polite">
                {pinsPendentes === 1 ? "1 anotação aguardando envio" : `${pinsPendentes} anotações aguardando envio`}
              </span>
            )}
            <button
              type="button"
              className="botao-conta"
              onClick={() => setMenuAberto(true)}
              aria-label="Abrir menu"
              title="Menu"
            >
              {iniciaisDoNome(sessao.usuario.nome)}
            </button>
          </div>
        </div>

        {mapaPronto && !ehCelular && <DockFerramentas grupos={gruposDock} />}

        <div className="pilha-topo-esquerda">
        {!ehCelular && mapasLocais.length > 0 && painelCamadasAberto && (
          <aside className="painel-camadas" aria-label="Camadas">
            <button
              type="button"
              className="cabecalho-painel-camadas"
              onClick={() => setPainelCamadasAberto(false)}
              aria-expanded={painelCamadasAberto}
            >
              <span>Camadas</span>
              <span className={`seta${painelCamadasAberto ? " seta--aberta" : ""}`} aria-hidden="true">
                ›
              </span>
            </button>
            <div className={`conteudo-painel-camadas${painelCamadasAberto ? " aberto" : ""}`}>
              <div className="conteudo-painel-camadas-interno">
                {listaCamadas}
              </div>
            </div>
          </aside>
        )}

        {buscaSelecionada && talhoesFazenda.length > 0 && (
          <div className="painel-talhoes-fazenda">
            <div className="cabecalho-painel-talhoes-fazenda">
              <span>
                {buscaSelecionada.texto}
                <small> · {talhoesFazenda.length} talhões</small>
              </span>
              <button
                type="button"
                className="fechar"
                onClick={fecharTalhoesFazenda}
                aria-label="Fechar lista de talhões"
                title="Fechar lista de talhões"
              >
                ×
              </button>
            </div>
            <ul className="lista-talhoes-fazenda">
              {talhoesFazenda.map((item) => (
                <li key={`${item.secao}-${item.talhao}`}>
                  <button type="button" onClick={() => selecionarTalhaoDaLista(item)}>
                    Talhão {item.talhao}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {!ehCelular && mostrarPainelVoos && painelVoosAberto && (
          <aside className="painel-camadas painel-voos-lateral" aria-label="Voos">
            <button
              type="button"
              className="cabecalho-painel-camadas"
              onClick={() => setPainelVoosAberto(false)}
              aria-expanded={painelVoosAberto}
            >
              <span>Voos</span>
              <span className="seta seta--aberta" aria-hidden="true">
                ›
              </span>
            </button>
            <PainelVoos apontamento={apontamento} aoApontar={entrarNoApontamento} />
          </aside>
        )}
        </div>

        {mostrarGaveta && (
          <section className={`gaveta-celular${gavetaAberta ? " aberta" : ""}`} aria-label="Painel do mapa">
            <button
              type="button"
              className="alca-gaveta"
              onClick={() => setGavetaAberta((a) => !a)}
              aria-label={gavetaAberta ? "Recolher painel" : "Expandir painel"}
              aria-expanded={gavetaAberta}
            >
              <span aria-hidden="true" />
            </button>
            <div className="abas-gaveta" role="tablist" aria-label="Seções do painel">
              {abasGaveta.map((aba) => (
                <button
                  key={aba.id}
                  type="button"
                  role="tab"
                  aria-selected={abaGavetaAtual === aba.id}
                  className={abaGavetaAtual === aba.id ? "ativa" : ""}
                  onClick={() => {
                    setAbaGaveta(aba.id);
                    setGavetaAberta(true);
                  }}
                >
                  {aba.rotulo}
                </button>
              ))}
            </div>
            {gavetaAberta ? (
              <div className="conteudo-gaveta" role="tabpanel">
                {abaGavetaAtual === "voos" && (
                  <PainelVoos apontamento={apontamento} aoApontar={entrarNoApontamento} />
                )}
                {abaGavetaAtual === "camadas" && listaCamadas}
                {abaGavetaAtual === "legenda" && legendaGaveta}
                {abaGavetaAtual === "ferramentas" && ferramentasGaveta}
              </div>
            ) : abaGavetaAtual === "voos" ? (
              // Recolhida na aba Voos: resumo + o botão de apontar a um
              // toque, sem precisar abrir a gaveta.
              <div className="resumo-gaveta resumo-gaveta--voos">
                <button type="button" className="texto-resumo-gaveta" onClick={() => setGavetaAberta(true)}>
                  <strong>{resumoGaveta.titulo}</strong>
                  <span>{resumoGaveta.sub}</span>
                </button>
                <button
                  type="button"
                  className="botao-apontar-voo botao-apontar-voo--curto"
                  onClick={entrarNoApontamento}
                  disabled={apontamento.carregandoPendentes || apontamento.qtdTalhoesPendentes === 0}
                >
                  Apontar voo
                </button>
              </div>
            ) : (
              <button type="button" className="resumo-gaveta" onClick={() => setGavetaAberta(true)}>
                <span>
                  <strong>{resumoGaveta.titulo}</strong>
                  <span>{resumoGaveta.sub}</span>
                </span>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="m6 15 6-6 6 6" />
                </svg>
              </button>
            )}
          </section>
        )}

        {mapasLocais.length === 0 && !sincronizando && (
          <p className="aviso-sem-mapas">
            <IconeEstadoVazio tamanho={28} />
            {offline
              ? "Nenhum mapa disponível ainda. Conecte-se à internet pra sincronizar."
              : "Este mapa ainda não tem camadas publicadas."}
          </p>
        )}

        <div className="pilha-acoes">
          {track.mostrarPainelTrack && (
            <BarraAcaoPercurso
              track={track}
              aoVerNoMapa={() =>
                temporaria.definirArquivoTemporario(
                  `Percurso — ${new Date().toLocaleString("pt-BR")}`,
                  track.geojsonPercursoAtual
                )
              }
            />
          )}
          {medicao.medindo && <BarraAcaoMedicao medicao={medicao} />}
          {voosInfo && apontamento.modoApontamento && <BarraApontamento apontamento={apontamento} />}
          <BarraAnotar
            aberta={barraAnotarAberta}
            modoAdicionar={pins.modoAdicionar}
            obtendoGps={pins.obtendoGps}
            movendo={Boolean(pins.movendoId)}
            aoTocarNoMapa={() => pins.setModoAdicionar((m) => !m)}
            aoMinhaLocalizacao={pins.adicionarNaMinhaLocalizacao}
            aoConfirmarMover={pins.confirmarMover}
            aoCancelarMover={pins.cancelarMover}
            aoFechar={() => setBarraAnotarAberta(false)}
          />
        </div>

        {/* Confirmação do apontamento — fora do card de modo de apontamento
            de propósito: `confirmarLote` desliga `modoApontamento` no mesmo
            instante que grava o resultado, então um toast preso dentro
            daquele card nunca chegava a aparecer (achado real, 2026-09-22).
            Fica independente, com fechamento automático (ver
            useApontamentoVoo.js) — mesmo padrão visual de .pilha-toasts já
            usado pelos avisos de job do admin. */}
        {voosInfo && apontamento.resultado && (
          <div className="pilha-toasts" role="status" aria-live="polite">
            <div className={`toast toast--${apontamento.resultado.falha.length > 0 || apontamento.resultado.recusados > 0 ? "erro" : "sucesso"}`}>
              <div>
                <span>{textoResultadoApontamento(apontamento.resultado)}</span>
                {apontamento.resultado.falha.length > 0 && (
                  // Motivo de verdade, não só a contagem (achado real: piloto
                  // sem vínculo em pilotos_dronemgmt via só "1 falharam" sem
                  // nenhuma pista, 2026-09-22). Deduplicado — as mesmas N
                  // falhas geralmente têm o mesmo motivo.
                  <ul className="detalhe-falha-apontamento">
                    {[...new Set(apontamento.resultado.falha.map((f) => f.erro))].map((erro, i) => (
                      <li key={i}>{erro}</li>
                    ))}
                  </ul>
                )}
              </div>
              <button
                type="button"
                className="fechar"
                onClick={apontamento.fecharResultado}
                aria-label="Fechar aviso"
              >
                ×
              </button>
            </div>
          </div>
        )}

        <aside className={`painel-flutuante painel-atributos${selecao ? " aberto" : ""}`} aria-label="Atributos">
          {itemSelecionado && (
            <>
              <div className="cabecalho-atributos">
                <span className="sobretitulo-atributos">
                  <span className="swatch-camada" style={{ backgroundColor: itemSelecionado.cor }} />
                  {itemSelecionado.camada}
                </span>
                {selecao.itens.length > 1 && (
                  <span className="paginacao-atributos">
                    <button type="button" onClick={() => irParaItem(-1)} aria-label="Feição anterior">
                      <IconeAnterior />
                    </button>
                    <span>
                      {selecao.indice + 1} de {selecao.itens.length}
                    </span>
                    <button type="button" onClick={() => irParaItem(1)} aria-label="Próxima feição">
                      <IconeProximo />
                    </button>
                  </span>
                )}
                <button
                  type="button"
                  className="botao-fechar-atributos"
                  onClick={() => setSelecao(null)}
                  aria-label="Fechar painel de atributos"
                  title="Fechar"
                >
                  <IconeFechar />
                </button>
              </div>
              <h2 className="titulo-atributos">{cabecalhoSelecao.titulo}</h2>
              {cabecalhoSelecao.subtitulo && <p className="subtitulo-atributos">{cabecalhoSelecao.subtitulo}</p>}
              <div className="atalhos-atributos">
                <button type="button" onClick={centralizarSelecao}>
                  <IconeCentralizar />
                  Centralizar
                </button>
                <div className="atalho-como-chegar">
                  <button
                    type="button"
                    onClick={() => setMostrarMenuCompartilhar((v) => !v)}
                    aria-expanded={mostrarMenuCompartilhar}
                  >
                    <IconeComoChegar />
                    Como chegar
                  </button>
                  {mostrarMenuCompartilhar && (
                    <div className="menu-compartilhar-localizacao">
                      <a href={linkGoogleMaps(selecao.lngLat.lat, selecao.lngLat.lng)} target="_blank" rel="noopener noreferrer">
                        Google Maps
                      </a>
                      <a href={linkWaze(selecao.lngLat.lat, selecao.lngLat.lng)} target="_blank" rel="noopener noreferrer">
                        Waze
                      </a>
                      <a href={linkAppleMaps(selecao.lngLat.lat, selecao.lngLat.lng)} target="_blank" rel="noopener noreferrer">
                        Apple Maps
                      </a>
                    </div>
                  )}
                </div>
                <button type="button" onClick={compartilharSelecao}>
                  <IconeCompartilhar />
                  {linkCopiado ? "Link copiado" : "Compartilhar"}
                </button>
              </div>
              {pendenciasTalhaoSelecionado && (
                <div className="pendencias-talhao">
                  {pendenciasTalhaoSelecionado.length === 0 ? (
                    <p>Nenhum voo pendente neste talhão.</p>
                  ) : (
                    <>
                      <p>
                        <strong>
                          {pendenciasTalhaoSelecionado.length === 1
                            ? "1 voo pendente"
                            : `${pendenciasTalhaoSelecionado.length} voos pendentes`}
                        </strong>
                        {" · "}
                        {pendenciasTalhaoSelecionado.map((r) => r.projeto).join(", ")}
                      </p>
                      <button
                        type="button"
                        className="botao-apontar-voo"
                        onClick={() =>
                          apontamento.iniciarComTalhao(itemSelecionado.bruto.SECAO, itemSelecionado.bruto.TALHAO)
                        }
                      >
                        Apontar este talhão
                      </button>
                    </>
                  )}
                </div>
              )}
              <dl className="atributos-grid" key={selecao.indice}>
                {(atributosCompactos ? itemSelecionado.propriedades.slice(0, 2) : itemSelecionado.propriedades).map(
                  ({ campo, rotulo, valor }) => (
                    <div key={campo} className="linha-atributo">
                      <dt>{rotulo}</dt>
                      <dd>{String(valor)}</dd>
                    </div>
                  )
                )}
              </dl>
              {ehCelular && itemSelecionado.propriedades.length > 2 && (
                <button
                  type="button"
                  className="botao-ver-atributos"
                  onClick={() => setAtributosExpandidos((v) => !v)}
                  aria-expanded={atributosExpandidos}
                >
                  {atributosExpandidos
                    ? "Mostrar menos"
                    : `Ver todos os ${itemSelecionado.propriedades.length} atributos`}
                </button>
              )}
              {!atributosCompactos && <LinhaCoordenada lngLat={selecao.lngLat} />}
            </>
          )}
        </aside>

        <CartaoPonto
          lngLat={pontoSelecionado?.lngLat || null}
          podeAnotar={podeEditar}
          aoAdicionarPin={() => {
            const lngLat = pontoSelecionado.lngLat;
            setPontoSelecionado(null);
            pins.abrirNovo(lngLat);
          }}
          aoFechar={() => setPontoSelecionado(null)}
        />

        <CartaoPin
          pin={pins.pinSelecionado}
          podeEditar={podeEditar}
          aoEditar={() => pins.abrirEdicao(pins.pinSelecionado.id)}
          aoMover={() => {
            const id = pins.pinSelecionado.id;
            pins.fecharPin();
            pins.iniciarMover(id);
          }}
          aoRemover={() => pins.removerPin(pins.pinSelecionado.id)}
          aoFechar={pins.fecharPin}
        />

        {pins.rascunho && (
          <FormularioPin
            key={pins.rascunho.id || "novo"}
            rascunho={pins.rascunho}
            aoSalvar={pins.salvarRascunho}
            aoCancelar={pins.cancelarRascunho}
          />
        )}
      </div>
    </main>
  );
}
