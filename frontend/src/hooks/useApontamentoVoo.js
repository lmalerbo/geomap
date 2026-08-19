import { useEffect, useRef, useState } from "react";
import { CORES_FERRAMENTAS } from "../lib/coresFerramentas.js";
import { buscarVoosPendentes, apontarVoos } from "../lib/api.js";

const FONTE_SELECAO = "fonte-voos-selecao";
const CAMADA_SELECAO = "camada-voos-selecao";

// Chave usada tanto pra indexar `pendentes` quanto pra montar a expressão
// MapLibre (["concat", ["get","SECAO"], "-", ["get","TALHAO"]]) — precisa
// ser idêntica dos dois lados pro "match" bater. Mesmo padrão já usado em
// talhoesPorDesc (Mapa.jsx).
function chave(secao, talhao) {
  return `${secao}-${talhao}`;
}

// Ferramenta de apontamento de voo pelo mapa (ver
// docs/INTEGRACAO_DRONEMANAGEMENT.md) — mesmo espírito de useMedicao.js/
// useTrackLog.js: `mapRef`/`mapaPronto` vêm de fora (mapa único do
// componente pai). `voosInfo` é o `info` (de camadasCarregadasRef) da
// camada com `tipoCamada === "voos"`, ou `null` enquanto ela não carregou/
// não existe nesse mapa — a maioria dos efeitos abaixo não faz nada sem
// ela. `mapaId`/`token` são pra chamar o backend (GET /voos/pendentes,
// POST /voos/apontamentos).
export function useApontamentoVoo(mapRef, mapaPronto, voosInfo, mapaId, token) {
  const [pendentes, setPendentes] = useState([]); // [{id, secao, talhao, controlStatus, verifyFlightSize}]
  const [modoApontamento, setModoApontamento] = useState(false);
  const [selecionados, setSelecionados] = useState(new Map()); // chave -> registro pendente
  const [dataVoo, setDataVoo] = useState(() => new Date().toISOString().slice(0, 10));
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null); // {sucesso, falha} do último envio, pro painel mostrar

  const pendentesPorChaveRef = useRef(new Map());

  // 1) busca os pendentes quando a camada "voos" fica disponível (troca de
  // mapa, ou a camada muda de assinatura — ver adicionarCamada).
  useEffect(() => {
    if (!voosInfo || !mapaId || !token) return;
    let cancelado = false;
    buscarVoosPendentes(token, mapaId)
      .then((dados) => {
        if (cancelado) return;
        setPendentes(dados);
        pendentesPorChaveRef.current = new Map(dados.map((r) => [chave(r.secao, r.talhao), r]));
      })
      .catch((err) => console.error("Erro ao buscar voos pendentes:", err));
    return () => {
      cancelado = true;
    };
  }, [voosInfo?.id, voosInfo?.assinatura, mapaId, token]);

  // 2) colore a camada "voos" por status (persistente, sempre visível
  // enquanto a camada existir) — sobrescreve o fill-color/line-color que
  // adicionarCamada já aplicou, direto na camada carregada. Roda de novo
  // sempre que a lista de pendentes muda (ex: depois de confirmar um lote).
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !voosInfo) return;

    const chaves = pendentes.map((r) => chave(r.secao, r.talhao));
    const expressaoCor = [
      "match",
      ["concat", ["get", "SECAO"], "-", ["get", "TALHAO"]],
      chaves.length > 0 ? chaves : ["__nenhum__"],
      CORES_FERRAMENTAS.vooPendente,
      "rgba(0,0,0,0)",
    ];

    if (voosInfo.fillLayerId && map.getLayer(voosInfo.fillLayerId)) {
      map.setPaintProperty(voosInfo.fillLayerId, "fill-color", expressaoCor);
      map.setPaintProperty(voosInfo.fillLayerId, "fill-opacity", 0.55);
    }
    if (voosInfo.lineLayerId && map.getLayer(voosInfo.lineLayerId)) {
      map.setPaintProperty(voosInfo.lineLayerId, "line-color", expressaoCor);
      map.setPaintProperty(voosInfo.lineLayerId, "line-opacity", 1);
    }
  }, [pendentes, voosInfo, mapRef]);

  // 3) fonte/camada própria pra destacar os talhões selecionados no lote
  // em andamento — deliberadamente NÃO reaproveita o highlightLayerId
  // compartilhado (Mapa.jsx efeito 7 zera ele a cada clique/busca, o que
  // apagaria a seleção do lote no meio do apontamento). Fica montada só
  // enquanto o modo estiver ligado.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !voosInfo) return;
    if (!modoApontamento) {
      if (map.getLayer(CAMADA_SELECAO)) map.removeLayer(CAMADA_SELECAO);
      if (map.getSource(FONTE_SELECAO)) map.removeSource(FONTE_SELECAO);
      return;
    }

    map.addSource(FONTE_SELECAO, {
      type: "vector",
      url: map.getSource(voosInfo.sourceId)?.url,
      minzoom: voosInfo.header?.minZoom,
      maxzoom: voosInfo.header?.maxZoom,
    });
    map.addLayer({
      id: CAMADA_SELECAO,
      type: "line",
      source: FONTE_SELECAO,
      "source-layer": voosInfo.sourceLayerPrincipal,
      paint: { "line-color": CORES_FERRAMENTAS.vooSelecionado, "line-width": 4 },
      filter: ["==", ["literal", 1], ["literal", 2]], // nada selecionado ainda
    });

    return () => {
      if (map.getLayer(CAMADA_SELECAO)) map.removeLayer(CAMADA_SELECAO);
      if (map.getSource(FONTE_SELECAO)) map.removeSource(FONTE_SELECAO);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoApontamento, voosInfo?.id]);

  // 4) atualiza o filtro da camada de seleção a cada talhão marcado/
  // desmarcado — sem recriar fonte/camada.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !map.getLayer(CAMADA_SELECAO)) return;
    const chaves = [...selecionados.keys()];
    map.setFilter(
      CAMADA_SELECAO,
      chaves.length > 0
        ? ["match", ["concat", ["get", "SECAO"], "-", ["get", "TALHAO"]], chaves, true, false]
        : ["==", ["literal", 1], ["literal", 2]]
    );
  }, [selecionados, mapRef]);

  function iniciarModo() {
    setSelecionados(new Map());
    setResultado(null);
    setModoApontamento(true);
  }

  function cancelarModo() {
    setModoApontamento(false);
    setSelecionados(new Map());
  }

  // Chamado pelo handler de clique do mapa (Mapa.jsx) quando o modo está
  // ligado e a feição clicada é da camada "voos" — ignora talhão que não
  // está pendente (nada a apontar nele).
  function alternarSelecao(propriedades) {
    const registro = pendentesPorChaveRef.current.get(chave(propriedades.SECAO, propriedades.TALHAO));
    if (!registro) return;
    setSelecionados((atual) => {
      const chaveAtual = chave(registro.secao, registro.talhao);
      const novo = new Map(atual);
      if (novo.has(chaveAtual)) novo.delete(chaveAtual);
      else novo.set(chaveAtual, registro);
      return novo;
    });
  }

  // Melhor-esforço por talhão (ver POST /voos/apontamentos) — nunca
  // tudo-ou-nada, o backend já separa sucesso de falha. Remove da lista de
  // pendentes só quem teve sucesso, então a coloração (efeito 2) reflete
  // na hora sem precisar buscar tudo de novo do DroneManagement.
  async function confirmarLote() {
    if (selecionados.size === 0 || !mapaId) return;
    setEnviando(true);
    setResultado(null);
    try {
      const registros = [...selecionados.values()].map((r) => ({ id: r.id, secao: r.secao, talhao: r.talhao }));
      const resposta = await apontarVoos(token, { mapaId, dataVoo, registros });
      setResultado(resposta);
      const sucessoIds = new Set(resposta.sucesso);
      setPendentes((atual) => atual.filter((r) => !sucessoIds.has(r.id)));
      setSelecionados(new Map());
      setModoApontamento(false);
    } catch (err) {
      setResultado({ sucesso: [], falha: [{ erro: err.message }] });
    } finally {
      setEnviando(false);
    }
  }

  return {
    pendentes,
    modoApontamento,
    selecionados,
    dataVoo,
    setDataVoo,
    enviando,
    resultado,
    iniciarModo,
    cancelarModo,
    alternarSelecao,
    confirmarLote,
  };
}
