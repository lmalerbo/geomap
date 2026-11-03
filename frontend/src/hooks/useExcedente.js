import { useEffect, useMemo, useState, useCallback } from "react";
import { buscarCasosExcedente } from "../lib/api.js";
import { lerCasosExcedente, salvarCasosExcedente, listarFilaExcedente } from "../lib/db.js";
import { filaExcedente, assinarFilaExcedente, enviarExcedentePendentes } from "../lib/filaExcedenteApp.js";
import {
  CORES_EXCEDENTE, COR_CONTORNO_AJUSTADO, casoVigentePorTalhao, aplicarPendentes, contarPorStatus,
} from "../lib/excedente.js";

// Plantio Excedente — mesmo espírito de useApontamentoVoo: a camada Talhões
// marcada com tipoCamada "excedente" é pintada por status; os trechos
// desenhados ficam numa fonte GeoJSON própria. Cópia no aparelho primeiro,
// servidor em segundo plano; apontamento vai sempre pela fila (envia na hora
// se houver sinal).
const FONTE_TRECHOS = "excedente-trechos";
const CAMADA_TRECHOS_FILL = "excedente-trechos-preenchimento";
const CAMADA_TRECHOS_LINHA = "excedente-trechos-contorno";
const CAMADA_AJUSTADO = "excedente-contorno-ajustado";
const INTERVALO_REENVIO_MS = 3 * 60 * 1000;
const chaveExpr = ["concat", ["get", "SECAO"], "-", ["get", "TALHAO"]];
const FILTRO_NENHUM = ["==", ["literal", 1], ["literal", 2]];

function grupoDoStatus(status) {
  return status === "sem_ajuste" || status === "ajustado" ? "concluidos" : status;
}

// Mesma regra de Mapa.jsx: as camadas próprias entram abaixo do primeiro rótulo.
function primeiroRotuloExistente(map) {
  for (const layer of map.getStyle().layers) {
    if (layer.id.endsWith("-rotulo")) return layer.id;
  }
  return undefined;
}

// `visivel`: a camada Talhões está ligada no painel de camadas. Como a
// pintura daqui define a opacidade, o liga/desliga do Mapa.jsx não mexe nela.
// `rascunho`: trecho em edição no cartão (desenhado ou de arquivo), mostrado
// junto dos trechos já gravados.
export function useExcedente(mapRef, mapaPronto, excedenteInfo, mapaId, token, visivel = true, rascunho = null) {
  const [casosServidor, setCasosServidor] = useState(null); // null = nada ainda
  const [itensFila, setItensFila] = useState([]);
  const [filtroStatus, setFiltroStatus] = useState(null);
  const [atualizando, setAtualizando] = useState(false);
  const [avisoAtualizacao, setAvisoAtualizacao] = useState(null);
  const [selecionado, setSelecionado] = useState(null);
  const [versaoBusca, setVersaoBusca] = useState(0);
  const ativo = Boolean(excedenteInfo);
  const mapaIdNum = Number(mapaId);

  const recarregarFila = useCallback(async () => {
    const todos = await listarFilaExcedente();
    setItensFila(todos.filter((i) => i.mapaId === mapaIdNum));
  }, [mapaIdNum]);

  // Cópia do aparelho na hora; servidor depois.
  useEffect(() => {
    if (!ativo) return undefined;
    let cancelado = false;
    (async () => {
      const copia = await lerCasosExcedente(mapaIdNum);
      if (!cancelado && copia && casosServidor === null) setCasosServidor(copia);
      await recarregarFila();
      if (!navigator.onLine) {
        setAvisoAtualizacao("Sem conexão — mostrando a última cópia do aparelho.");
        return;
      }
      setAtualizando(true);
      try {
        const { casos, atualizacao } = await buscarCasosExcedente(token, mapaIdNum);
        if (cancelado) return;
        setCasosServidor(casos);
        await salvarCasosExcedente(mapaIdNum, casos);
        setAvisoAtualizacao(atualizacao === "falhou" ? "Não foi possível buscar voos novos agora." : null);
      } catch {
        if (!cancelado) setAvisoAtualizacao("Não foi possível atualizar agora — mostrando a última cópia do aparelho.");
      } finally {
        if (!cancelado) setAtualizando(false);
      }
    })();
    return () => {
      cancelado = true;
    };
    // casosServidor fora das dependências de propósito: só a 1ª leitura usa a cópia.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ativo, mapaIdNum, token, versaoBusca, recarregarFila]);

  const enviarFila = useCallback(async () => {
    if (!navigator.onLine) return;
    const r = await enviarExcedentePendentes(token);
    if (r.enviados > 0) setVersaoBusca((v) => v + 1);
  }, [token]);

  // Envio ao reconectar, a cada 3 min enquanto houver fila, e quando a fila muda.
  useEffect(() => {
    if (!ativo) return undefined;
    const cancelarAssinatura = assinarFilaExcedente((detalhe) => {
      // Casos atualizados na resposta do envio: troca a cópia antes de tirar
      // o item da fila da tela, senão o status antigo volta por um instante.
      const doMapa = detalhe?.casosPorMapa?.[mapaIdNum];
      if (doMapa) setCasosServidor(doMapa);
      recarregarFila();
    });
    const aoVoltar = () => enviarFila();
    window.addEventListener("online", aoVoltar);
    const intervalo = setInterval(() => enviarFila(), INTERVALO_REENVIO_MS);
    enviarFila();
    return () => {
      cancelarAssinatura();
      window.removeEventListener("online", aoVoltar);
      clearInterval(intervalo);
    };
  }, [ativo, enviarFila, recarregarFila, mapaIdNum]);

  const casos = useMemo(() => aplicarPendentes(casosServidor || [], itensFila), [casosServidor, itensFila]);
  const casoPorChave = useMemo(() => casoVigentePorTalhao(casos), [casos]);
  const contagem = useMemo(() => contarPorStatus([...casoPorChave.values()]), [casoPorChave]);
  // O que está pintado na tela agora (camada ligada e status no filtro): o
  // clique só abre caso daqui.
  const casoPorChaveVisivel = useMemo(() => {
    if (!visivel) return new Map();
    if (!filtroStatus) return casoPorChave;
    return new Map([...casoPorChave].filter(([, c]) => filtroStatus.has(grupoDoStatus(c.status))));
  }, [casoPorChave, filtroStatus, visivel]);

  // Pinta a camada Talhões por status + contorno do ajustado + trechos.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto || !excedenteInfo) return;
    const beforeId = primeiroRotuloExistente(map);
    const ramosCor = [];
    const chavesAjustado = [];
    const porCor = new Map();
    for (const [k, c] of casoPorChaveVisivel) {
      const cor = CORES_EXCEDENTE[c.status];
      if (!porCor.has(cor)) porCor.set(cor, []);
      porCor.get(cor).push(k);
      if (c.status === "ajustado") chavesAjustado.push(k);
    }
    for (const [cor, chaves] of porCor) ramosCor.push(chaves, cor);
    const transparente = "rgba(0,0,0,0)";
    if (excedenteInfo.fillLayerId && map.getLayer(excedenteInfo.fillLayerId)) {
      map.setPaintProperty(excedenteInfo.fillLayerId, "fill-color", ramosCor.length ? ["match", chaveExpr, ...ramosCor, transparente] : transparente);
      map.setPaintProperty(excedenteInfo.fillLayerId, "fill-opacity", 0.55);
    }

    if (!map.getLayer(CAMADA_AJUSTADO)) {
      map.addLayer(
        {
          id: CAMADA_AJUSTADO,
          type: "line",
          source: excedenteInfo.sourceId,
          "source-layer": excedenteInfo.sourceLayerPrincipal,
          paint: { "line-color": COR_CONTORNO_AJUSTADO, "line-width": 3 },
        },
        beforeId,
      );
    }
    map.setFilter(CAMADA_AJUSTADO, chavesAjustado.length ? ["match", chaveExpr, chavesAjustado, true, false] : FILTRO_NENHUM);

    const features = [];
    for (const c of casoPorChaveVisivel.values()) {
      if (!c.poligonoExcedente) continue;
      features.push({ type: "Feature", properties: { casoId: c.id, aberto: c.status === "precisa_ajuste" }, geometry: c.poligonoExcedente });
    }
    if (rascunho) features.push({ type: "Feature", properties: { casoId: null, aberto: true }, geometry: rascunho });
    const dados = { type: "FeatureCollection", features };
    if (map.getSource(FONTE_TRECHOS)) {
      map.getSource(FONTE_TRECHOS).setData(dados);
    } else {
      map.addSource(FONTE_TRECHOS, { type: "geojson", data: dados });
      map.addLayer(
        {
          id: CAMADA_TRECHOS_FILL,
          type: "fill",
          source: FONTE_TRECHOS,
          filter: ["==", ["get", "aberto"], true],
          paint: { "fill-color": CORES_EXCEDENTE.precisa_ajuste, "fill-opacity": 0.35 },
        },
        beforeId,
      );
      map.addLayer(
        {
          id: CAMADA_TRECHOS_LINHA,
          type: "line",
          source: FONTE_TRECHOS,
          paint: { "line-color": CORES_EXCEDENTE.precisa_ajuste, "line-width": 2, "line-dasharray": [2, 1.5] },
        },
        beforeId,
      );
    }
  }, [mapRef, mapaPronto, excedenteInfo, casoPorChaveVisivel, rascunho]);

  // Mapa remontou a camada (estilo mudou): as camadas próprias somem junto da fonte.
  useEffect(() => {
    const map = mapRef.current;
    return () => {
      if (!map || !map.getStyle()) return;
      for (const id of [CAMADA_TRECHOS_FILL, CAMADA_TRECHOS_LINHA, CAMADA_AJUSTADO]) if (map.getLayer(id)) map.removeLayer(id);
      if (map.getSource(FONTE_TRECHOS)) map.removeSource(FONTE_TRECHOS);
    };
  }, [mapRef, excedenteInfo?.sourceId]);

  async function apontar({ casoId, status, campos }) {
    const statusAnterior = casos.find((c) => c.id === casoId)?.status ?? null;
    await filaExcedente.enfileirar({ mapaId: mapaIdNum, casoId, status, statusAnterior, campos });
    await recarregarFila();
    enviarFila();
  }

  return {
    casos,
    casoPorChave,
    casoPorChaveVisivel,
    contagem,
    filtroStatus,
    setFiltroStatus,
    carregando: ativo && casosServidor === null && atualizando,
    atualizando,
    avisoAtualizacao,
    itensFila,
    apontar,
    retentar: async (itemId) => {
      await filaExcedente.retentar(itemId);
      enviarFila();
    },
    descartar: filaExcedente.descartar,
    selecionado,
    setSelecionado,
  };
}
