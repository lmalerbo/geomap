import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { garantirImagensPins, idImagemPin, ICONE_PADRAO, nomeIcone } from "../lib/iconesPreparo.js";
import { CORES_FERRAMENTAS } from "../lib/coresFerramentas.js";
import { salvarPinLocal, listarPinsDoMapa, buscarPinLocal } from "../lib/db.js";
import { enviarPinsPendentes, avisarPinsAtualizados, EVENTO_PINS_ATUALIZADOS, EVENTO_PIN_DESCARTADO } from "../lib/syncPinsApp.js";

const FONTE_PINS = "fonte-pins";
const CAMADA_PINS = "camada-pins";
const CAMADA_PINS_PENDENTES = "camada-pins-pendentes";
const PRECISAO_MAXIMA_GPS = 30; // metros — acima disso pede confirmação

function pinParaFeature(pin) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [pin.lng, pin.lat] },
    properties: { id: pin.id, titulo: pin.titulo, imagem: idImagemPin(pin.icone, pin.cor), pendente: Boolean(pin.pendente) },
  };
}

// Anotações compartilhadas do mapa (Mapa do Preparo) — ver
// docs/superpowers/specs/2026-09-24-mapa-preparo-anotacoes-design.md.
// Toda escrita vai primeiro pro IndexedDB com `pendente` (funciona sem
// rede) e depois dispara o envio em segundo plano (lib/syncPinsApp.js).
export function usePins(mapRef, mapaPronto, mapaId, { podeEditar, sessao, aoAviso }) {
  const [pins, setPins] = useState([]);
  const [visivel, setVisivel] = useState(true);
  const [pinSelecionadoId, setPinSelecionadoId] = useState(null);
  const [rascunho, setRascunho] = useState(null);
  const [modoAdicionar, setModoAdicionar] = useState(false);
  const [obtendoGps, setObtendoGps] = useState(false);
  const [movendoId, setMovendoId] = useState(null);
  const marcadorMoverRef = useRef(null);

  const recarregar = useCallback(async () => {
    if (!Number.isFinite(mapaId)) return;
    const todos = await listarPinsDoMapa(mapaId);
    setPins(todos.filter((p) => p.pendente !== "remover"));
  }, [mapaId]);

  // Carga inicial + recarga quando o sync (ou outra aba) mexer nos pins.
  useEffect(() => {
    recarregar();
    function aoAtualizar(e) {
      if (!e.detail?.mapaIds || e.detail.mapaIds.includes(mapaId)) recarregar();
    }
    // O toast do descarte é global (components/AvisoPinsDescartados.jsx);
    // aqui só redesenha se o pin era deste mapa.
    function aoDescartar(e) {
      if (e.detail.pin.mapaId === mapaId) recarregar();
    }
    window.addEventListener(EVENTO_PINS_ATUALIZADOS, aoAtualizar);
    window.addEventListener(EVENTO_PIN_DESCARTADO, aoDescartar);
    return () => {
      window.removeEventListener(EVENTO_PINS_ATUALIZADOS, aoAtualizar);
      window.removeEventListener(EVENTO_PIN_DESCARTADO, aoDescartar);
    };
  }, [recarregar, mapaId]);

  // Voltou a internet: tenta esvaziar a fila.
  useEffect(() => {
    function aoFicarOnline() {
      enviarPinsPendentes(sessao.token);
    }
    window.addEventListener("online", aoFicarOnline);
    return () => window.removeEventListener("online", aoFicarOnline);
  }, [sessao.token]);

  // Camadas do MapLibre: cria na primeira vez, depois só setData (mesmo
  // idioma da medição/track). Sem beforeId: anotação fica por cima de tudo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto) return;
    let cancelado = false;
    (async () => {
      await garantirImagensPins(map, pins);
      if (cancelado) return;
      const dados = { type: "FeatureCollection", features: pins.map(pinParaFeature) };
      const fonte = map.getSource(FONTE_PINS);
      if (fonte) {
        fonte.setData(dados);
      } else {
        map.addSource(FONTE_PINS, { type: "geojson", data: dados });
        map.addLayer({
          id: CAMADA_PINS,
          type: "symbol",
          source: FONTE_PINS,
          layout: {
            "icon-image": ["get", "imagem"],
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
            "text-field": ["get", "titulo"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 12,
            "text-anchor": "top",
            "text-offset": [0, 0.2],
            "text-optional": true,
          },
          paint: {
            "text-color": "#1f2933",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.5,
          },
        });
        // Bolinha laranja no "ombro" do pin = ainda não enviado.
        map.addLayer({
          id: CAMADA_PINS_PENDENTES,
          type: "circle",
          source: FONTE_PINS,
          filter: ["==", ["get", "pendente"], true],
          paint: {
            "circle-radius": 5,
            "circle-color": CORES_FERRAMENTAS.pinPendente,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-translate": [12, -40],
          },
        });
      }
      const vis = visivel ? "visible" : "none";
      map.setLayoutProperty(CAMADA_PINS, "visibility", vis);
      map.setLayoutProperty(CAMADA_PINS_PENDENTES, "visibility", vis);
    })();
    return () => {
      cancelado = true;
    };
  }, [pins, visivel, mapaPronto, mapRef]);

  // Cursor mira enquanto "tocar no mapa" está ativo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = modoAdicionar ? "crosshair" : "";
    return () => {
      if (mapRef.current) mapRef.current.getCanvas().style.cursor = "";
    };
  }, [modoAdicionar, mapRef]);

  // Remove o marcador de mover ao desmontar.
  useEffect(() => () => marcadorMoverRef.current?.remove(), []);

  async function gravar(pin) {
    await salvarPinLocal(pin);
    await recarregar();
    avisarPinsAtualizados([mapaId]);
    enviarPinsPendentes(sessao.token);
  }

  function selecionarPin(id) {
    setModoAdicionar(false);
    setRascunho(null);
    setPinSelecionadoId(id);
  }

  function fecharPin() {
    setPinSelecionadoId(null);
  }

  function abrirNovo(lngLat, precisao) {
    if (!podeEditar) return;
    setModoAdicionar(false);
    setPinSelecionadoId(null);
    setRascunho({
      lngLat,
      precisao,
      inicial: { icone: ICONE_PADRAO, cor: CORES_FERRAMENTAS.pinPadrao, titulo: nomeIcone(ICONE_PADRAO), nota: "" },
    });
  }

  function abrirEdicao(id) {
    const pin = pins.find((p) => p.id === id);
    if (!pin || !podeEditar) return;
    setRascunho({ id, lngLat: { lng: pin.lng, lat: pin.lat }, inicial: { icone: pin.icone, cor: pin.cor, titulo: pin.titulo, nota: pin.nota } });
  }

  function cancelarRascunho() {
    setRascunho(null);
  }

  async function salvarRascunho(campos) {
    if (!rascunho) return;
    const agora = new Date().toISOString();
    const usuario = sessao.usuario;
    if (rascunho.id) {
      const atual = await buscarPinLocal(rascunho.id);
      if (!atual) return setRascunho(null);
      await gravar({ ...atual, ...campos, atualizadoEm: agora, atualizadoPor: usuario.id, atualizadoPorNome: usuario.nome, pendente: "salvar" });
      setPinSelecionadoId(rascunho.id);
    } else {
      const novo = {
        id: crypto.randomUUID(),
        mapaId,
        ...campos,
        lng: rascunho.lngLat.lng,
        lat: rascunho.lngLat.lat,
        criadoPor: usuario.id,
        criadoPorNome: usuario.nome,
        atualizadoPor: usuario.id,
        atualizadoPorNome: usuario.nome,
        criadoEm: agora,
        atualizadoEm: agora,
        removidoEm: null,
        pendente: "salvar",
      };
      await gravar(novo);
      setPinSelecionadoId(novo.id);
    }
    setRascunho(null);
  }

  async function removerPin(id) {
    const atual = await buscarPinLocal(id);
    if (!atual) return;
    const agora = new Date().toISOString();
    await gravar({ ...atual, removidoEm: agora, atualizadoEm: agora, pendente: "remover" });
    if (pinSelecionadoId === id) setPinSelecionadoId(null);
  }

  function adicionarNaMinhaLocalizacao() {
    if (!navigator.geolocation) {
      aoAviso?.("Este aparelho não oferece localização por GPS.");
      return;
    }
    setObtendoGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setObtendoGps(false);
        const precisao = Math.round(pos.coords.accuracy);
        if (precisao > PRECISAO_MAXIMA_GPS && !window.confirm(`A precisão do GPS agora é de ±${precisao} m. Usar mesmo assim?`)) return;
        abrirNovo({ lng: pos.coords.longitude, lat: pos.coords.latitude }, precisao);
      },
      (erro) => {
        setObtendoGps(false);
        aoAviso?.(erro.code === erro.PERMISSION_DENIED ? "Permissão de localização negada." : "Não foi possível obter a localização. Tente de novo.");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  function iniciarMover(id) {
    const map = mapRef.current;
    const pin = pins.find((p) => p.id === id);
    if (!map || !pin || !podeEditar) return;
    marcadorMoverRef.current?.remove();
    marcadorMoverRef.current = new maplibregl.Marker({ draggable: true, color: pin.cor }).setLngLat([pin.lng, pin.lat]).addTo(map);
    setMovendoId(id);
  }

  async function confirmarMover() {
    const marcador = marcadorMoverRef.current;
    const id = movendoId;
    marcadorMoverRef.current = null;
    setMovendoId(null);
    if (!marcador || !id) return;
    const { lng, lat } = marcador.getLngLat();
    marcador.remove();
    const atual = await buscarPinLocal(id);
    if (!atual) return;
    const usuario = sessao.usuario;
    await gravar({ ...atual, lng, lat, atualizadoEm: new Date().toISOString(), atualizadoPor: usuario.id, atualizadoPorNome: usuario.nome, pendente: "salvar" });
  }

  function cancelarMover() {
    marcadorMoverRef.current?.remove();
    marcadorMoverRef.current = null;
    setMovendoId(null);
  }

  function voarParaPin(id) {
    const map = mapRef.current;
    const pin = pins.find((p) => p.id === id);
    if (!map || !pin) return;
    map.flyTo({ center: [pin.lng, pin.lat], zoom: Math.max(map.getZoom(), 16), duration: 800 });
    selecionarPin(id);
  }

  return {
    pins,
    pinSelecionado: pins.find((p) => p.id === pinSelecionadoId) || null,
    visivel,
    setVisivel,
    layerIds: [CAMADA_PINS],
    selecionarPin,
    fecharPin,
    rascunho,
    abrirNovo,
    abrirEdicao,
    cancelarRascunho,
    salvarRascunho,
    modoAdicionar,
    setModoAdicionar,
    obtendoGps,
    adicionarNaMinhaLocalizacao,
    movendoId,
    iniciarMover,
    confirmarMover,
    cancelarMover,
    removerPin,
    voarParaPin,
  };
}
