export default function BarraAnotar({
  aberta,
  modoAdicionar,
  obtendoGps,
  movendo,
  aoTocarNoMapa,
  aoMinhaLocalizacao,
  aoConfirmarMover,
  aoCancelarMover,
  aoFechar,
}) {
  if (movendo) {
    return (
      <div className="barra-anotar" role="toolbar" aria-label="Mover anotação">
        <span>Arraste o pin até o novo local.</span>
        <button type="button" onClick={aoConfirmarMover}>Confirmar</button>
        <button type="button" onClick={aoCancelarMover}>Cancelar</button>
      </div>
    );
  }
  if (!aberta) return null;
  return (
    <div className="barra-anotar" role="toolbar" aria-label="Anotar">
      <button type="button" className={modoAdicionar ? "ativo" : ""} onClick={aoTocarNoMapa} aria-pressed={modoAdicionar}>
        {modoAdicionar ? "Toque no mapa…" : "Tocar no mapa"}
      </button>
      <button type="button" onClick={aoMinhaLocalizacao} disabled={obtendoGps}>
        {obtendoGps && <span className="spinner" aria-hidden="true" />} Na minha localização
      </button>
      <button type="button" className="fechar" onClick={aoFechar} aria-label="Fechar ferramenta de anotação">
        ×
      </button>
    </div>
  );
}
