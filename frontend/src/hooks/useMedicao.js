import { useEffect, useRef, useState } from "react";
import turfLength from "@turf/length";
import turfArea from "@turf/area";
import { CORES_FERRAMENTAS } from "../lib/coresFerramentas.js";
import { baixarKmlMedicao, baixarPdfMedicao } from "../lib/exportarMedicao.js";

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
// não fazem sentido abertos ao mesmo tempo. `nomeMapa` só é usado pra
// nomear os arquivos exportados (KML/PDF).
export function useMedicao(mapRef, mapaPronto, aoIniciar, nomeMapa) {
  const [medindo, setMedindo] = useState(false);
  const [modoMedicao, setModoMedicao] = useState("distancia");
  const [pontosMedicao, setPontosMedicao] = useState([]);
  // "clique" (padrão de sempre — toca no mapa) | "gps" (anda com o
  // aparelho, ver iniciarCapturaGps abaixo — mesma técnica do track log,
  // mas sem pausar/continuar: aqui o caso de uso é andar o
  // trajeto/perímetro de uma vez, não gravar uma sessão longa).
  const [origemPontos, setOrigemPontos] = useState("clique");
  const [capturandoGps, setCapturandoGps] = useState(false);
  const [erroGps, setErroGps] = useState(null);
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);

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
      // fill-antialias:false evita o bug de fragmentação do preenchimento
      // no Safari/iOS (ver mesmo comentário em Mapa.jsx/adicionarCamada).
      paint: { "fill-color": CORES_FERRAMENTAS.medicao, "fill-opacity": 0.25, "fill-antialias": false },
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

  // Desligar a medição (botão fechar) no meio de uma captura por GPS não
  // pode deixar o watchPosition rodando escondido pra sempre.
  useEffect(() => {
    if (!medindo && watchIdRef.current != null) {
      pararCapturaGps();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medindo]);

  // Mesma proteção de desmontagem já usada no track log — troca de mapa/
  // logout no meio de uma captura não pode deixar o GPS rodando.
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
      wakeLockRef.current?.release().catch(() => {});
    };
  }, []);

  async function solicitarWakeLock() {
    if (!("wakeLock" in navigator)) return;
    try {
      wakeLockRef.current = await navigator.wakeLock.request("screen");
    } catch {
      wakeLockRef.current = null;
    }
  }

  async function liberarWakeLock() {
    try {
      await wakeLockRef.current?.release();
    } catch {
      // no-op
    }
    wakeLockRef.current = null;
  }

  function trocarModoMedicao(modo) {
    setModoMedicao(modo);
    setPontosMedicao([]);
    if (capturandoGps) pararCapturaGps();
  }

  function trocarOrigemPontos(origem) {
    if (capturandoGps) pararCapturaGps();
    setOrigemPontos(origem);
    setPontosMedicao([]);
  }

  function adicionarPonto(lngLat) {
    setPontosMedicao((atual) => [...atual, lngLat]);
  }

  // Só "iniciar/parar" (sem pausar/continuar, diferente do track log) — o
  // caso de uso aqui é andar o trajeto/perímetro de uma vez só; pausar
  // fica pro track log, que já cobre gravações mais longas.
  function iniciarCapturaGps() {
    if (!("geolocation" in navigator)) {
      setErroGps("Geolocalização não disponível neste navegador/dispositivo.");
      return;
    }
    setErroGps(null);
    setPontosMedicao([]);
    setCapturandoGps(true);
    solicitarWakeLock();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (posicao) => {
        const { longitude, latitude } = posicao.coords;
        adicionarPonto([longitude, latitude]);
        setErroGps(null);
      },
      (erro) => {
        setErroGps(erro.message || "Não foi possível obter a localização.");
        // Mesmo critério do track log: erro passageiro de GPS
        // (POSITION_UNAVAILABLE/TIMEOUT) não encerra a captura sozinho,
        // só permissão negada é fatal.
        if (erro.code === erro.PERMISSION_DENIED) {
          pararCapturaGps();
        }
      },
      { enableHighAccuracy: true }
    );
  }

  function pararCapturaGps() {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    liberarWakeLock();
    setCapturandoGps(false);
  }

  const resultadoMedicaoAtual = medindo ? textoResultadoMedicao(pontosMedicao, modoMedicao) : null;

  // Snapshot do canvas do mapa no momento da exportação (preserveDrawingBuffer
  // precisa estar ligado na criação do mapa — ver Mapa.jsx — senão volta
  // uma imagem em branco). Falha silenciosa (undefined) não impede o
  // resto do PDF de sair, só sem a imagem.
  function capturarImagemMapa() {
    try {
      // JPEG em vez de PNG — o canvas do mapa é essencialmente uma "foto"
      // (sem transparência relevante pra manter), e PNG sem perdas gerava
      // um PDF de 3+ MB só com a imagem, pesado demais pra compartilhar
      // em campo (WhatsApp, e-mail com anexo limitado).
      return mapRef.current?.getCanvas().toDataURL("image/jpeg", 0.85);
    } catch {
      return undefined;
    }
  }

  function exportarMedicaoKml() {
    if (!resultadoMedicaoAtual) return;
    baixarKmlMedicao(pontosMedicao, modoMedicao, resultadoMedicaoAtual, nomeMapa);
  }

  function exportarMedicaoPdf() {
    if (!resultadoMedicaoAtual) return;
    baixarPdfMedicao({
      pontos: pontosMedicao,
      modo: modoMedicao,
      resultado: resultadoMedicaoAtual,
      nomeMapa,
      imagemMapaDataUrl: capturarImagemMapa(),
    });
  }

  return {
    medindo,
    setMedindo,
    modoMedicao,
    pontosMedicao,
    setPontosMedicao,
    trocarModoMedicao,
    adicionarPonto,
    resultadoMedicaoAtual,
    origemPontos,
    trocarOrigemPontos,
    capturandoGps,
    erroGps,
    iniciarCapturaGps,
    pararCapturaGps,
    exportarMedicaoKml,
    exportarMedicaoPdf,
  };
}
