import { useEffect, useState } from "react";
import { CORES_FERRAMENTAS } from "../lib/coresFerramentas.js";
import { importarArquivoTemporario } from "../lib/importadorTemporario.js";

const FONTE_TEMPORARIA = "fonte-temporaria";
const CAMADA_TEMPORARIA_PREENCHIMENTO = "camada-temporaria-preenchimento";
const CAMADA_TEMPORARIA_LINHA = "camada-temporaria-linha";
const CAMADA_TEMPORARIA_PONTOS = "camada-temporaria-pontos";

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
      paint: { "fill-color": CORES_FERRAMENTAS.temporaria, "fill-opacity": temporariaVisivel ? 0.25 : 0 },
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
      paint: { "line-color": CORES_FERRAMENTAS.temporaria, "line-width": 2, "line-opacity": opacidade },
    });
    map.addLayer({
      id: CAMADA_TEMPORARIA_PONTOS,
      type: "circle",
      source: FONTE_TEMPORARIA,
      filter: ["match", ["geometry-type"], ["Point", "MultiPoint"], true, false],
      paint: {
        "circle-radius": 5,
        "circle-color": CORES_FERRAMENTAS.temporaria,
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
