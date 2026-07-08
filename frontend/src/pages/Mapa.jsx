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

  // Sem campo de estilo explícito no schema ainda — decide pela presença do
  // campo TALHAO no próprio metadata: camadas de talhão ganham preenchimento
  // + rótulo com zoom mais alto; as demais (limites/contornos) ficam só com
  // a linha + rótulo (nome) a partir de um zoom mais baixo.
  const campos = camadaPrincipal.fields || {};
  const ehTalhao = "TALHAO" in campos;
  const opacidadePreenchimento = ehTalhao ? 0.35 : 0;
  const zoomRotulo = ehTalhao ? 13 : 10;

  const sourceId = `fonte-${mapa.id}`;
  const fillLayerId = `camada-${mapa.id}-preenchimento`;
  const lineLayerId = `camada-${mapa.id}-borda`;
  const rotuloLayerId = `camada-${mapa.id}-rotulo`;
  const highlightLayerId = `camada-${mapa.id}-highlight`;
  const cor = corDaCamada(mapa.id);

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

  if (temRotulos) {
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
    cor,
    opacidadePreenchimento,
    sourceId,
    fillLayerId,
    lineLayerId,
    highlightLayerId,
    rotuloLayerId: temRotulos ? rotuloLayerId : null,
    // Camadas de contorno (sem preenchimento, ex: Limites) são só visuais +
    // rótulo de nome — não abrem painel de atributos ao clicar.
    consultavel: ehTalhao,
    header,
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
          propriedades: feature.properties,
          grupoFiltro: construirFiltroGrupo(feature.properties),
        });
      }
      if (itens.length === 0) return;

      setSelecao({ lngLat: e.lngLat, itens, indice: 0 });
    }

    map.on("click", handleClick);
    return () => map.off("click", handleClick);
  }, [mapaPronto, camadasVisiveis]);

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

  const itemSelecionado = selecao?.itens[selecao.indice];

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
        <button type="button" className="botao-sair" onClick={handleSair}>
          Sair
        </button>
      </header>

      <div className="area-mapa">
        <div ref={containerRef} className="mapa-container" />

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
            </div>
          </aside>
        )}

        {mapasLocais.length === 0 && !sincronizando && (
          <p className="aviso-sem-mapas">
            Nenhum mapa disponível ainda. Conecte-se à internet pra sincronizar.
          </p>
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
