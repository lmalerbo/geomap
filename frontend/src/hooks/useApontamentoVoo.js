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

// map.getLayer() do MapLibre lança exceção (em vez de devolver undefined)
// quando o estilo interno ainda não terminou de carregar — confirmado num
// crash real testando um remount do mapa (troca de mapa via key={mapaId}
// em App.jsx), que derrubava o componente <Mapa> inteiro. `mapaPronto`
// nos efeitos abaixo já reduz a janela disso acontecer, mas essa função
// é o cinto de segurança de verdade — nunca deixa esse erro específico
// escapar pra fora do hook.
function getLayerSeguro(map, id) {
  try {
    return map.getLayer(id);
  } catch {
    return undefined;
  }
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
  const [pendentes, setPendentes] = useState([]); // [{id, projeto, secao, talhao, controlStatus, verifyFlightSize}]
  // Talhões pendentes vêm de qualquer projeto/campanha de voo misturados
  // (ex: "Falhas Plantio", "Projeto Plantio") — pedido explícito do Leo
  // pra poder ver/apontar só um tipo por vez. `null` = mostra todos (não
  // usar Set vazio pra "todos", senão não dava pra distinguir de "nenhum
  // selecionado" depois que o usuário desmarcasse tudo).
  const [filtroProjetos, setFiltroProjetos] = useState(null);
  const [modoApontamento, setModoApontamento] = useState(false);
  const [selecionados, setSelecionados] = useState(new Map()); // chave -> registro pendente
  const [dataVoo, setDataVoo] = useState(() => new Date().toISOString().slice(0, 10));
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null); // {sucesso, falha} do último envio, pro painel mostrar
  // Sem isso, o botão mostrava "0 pendentes" (o valor inicial de
  // `pendentes`) enquanto a busca ainda estava em andamento — indistinguível
  // de "de verdade não tem nenhum pendente". A primeira busca pode demorar
  // bastante (login SSO no DroneManagement, ~30-45s no Render, ver
  // docs/INTEGRACAO_DRONEMANAGEMENT.md), então essa distinção importa de
  // verdade, não é só estética. `erroPendentes` pelo mesmo motivo — antes
  // uma falha só ia pro console, invisível pro usuário.
  const [carregandoPendentes, setCarregandoPendentes] = useState(false);
  const [erroPendentes, setErroPendentes] = useState(null);

  const pendentesPorChaveRef = useRef(new Map());

  // Lista de projetos/campanhas presentes nos pendentes atuais (pra
  // preencher os checkboxes de filtro) — derivado, não state próprio,
  // porque é 100% função de `pendentes`.
  const projetosDisponiveis = [...new Set(pendentes.map((r) => r.projeto).filter(Boolean))].sort();

  // `null` = sem filtro (mostra tudo); com filtro, só os projetos
  // marcados. Também derivado — nunca fica dessincronizado de `pendentes`
  // porque não é state (não existe "esqueceu de recalcular").
  const pendentesFiltrados =
    filtroProjetos == null ? pendentes : pendentes.filter((r) => filtroProjetos.has(r.projeto));

  // 1) busca os pendentes quando a camada "voos" fica disponível (troca de
  // mapa, ou a camada muda de assinatura — ver adicionarCamada).
  useEffect(() => {
    if (!voosInfo || !mapaId || !token) return;
    let cancelado = false;
    setCarregandoPendentes(true);
    setErroPendentes(null);
    setFiltroProjetos(null); // volta pra "todos" ao trocar de camada/mapa
    buscarVoosPendentes(token, mapaId)
      .then((dados) => {
        if (cancelado) return;
        setPendentes(dados);
      })
      .catch((err) => {
        console.error("Erro ao buscar voos pendentes:", err);
        if (!cancelado) setErroPendentes(err.message);
      })
      .finally(() => {
        if (!cancelado) setCarregandoPendentes(false);
      });
    return () => {
      cancelado = true;
    };
  }, [voosInfo?.id, voosInfo?.assinatura, mapaId, token]);

  // Mantém o índice secao-talhao -> registro sempre alinhado com o que
  // está sendo mostrado/colorido no momento (pendentesFiltrados, não a
  // lista bruta) — clicar num talhão escondido pelo filtro não deveria
  // selecionar nada (ver alternarSelecao).
  useEffect(() => {
    pendentesPorChaveRef.current = new Map(pendentesFiltrados.map((r) => [chave(r.secao, r.talhao), r]));
  }, [pendentesFiltrados]);

  // 2) colore a camada "voos" por status (persistente, sempre visível
  // enquanto a camada existir) — sobrescreve o fill-color/line-color que
  // adicionarCamada já aplicou, direto na camada carregada. Roda de novo
  // sempre que a lista de pendentes (ou o filtro de projeto) muda.
  //
  // Enquanto a primeira busca ainda não terminou (carregandoPendentes),
  // NÃO mexe no estilo — antes disso a expressão caía no fallback
  // "chaves vazias" e deixava a camada inteira transparente por até ~90s
  // (login SSO + baixar a camada pela 1ª vez), parecendo "mapa vazio,
  // nada carrega" (bug real reportado pelo Leo). E mesmo depois de
  // carregado, quem NÃO está pendente/filtrado usa a cor que a camada já
  // tinha configurada (`voosInfo.cor`), não transparente — a réplica
  // continua parecendo um mapa de talhões normal, só com os pendentes em
  // destaque, em vez de sumir o resto.
  useEffect(() => {
    const map = mapRef.current;
    // `mapaPronto` (não só `map` truthy) — sem isso, um remount do mapa
    // (troca de mapa, ver key={mapaId} em App.jsx) pode rodar este efeito
    // com um `map` cujo estilo interno ainda não carregou; `map.getLayer`
    // do MapLibre lança exceção nesse estado em vez de devolver
    // undefined, o que derrubava o componente inteiro (confirmado num
    // crash real testando: "Cannot read properties of undefined (reading
    // 'getLayer')", pego pelo ErrorBoundary).
    if (!map || !mapaPronto || !voosInfo || carregandoPendentes) return;

    const chaves = pendentesFiltrados.map((r) => chave(r.secao, r.talhao));
    const corPadrao = voosInfo.cor || "#2a78d6";
    const expressaoCor =
      chaves.length > 0
        ? ["match", ["concat", ["get", "SECAO"], "-", ["get", "TALHAO"]], chaves, CORES_FERRAMENTAS.vooPendente, corPadrao]
        : corPadrao;

    if (voosInfo.fillLayerId && getLayerSeguro(map, voosInfo.fillLayerId)) {
      map.setPaintProperty(voosInfo.fillLayerId, "fill-color", expressaoCor);
      map.setPaintProperty(voosInfo.fillLayerId, "fill-opacity", 0.55);
    }
    if (voosInfo.lineLayerId && getLayerSeguro(map, voosInfo.lineLayerId)) {
      map.setPaintProperty(voosInfo.lineLayerId, "line-color", expressaoCor);
      map.setPaintProperty(voosInfo.lineLayerId, "line-opacity", 1);
    }
  }, [pendentesFiltrados, carregandoPendentes, voosInfo, mapaPronto, mapRef]);

  // 3) fonte/camada própria pra destacar os talhões selecionados no lote
  // em andamento — deliberadamente NÃO reaproveita o highlightLayerId
  // compartilhado (Mapa.jsx efeito 7 zera ele a cada clique/busca, o que
  // apagaria a seleção do lote no meio do apontamento). Fica montada só
  // enquanto o modo estiver ligado.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto || !voosInfo) return;
    if (!modoApontamento) {
      if (getLayerSeguro(map, CAMADA_SELECAO)) map.removeLayer(CAMADA_SELECAO);
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
      if (getLayerSeguro(map, CAMADA_SELECAO)) map.removeLayer(CAMADA_SELECAO);
      if (map.getSource(FONTE_SELECAO)) map.removeSource(FONTE_SELECAO);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoApontamento, voosInfo?.id, mapaPronto]);

  // 4) atualiza o filtro da camada de seleção a cada talhão marcado/
  // desmarcado — sem recriar fonte/camada.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto || !getLayerSeguro(map, CAMADA_SELECAO)) return;
    const chaves = [...selecionados.keys()];
    map.setFilter(
      CAMADA_SELECAO,
      chaves.length > 0
        ? ["match", ["concat", ["get", "SECAO"], "-", ["get", "TALHAO"]], chaves, true, false]
        : ["==", ["literal", 1], ["literal", 2]]
    );
  }, [selecionados, mapaPronto, mapRef]);

  // `filtroProjetos` só vira um Set concreto no primeiro toggle — parte de
  // "todos marcados" (não do vazio) pra desmarcar 1 projeto excluir só
  // ele, não esconder tudo de repente.
  function alternarFiltroProjeto(nome) {
    setFiltroProjetos((atual) => {
      const base = atual ?? new Set(projetosDisponiveis);
      const novo = new Set(base);
      if (novo.has(nome)) novo.delete(nome);
      else novo.add(nome);
      return novo;
    });
  }

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
    pendentesFiltrados,
    projetosDisponiveis,
    filtroProjetos,
    alternarFiltroProjeto,
    carregandoPendentes,
    erroPendentes,
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
