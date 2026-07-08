import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { PMTiles, Protocol } from "pmtiles";
import { listarMapasBaixados } from "../lib/db.js";
import { sincronizarMapas } from "../lib/sync.js";
import { BlobSource } from "../lib/pmtilesBlobSource.js";
import { useAuth } from "../context/AuthContext.jsx";

// Paleta categórica validada (dataviz skill): ordem fixa, checada pra
// separação CVD e contraste contra o fundo do mapa. A cor é atribuída pelo
// id do mapa (identidade), nunca pela posição na lista — assim uma camada
// não muda de cor só porque outra camada foi sincronizada antes/depois.
const PALETA_HEX = [
  "#2a78d6", // azul
  "#1baf7a", // água
  "#eda100", // amarelo
  "#008300", // verde
  "#4a3aa7", // violeta
  "#e34948", // vermelho
  "#e87ba4", // magenta
  "#eb6834", // laranja
];

function corDaCamada(mapaId) {
  return PALETA_HEX[mapaId % PALETA_HEX.length];
}

async function adicionarCamada(map, protocol, mapa) {
  const source = new BlobSource(`mapa-${mapa.id}-${mapa.versao}`, mapa.blob);
  const pmtiles = new PMTiles(source);
  protocol.add(pmtiles);

  const header = await pmtiles.getHeader();
  const metadata = await pmtiles.getMetadata();
  const camadaVetor = metadata?.vector_layers?.[0]?.id;
  if (!camadaVetor) return null;

  const sourceId = `fonte-${mapa.id}`;
  const fillLayerId = `camada-${mapa.id}-preenchimento`;
  const lineLayerId = `camada-${mapa.id}-borda`;
  const cor = corDaCamada(mapa.id);

  // Idempotente: efeitos concorrentes (carga inicial offline-first + sync em
  // segundo plano) podem tentar aplicar a mesma camada quase ao mesmo tempo.
  if (map.getLayer(fillLayerId)) map.removeLayer(fillLayerId);
  if (map.getLayer(lineLayerId)) map.removeLayer(lineLayerId);
  if (map.getSource(sourceId)) map.removeSource(sourceId);

  map.addSource(sourceId, { type: "vector", url: `pmtiles://${source.getKey()}` });
  map.addLayer({
    id: fillLayerId,
    type: "fill",
    source: sourceId,
    "source-layer": camadaVetor,
    paint: {
      "fill-color": cor,
      "fill-opacity": 0.35,
      "fill-opacity-transition": { duration: 300 },
    },
  });
  map.addLayer({
    id: lineLayerId,
    type: "line",
    source: sourceId,
    "source-layer": camadaVetor,
    paint: {
      "line-color": cor,
      "line-width": 1.5,
      "line-opacity": 1,
      "line-opacity-transition": { duration: 300 },
    },
  });

  return { id: mapa.id, nome: mapa.nome, versao: mapa.versao, cor, sourceId, fillLayerId, lineLayerId, header };
}

function removerCamada(map, info) {
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

  const [mapaPronto, setMapaPronto] = useState(false);
  const [mapasLocais, setMapasLocais] = useState([]);
  const [camadasVisiveis, setCamadasVisiveis] = useState(new Set());
  const [sincronizando, setSincronizando] = useState(true);
  const [ultimaSincronizacao, setUltimaSincronizacao] = useState(null);
  const [offline, setOffline] = useState(false);
  const [atributos, setAtributos] = useState(null);

  // 1) cria o mapa uma única vez, com controles de navegação e localização
  useEffect(() => {
    const protocol = new Protocol();
    maplibregl.addProtocol("pmtiles", protocol.tile);
    protocolRef.current = protocol;

    const map = new maplibregl.Map({
      container: containerRef.current,
      style: {
        version: 8,
        sources: {},
        layers: [{ id: "fundo", type: "background", paint: { "background-color": "#e8eef1" } }],
      },
      center: [-47.9, -22.0],
      zoom: 9,
    });
    mapRef.current = map;
    if (import.meta.env.DEV) window.__map = map;

    map.addControl(new maplibregl.NavigationControl({ showCompass: true }), "top-right");
    map.addControl(
      new maplibregl.GeolocateControl({
        positionOptions: { enableHighAccuracy: true },
        trackUserLocation: true,
        showUserHeading: true,
      }),
      "top-right"
    );

    map.on("load", () => setMapaPronto(true));

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

      for (const [id, info] of carregadas) {
        if (!idsAtuais.has(id)) {
          removerCamada(map, info);
          carregadas.delete(id);
        }
      }

      for (const mapa of mapasLocais) {
        const existente = carregadas.get(mapa.id);
        if (existente && existente.versao === mapa.versao) continue;
        if (existente) removerCamada(map, existente);

        const info = await adicionarCamada(map, protocol, mapa);
        if (cancelado) return;
        if (info) carregadas.set(mapa.id, info);
      }

      const headers = [...carregadas.values()].map((c) => c.header);
      if (headers.length > 0 && !jaEnquadrouRef.current) {
        const minLon = Math.min(...headers.map((h) => h.minLon));
        const minLat = Math.min(...headers.map((h) => h.minLat));
        const maxLon = Math.max(...headers.map((h) => h.maxLon));
        const maxLat = Math.max(...headers.map((h) => h.maxLat));
        map.fitBounds(
          [
            [minLon, minLat],
            [maxLon, maxLat],
          ],
          { padding: 40, duration: 900 }
        );
        jaEnquadrouRef.current = true;
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
      map.setPaintProperty(info.fillLayerId, "fill-opacity", visivel ? 0.35 : 0);
      map.setPaintProperty(info.lineLayerId, "line-opacity", visivel ? 1 : 0);
    }
  }, [camadasVisiveis, mapaPronto, mapasLocais]);

  // 6) clique consolidado nas camadas visíveis
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto) return;

    function handleClick(e) {
      const fillLayerIds = [...camadasCarregadasRef.current.entries()]
        .filter(([id]) => camadasVisiveis.has(id))
        .map(([, info]) => info.fillLayerId)
        .filter((id) => map.getLayer(id));
      if (fillLayerIds.length === 0) return;

      const features = map.queryRenderedFeatures(e.point, { layers: fillLayerIds });
      if (features.length === 0) return;

      const feature = features[0];
      const info = [...camadasCarregadasRef.current.values()].find(
        (c) => c.fillLayerId === feature.layer.id
      );
      setAtributos({ camada: info?.nome, cor: info?.cor, propriedades: feature.properties });
    }

    map.on("click", handleClick);
    return () => map.off("click", handleClick);
  }, [mapaPronto, camadasVisiveis]);

  function alternarCamada(id) {
    setCamadasVisiveis((atual) => {
      const nova = new Set(atual);
      if (nova.has(id)) nova.delete(id);
      else nova.add(id);
      return nova;
    });
  }

  function handleSair() {
    sair();
    navigate("/login");
  }

  return (
    <main className="tela-mapa">
      <header className="barra-mapa">
        <strong>GeoPortal</strong>
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
        <button type="button" className="botao-sair" onClick={handleSair}>
          Sair
        </button>
      </header>

      <div className="area-mapa">
        <div ref={containerRef} className="mapa-container" />

        {mapasLocais.length > 0 && (
          <aside className="painel-camadas">
            <h2>Camadas</h2>
            {mapasLocais.map((m) => (
              <label key={m.id} className="linha-camada">
                <input
                  type="checkbox"
                  checked={camadasVisiveis.has(m.id)}
                  onChange={() => alternarCamada(m.id)}
                />
                <span className="swatch-camada" style={{ backgroundColor: corDaCamada(m.id) }} />
                <span className="nome-camada">{m.nome}</span>
              </label>
            ))}
          </aside>
        )}

        {mapasLocais.length === 0 && !sincronizando && (
          <p className="aviso-sem-mapas">
            Nenhum mapa disponível ainda. Conecte-se à internet pra sincronizar.
          </p>
        )}

        <aside className={`painel-atributos${atributos ? " painel-atributos--aberto" : ""}`}>
          {atributos && (
            <>
              <button type="button" className="fechar" onClick={() => setAtributos(null)}>
                ×
              </button>
              <h2>
                <span className="swatch-camada" style={{ backgroundColor: atributos.cor }} />
                {atributos.camada}
              </h2>
              <dl>
                {Object.entries(atributos.propriedades).map(([chave, valor]) => (
                  <div key={chave} className="linha-atributo">
                    <dt>{chave}</dt>
                    <dd>{String(valor)}</dd>
                  </div>
                ))}
              </dl>
            </>
          )}
        </aside>
      </div>
    </main>
  );
}
