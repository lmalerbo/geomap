import { useEffect, useRef, useState } from "react";
import { useParams, Link } from "react-router-dom";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { PMTiles, Protocol } from "pmtiles";
import { buscarMapaBaixado } from "../lib/db.js";
import { BlobSource } from "../lib/pmtilesBlobSource.js";

const CAMADA = "talhoes";

export default function Mapa() {
  const { mapaId } = useParams();
  const containerRef = useRef(null);
  const mapRef = useRef(null);
  const [nomeMapa, setNomeMapa] = useState("");
  const [atributos, setAtributos] = useState(null);
  const [erro, setErro] = useState(null);

  useEffect(() => {
    let map;
    let protocol;
    let cancelado = false;

    async function montar() {
      const registro = await buscarMapaBaixado(Number(mapaId));
      if (!registro) {
        setErro("Este mapa ainda não foi baixado neste dispositivo.");
        return;
      }
      if (cancelado) return;
      setNomeMapa(registro.nome);

      protocol = new Protocol();
      maplibregl.addProtocol("pmtiles", protocol.tile);

      const source = new BlobSource(`mapa-${mapaId}`, registro.blob);
      const pmtiles = new PMTiles(source);
      protocol.add(pmtiles);

      const header = await pmtiles.getHeader();

      map = new maplibregl.Map({
        container: containerRef.current,
        style: {
          version: 8,
          sources: {},
          layers: [{ id: "fundo", type: "background", paint: { "background-color": "#e8eef1" } }],
        },
        center: [header.centerLon, header.centerLat],
        zoom: header.centerZoom,
      });
      mapRef.current = map;
      if (import.meta.env.DEV) window.__map = map;

      map.on("load", () => {
        map.addSource(CAMADA, {
          type: "vector",
          url: `pmtiles://${source.getKey()}`,
        });

        map.addLayer({
          id: "talhoes-preenchimento",
          type: "fill",
          source: CAMADA,
          "source-layer": CAMADA,
          paint: { "fill-color": "#3a8f5f", "fill-opacity": 0.35 },
        });

        map.addLayer({
          id: "talhoes-borda",
          type: "line",
          source: CAMADA,
          "source-layer": CAMADA,
          paint: { "line-color": "#2c6b47", "line-width": 1.5 },
        });

        map.fitBounds(
          [
            [header.minLon, header.minLat],
            [header.maxLon, header.maxLat],
          ],
          { padding: 30, duration: 0 }
        );

        map.on("click", "talhoes-preenchimento", (e) => {
          const feature = e.features?.[0];
          if (feature) setAtributos(feature.properties);
        });

        map.on("mouseenter", "talhoes-preenchimento", () => {
          map.getCanvas().style.cursor = "pointer";
        });
        map.on("mouseleave", "talhoes-preenchimento", () => {
          map.getCanvas().style.cursor = "";
        });
      });
    }

    montar();

    return () => {
      cancelado = true;
      map?.remove();
      if (protocol) maplibregl.removeProtocol("pmtiles");
    };
  }, [mapaId]);

  if (erro) {
    return (
      <main className="tela-mapa-erro">
        <p>{erro}</p>
        <Link to="/catalogo">Voltar ao catálogo</Link>
      </main>
    );
  }

  return (
    <main className="tela-mapa">
      <header className="barra-mapa">
        <Link to="/catalogo">&larr; Catálogo</Link>
        <strong>{nomeMapa}</strong>
      </header>
      <div ref={containerRef} className="mapa-container" />
      {atributos && (
        <aside className="painel-atributos">
          <button type="button" className="fechar" onClick={() => setAtributos(null)}>
            ×
          </button>
          <h2>Talhão</h2>
          <dl>
            {Object.entries(atributos).map(([chave, valor]) => (
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
