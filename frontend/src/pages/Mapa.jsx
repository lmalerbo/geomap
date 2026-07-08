import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { PMTiles, Protocol } from "pmtiles";
import { listarMapasBaixados } from "../lib/db.js";
import { sincronizarMapas } from "../lib/sync.js";
import { BlobSource } from "../lib/pmtilesBlobSource.js";
import { useAuth } from "../context/AuthContext.jsx";

const PALETA = [
  { preenchimento: "#3a8f5f", borda: "#2c6b47" },
  { preenchimento: "#3a6f9f", borda: "#264d73" },
  { preenchimento: "#9f7a3a", borda: "#735826" },
  { preenchimento: "#8a3a9f", borda: "#5f2673" },
];

async function adicionarCamada(map, protocol, mapa, cores) {
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
    paint: { "fill-color": cores.preenchimento, "fill-opacity": 0.35 },
  });
  map.addLayer({
    id: lineLayerId,
    type: "line",
    source: sourceId,
    "source-layer": camadaVetor,
    paint: { "line-color": cores.borda, "line-width": 1.5 },
  });

  return { id: mapa.id, nome: mapa.nome, versao: mapa.versao, sourceId, fillLayerId, lineLayerId, header };
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

  // 1) cria o mapa uma única vez
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

      for (let i = 0; i < mapasLocais.length; i++) {
        const mapa = mapasLocais[i];
        const existente = carregadas.get(mapa.id);
        if (existente && existente.versao === mapa.versao) continue;
        if (existente) removerCamada(map, existente);

        const cores = PALETA[i % PALETA.length];
        const info = await adicionarCamada(map, protocol, mapa, cores);
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
          { padding: 30, duration: 0 }
        );
        jaEnquadrouRef.current = true;
      }
    }

    aplicar();
    return () => {
      cancelado = true;
    };
  }, [mapasLocais, mapaPronto]);

  // 5) liga/desliga camadas
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto) return;
    for (const [id, info] of camadasCarregadasRef.current) {
      if (!map.getLayer(info.fillLayerId)) continue;
      const visivel = camadasVisiveis.has(id) ? "visible" : "none";
      map.setLayoutProperty(info.fillLayerId, "visibility", visivel);
      map.setLayoutProperty(info.lineLayerId, "visibility", visivel);
    }
  }, [camadasVisiveis, mapaPronto, mapasLocais]);

  // 6) clique consolidado em todas as camadas visíveis
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto) return;

    function handleClick(e) {
      const fillLayerIds = [...camadasCarregadasRef.current.values()]
        .map((c) => c.fillLayerId)
        .filter((id) => map.getLayer(id));
      if (fillLayerIds.length === 0) return;

      const features = map.queryRenderedFeatures(e.point, { layers: fillLayerIds });
      if (features.length === 0) return;

      const feature = features[0];
      const info = [...camadasCarregadasRef.current.values()].find(
        (c) => c.fillLayerId === feature.layer.id
      );
      setAtributos({ camada: info?.nome, propriedades: feature.properties });
    }

    map.on("click", handleClick);
    return () => map.off("click", handleClick);
  }, [mapaPronto]);

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
              {m.nome}
            </label>
          ))}
        </aside>
      )}

      {mapasLocais.length === 0 && !sincronizando && (
        <p className="aviso-sem-mapas">
          Nenhum mapa disponível ainda. Conecte-se à internet pra sincronizar.
        </p>
      )}

      {atributos && (
        <aside className="painel-atributos">
          <button type="button" className="fechar" onClick={() => setAtributos(null)}>
            ×
          </button>
          <h2>{atributos.camada}</h2>
          <dl>
            {Object.entries(atributos.propriedades).map(([chave, valor]) => (
              <div key={chave} className="linha-atributo">
                <dt>{chave}</dt>
                <dd>{String(valor)}</dd>
              </div>
            ))}
          </dl>
        </aside>
      )}
    </main>
  );
}
