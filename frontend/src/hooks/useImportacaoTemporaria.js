import { useEffect, useState } from "react";
import { CORES_FERRAMENTAS } from "../lib/coresFerramentas.js";
import { importarArquivoTemporario } from "../lib/importadorTemporario.js";

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

// Importação temporária de KML/Shapefile pra visualização — extraída de
// Mapa.jsx (era o efeito 11 + os states/funções relacionados). Nunca toca
// IndexedDB/backend, vive só em memória — some ao recarregar a página ou
// remover manualmente. `mapRef`/`mapaPronto` vêm de fora (mesmo mapa único
// do componente pai).
export function useImportacaoTemporaria(mapRef, mapaPronto) {
  const [arquivoTemporario, setArquivoTemporario] = useState(null); // {nome, geojson} | null
  const [temporariaVisivel, setTemporariaVisivel] = useState(true);
  const [importandoArquivo, setImportandoArquivo] = useState(false);
  const [erroImportacao, setErroImportacao] = useState(null);

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
  }

  return {
    arquivoTemporario,
    setArquivoTemporario,
    temporariaVisivel,
    setTemporariaVisivel,
    importandoArquivo,
    erroImportacao,
    aoImportarArquivo,
    removerArquivoTemporario,
  };
}
