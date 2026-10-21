import { useEffect, useRef, useState } from "react";
import { buscarPlanejamentos } from "../lib/api.js";
import { salvarPlanejamentosLocal, buscarPlanejamentosLocal } from "../lib/db.js";
import { corDoDia, filtrarDeHojeEmDiante, rotuloDia } from "../lib/planejamentoVoo.js";

// Polígonos do planejamento de voos no mapa (ver
// docs/superpowers/specs/2026-10-16-planejamento-voos-design.md). Mesmo
// padrão de useApontamentoVoo: a cópia do aparelho aparece primeiro, o
// servidor atualiza depois. As camadas MapLibre são criadas abaixo da
// camada de voos e depois só recebem setData/visibility.
const FONTE = "planejamento-voo";
const CAMADA_PREENCHIMENTO = "planejamento-preenchimento";
const CAMADA_CONTORNO = "planejamento-contorno";
const CAMADA_ROTULO = "planejamento-rotulo";
const CAMADAS = [CAMADA_PREENCHIMENTO, CAMADA_CONTORNO, CAMADA_ROTULO];

function ordenar(lista) {
  return [...lista].sort((a, b) => a.data.localeCompare(b.data));
}

function dadosGeoJSON(lista) {
  return {
    type: "FeatureCollection",
    features: lista.map((p) => ({
      type: "Feature",
      properties: { id: p.id, data: p.data, rotulo: rotuloDia(p.data), cor: corDoDia(p.data) },
      geometry: p.poligono,
    })),
  };
}

// Pode ser chamado com o mapa já desmontado ou com o estilo ainda carregando
// (map.getLayer lança exceção nesse caso) — por isso o try/catch.
function removerCamadas(map) {
  try {
    for (const id of CAMADAS) if (map.getLayer(id)) map.removeLayer(id);
    if (map.getSource(FONTE)) map.removeSource(FONTE);
  } catch {
    // mapa já destruído: nada a remover
  }
}

// `voosInfo` é o mesmo que useApontamentoVoo recebe (null fora do mapa de
// voos). Sem ele, o hook não busca nem desenha nada.
export function usePlanejamentos(mapRef, mapaPronto, voosInfo, mapaId, token) {
  const [planejamentos, setPlanejamentos] = useState([]); // só de hoje em diante
  const [selecionado, setSelecionado] = useState(null);
  const [visivel, setVisivel] = useState(true);
  const [versaoBusca, setVersaoBusca] = useState(0);
  // Espelho da lista atual: selecionarPorId (chamado pelo clique no mapa)
  // acha o item sem depender de um render recente.
  const listaRef = useRef([]);

  function mostrar(itens) {
    const lista = filtrarDeHojeEmDiante(ordenar(itens));
    listaRef.current = lista;
    setPlanejamentos(lista);
  }

  function salvarLista(itens) {
    mostrar(itens);
    if (mapaId) {
      salvarPlanejamentosLocal(mapaId, listaRef.current).catch((e) => console.warn("Falha ao guardar planejamentos", e));
    }
  }

  // 1) cópia do aparelho primeiro; depois o servidor. Sem rede, fica a cópia.
  useEffect(() => {
    if (!voosInfo || !mapaId || !token) return;
    let cancelado = false;

    async function carregar() {
      const copia = await buscarPlanejamentosLocal(mapaId).catch(() => null);
      if (cancelado) return;
      if (copia) mostrar(copia.itens);

      try {
        const lista = await buscarPlanejamentos(token, mapaId);
        if (cancelado) return;
        mostrar(lista);
        salvarPlanejamentosLocal(mapaId, lista).catch((e) => console.warn("Falha ao guardar planejamentos", e));
      } catch (err) {
        console.error("Erro ao buscar planejamentos de voo:", err);
      }
    }

    carregar();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voosInfo, mapaId, token, versaoBusca]);

  // 2) tira as camadas quando a camada de voos sai (troca de mapa,
  // reconstrução do estilo). O React roda essa limpeza antes de recriar.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto || !voosInfo) return undefined;
    return () => removerCamadas(map);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapaPronto, voosInfo]);

  // 3) cria fonte e camadas na primeira vez (abaixo da camada de voos);
  // depois só setData. Liga/desliga mexe só na visibilidade.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto || !voosInfo) return;
    try {
      const dados = dadosGeoJSON(planejamentos);
      const fonte = map.getSource(FONTE);
      if (fonte) {
        fonte.setData(dados);
      } else {
        map.addSource(FONTE, { type: "geojson", data: dados });
        const antes = voosInfo.fillLayerId && map.getLayer(voosInfo.fillLayerId) ? voosInfo.fillLayerId : undefined;
        map.addLayer(
          {
            id: CAMADA_PREENCHIMENTO,
            type: "fill",
            source: FONTE,
            paint: { "fill-color": ["get", "cor"], "fill-opacity": 0.12 },
          },
          antes
        );
        map.addLayer(
          {
            id: CAMADA_CONTORNO,
            type: "line",
            source: FONTE,
            paint: { "line-color": ["get", "cor"], "line-width": 2.5, "line-dasharray": [2, 1.5] },
          },
          antes
        );
        map.addLayer(
          {
            id: CAMADA_ROTULO,
            type: "symbol",
            source: FONTE,
            layout: {
              "text-field": ["get", "rotulo"],
              "text-font": ["Noto Sans Regular"],
              "text-size": 15,
              "symbol-placement": "point",
            },
            paint: { "text-color": "#1e293b", "text-halo-color": "#ffffff", "text-halo-width": 2 },
          },
          antes
        );
      }
      const visibility = visivel ? "visible" : "none";
      for (const id of CAMADAS) {
        if (map.getLayer(id)) map.setLayoutProperty(id, "visibility", visibility);
      }
    } catch (err) {
      console.warn("Falha ao desenhar planejamentos de voo", err);
    }
  }, [mapRef, mapaPronto, voosInfo, planejamentos, visivel]);

  function selecionarPorId(id) {
    setSelecionado(listaRef.current.find((p) => p.id === id) || null);
  }

  function recarregar() {
    setVersaoBusca((v) => v + 1);
  }

  // Alterações feitas pelo admin (ver Tarefa 6): atualizam a tela e a cópia
  // do aparelho sem esperar a próxima busca.
  function adicionarLocal(planejamento) {
    salvarLista([...listaRef.current.filter((p) => p.id !== planejamento.id), planejamento]);
  }

  function atualizarLocal(planejamento) {
    salvarLista(listaRef.current.map((p) => (p.id === planejamento.id ? planejamento : p)));
    setSelecionado((s) => (s && s.id === planejamento.id ? planejamento : s));
  }

  function removerLocal(id) {
    salvarLista(listaRef.current.filter((p) => p.id !== id));
    setSelecionado((s) => (s && s.id === id ? null : s));
  }

  return {
    planejamentos,
    selecionado,
    setSelecionado,
    selecionarPorId,
    visivel,
    setVisivel,
    recarregar,
    adicionarLocal,
    atualizarLocal,
    removerLocal,
  };
}
