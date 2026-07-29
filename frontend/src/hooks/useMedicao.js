import { useEffect, useRef, useState } from "react";
import turfLength from "@turf/length";
import turfArea from "@turf/area";
import { CORES_FERRAMENTAS } from "../lib/coresFerramentas.js";
import { baixarZipMedicao } from "../lib/exportarMedicao.js";

const FONTE_MEDICAO = "fonte-medicao";
const CAMADA_MEDICAO_LINHA = "camada-medicao-linha";
const CAMADA_MEDICAO_PONTOS = "camada-medicao-pontos";
const CAMADA_MEDICAO_AREA = "camada-medicao-area";

// Monta o FeatureCollection renderizado enquanto o usuário vai clicando:
// pontos sempre, linha a partir de 2 pontos (fechada se for modo área,
// só pra dar a pista visual do polígono), preenchimento a partir de 3
// pontos em modo área.
function geojsonMedicao(pontos, modo) {
  // `indice` identifica qual ponto foi atingido ao arrastar (ver efeito de
  // arrastar ponto abaixo) — sem isso não daria pra saber qual posição do
  // array atualizar a partir de um hit-test no mapa.
  const features = pontos.map((p, i) => ({
    type: "Feature",
    properties: { indice: i },
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
// o tamanho, igual a barra de escala do MapLibre já faz); área sempre em
// hectares (unidade padrão de agricultura — pedido explícito, mesmo pra
// áreas pequenas que antes caíam em m²).
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
  return `${(m2 / 10000).toFixed(2)} ha`;
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

  // Arrastar um ponto já colocado pra reposicionar — só no modo "clique"
  // (pontos de GPS já são atualizados pelo watchPosition, arrastar não
  // faz sentido pra eles). Padrão oficial do MapLibre pra feição
  // arrastável: mousedown/touchstart na camada com e.preventDefault()
  // (impede o mapa de começar a arrastar/pan junto e também suprime o
  // "click" nativo que viria em seguida — sem isso, soltar o ponto
  // também adicionaria um ponto novo na posição final), depois
  // mousemove/touchmove no mapa inteiro até soltar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !medindo || origemPontos !== "clique") return;

    function aoEntrarPonto() {
      map.getCanvas().style.cursor = "grab";
    }
    function aoSairPonto() {
      map.getCanvas().style.cursor = "";
    }

    function iniciarArraste(e) {
      e.preventDefault();
      const feature = e.features?.[0];
      if (!feature) return;
      const indice = feature.properties.indice;
      map.getCanvas().style.cursor = "grabbing";
      map.dragPan.disable();

      function aoMover(ev) {
        const { lng, lat } = ev.lngLat;
        setPontosMedicao((atual) => {
          if (indice >= atual.length) return atual;
          const novo = [...atual];
          novo[indice] = [lng, lat];
          return novo;
        });
      }
      function finalizarArraste() {
        map.off("mousemove", aoMover);
        map.off("touchmove", aoMover);
        map.getCanvas().style.cursor = "";
        map.dragPan.enable();
      }

      map.on("mousemove", aoMover);
      map.on("touchmove", aoMover);
      map.once("mouseup", finalizarArraste);
      map.once("touchend", finalizarArraste);
    }

    map.on("mouseenter", CAMADA_MEDICAO_PONTOS, aoEntrarPonto);
    map.on("mouseleave", CAMADA_MEDICAO_PONTOS, aoSairPonto);
    map.on("mousedown", CAMADA_MEDICAO_PONTOS, iniciarArraste);
    map.on("touchstart", CAMADA_MEDICAO_PONTOS, iniciarArraste);

    return () => {
      map.off("mouseenter", CAMADA_MEDICAO_PONTOS, aoEntrarPonto);
      map.off("mouseleave", CAMADA_MEDICAO_PONTOS, aoSairPonto);
      map.off("mousedown", CAMADA_MEDICAO_PONTOS, iniciarArraste);
      map.off("touchstart", CAMADA_MEDICAO_PONTOS, iniciarArraste);
      map.dragPan.enable();
      map.getCanvas().style.cursor = "";
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medindo, origemPontos, mapaPronto]);

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
  // resto do PDF de sair, só sem a imagem. Devolve largura/altura reais do
  // canvas junto — sem isso o PDF encaixava a imagem numa caixa de
  // proporção fixa, esticando/achatando ela quando a proporção real da
  // tela do usuário era diferente (ex: celular em retrato).
  function capturarImagemMapa() {
    try {
      const canvas = mapRef.current?.getCanvas();
      if (!canvas) return undefined;
      // JPEG em vez de PNG — o canvas do mapa é essencialmente uma "foto"
      // (sem transparência relevante pra manter), e PNG sem perdas gerava
      // um PDF de 3+ MB só com a imagem, pesado demais pra compartilhar
      // em campo (WhatsApp, e-mail com anexo limitado).
      return {
        dataUrl: canvas.toDataURL("image/jpeg", 0.85),
        largura: canvas.width,
        altura: canvas.height,
      };
    } catch {
      return undefined;
    }
  }

  // Um zip só com os 3 formatos (relatório em PDF, geometria em KML,
  // coordenadas em CSV) — antes eram dois botões separados (KML/PDF); o
  // PDF com a lista de pontos virava um calhamaço de várias páginas com
  // medições de muitos pontos (testado com 131), então a lista bruta
  // saiu do PDF e virou o CSV, sempre incluído junto. `referencia` (nome/
  // código da fazenda mais próxima) é calculado em Mapa.jsx, que é quem
  // tem acesso ao índice de busca — este hook não precisa conhecer esse
  // formato.
  function exportarMedicaoZip(referencia) {
    if (!resultadoMedicaoAtual) return;
    baixarZipMedicao({
      pontos: pontosMedicao,
      modo: modoMedicao,
      resultado: resultadoMedicaoAtual,
      nomeMapa,
      referencia,
      imagemMapa: capturarImagemMapa(),
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
    exportarMedicaoZip,
  };
}
