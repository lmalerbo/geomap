import { useEffect, useState } from "react";
import turfLength from "@turf/length";
import turfArea from "@turf/area";
import { CORES_FERRAMENTAS } from "../lib/coresFerramentas.js";

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

// Ferramenta de medição de distância/área — extraída de Mapa.jsx (era os
// efeitos 9/10 + os states medindo/modoMedicao/pontosMedicao). `mapRef` e
// `mapaPronto` vêm de fora (o mapa é criado uma vez só, no componente
// pai); `aoIniciar` é chamado quando a medição liga de verdade (não só o
// state mudar) — usado pra fechar o painel de atributos, já que os dois
// não fazem sentido abertos ao mesmo tempo.
export function useMedicao(mapRef, mapaPronto, aoIniciar) {
  const [medindo, setMedindo] = useState(false);
  const [modoMedicao, setModoMedicao] = useState("distancia");
  const [pontosMedicao, setPontosMedicao] = useState([]);

  // Cria/remove a fonte e as camadas de desenho quando liga/desliga (uma
  // fonte só, 3 camadas filtradas por tipo de geometria).
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

    aoIniciar?.();
    map.addSource(FONTE_MEDICAO, { type: "geojson", data: geojsonMedicao([], modoMedicao) });
    map.addLayer({
      id: CAMADA_MEDICAO_AREA,
      type: "fill",
      source: FONTE_MEDICAO,
      filter: ["==", ["geometry-type"], "Polygon"],
      paint: { "fill-color": CORES_FERRAMENTAS.medicao, "fill-opacity": 0.25 },
    });
    map.addLayer({
      id: CAMADA_MEDICAO_LINHA,
      type: "line",
      source: FONTE_MEDICAO,
      filter: ["==", ["geometry-type"], "LineString"],
      paint: {
        "line-color": CORES_FERRAMENTAS.medicao,
        "line-width": 2,
        "line-dasharray": [2, 1],
      },
    });
    map.addLayer({
      id: CAMADA_MEDICAO_PONTOS,
      type: "circle",
      source: FONTE_MEDICAO,
      filter: ["==", ["geometry-type"], "Point"],
      paint: {
        "circle-radius": 5,
        "circle-color": CORES_FERRAMENTAS.medicao,
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medindo, mapaPronto]);

  // Redesenha a medição a cada ponto novo, sem recriar fonte/camadas.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !medindo) return;
    const fonte = map.getSource(FONTE_MEDICAO);
    if (fonte) fonte.setData(geojsonMedicao(pontosMedicao, modoMedicao));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pontosMedicao, modoMedicao, medindo]);

  function trocarModoMedicao(modo) {
    setModoMedicao(modo);
    setPontosMedicao([]);
  }

  function adicionarPonto(lngLat) {
    setPontosMedicao((atual) => [...atual, lngLat]);
  }

  const resultadoMedicaoAtual = medindo ? textoResultadoMedicao(pontosMedicao, modoMedicao) : null;

  return {
    medindo,
    setMedindo,
    modoMedicao,
    pontosMedicao,
    setPontosMedicao,
    trocarModoMedicao,
    adicionarPonto,
    resultadoMedicaoAtual,
  };
}
