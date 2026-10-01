import { IconeFechar } from "../IconesAcao.jsx";

// Barra de ação de anotar — mesmo formato das barras de medição e percurso
// no rodapé central (redesenho, fase 2 — ver docs/REDESENHO_FRONTEND.md).
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
      <div className="barra-acao barra-anotar" role="toolbar" aria-label="Mover anotação">
        <div className="linha-barra-acao">
          <div className="valor-barra-acao">
            <strong>Mover anotação</strong>
            <span>Arraste o pin até o novo local</span>
          </div>
          <div className="acoes-barra-acao">
            <button type="button" className="botao-acao-secundario" onClick={aoCancelarMover}>
              Cancelar
            </button>
            <button type="button" className="botao-acao-primario" onClick={aoConfirmarMover}>
              Confirmar
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!aberta) return null;
  return (
    <div className="barra-acao barra-anotar" role="toolbar" aria-label="Anotar">
      <div className="linha-barra-acao">
        <div className="valor-barra-acao">
          <strong>Anotar no mapa</strong>
          <span>{modoAdicionar ? "Toque no ponto do mapa…" : "Escolha onde fica a anotação"}</span>
        </div>
        <div className="acoes-barra-acao">
          <button
            type="button"
            className={modoAdicionar ? "botao-acao-primario" : "botao-acao-secundario"}
            onClick={aoTocarNoMapa}
            aria-pressed={modoAdicionar}
          >
            Tocar no mapa
          </button>
          <button type="button" className="botao-acao-secundario" onClick={aoMinhaLocalizacao} disabled={obtendoGps}>
            {obtendoGps && <span className="spinner" aria-hidden="true" />} Na minha localização
          </button>
          <button
            type="button"
            className="botao-acao-icone"
            onClick={aoFechar}
            aria-label="Fechar ferramenta de anotação"
            title="Fechar"
          >
            <IconeFechar />
          </button>
        </div>
      </div>
    </div>
  );
}
