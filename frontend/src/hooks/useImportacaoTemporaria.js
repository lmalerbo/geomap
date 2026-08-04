import { useEffect, useState } from "react";
import { CORES_FERRAMENTAS } from "../lib/coresFerramentas.js";
import { importarArquivoTemporario } from "../lib/importadorTemporario.js";
import { salvarArquivoImportado, buscarArquivoImportado, removerArquivoImportado } from "../lib/db.js";

const FONTE_TEMPORARIA = "fonte-temporaria";
const CAMADA_TEMPORARIA_PREENCHIMENTO = "camada-temporaria-preenchimento";
const CAMADA_TEMPORARIA_LINHA = "camada-temporaria-linha";
const CAMADA_TEMPORARIA_PONTOS = "camada-temporaria-pontos";

// Usa a cor/opacidade/espessura de cada feição quando existir — @tmcw/togeojson
// já extrai isso do <Style> do KML pra propriedades no padrão "simplestyle"
// (fill/fill-opacity/stroke/stroke-opacity/stroke-width), uma por feição (dá
// pra ter placemarks de cores diferentes no mesmo arquivo). Sem essa
// propriedade (shapefile importado, que nunca tem simbologia — ou um KML
// sem <Style> customizado), cai no valor padrão de sempre — mantém a cor
// magenta fixa como sinalização de "isso é temporário" nesses casos.
function expressaoOuPadrao(propriedade, padrao) {
  return ["coalesce", ["get", propriedade], padrao];
}

// Importação de KML/Shapefile pra visualização — extraída de Mapa.jsx (era
// o efeito 11 + os states/funções relacionados). Persiste no IndexedDB por
// mapa (só neste aparelho, sem sincronizar entre dispositivos nem passar
// pelo backend — pedido explícito: "cada pessoa personaliza seus mapas"
// sem exigir conta/servidor pra isso) — sobrevive a fechar/reabrir o
// navegador, some só se removida manualmente. Nome do hook/arquivo e a
// palavra "temporária" nos comentários/CSS ficaram como estavam antes
// dessa mudança (evita uma renomeação grande só por causa da palavra) —
// só o comportamento real mudou. `mapRef`/`mapaPronto` vêm de fora (mesmo
// mapa único do componente pai); `mapaId` decide de qual mapa é o arquivo
// salvo (cada mapa/fazenda guarda o próprio, no máximo 1 por vez).
export function useImportacaoTemporaria(mapRef, mapaPronto, mapaId) {
  const [arquivoTemporario, setArquivoTemporario] = useState(null); // {nome, geojson} | null
  const [temporariaVisivel, setTemporariaVisivel] = useState(true);
  const [importandoArquivo, setImportandoArquivo] = useState(false);
  const [erroImportacao, setErroImportacao] = useState(null);
  const [carregandoPersistido, setCarregandoPersistido] = useState(true);

  // Carrega o que já tinha sido importado nesse mapa (se algum) assim que
  // o componente monta — Mapa.jsx remonta inteiro a cada troca de mapa
  // (key={mapaId} em App.jsx), então isso roda uma vez por mapa aberto,
  // não precisa reagir a mapaId mudando dentro do mesmo componente.
  useEffect(() => {
    if (!Number.isFinite(mapaId)) {
      setCarregandoPersistido(false);
      return;
    }
    let cancelado = false;
    buscarArquivoImportado(mapaId).then((salvo) => {
      if (cancelado) return;
      if (salvo) {
        setArquivoTemporario({ nome: salvo.nome, geojson: salvo.geojson });
        setTemporariaVisivel(salvo.visivel ?? true);
      }
      setCarregandoPersistido(false);
    });
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mapaId]);

  // Cria/remove fonte+camadas quando o arquivo muda — 3 layers (uma por
  // família de geometria, já que o arquivo importado pode ter qualquer
  // tipo, diferente das camadas reais que já sabem o próprio tipo de
  // antemão) filtradas por ["geometry-type"], mesmo idioma da medição.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto) return;

    if (map.getLayer(CAMADA_TEMPORARIA_PONTOS)) map.removeLayer(CAMADA_TEMPORARIA_PONTOS);
    if (map.getLayer(CAMADA_TEMPORARIA_LINHA)) map.removeLayer(CAMADA_TEMPORARIA_LINHA);
    if (map.getLayer(CAMADA_TEMPORARIA_PREENCHIMENTO)) map.removeLayer(CAMADA_TEMPORARIA_PREENCHIMENTO);
    if (map.getSource(FONTE_TEMPORARIA)) map.removeSource(FONTE_TEMPORARIA);

    if (!arquivoTemporario) return;

    const opacidade = temporariaVisivel ? 1 : 0;
    map.addSource(FONTE_TEMPORARIA, { type: "geojson", data: arquivoTemporario.geojson });
    map.addLayer({
      id: CAMADA_TEMPORARIA_PREENCHIMENTO,
      type: "fill",
      source: FONTE_TEMPORARIA,
      filter: ["match", ["geometry-type"], ["Polygon", "MultiPolygon"], true, false],
      // fill-antialias:false evita o bug de fragmentação do preenchimento
      // no Safari/iOS (ver mesmo comentário em Mapa.jsx/adicionarCamada).
      paint: {
        "fill-color": expressaoOuPadrao("fill", CORES_FERRAMENTAS.temporaria),
        "fill-opacity": temporariaVisivel ? expressaoOuPadrao("fill-opacity", 0.25) : 0,
        "fill-antialias": false,
      },
    });
    map.addLayer({
      id: CAMADA_TEMPORARIA_LINHA,
      type: "line",
      source: FONTE_TEMPORARIA,
      filter: [
        "match",
        ["geometry-type"],
        ["LineString", "MultiLineString", "Polygon", "MultiPolygon"],
        true,
        false,
      ],
      paint: {
        "line-color": expressaoOuPadrao("stroke", CORES_FERRAMENTAS.temporaria),
        "line-width": expressaoOuPadrao("stroke-width", 2),
        "line-opacity": temporariaVisivel ? expressaoOuPadrao("stroke-opacity", 1) : 0,
      },
    });
    map.addLayer({
      id: CAMADA_TEMPORARIA_PONTOS,
      type: "circle",
      source: FONTE_TEMPORARIA,
      filter: ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
      paint: {
        "circle-radius": 5,
        "circle-color": expressaoOuPadrao("icon-color", CORES_FERRAMENTAS.temporaria),
        "circle-stroke-width": 1.5,
        "circle-stroke-color": "#fff",
        "circle-opacity": opacidade,
      },
    });
  }, [arquivoTemporario, temporariaVisivel, mapaPronto]);

  // Mantém o IndexedDB em dia quando o usuário liga/desliga a visibilidade
  // (não só na importação/remoção) — sem isso, reabrir o app restauraria
  // sempre visível, mesmo que a pessoa tivesse desligado antes de fechar.
  // Ignorado enquanto ainda está carregando o registro salvo (senão o
  // valor padrão do state re-salvaria por cima antes da leitura real
  // terminar) e sem arquivo nenhum (nada pra atualizar).
  useEffect(() => {
    if (carregandoPersistido || !arquivoTemporario || !Number.isFinite(mapaId)) return;
    salvarArquivoImportado(mapaId, arquivoTemporario.nome, arquivoTemporario.geojson, temporariaVisivel);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [temporariaVisivel]);

  async function aoImportarArquivo(e) {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reimportar o mesmo arquivo depois de remover
    if (!file) return;
    setImportandoArquivo(true);
    setErroImportacao(null);
    try {
      const resultado = await importarArquivoTemporario(file);
      setArquivoTemporario(resultado);
      setTemporariaVisivel(true);
      if (Number.isFinite(mapaId)) {
        await salvarArquivoImportado(mapaId, resultado.nome, resultado.geojson, true);
      }
    } catch (err) {
      setErroImportacao(err.message);
    } finally {
      setImportandoArquivo(false);
    }
  }

  function removerArquivoTemporario(e) {
    e.preventDefault();
    setArquivoTemporario(null);
    setErroImportacao(null);
    if (Number.isFinite(mapaId)) removerArquivoImportado(mapaId);
  }

  // Pro caso de "Ver percurso no mapa" (track log) usar o mesmo slot em
  // vez de um arquivo importado de verdade — persiste igual, pra não
  // sumir num reload igual um KML importado não sumiria mais.
  async function definirArquivoTemporario(nome, geojson) {
    setArquivoTemporario({ nome, geojson });
    setTemporariaVisivel(true);
    if (Number.isFinite(mapaId)) {
      await salvarArquivoImportado(mapaId, nome, geojson, true);
    }
  }

  return {
    arquivoTemporario,
    temporariaVisivel,
    setTemporariaVisivel,
    importandoArquivo,
    erroImportacao,
    aoImportarArquivo,
    removerArquivoTemporario,
    definirArquivoTemporario,
  };
}
