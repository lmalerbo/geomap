import { useEffect, useState } from "react";
import { formatarCoordenada, copiarTexto } from "../lib/coordenadas.js";

export default function LinhaCoordenada({ lngLat }) {
  const [copiado, setCopiado] = useState(false);
  const texto = formatarCoordenada(lngLat);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  return (
    <div className="linha-coordenada">
      <span className="texto-coordenada">{texto}</span>
      <button
        type="button"
        className="botao-copiar-coordenada"
        onClick={async () => setCopiado(await copiarTexto(texto))}
        aria-label="Copiar coordenada"
        title="Copiar coordenada"
      >
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
