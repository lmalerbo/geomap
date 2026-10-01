import { useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { expressaoCorPreenchimento, expressaoCorContorno, expressaoTracoLinha } from "../lib/estiloCamada.js";

// Prévia ao vivo do estilo da camada no admin (redesenho, fase 5): os dados
// reais do .pmtiles já baixado pela tela de Camadas, desenhados com o estilo
// que está sendo editado — antes de salvar. Mesmas expressões de cor/traço
// de Mapa.jsx (lib/estiloCamada.js), num mapa à parte.
//
// Protocolo próprio ("pmtiles-previa://"): o Protocol da lib pmtiles só
// aceita o prefixo "pmtiles://", e esse nome já é registrado globalmente
// pela tela do mapa — registrar outro com o mesmo nome trocaria o de lá.

const ARQUIVOS = new Map(); // chave -> PMTiles
let protocoloRegistrado = false;

function registrarProtocolo() {
  if (protocoloRegistrado) return;
  protocoloRegistrado = true;
  maplibregl.addProtocol("pmtiles-previa", async (params, abort) => {
    const m = params.url.match(/^pmtiles-previa:\/\/([^/]+)\/(\d+)\/(\d+)\/(\d+)/);
    const arquivo = m && ARQUIVOS.get(m[1]);
    if (!arquivo) return { data: new Uint8Array() };
    const tile = await arquivo.getZxy(Number(m[2]), Number(m[3]), Number(m[4]), abort?.signal);
    return { data: tile ? new Uint8Array(tile.data) : new Uint8Array() };
  });
}

const FONTE = "previa";
const CAMADAS = ["previa-preenchimento", "previa-contorno", "previa-ponto", "previa-rotulo"];

function aplicarEstilo(map, { estilo, camadaPrincipal, ehPonto, temRotulos }) {
  for (const id of CAMADAS) if (map.getLayer(id)) map.removeLayer(id);
  if (!map.getSource(FONTE)) return;
  const preenchimento = { ...estilo.preenchimento };
  const contorno = { ...estilo.contorno };
  if (!ehPonto && estilo.tipoDesenho === "contorno") preenchimento.opacidade = 0;
  if (!ehPonto && estilo.tipoDesenho === "preenchimento") contorno.opacidade = 0;
  if (estilo.tipoCamada === "voos") preenchimento.opacidade = 0;
  const base = { source: FONTE, "source-layer": camadaPrincipal.id };

  if (ehPonto) {
    map.addLayer({
      ...base,
      id: "previa-ponto",
      type: "circle",
      paint: {
        "circle-color": expressaoCorPreenchimento(preenchimento),
        "circle-opacity": preenchimento.opacidade,
        "circle-radius": 6,
        "circle-stroke-color": expressaoCorContorno(contorno),
        "circle-stroke-width": contorno.largura,
        "circle-stroke-opacity": contorno.opacidade,
      },
    });
  } else {
    map.addLayer({
      ...base,
      id: "previa-preenchimento",
      type: "fill",
      paint: {
        "fill-color": expressaoCorPreenchimento(preenchimento),
        "fill-opacity": preenchimento.opacidade,
        "fill-antialias": false,
      },
    });
    const traco = expressaoTracoLinha(contorno.estiloTraco);
    map.addLayer({
      ...base,
      id: "previa-contorno",
      type: "line",
      layout: { "line-cap": traco.cap },
      paint: {
        "line-color": expressaoCorContorno(contorno),
        "line-width": contorno.largura,
        "line-opacity": contorno.opacidade,
        ...(traco.dasharray ? { "line-dasharray": traco.dasharray } : {}),
      },
    });
  }

  const rotulo = estilo.rotulo;
  const usaPipeline = rotulo.origem === "pipeline" && temRotulos;
  if (rotulo.mostrar && (usaPipeline || rotulo.origem === "atributo")) {
    map.addLayer({
      source: FONTE,
      "source-layer": usaPipeline ? "rotulos" : camadaPrincipal.id,
      id: "previa-rotulo",
      type: "symbol",
      minzoom: rotulo.zoomMinimo,
      layout: {
        "text-field": ["get", usaPipeline ? "rotulo" : rotulo.campo || camadaPrincipal.id],
        "text-font": ["Noto Sans Regular"],
        "text-size": rotulo.tamanhoFonte,
      },
      paint: { "text-color": rotulo.cor, "text-halo-color": "#ffffff", "text-halo-width": 1.2 },
    });
  }
}

export default function PreviaCamada({ chave, pmtiles, camadaPrincipal, estilo, ehPonto, temRotulos, alterado }) {
  const divRef = useRef(null);
  const mapRef = useRef(null);
  const [pronto, setPronto] = useState(false);
  const [zoom, setZoom] = useState(null);

  // Cria o mapa uma vez.
  useEffect(() => {
    registrarProtocolo();
    const map = new maplibregl.Map({
      container: divRef.current,
      style: {
        version: 8,
        glyphs: `${import.meta.env.BASE_URL}fonts/{fontstack}/{range}.pbf`,
        sources: {},
        layers: [{ id: "fundo", type: "background", paint: { "background-color": "#eef2ee" } }],
      },
      center: [-47.8, -21.6],
      zoom: 8,
      attributionControl: false,
      dragRotate: false,
      pitchWithRotate: false,
    });
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    map.on("load", () => setPronto(true));
    map.on("zoomend", () => setZoom(map.getZoom()));
    mapRef.current = map;
    if (import.meta.env.DEV) window.__previa = map; // inspeção em teste
    return () => {
      map.remove();
      mapRef.current = null;
    };
  }, []);

  // Troca de camada: nova fonte e enquadra a extensão do arquivo.
  useEffect(() => {
    const map = mapRef.current;
    if (!pronto || !map || !pmtiles || !camadaPrincipal) return;
    let cancelado = false;
    ARQUIVOS.set(String(chave), pmtiles);
    for (const id of CAMADAS) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(FONTE)) map.removeSource(FONTE);
    pmtiles.getHeader().then((h) => {
      if (cancelado) return;
      map.addSource(FONTE, {
        type: "vector",
        tiles: [`pmtiles-previa://${chave}/{z}/{x}/{y}`],
        minzoom: camadaPrincipal.minzoom ?? h.minZoom,
        maxzoom: camadaPrincipal.maxzoom ?? h.maxZoom,
      });
      map.fitBounds(
        [
          [h.minLon, h.minLat],
          [h.maxLon, h.maxLat],
        ],
        { padding: 24, duration: 0 }
      );
      setZoom(map.getZoom());
      if (estilo) aplicarEstilo(map, { estilo, camadaPrincipal, ehPonto, temRotulos });
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pronto, chave, pmtiles, camadaPrincipal]);

  // Estilo editado: redesenha (com um pequeno atraso pra não refazer a cada
  // tecla de um campo de cor).
  useEffect(() => {
    const map = mapRef.current;
    if (!pronto || !map || !estilo || !camadaPrincipal) return;
    const id = setTimeout(() => {
      try {
        aplicarEstilo(map, { estilo, camadaPrincipal, ehPonto, temRotulos });
      } catch (e) {
        console.warn("Prévia: estilo ainda incompleto", e.message);
      }
    }, 120);
    return () => clearTimeout(id);
  }, [pronto, estilo, camadaPrincipal, ehPonto, temRotulos]);

  const foraDoZoom =
    zoom != null && estilo?.rotulo.mostrar && zoom < estilo.rotulo.zoomMinimo ? `Rótulo aparece a partir do zoom ${estilo.rotulo.zoomMinimo}` : null;

  return (
    <div className="adm-previa">
      <div ref={divRef} className="adm-previa-mapa" />
      <span className={`adm-previa-selo${alterado ? " adm-previa-selo--alterado" : ""}`}>{alterado ? "Prévia · alterações ainda não salvas" : "Prévia ao vivo"}</span>
      {foraDoZoom && <span className="adm-previa-dica">{foraDoZoom}</span>}
    </div>
  );
}
