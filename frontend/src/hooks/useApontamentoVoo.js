import { useEffect, useRef, useState } from "react";
import { CORES_FERRAMENTAS } from "../lib/coresFerramentas.js";
import { buscarVoosPendentes, apontarVoos } from "../lib/api.js";

const FONTE_SELECAO = "fonte-voos-selecao";
const CAMADA_SELECAO = "camada-voos-selecao";
const FILTRO_NENHUM = ["==", ["literal", 1], ["literal", 2]];
const TEMPO_CONFIRMACAO_MS = 4000;

// Talhão com 2+ tipos de voo pendentes ao mesmo tempo: em vez de uma cor
// única de "múltiplo" (que não diz QUAIS tipos são), desenha um contorno
// concêntrico por tipo via line-offset, cada um na cor real do seu tipo —
// decisão confirmada com o Leo (2026-08-20). Alternar cores num único
// traço tracejado foi cogitado primeiro e descartado: o MapLibre não tem
// controle de fase de tracejado (duas camadas com o mesmo line-dasharray
// desenham exatamente nas mesmas posições, uma cobre a outra por
// completo) nem line-gradient sobre fonte vector-tile (line-gradient só
// funciona com GeoJSON+lineMetrics) — anéis concêntricos são a
// alternativa que funciona de forma confiável pra qualquer quantidade de
// tipos.
const CAMADA_ANEL_PREFIXO = "camada-voos-anel-";
const MAX_ANEIS_MULTIPLO = 6;
const LARGURA_ANEL = 2.5;
const PASSO_OFFSET_ANEL = 2.5;

function idCamadaAnel(indice) {
  return `${CAMADA_ANEL_PREFIXO}${indice}`;
}

// Anel 0 fica exatamente na borda real do talhão (mesma posição visual do
// contorno de 1 tipo só, pra não "pular" quando um segundo tipo passa a
// existir ou deixa de existir); os seguintes alternam pra fora/dentro em
// passos crescentes.
function offsetAnel(indice) {
  if (indice === 0) return 0;
  const grupo = Math.ceil(indice / 2);
  const sinal = indice % 2 === 1 ? 1 : -1;
  return sinal * grupo * PASSO_OFFSET_ANEL;
}

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

// Cor e ordem fixas por tipo de voo — pedido explícito do Leo (2026-08-20)
// depois de ver a primeira versão (cor por hash do nome, sem ordem
// específica). Nomes vêm literais de flightProjectDetails.description no
// DroneManagement (ver docs/INTEGRACAO_DRONEMANAGEMENT.md) — os 9 valores
// reais confirmados nos dados de produção.
const ORDEM_E_COR_TIPO_VOO = [
  ["Falhas Plantio", "#16a34a"], // verde
  ["Falhas Soca", "#eab308"], // amarelo
  ["Sistematização", "#ffffff"], // branco (Sistematização/Expansão)
  ["Ervas Daninhas", "#dc2626"], // vermelho
  ["Drone Aplicação", "#ccff00"], // amarelo florescente
  ["Ambiental", "#ec4899"], // rosa
  ["Experimentação Agrícola", "#9333ea"], // roxo
  ["Levantamento Topográfico", "#c19a6b"], // marrom claro
  ["Projeto Plantio", "#2563eb"], // azul
];
const INDICE_ORDEM_TIPO_VOO = new Map(ORDEM_E_COR_TIPO_VOO.map(([nome], i) => [nome, i]));
const COR_POR_TIPO_VOO = new Map(ORDEM_E_COR_TIPO_VOO);

// Fallback só pra um tipo novo que apareça no DroneManagement e ainda não
// tenha entrado na lista fixa acima — cor por hash do nome (nunca some/
// undefined), até alguém adicionar a cor de verdade na lista.
function corPorProjeto(nome) {
  if (COR_POR_TIPO_VOO.has(nome)) return COR_POR_TIPO_VOO.get(nome);
  let h = 0;
  for (let i = 0; i < nome.length; i++) h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  const paletaFallback = ["#2a78d6", "#1baf7a", "#4a3aa7", "#e87ba4", "#eb6834"];
  return paletaFallback[h % paletaFallback.length];
}

// Ordem fixa (ORDEM_E_COR_TIPO_VOO acima); tipo desconhecido (fora da
// lista) vai pro fim, em ordem alfabética entre si.
function ordenarTiposVoo(nomes) {
  return [...nomes].sort((a, b) => {
    const ia = INDICE_ORDEM_TIPO_VOO.get(a) ?? Infinity;
    const ib = INDICE_ORDEM_TIPO_VOO.get(b) ?? Infinity;
    if (ia !== ib) return ia - ib;
    return a.localeCompare(b);
  });
}

// Ferramenta de apontamento de voo pelo mapa (ver
// docs/INTEGRACAO_DRONEMANAGEMENT.md) — mesmo espírito de useMedicao.js/
// useTrackLog.js: `mapRef`/`mapaPronto` vêm de fora (mapa único do
// componente pai). `voosInfo` é o `info` (de camadasCarregadasRef) da
// camada com `tipoCamada === "voos"`, ou `null` enquanto ela não carregou/
// não existe nesse mapa — a maioria dos efeitos abaixo não faz nada sem
// ela. `mapaId`/`token` são pra chamar o backend (GET /voos/pendentes,
// POST /voos/apontamentos).
//
// Desenho confirmado com o Leo (2026-08-20): essa camada é só contorno
// (a camada "mestre" Talhões — que já existe — continua sendo a fonte da
// informação cheia do talhão, atributos etc). Cada tipo de voo tem sua
// própria cor; um talhão com pendência em só 1 tipo mostra a cor dele; um
// talhão com 2+ tipos pendentes ao mesmo tempo (comum — ex: erva daninha
// e falha no mesmo talhão) mostra uma cor de "atenção: múltiplo" em vez
// de empilhar N contornos um em cima do outro — clicar nele abre uma
// escolha rápida (`escolhaPendente`) em vez de marcar direto.
export function useApontamentoVoo(mapRef, mapaPronto, voosInfo, mapaId, token) {
  const [pendentes, setPendentes] = useState([]); // [{id, projeto, secao, talhao, controlStatus, verifyFlightSize}]
  // `null` = sem filtro (mostra todos os tipos); com filtro, só os
  // marcados. Nunca usa Set vazio pra "todos" — senão não dava pra
  // distinguir de "usuário desmarcou tudo".
  const [filtroProjetos, setFiltroProjetos] = useState(null);
  const [modoApontamento, setModoApontamento] = useState(false);
  const [selecionados, setSelecionados] = useState(new Map()); // id do registro -> registro
  // Talhão clicado com 2+ tipos pendentes ao mesmo tempo — enquanto isso
  // não é null, Mapa.jsx mostra a escolha em vez de já ter selecionado
  // nada.
  const [escolhaPendente, setEscolhaPendente] = useState(null); // {secao, talhao, registros} | null
  const [dataVoo, setDataVoo] = useState(() => new Date().toISOString().slice(0, 10));
  const [enviando, setEnviando] = useState(false);
  const [resultado, setResultado] = useState(null); // {sucesso, falha} do último envio, pro painel mostrar
  // Chaves (secao-talhao) que acabaram de ser apontadas com sucesso —
  // ficam verdes por TEMPO_CONFIRMACAO_MS como confirmação visual, depois
  // voltam a mostrar a cor de qualquer pendência que ainda reste ali (ver
  // efeito de coloração). Não precisava ser state se fosse só decorativo,
  // mas precisa disparar o re-render que recalcula a expressão de cor.
  const [recemApontados, setRecemApontados] = useState(new Map());
  // Sem isso, o botão mostrava "0 pendentes" (o valor inicial de
  // `pendentes`) enquanto a busca ainda estava em andamento — indistinguível
  // de "de verdade não tem nenhum pendente". A primeira busca pode demorar
  // bastante (login SSO no DroneManagement, ~30-45s no Render, ver
  // docs/INTEGRACAO_DRONEMANAGEMENT.md), então essa distinção importa de
  // verdade, não é só estética. `erroPendentes` pelo mesmo motivo — antes
  // uma falha só ia pro console, invisível pro usuário.
  const [carregandoPendentes, setCarregandoPendentes] = useState(false);
  const [erroPendentes, setErroPendentes] = useState(null);

  // chave (secao-talhao) -> lista de registros pendentes ali (quase
  // sempre 1, mas pode ser vários — mesmo talhão com pendência em mais de
  // 1 tipo de voo ao mesmo tempo).
  const pendentesPorChaveRef = useRef(new Map());

  // Lista de projetos/campanhas presentes nos pendentes atuais (pra
  // preencher os checkboxes de filtro) — derivado, não state próprio,
  // porque é 100% função de `pendentes`.
  const projetosDisponiveis = ordenarTiposVoo([...new Set(pendentes.map((r) => r.projeto).filter(Boolean))]);
  // Nome + cor (estável, ver corPorProjeto) de cada tipo — pro painel
  // desenhar o swatch ao lado de cada checkbox.
  const legendaProjetos = projetosDisponiveis.map((nome) => ({ nome, cor: corPorProjeto(nome) }));

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

  // Mantém o índice secao-talhao -> registros[] sempre alinhado com o que
  // está sendo mostrado/colorido no momento (pendentesFiltrados, não a
  // lista bruta) — clicar num talhão escondido pelo filtro não deveria
  // selecionar nada (ver alternarSelecao).
  useEffect(() => {
    const porChave = new Map();
    for (const r of pendentesFiltrados) {
      const k = chave(r.secao, r.talhao);
      if (!porChave.has(k)) porChave.set(k, []);
      porChave.get(k).push(r);
    }
    pendentesPorChaveRef.current = porChave;
  }, [pendentesFiltrados]);

  // 2) colore a camada "voos" por tipo (persistente, sempre visível
  // enquanto a camada existir) — sobrescreve o line-color/fill-opacity que
  // adicionarCamada já aplicou, direto na camada carregada. Roda de novo
  // sempre que a lista de pendentes, o filtro de projeto, ou os "recém
  // apontados" mudam.
  //
  // Enquanto a primeira busca ainda não terminou (carregandoPendentes),
  // NÃO mexe no estilo — antes disso a expressão caía no fallback
  // "chaves vazias" e deixava a camada inteira transparente por até ~90s
  // (login SSO + baixar a camada pela 1ª vez), parecendo "mapa vazio,
  // nada carrega" (bug real reportado pelo Leo).
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

    // Só contorno — a camada mestre (Talhões) já mostra a info cheia,
    // essas camadas de tipo de voo são só indicador visual pra
    // selecionar/apontar (pedido explícito do Leo).
    if (voosInfo.fillLayerId && getLayerSeguro(map, voosInfo.fillLayerId)) {
      map.setPaintProperty(voosInfo.fillLayerId, "fill-opacity", 0);
    }

    // Agrupa por talhão, já na ordem fixa de exibição (ordenarTiposVoo) —
    // essa ordem decide em qual anel (offsetAnel) cada tipo cai quando o
    // talhão tem 2+ pendências ao mesmo tempo. 0 tipos pendentes visíveis
    // = sem contorno; 1 tipo = cor daquele tipo, no contorno normal; 2+
    // tipos = um anel por tipo (ver bloco abaixo), nunca uma cor genérica
    // de "múltiplo".
    const tiposPorTalhao = new Map(); // chave -> Set<projeto>
    for (const r of pendentesFiltrados) {
      const k = chave(r.secao, r.talhao);
      if (!tiposPorTalhao.has(k)) tiposPorTalhao.set(k, new Set());
      tiposPorTalhao.get(k).add(r.projeto);
    }

    const chavesVerdes = new Set(recemApontados.keys());
    const chavesPorCor = new Map(); // cor -> [chaves], só quando tem 1 tipo só
    const multiploPorChave = new Map(); // chave -> string[] tipos (ordenados), quando tem 2+

    for (const [k, tiposSet] of tiposPorTalhao) {
      if (chavesVerdes.has(k)) continue; // recém apontado tem prioridade, tratado à parte
      if (tiposSet.size > 1) {
        multiploPorChave.set(k, ordenarTiposVoo([...tiposSet]));
        continue;
      }
      const cor = corPorProjeto([...tiposSet][0]);
      if (!chavesPorCor.has(cor)) chavesPorCor.set(cor, []);
      chavesPorCor.get(cor).push(k);
    }

    const semContorno = "rgba(0,0,0,0)";
    const ramos = [];
    for (const [cor, chaves] of chavesPorCor) ramos.push(chaves, cor);
    if (chavesVerdes.size > 0) ramos.push([...chavesVerdes], CORES_FERRAMENTAS.vooConfirmado);

    // Talhão com 2+ tipos não desenha nada no contorno normal — quem
    // desenha ele são os anéis, logo abaixo.
    const expressaoCor =
      ramos.length > 0
        ? ["match", ["concat", ["get", "SECAO"], "-", ["get", "TALHAO"]], ...ramos, semContorno]
        : semContorno;

    if (voosInfo.lineLayerId && getLayerSeguro(map, voosInfo.lineLayerId)) {
      map.setPaintProperty(voosInfo.lineLayerId, "line-color", expressaoCor);
      map.setPaintProperty(voosInfo.lineLayerId, "line-width", 3);
      map.setPaintProperty(voosInfo.lineLayerId, "line-opacity", 1);
    }

    // Anéis concêntricos: um por posição (ver offsetAnel). Cada anel só
    // pinta os talhões que têm um tipo NAQUELA posição — um talhão com
    // menos tipos que MAX_ANEIS_MULTIPLO simplesmente fica transparente
    // nos anéis que sobram pra ele.
    for (let i = 0; i < MAX_ANEIS_MULTIPLO; i++) {
      const idAnel = idCamadaAnel(i);
      if (!getLayerSeguro(map, idAnel)) continue;
      const ramosAnel = [];
      for (const [k, tipos] of multiploPorChave) {
        if (i < tipos.length) ramosAnel.push(k, corPorProjeto(tipos[i]));
      }
      const expressaoAnel =
        ramosAnel.length > 0
          ? ["match", ["concat", ["get", "SECAO"], "-", ["get", "TALHAO"]], ...ramosAnel, semContorno]
          : semContorno;
      map.setPaintProperty(idAnel, "line-color", expressaoAnel);
    }
  }, [pendentesFiltrados, recemApontados, carregandoPendentes, voosInfo, mapaPronto, mapRef]);

  // 2b) cria/destrói os MAX_ANEIS_MULTIPLO contornos concêntricos usados
  // pra desenhar talhão com 2+ tipos pendentes (ver offsetAnel acima) —
  // uma vez por voosInfo, mesmo padrão de lifecycle já usado pra
  // CAMADA_SELECAO no efeito 3 logo abaixo. Paint inicial transparente;
  // quem decide cor/visibilidade de cada anel a cada momento é o efeito
  // de coloração (2) acima.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto || !voosInfo) return;

    for (let i = 0; i < MAX_ANEIS_MULTIPLO; i++) {
      const id = idCamadaAnel(i);
      if (getLayerSeguro(map, id)) continue;
      map.addLayer({
        id,
        type: "line",
        source: voosInfo.sourceId,
        "source-layer": voosInfo.sourceLayerPrincipal,
        paint: {
          "line-color": "rgba(0,0,0,0)",
          "line-width": LARGURA_ANEL,
          "line-offset": offsetAnel(i),
        },
      });
    }

    return () => {
      for (let i = 0; i < MAX_ANEIS_MULTIPLO; i++) {
        const id = idCamadaAnel(i);
        if (getLayerSeguro(map, id)) map.removeLayer(id);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [voosInfo?.id, voosInfo?.sourceId, voosInfo?.sourceLayerPrincipal, mapaPronto]);

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
      paint: { "line-color": CORES_FERRAMENTAS.vooSelecionado, "line-width": 5 },
      filter: FILTRO_NENHUM, // nada selecionado ainda
    });

    return () => {
      if (getLayerSeguro(map, CAMADA_SELECAO)) map.removeLayer(CAMADA_SELECAO);
      if (map.getSource(FONTE_SELECAO)) map.removeSource(FONTE_SELECAO);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modoApontamento, voosInfo?.id, mapaPronto]);

  // 4) atualiza o filtro da camada de seleção a cada talhão marcado/
  // desmarcado — sem recriar fonte/camada. Por chave (não por id de
  // registro): um talhão com 2 tipos selecionados ainda é só 1 polígono
  // geometricamente, não precisa desenhar 2x.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto || !getLayerSeguro(map, CAMADA_SELECAO)) return;
    const chaves = [...new Set([...selecionados.values()].map((r) => chave(r.secao, r.talhao)))];
    map.setFilter(
      CAMADA_SELECAO,
      chaves.length > 0 ? ["match", ["concat", ["get", "SECAO"], "-", ["get", "TALHAO"]], chaves, true, false] : FILTRO_NENHUM
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
    setEscolhaPendente(null);
    setResultado(null);
    setModoApontamento(true);
  }

  function cancelarModo() {
    setModoApontamento(false);
    setSelecionados(new Map());
    setEscolhaPendente(null);
  }

  function alternarRegistro(registro) {
    setSelecionados((atual) => {
      const novo = new Map(atual);
      if (novo.has(registro.id)) novo.delete(registro.id);
      else novo.set(registro.id, registro);
      return novo;
    });
  }

  // Chamado pelo handler de clique do mapa (Mapa.jsx) quando o modo está
  // ligado e a feição clicada é da camada "voos". Talhão sem pendência
  // (filtrada ou não) não faz nada; com 1 pendência, seleciona/desmarca
  // direto; com 2+ (o mesmo talhão pendente em mais de um tipo ao mesmo
  // tempo), abre a escolha rápida em vez de adivinhar qual o piloto quis.
  function alternarSelecao(propriedades) {
    const registros = pendentesPorChaveRef.current.get(chave(propriedades.SECAO, propriedades.TALHAO)) || [];
    if (registros.length === 0) return;
    if (registros.length === 1) {
      alternarRegistro(registros[0]);
      return;
    }
    setEscolhaPendente({ secao: propriedades.SECAO, talhao: propriedades.TALHAO, registros });
  }

  function escolherRegistro(registro) {
    alternarRegistro(registro);
  }

  function fecharEscolha() {
    setEscolhaPendente(null);
  }

  // Melhor-esforço por talhão (ver POST /voos/apontamentos) — nunca
  // tudo-ou-nada, o backend já separa sucesso de falha. Quem teve sucesso
  // fica marcado como "recém apontado" (verde) por alguns segundos antes
  // de sumir de vez da lista de pendentes — só remover na hora deixava a
  // confirmação parecer instantânea/some-sem-avisar demais.
  async function confirmarLote() {
    if (selecionados.size === 0 || !mapaId) return;
    setEnviando(true);
    setResultado(null);
    try {
      const registros = [...selecionados.values()].map((r) => ({ id: r.id, secao: r.secao, talhao: r.talhao }));
      const resposta = await apontarVoos(token, { mapaId, dataVoo, registros });
      setResultado(resposta);
      const sucessoIds = new Set(resposta.sucesso);
      const chavesSucesso = registros.filter((r) => sucessoIds.has(r.id)).map((r) => chave(r.secao, r.talhao));
      if (chavesSucesso.length > 0) {
        setRecemApontados((atual) => {
          const novo = new Map(atual);
          for (const k of chavesSucesso) novo.set(k, true);
          return novo;
        });
        setTimeout(() => {
          setRecemApontados((atual) => {
            const novo = new Map(atual);
            for (const k of chavesSucesso) novo.delete(k);
            return novo;
          });
        }, TEMPO_CONFIRMACAO_MS);
      }
      setPendentes((atual) => atual.filter((r) => !sucessoIds.has(r.id)));
      setSelecionados(new Map());
      setEscolhaPendente(null);
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
    legendaProjetos,
    filtroProjetos,
    alternarFiltroProjeto,
    carregandoPendentes,
    erroPendentes,
    modoApontamento,
    selecionados,
    escolhaPendente,
    escolherRegistro,
    fecharEscolha,
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
