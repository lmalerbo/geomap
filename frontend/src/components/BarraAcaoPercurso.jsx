import { IconeFechar } from "./IconesAcao.jsx";

// Barra de ação da gravação de percurso no rodapé central (redesenho,
// fase 2 — ver docs/REDESENHO_FRONTEND.md). Três estados: pronto pra
// começar, gravando (ou pausado) e percurso terminado (exportar etc.).
// Fechar a barra durante a gravação só esconde a barra — o GPS continua
// gravando (o botão "Percurso" da barra de ferramentas segue marcado).
export default function BarraAcaoPercurso({ track, aoVerNoMapa }) {
  const {
    gravandoPercurso,
    pausado,
    distanciaPercursoAtual,
    seguirCamera,
    setSeguirCamera,
    erroTrack,
    avisoCompartilhar,
    iniciarGravacaoPercurso,
    pararGravacaoPercurso,
    pausarGravacaoPercurso,
    continuarGravacaoPercurso,
    limparPercurso,
    exportarPercurso,
    compartilharPercurso,
    setMostrarPainelTrack,
  } = track;

  const terminado = !gravandoPercurso && Boolean(distanciaPercursoAtual);

  return (
    <div className="barra-acao" role="toolbar" aria-label="Gravação de percurso">
      {gravandoPercurso && (
        <p className="aviso-barra-acao">
          Mantenha o app aberto — trocar de app ou travar a tela manualmente interrompe a gravação.
        </p>
      )}
      {erroTrack && <p className="aviso-barra-acao aviso-barra-acao--erro">{erroTrack}</p>}
      {avisoCompartilhar && <p className="aviso-barra-acao">{avisoCompartilhar}</p>}
      <div className="linha-barra-acao">
        {gravandoPercurso && (
          <span className={`ponto-gravando${pausado ? " ponto-gravando--pausado" : ""}`} aria-hidden="true" />
        )}
        <div className="valor-barra-acao" aria-live="polite">
          {gravandoPercurso ? (
            <>
              <strong>{pausado ? "Pausado" : "Gravando percurso"}</strong>
              <span>{distanciaPercursoAtual ?? "0 m"}</span>
            </>
          ) : terminado ? (
            <>
              <strong>Percurso gravado</strong>
              <span>{distanciaPercursoAtual}</span>
            </>
          ) : (
            <>
              <strong>Gravar percurso</strong>
              <span>Mantenha o app aberto durante o trajeto</span>
            </>
          )}
        </div>

        <div className="acoes-barra-acao">
          {!gravandoPercurso && !terminado && (
            <button type="button" className="botao-acao-primario" onClick={iniciarGravacaoPercurso}>
              Iniciar gravação
            </button>
          )}
          {gravandoPercurso && (
            <>
              <label className="opcao-barra-acao">
                <input type="checkbox" checked={seguirCamera} onChange={() => setSeguirCamera((s) => !s)} />
                Seguir minha localização
              </label>
              {pausado ? (
                <button type="button" className="botao-acao-secundario" onClick={continuarGravacaoPercurso}>
                  Continuar
                </button>
              ) : (
                <button type="button" className="botao-acao-secundario" onClick={pausarGravacaoPercurso}>
                  Pausar
                </button>
              )}
              <button type="button" className="botao-acao-perigo" onClick={pararGravacaoPercurso}>
                Parar
              </button>
            </>
          )}
          {terminado && (
            <>
              <button type="button" className="botao-acao-secundario" onClick={exportarPercurso}>
                Exportar KML
              </button>
              <button type="button" className="botao-acao-secundario" onClick={compartilharPercurso}>
                Compartilhar
              </button>
              <button type="button" className="botao-acao-secundario" onClick={aoVerNoMapa}>
                Ver no mapa
              </button>
              <button type="button" className="botao-acao-secundario" onClick={limparPercurso}>
                Limpar
              </button>
            </>
          )}
          <button
            type="button"
            className="botao-acao-icone"
            onClick={() => setMostrarPainelTrack(false)}
            aria-label={gravandoPercurso ? "Esconder barra (a gravação continua)" : "Fechar gravação de percurso"}
            title={gravandoPercurso ? "Esconder barra (a gravação continua)" : "Fechar"}
          >
            <IconeFechar />
          </button>
        </div>
      </div>
    </div>
  );
}
