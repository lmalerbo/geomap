import { useEffect, useRef, useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { PMTiles, Protocol } from "pmtiles";
import { VectorTile } from "@mapbox/vector-tile";
import { PbfReader } from "pbf";
import turfLength from "@turf/length";
import turfArea from "@turf/area";
import { listarMapasBaixados } from "../lib/db.js";
import { sincronizarMapas } from "../lib/sync.js";
import { BlobSource } from "../lib/pmtilesBlobSource.js";
import { corDaCamada } from "../lib/paleta.js";
import { useAuth } from "../context/AuthContext.jsx";

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

// Nome de camada convencionado, gerado pelo pipeline (ver
// gerar_rotulos_conectores.py): "rotulos" = 1 ponto por feição lógica
// (mesmo quando a geometria original tem várias partes desconexas —
// MapLibre/tippecanoe rotulariam cada parte separadamente, causando
// número repetido no mapa). Não é obrigatória — um .pmtiles sem ela
// simplesmente não ganha rótulo.
const CAMADA_ROTULOS = "rotulos";

// Filtro que nunca casa com nenhuma feição — usado pra "desligar" o
// highlight de grupo sem precisar remover/recriar a camada.
const FILTRO_NENHUM = ["==", ["literal", 1], ["literal", 2]];

// Medição de distância/área — fonte/camadas próprias, nada a ver com os
// dados baixados.
const FONTE_MEDICAO = "fonte-medicao";
const CAMADA_MEDICAO_LINHA = "camada-medicao-linha";
const CAMADA_MEDICAO_PONTOS = "camada-medicao-pontos";
const CAMADA_MEDICAO_AREA = "camada-medicao-area";

// Monta o FeatureCollection renderizado enquanto o usuário vai clicando:
// pontos sempre, linha a partir de 2 pontos (fechada se for modo área,
// só pra dar a pista visual do polígono), preenchimento a partir de 3
// pontos em modo área.
function geojsonMedicao(pontos, modo) {
  const features = pontos.map((p) => ({
    type: "Feature",
    properties: {},
    geometry: { type: "Point", coordinates: p },
  }));

  if (pontos.length >= 2) {
    const linha = modo === "area" ? [...pontos, pontos[0]] : pontos;
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "LineString", coordinates: linha },
    });
  }

  if (modo === "area" && pontos.length >= 3) {
    features.push({
      type: "Feature",
      properties: {},
      geometry: { type: "Polygon", coordinates: [[...pontos, pontos[0]]] },
    });
  }

  return { type: "FeatureCollection", features };
}

// Texto pronto pra exibir — km/m pra distância (troca a unidade conforme
// o tamanho, igual a barra de escala do MapLibre já faz), m²/ha pra área.
function textoResultadoMedicao(pontos, modo) {
  if (modo === "distancia") {
    if (pontos.length < 2) return null;
    const linha = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pontos } };
    const km = turfLength(linha, { units: "kilometers" });
    return km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(2)} km`;
  }
  if (pontos.length < 3) return null;
  const poligono = {
    type: "Feature",
    properties: {},
    geometry: { type: "Polygon", coordinates: [[...pontos, pontos[0]]] },
  };
  const m2 = turfArea(poligono);
  return m2 < 10000 ? `${m2.toFixed(0)} m²` : `${(m2 / 10000).toFixed(2)} ha`;
}

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

// Filtra/ordena os atributos exibidos no painel conforme configurado no
// painel de admin. Sem config (mapa ainda não configurado) mostra tudo,
// na ordem bruta do vector tile — comportamento de sempre.
function aplicarConfigAtributos(propriedades, config) {
  if (!config || config.length === 0) return propriedades;
  const resultado = {};
  for (const { campo, visivel } of [...config].sort((a, b) => a.ordem - b.ordem)) {
    if (visivel && campo in propriedades) resultado[campo] = propriedades[campo];
  }
  return resultado;
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
async function montarIndiceBusca(infos) {
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

        // Enriquece com DESC_SECAO/SECAO da camada principal (polígono) —
        // o rótulo sozinho não carrega isso: em talhões é só o número, em
        // limites é só o nome (um nome pode ter vários códigos SECAO, ver
        // gerar_rotulos_por_atributo.py). Degrada bem: sem match no join,
        // busca só pelo que o rótulo já tinha.
        const descPorChaveTalhao = new Map(); // "SECAO|TALHAO" -> DESC_SECAO
        const codigosPorDesc = new Map(); // DESC_SECAO -> Set(SECAO)
        const camadaPrincipal = tile.layers[info.sourceLayerPrincipal];
        if (camadaPrincipal) {
          for (let i = 0; i < camadaPrincipal.length; i++) {
            const props = camadaPrincipal.feature(i).properties;
            if (info.consultavel) {
              const chave = `${props.SECAO}|${props.TALHAO}`;
              if (!descPorChaveTalhao.has(chave)) descPorChaveTalhao.set(chave, props.DESC_SECAO);
            } else {
              if (!codigosPorDesc.has(props.DESC_SECAO)) codigosPorDesc.set(props.DESC_SECAO, new Set());
              codigosPorDesc.get(props.DESC_SECAO).add(props.SECAO);
            }
          }
        }

        const camadaRotulos = tile.layers[CAMADA_ROTULOS];
        if (!camadaRotulos) continue;
        for (let i = 0; i < camadaRotulos.length; i++) {
          const feature = camadaRotulos.feature(i);
          const props = feature.properties;
          const [lng, lat] = feature.toGeoJSON(x, y, z).geometry.coordinates;

          let texto;
          let buscavelExtra = "";
          if ("talhao" in props && "secao" in props) {
            const desc = descPorChaveTalhao.get(`${props.secao}|${props.talhao}`);
            texto = `Talhão ${props.talhao}${desc ? ` — ${desc}` : ""} (cód. ${props.secao})`;
          } else {
            texto = String(props.rotulo);
            const codigos = codigosPorDesc.get(props.rotulo);
            if (codigos) buscavelExtra = ` ${[...codigos].join(" ")}`;
          }

          indice.push({
            texto,
            buscavel: normalizarTexto(texto + buscavelExtra),
            lng,
            lat,
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

  const temRotulos = todasCamadas.some((l) => l.id === CAMADA_ROTULOS);

  // Sem config salva (mapa ainda não editado no admin), decide pela presença
  // do campo TALHAO no próprio metadata: camadas de talhão ganham
  // preenchimento + rótulo com zoom mais alto; as demais (limites/contornos)
  // ficam só com a linha + rótulo (nome) a partir de um zoom mais baixo.
  const campos = camadaPrincipal.fields || {};
  const ehTalhao = "TALHAO" in campos;
  const estilo = mapa.estiloConfig || {};
  const opacidadePreenchimento = estilo.opacidadePreenchimento ?? (ehTalhao ? 0.35 : 0);
  const zoomRotulo = estilo.zoomRotulo ?? (ehTalhao ? 13 : 10);
  const mostrarRotulo = (estilo.mostrarRotulo ?? true) && temRotulos;
  const cor = estilo.cor || corDaCamada(mapa.id);

  const sourceId = `fonte-${mapa.id}`;
  const fillLayerId = `camada-${mapa.id}-preenchimento`;
  const lineLayerId = `camada-${mapa.id}-borda`;
  const rotuloLayerId = `camada-${mapa.id}-rotulo`;
  const highlightLayerId = `camada-${mapa.id}-highlight`;

  // Idempotente: efeitos concorrentes (carga inicial offline-first + sync em
  // segundo plano) podem tentar aplicar a mesma camada quase ao mesmo tempo.
  for (const id of [rotuloLayerId, highlightLayerId, fillLayerId, lineLayerId]) {
    if (map.getLayer(id)) map.removeLayer(id);
  }
  if (map.getSource(sourceId)) map.removeSource(sourceId);

  map.addSource(sourceId, { type: "vector", url: `pmtiles://${source.getKey()}` });
  map.addLayer({
    id: fillLayerId,
    type: "fill",
    source: sourceId,
    "source-layer": camadaPrincipal.id,
    paint: {
      "fill-color": cor,
      "fill-opacity": opacidadePreenchimento,
      "fill-opacity-transition": { duration: 300 },
    },
  });
  map.addLayer({
    id: lineLayerId,
    type: "line",
    source: sourceId,
    "source-layer": camadaPrincipal.id,
    paint: {
      "line-color": cor,
      "line-width": 1.5,
      "line-opacity": 1,
      "line-opacity-transition": { duration: 300 },
    },
  });

  // Highlight de grupo: ao clicar num talhão com várias partes, todas as
  // partes irmãs (mesma SECAO+TALHAO) ganham essa borda — sem precisar de
  // linha conectando geometria nenhuma. Começa sem casar com nada.
  map.addLayer({
    id: highlightLayerId,
    type: "line",
    source: sourceId,
    "source-layer": camadaPrincipal.id,
    paint: { "line-color": "#ffd400", "line-width": 3 },
    filter: FILTRO_NENHUM,
  });

  if (mostrarRotulo) {
    map.addLayer({
      id: rotuloLayerId,
      type: "symbol",
      source: sourceId,
      "source-layer": CAMADA_ROTULOS,
      minzoom: zoomRotulo,
      layout: {
        "text-field": ["get", "rotulo"],
        "text-font": ["Noto Sans Regular"],
        "text-size": ["interpolate", ["linear"], ["zoom"], zoomRotulo, 9, zoomRotulo + 4, 15],
        "text-allow-overlap": false,
      },
      paint: {
        "text-color": "#1f2933",
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
    cor,
    opacidadePreenchimento,
    sourceId,
    fillLayerId,
    lineLayerId,
    highlightLayerId,
    rotuloLayerId: mostrarRotulo ? rotuloLayerId : null,
    // Camadas de contorno (sem preenchimento, ex: Limites) são só visuais +
    // rótulo de nome — não abrem painel de atributos ao clicar.
    consultavel: ehTalhao,
    atributosConfig: mapa.atributosConfig,
    // Pra montar o índice de busca (a partir dos dados já baixados, sem
    // pipeline/back-end extra): temRotulos independe de mostrarRotulo (o
    // texto/posição existe no tile mesmo com o rótulo visual desligado),
    // e sourceLayerPrincipal permite consultar DESC_SECAO/TALHAO direto
    // do polígono.
    temRotulos,
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
  if (map.getLayer(info.highlightLayerId)) map.removeLayer(info.highlightLayerId);
  if (map.getLayer(info.fillLayerId)) map.removeLayer(info.fillLayerId);
  if (map.getLayer(info.lineLayerId)) map.removeLayer(info.lineLayerId);
  if (map.getSource(info.sourceId)) map.removeSource(info.sourceId);
}

export default function Mapa() {
  const { sessao, sair } = useAuth();
  const navigate = useNavigate();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const protocolRef = useRef(null);
  const camadasCarregadasRef = useRef(new Map());
  const jaEnquadrouRef = useRef(false);
  const extensaoAtualRef = useRef(null);
  const marcadorRef = useRef(null);

  const [mapaPronto, setMapaPronto] = useState(false);
  const [mapasLocais, setMapasLocais] = useState([]);
  const [camadasVisiveis, setCamadasVisiveis] = useState(new Set());
  const [sincronizando, setSincronizando] = useState(true);
  const [ultimaSincronizacao, setUltimaSincronizacao] = useState(null);
  const [offline, setOffline] = useState(false);
  const [selecao, setSelecao] = useState(null);
  const [painelCamadasAberto, setPainelCamadasAberto] = useState(true);
  const [indiceBusca, setIndiceBusca] = useState([]);
  const [buscaTexto, setBuscaTexto] = useState("");
  const [medindo, setMedindo] = useState(false);
  const [modoMedicao, setModoMedicao] = useState("distancia");
  const [pontosMedicao, setPontosMedicao] = useState([]);

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
        glyphs: "/fonts/{fontstack}/{range}.pbf",
        sources: {},
        layers: [{ id: "fundo", type: "background", paint: { "background-color": "#e8eef1" } }],
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
    map.addControl(new MedicaoControl(() => setMedindo((m) => !m)), "top-right");
    map.addControl(new maplibregl.ScaleControl({ maxWidth: 120, unit: "metric" }), "bottom-left");

    map.on("load", () => {
      setMapaPronto(true);
      // Rastreamento de localização em tempo real, sem precisar clicar no botão.
      try {
        geolocate.trigger();
      } catch {
        // permissão negada/indisponível — usuário ainda pode clicar manualmente
      }
    });

    return () => {
      map.remove();
      maplibregl.removeProtocol("pmtiles");
    };
  }, []);

  // 2) offline-first: assim que o mapa carrega, mostra o que já existe localmente
  useEffect(() => {
    if (!mapaPronto) return;
    listarMapasBaixados().then((locais) => {
      setMapasLocais(locais);
      setCamadasVisiveis(new Set(locais.map((m) => m.id)));
    });
  }, [mapaPronto]);

  // 3) sincroniza em segundo plano, sem UI de bloqueio
  useEffect(() => {
    if (!mapaPronto) return;
    let cancelado = false;

    sincronizarMapas(sessao.token).then((resultado) => {
      if (cancelado) return;
      setMapasLocais(resultado.mapas);
      setCamadasVisiveis((atual) => {
        const nova = new Set(atual);
        for (const m of resultado.mapas) nova.add(m.id);
        return nova;
      });
      setOffline(!resultado.online);
      if (resultado.online) setUltimaSincronizacao(resultado.sincronizadoEm);
      setSincronizando(false);
    });

    return () => {
      cancelado = true;
    };
  }, [mapaPronto, sessao.token]);

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

        const info = await adicionarCamada(map, protocol, mapa);
        if (cancelado) return;
        if (info) {
          carregadas.set(mapa.id, info);
          mudou = true;
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

      // Índice de busca: só remonta quando alguma camada foi adicionada/
      // trocada de verdade — ler tiles direto da lib pmtiles é barato (tudo
      // local, poucos tiles no zoom mínimo) mas não precisa repetir à toa.
      if (mudou) {
        montarIndiceBusca([...carregadas.values()]).then((novo) => {
          if (!cancelado) setIndiceBusca(novo);
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
      if (!map.getLayer(info.fillLayerId)) continue;
      const visivel = camadasVisiveis.has(id);
      map.setPaintProperty(info.fillLayerId, "fill-opacity", visivel ? info.opacidadePreenchimento : 0);
      map.setPaintProperty(info.lineLayerId, "line-opacity", visivel ? 1 : 0);
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
      if (medindo) {
        setPontosMedicao((atual) => [...atual, [e.lngLat.lng, e.lngLat.lat]]);
        return;
      }

      const fillLayerIds = [...camadasCarregadasRef.current.entries()]
        .filter(([id, info]) => camadasVisiveis.has(id) && info.consultavel)
        .map(([, info]) => info.fillLayerId)
        .filter((id) => map.getLayer(id));
      if (fillLayerIds.length === 0) {
        setSelecao(null);
        return;
      }

      const features = map.queryRenderedFeatures(e.point, { layers: fillLayerIds });
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
          (c) => c.fillLayerId === feature.layer.id
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
  }, [mapaPronto, camadasVisiveis, medindo]);

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
    }

    const atual = selecao?.itens[selecao.indice];
    if (atual?.grupoFiltro && atual.mapaId != null) {
      const info = camadasCarregadasRef.current.get(atual.mapaId);
      if (info && map.getLayer(info.highlightLayerId)) {
        map.setFilter(info.highlightLayerId, atual.grupoFiltro);
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
      marcadorRef.current = new maplibregl.Marker({ color: "#6b3fa0" }).setLngLat(selecao.lngLat).addTo(map);
    }
    return () => {
      marcadorRef.current?.remove();
      marcadorRef.current = null;
    };
  }, [selecao]);

  // 9) modo medição: cria/remove a fonte e as camadas de desenho quando
  // liga/desliga (uma fonte só, 3 camadas filtradas por tipo de geometria).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto) return;

    if (!medindo) {
      setPontosMedicao([]);
      if (map.getLayer(CAMADA_MEDICAO_PONTOS)) map.removeLayer(CAMADA_MEDICAO_PONTOS);
      if (map.getLayer(CAMADA_MEDICAO_LINHA)) map.removeLayer(CAMADA_MEDICAO_LINHA);
      if (map.getLayer(CAMADA_MEDICAO_AREA)) map.removeLayer(CAMADA_MEDICAO_AREA);
      if (map.getSource(FONTE_MEDICAO)) map.removeSource(FONTE_MEDICAO);
      return;
    }

    setSelecao(null);
    map.addSource(FONTE_MEDICAO, { type: "geojson", data: geojsonMedicao([], modoMedicao) });
    map.addLayer({
      id: CAMADA_MEDICAO_AREA,
      type: "fill",
      source: FONTE_MEDICAO,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": "#eda100", "fill-opacity": 0.25 },
    });
    map.addLayer({
      id: CAMADA_MEDICAO_LINHA,
      type: "line",
      source: FONTE_MEDICAO,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: { "line-color": "#eda100", "line-width": 2, "line-dasharray": [2, 1] },
    });
    map.addLayer({
      id: CAMADA_MEDICAO_PONTOS,
      type: "circle",
      source: FONTE_MEDICAO,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": "#eda100",
        "circle-stroke-width": 2,
        "circle-stroke-color": "#fff",
      },
    });

    return () => {
      if (map.getLayer(CAMADA_MEDICAO_PONTOS)) map.removeLayer(CAMADA_MEDICAO_PONTOS);
      if (map.getLayer(CAMADA_MEDICAO_LINHA)) map.removeLayer(CAMADA_MEDICAO_LINHA);
      if (map.getLayer(CAMADA_MEDICAO_AREA)) map.removeLayer(CAMADA_MEDICAO_AREA);
      if (map.getSource(FONTE_MEDICAO)) map.removeSource(FONTE_MEDICAO);
    };
  }, [medindo, mapaPronto]);

  // 10) redesenha a medição a cada ponto novo, sem recriar fonte/camadas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !medindo) return;
    const fonte = map.getSource(FONTE_MEDICAO);
    if (fonte) fonte.setData(geojsonMedicao(pontosMedicao, modoMedicao));
  }, [pontosMedicao, modoMedicao, medindo]);

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
    map.flyTo({ center: [resultado.lng, resultado.lat], zoom: 16, duration: 1200 });
    setBuscaTexto("");
  }

  function trocarModoMedicao(modo) {
    setModoMedicao(modo);
    setPontosMedicao([]);
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

  const resultadoMedicaoAtual = medindo ? textoResultadoMedicao(pontosMedicao, modoMedicao) : null;

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
        {sessao.usuario.papel === "admin" && (
          <Link to="/admin" className="botao botao-sair">
            Admin
          </Link>
        )}
        <button type="button" className="botao-sair" onClick={handleSair}>
          Sair
        </button>
      </header>

      <div className="area-mapa">
        <div ref={containerRef} className="mapa-container" />

        {!mapaPronto && (
          <div className="carregando-mapa">
            <span className="spinner spinner--grande" aria-hidden="true" />
            <p>Carregando mapa…</p>
          </div>
        )}

        {indiceBusca.length > 0 && (
          <div className="painel-busca">
            <input
              type="search"
              placeholder="Buscar talhão ou fazenda…"
              value={buscaTexto}
              onChange={(e) => setBuscaTexto(e.target.value)}
            />
            {resultadosBusca.length > 0 && (
              <ul className="resultados-busca">
                {resultadosBusca.map((r, i) => (
                  <li key={`${r.mapaId}-${i}`}>
                    <button type="button" onClick={() => selecionarResultadoBusca(r)}>
                      {r.texto}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            {buscaNormalizada.length >= 2 && resultadosBusca.length === 0 && (
              <p className="sem-resultados-busca">Nada encontrado.</p>
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
              {mapasLocais.map((m) => {
                const cor = m.estiloConfig?.cor || corDaCamada(m.id);
                // Legenda dinâmica: camada com preenchimento (ex: Talhões)
                // ganha swatch sólido; camada só-contorno (ex: Limites)
                // ganha swatch vazado — reflete o que aparece de fato no
                // mapa, não só uma cor genérica.
                const info = camadasCarregadasRef.current.get(m.id);
                const preenchido = (info?.opacidadePreenchimento ?? 0) > 0;
                return (
                  <label key={m.id} className="linha-camada">
                    <input
                      type="checkbox"
                      checked={camadasVisiveis.has(m.id)}
                      onChange={() => alternarCamada(m.id)}
                    />
                    <span
                      className={`swatch-camada${preenchido ? "" : " swatch-camada--contorno"}`}
                      style={preenchido ? { backgroundColor: cor } : { borderColor: cor }}
                    />
                    <span className="nome-camada">{m.nome}</span>
                  </label>
                );
              })}
            </div>
          </aside>
        )}

        {mapasLocais.length === 0 && !sincronizando && (
          <p className="aviso-sem-mapas">
            Nenhum mapa disponível ainda. Conecte-se à internet pra sincronizar.
          </p>
        )}

        {medindo && (
          <aside className="painel-medicao">
            <button type="button" className="fechar" onClick={() => setMedindo(false)}>
              ×
            </button>
            <div className="opcoes-modo-medicao">
              <button
                type="button"
                className={modoMedicao === "distancia" ? "ativo" : ""}
                onClick={() => trocarModoMedicao("distancia")}
              >
                Distância
              </button>
              <button
                type="button"
                className={modoMedicao === "area" ? "ativo" : ""}
                onClick={() => trocarModoMedicao("area")}
              >
                Área
              </button>
            </div>
            <p className="resultado-medicao">
              {resultadoMedicaoAtual ??
                (modoMedicao === "area" ? "Clique pra marcar o polígono (mín. 3 pontos)" : "Clique pra marcar os pontos")}
            </p>
            {pontosMedicao.length > 0 && (
              <button type="button" className="botao-limpar-medicao" onClick={() => setPontosMedicao([])}>
                Limpar
              </button>
            )}
          </aside>
        )}

        <aside className={`painel-atributos${selecao ? " painel-atributos--aberto" : ""}`}>
          {itemSelecionado && (
            <>
              <button type="button" className="fechar" onClick={() => setSelecao(null)}>
                ×
              </button>
              <h2>
                <span className="swatch-camada" style={{ backgroundColor: itemSelecionado.cor }} />
                {itemSelecionado.camada}
              </h2>
              <dl>
                {Object.entries(itemSelecionado.propriedades).map(([chave, valor]) => (
                  <div key={chave} className="linha-atributo">
                    <dt>{chave}</dt>
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
