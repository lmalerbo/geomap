import { useEffect, useRef, useState } from "react";
import turfLength from "@turf/length";
import { CORES_FERRAMENTAS } from "../lib/coresFerramentas.js";
import { baixarKmlPercurso } from "../lib/trackLog.js";

const FONTE_TRACK = "fonte-track";
const CAMADA_TRACK_LINHA = "camada-track-linha";

function geojsonPercurso(pontos) {
  return {
    type: "FeatureCollection",
    features:
      pontos.length >= 2
        ? [{ type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pontos } }]
        : [],
  };
}

// Mesmo critério de formatação usado na medição (km/m conforme o
// tamanho), reaproveitado aqui pra distância percorrida ao vivo.
function textoDistanciaPercurso(pontos) {
  if (pontos.length < 2) return null;
  const linha = { type: "Feature", properties: {}, geometry: { type: "LineString", coordinates: pontos } };
  const km = turfLength(linha, { units: "kilometers" });
  return km < 1 ? `${(km * 1000).toFixed(0)} m` : `${km.toFixed(2)} km`;
}

// Gravação de percurso via GPS — extraída de Mapa.jsx (era os efeitos
// 12/13 + o cleanup de watchId + os states/funções relacionados).
// `mapRef`/`mapaPronto` vêm de fora (mesmo mapa único do componente pai);
// `mapaId` só é usado pra nomear o arquivo KML exportado.
export function useTrackLog(mapRef, mapaPronto, mapaId) {
  const [mostrarPainelTrack, setMostrarPainelTrack] = useState(false);
  const [gravandoPercurso, setGravandoPercurso] = useState(false);
  const [pontosPercurso, setPontosPercurso] = useState([]);
  const [erroTrack, setErroTrack] = useState(null);
  const watchIdRef = useRef(null);

  const temPercurso = pontosPercurso.length >= 2;

  // Cria/remove a fonte+camada quando o percurso passa a ter (ou deixa de
  // ter) pelo menos 2 pontos. Sem limpar pontosPercurso ao fechar o
  // painel: o percurso é intencional (gravado de propósito), diferente
  // da medição (ferramenta descartável) — fechar o painel só esconde os
  // controles, nunca apaga a gravação.
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

  // Encerra a gravação se o componente desmontar no meio (troca de mapa,
  // logout) — sem isso o watchPosition ficaria rodando pra sempre.
  useEffect(() => {
    return () => {
      if (watchIdRef.current != null) navigator.geolocation.clearWatch(watchIdRef.current);
    };
  }, []);

  function pararGravacaoPercurso() {
    if (watchIdRef.current != null) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setGravandoPercurso(false);
  }

  function iniciarGravacaoPercurso() {
    if (!("geolocation" in navigator)) {
      setErroTrack("Geolocalização não disponível neste navegador/dispositivo.");
      return;
    }
    setErroTrack(null);
    setGravandoPercurso(true);
    watchIdRef.current = navigator.geolocation.watchPosition(
      (posicao) => {
        const { longitude, latitude } = posicao.coords;
        setPontosPercurso((atual) => [...atual, [longitude, latitude]]);
        setErroTrack(null);
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

  function limparPercurso() {
    setPontosPercurso([]);
    setErroTrack(null);
  }

  function exportarPercurso() {
    baixarKmlPercurso(pontosPercurso, `mapa-${mapaId}`);
  }

  const distanciaPercursoAtual = textoDistanciaPercurso(pontosPercurso);

  return {
    mostrarPainelTrack,
    setMostrarPainelTrack,
    gravandoPercurso,
    pontosPercurso,
    erroTrack,
    iniciarGravacaoPercurso,
    pararGravacaoPercurso,
    limparPercurso,
    exportarPercurso,
    distanciaPercursoAtual,
  };
}
