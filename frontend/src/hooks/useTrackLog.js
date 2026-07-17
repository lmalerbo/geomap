import { useEffect, useRef, useState } from "react";
import turfLength from "@turf/length";
import { CORES_FERRAMENTAS } from "../lib/coresFerramentas.js";
import { baixarKmlPercurso, compartilharKmlPercurso } from "../lib/trackLog.js";

const FONTE_TRACK = "fonte-track";
const CAMADA_TRACK_LINHA = "camada-track-linha";

// `segmentos`: array de segmentos (pausar/continuar abre um novo a cada
// vez), cada um um array de [lng, lat]. Só os segmentos com >=2 pontos
// viram feature — um segmento recém-aberto (0 ou 1 ponto) ainda não é uma
// linha desenhável.
function geojsonPercurso(segmentos) {
  return {
    type: "FeatureCollection",
    features: segmentos
      .filter((pontos) => pontos.length >= 2)
      .map((pontos) => ({ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pontos } })),
  };
}

// Mesmo critério de formatação usado na medição (km/m conforme o
// tamanho), reaproveitado aqui pra distância percorrida ao vivo — soma o
// comprimento de todos os segmentos (pausar/continuar pode gerar mais de
// um), não só o último.
function textoDistanciaPercurso(segmentos) {
  const segmentosValidos = segmentos.filter((pontos) => pontos.length >= 2);
  if (segmentosValidos.length === 0) return null;
  const km = segmentosValidos.reduce((total, pontos) => {
    const linha = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pontos } };
    return total + turfLength(linha, { units: "kilometers" });
  }, 0);
  return km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(2)} km`;
}

// Gravação de percurso via GPS — extraída de Mapa.jsx (era os efeitos
// 12/13 + o cleanup de watchId + os states/funções relacionados).
// `mapRef`/`mapaPronto` vêm de fora (mesmo mapa único do componente pai);
// `mapaId` só é usado pra nomear o arquivo KML exportado.
export function useTrackLog(mapRef, mapaPronto, mapaId) {
  const [mostrarPainelTrack, setMostrarPainelTrack] = useState(false);
  const [gravandoPercurso, setGravandoPercurso] = useState(false);
  const [pausado, setPausado] = useState(false);
  // Array de segmentos, não um array plano de pontos — pausar/continuar
  // (ver pausarGravacaoPercurso/continuarGravacaoPercurso) abre um novo
  // segmento a cada retomada, virando múltiplas linhas no KML final. Esse
  // state nunca é persistido (só vive em memória durante a sessão), então
  // não há preocupação de compatibilidade com um formato antigo salvo.
  const [pontosPercurso, setPontosPercurso] = useState([]);
  // Câmera acompanha o GPS ao vivo enquanto grava — desliga sozinho se o
  // usuário arrastar o mapa manualmente (ver efeito de "dragstart" abaixo),
  // mesmo comportamento de "recentralizar" do Google Maps.
  const [seguirCamera, setSeguirCamera] = useState(true);
  const [erroTrack, setErroTrack] = useState(null);
  const watchIdRef = useRef(null);
  const wakeLockRef = useRef(null);
  // O callback de sucesso do watchPosition é registrado uma única vez (em
  // iniciarGravacaoPercurso) e continua rodando durante uma pausa (sem
  // clearWatch — evita o GPS ter que readquirir sinal ao continuar), então
  // ele não vê re-renders novos por closure; refs mantêm o valor atual de
  // pausado/seguirCamera acessível de dentro desse callback de vida longa.
  const pausadoRef = useRef(false);
  const seguirCameraRef = useRef(true);

  useEffect(() => {
    pausadoRef.current = pausado;
  }, [pausado]);

  useEffect(() => {
    seguirCameraRef.current = seguirCamera;
  }, [seguirCamera]);

  const temPercurso = pontosPercurso.some((pontos) => pontos.length >= 2);

  // Cria/remove a fonte+camada quando o percurso passa a ter (ou deixa de
  // ter) pelo menos 1 segmento desenhável. Sem limpar pontosPercurso ao
  // fechar o painel: o percurso é intencional (gravado de propósito),
  // diferente da medição (ferramenta descartável) — fechar o painel só
  // esconde os controles, nunca apaga a gravação.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto) return;
    if (!temPercurso) {
      if (map.getLayer(CAMADA_TRACK_LINHA)) map.removeLayer(CAMADA_TRACK_LINHA);
      if (map.getSource(FONTE_TRACK)) map.removeSource(FONTE_TRACK);
      return;
    }
    if (map.getSource(FONTE_TRACK)) return; // já existe — o efeito abaixo atualiza os dados
    map.addSource(FONTE_TRACK, { type: "geojson", data: geojsonPercurso(pontosPercurso) });
    map.addLayer({
      id: CAMADA_TRACK_LINHA,
      type: "line",
      source: FONTE_TRACK,
      paint: { "line-color": CORES_FERRAMENTAS.track, "line-width": 3 },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temPercurso, mapaPronto]);

  // Redesenha o percurso a cada ponto novo do GPS, sem recriar fonte/camada.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !temPercurso) return;
    const fonte = map.getSource(FONTE_TRACK);
    if (fonte) fonte.setData(geojsonPercurso(pontosPercurso));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pontosPercurso, temPercurso]);

  // Desliga "seguir câmera" sozinho se o usuário arrastar o mapa na mão —
  // sem isso a câmera brigaria com um pan manual a cada novo ponto GPS
  // (mesma classe de problema já documentada pro auto-zoom do
  // GeolocateControl). Registrado só enquanto seguirCamera está ligado.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto || !seguirCamera) return;
    function aoArrastar() {
      setSeguirCamera(false);
    }
    map.on("dragstart", aoArrastar);
    return () => map.off("dragstart", aoArrastar);
  }, [seguirCamera, mapaPronto, mapRef]);

  // Wake Lock evita que a tela apague sozinha por inatividade enquanto
  // grava (o caso mais comum de "gravação parou sozinha" em campo — GPS
  // web não roda com a tela travada, isso é limitação do navegador, não
  // dá pra contornar). O navegador libera o lock automaticamente quando a
  // aba perde visibilidade (troca de app) — sem readquirir aqui, um
  // app-switch rápido (volta pro app em segundos) deixaria a tela
  // vulnerável a apagar de novo mesmo com a gravação continuando.
  useEffect(() => {
    if (!gravandoPercurso) return;
    function aoVisibilidadeMudar() {
      if (document.visibilityState === "visible") solicitarWakeLock();
    }
    document.addEventListener("visibilitychange", aoVisibilidadeMudar);
    return () => document.removeEventListener("visibilitychange", aoVisibilidadeMudar);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gravandoPercurso]);

  // Encerra a gravação se o componente desmontar no meio (troca de mapa,
  // logout) — sem isso o watchPosition ficaria rodando pra sempre.
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
      // Permissão negada, dispositivo sem suporte no momento (ex: bateria
      // baixa em alguns Android) — degrada silenciosamente, a gravação
      // continua funcionando, só sem a proteção extra.
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

  function pararGravacaoPercurso() {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    liberarWakeLock();
    setGravandoPercurso(false);
    setPausado(false);
  }

  function iniciarGravacaoPercurso() {
    if (!("geolocation" in navigator)) {
      setErroTrack("Geolocalização não disponível neste navegador/dispositivo.");
      return;
    }
    setErroTrack(null);
    setPontosPercurso([[]]);
    setPausado(false);
    setSeguirCamera(true);
    setGravandoPercurso(true);
    solicitarWakeLock();
    watchIdRef.current = navigator.geolocation.watchPosition(
      (posicao) => {
        if (pausadoRef.current) return;
        const { longitude, latitude } = posicao.coords;
        setPontosPercurso((segmentos) => {
          const semUltimo = segmentos.slice(0, -1);
          const ultimo = segmentos[segmentos.length - 1] ?? [];
          return [...semUltimo, [...ultimo, [longitude, latitude]]];
        });
        setErroTrack(null);
        if (seguirCameraRef.current && mapRef.current) {
          mapRef.current.easeTo({ center: [longitude, latitude], duration: 300 });
        }
      },
      (erro) => {
        setErroTrack(erro.message || "Não foi possível obter a localização.");
        // watchPosition chama o erro sem cancelar o watch sozinho — sinal de
        // GPS instável (POSITION_UNAVAILABLE/TIMEOUT) é passageiro (comum
        // em campo, ex: sob cobertura ruim) e a gravação deve continuar
        // tentando; só permissão negada de verdade é fatal.
        if (erro.code === erro.PERMISSION_DENIED) {
          pararGravacaoPercurso();
        }
      },
      { enableHighAccuracy: true }
    );
  }

  // Não dá clearWatch — mantém o GPS "quente" pra continuar sem esperar
  // readquirir sinal; só marca pausado, e o callback de sucesso acima para
  // de empurrar pontos pro segmento atual enquanto isso.
  function pausarGravacaoPercurso() {
    setPausado(true);
  }

  // Abre um novo segmento vazio — é isso que gera as múltiplas linhas no
  // KML final quando o usuário pausa/continua mais de uma vez.
  function continuarGravacaoPercurso() {
    setPontosPercurso((segmentos) => [...segmentos, []]);
    setPausado(false);
  }

  function limparPercurso() {
    setPontosPercurso([]);
    setErroTrack(null);
  }

  function exportarPercurso() {
    baixarKmlPercurso(pontosPercurso, `mapa-${mapaId}`);
  }

  async function compartilharPercurso() {
    try {
      await compartilharKmlPercurso(pontosPercurso, `mapa-${mapaId}`);
    } catch {
      setErroTrack("Não foi possível compartilhar o arquivo.");
    }
  }

  const distanciaPercursoAtual = textoDistanciaPercurso(pontosPercurso);

  return {
    mostrarPainelTrack,
    setMostrarPainelTrack,
    gravandoPercurso,
    pausado,
    pontosPercurso,
    // Geometria pronta pra virar camada temporária (ver botão "Ver
    // percurso no mapa" em Mapa.jsx) sem o chamador precisar conhecer o
    // formato interno de segmentos.
    geojsonPercursoAtual: geojsonPercurso(pontosPercurso),
    seguirCamera,
    setSeguirCamera,
    erroTrack,
    iniciarGravacaoPercurso,
    pararGravacaoPercurso,
    pausarGravacaoPercurso,
    continuarGravacaoPercurso,
    limparPercurso,
    exportarPercurso,
    compartilharPercurso,
    distanciaPercursoAtual,
  };
}
