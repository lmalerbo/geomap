import { IconeDesfazer, IconeFechar } from "./IconesAcao.jsx";

// Barra de ação da medição no rodapé central (redesenho, fase 2 — ver
// docs/REDESENHO_FRONTEND.md). Substitui o cartão do canto direito: o valor
// medido fica sempre à vista no meio da tela, perto de onde o usuário está
// tocando, e o mapa à direita fica livre pro painel de atributos.
export default function BarraAcaoMedicao({ medicao }) {
  const {
    modoMedicao,
    trocarModoMedicao,
    origemPontos,
    trocarOrigemPontos,
    pontosMedicao,
    setPontosMedicao,
    resultadoMedicaoAtual,
    capturandoGps,
    erroGps,
    iniciarCapturaGps,
    pararCapturaGps,
    exportarMedicaoZip,
    setMedindo,
  } = medicao;

  const porGps = origemPontos === "gps";
  const dica = porGps
    ? capturandoGps
      ? "Capturando pontos, ande normalmente…"
      : "Inicie a captura e percorra o trajeto"
    : modoMedicao === "area"
      ? "Toque no mapa pra marcar o polígono (mín. 3 pontos)"
      : "Toque no mapa pra marcar os pontos";

  return (
    <div className="barra-acao" role="toolbar" aria-label="Medição">
      {porGps && capturandoGps && (
        <p className="aviso-barra-acao">
          Mantenha o app aberto — trocar de app ou travar a tela interrompe a captura.
        </p>
      )}
      {erroGps && <p className="aviso-barra-acao aviso-barra-acao--erro">{erroGps}</p>}
      <div className="linha-barra-acao">
        <div className="segmentado" role="group" aria-label="Tipo de medição">
          <button
            type="button"
            className={modoMedicao === "distancia" ? "ativo" : ""}
            aria-pressed={modoMedicao === "distancia"}
            onClick={() => trocarModoMedicao("distancia")}
          >
            Distância
          </button>
          <button
            type="button"
            className={modoMedicao === "area" ? "ativo" : ""}
            aria-pressed={modoMedicao === "area"}
            onClick={() => trocarModoMedicao("area")}
          >
            Área
          </button>
        </div>
        <div className="segmentado" role="group" aria-label="Como marcar os pontos">
          <button
            type="button"
            className={!porGps ? "ativo" : ""}
            aria-pressed={!porGps}
            onClick={() => trocarOrigemPontos("clique")}
          >
            No mapa
          </button>
          <button
            type="button"
            className={porGps ? "ativo" : ""}
            aria-pressed={porGps}
            onClick={() => trocarOrigemPontos("gps")}
          >
            Por GPS
          </button>
        </div>

        <div className="valor-barra-acao" aria-live="polite">
          {resultadoMedicaoAtual ? (
            <>
              <strong>{resultadoMedicaoAtual}</strong>
              <span>
                {pontosMedicao.length} {pontosMedicao.length === 1 ? "ponto" : "pontos"}
              </span>
            </>
          ) : (
            <span>{dica}</span>
          )}
        </div>

        <div className="acoes-barra-acao">
          {porGps &&
            (!capturandoGps ? (
              <button type="button" className="botao-acao-primario" onClick={iniciarCapturaGps}>
                {modoMedicao === "area" ? "Capturar perímetro" : "Capturar trajeto"}
              </button>
            ) : (
              <button type="button" className="botao-acao-perigo" onClick={pararCapturaGps}>
                Parar captura
              </button>
            ))}
          {!porGps && pontosMedicao.length > 0 && (
            <button
              type="button"
              className="botao-acao-icone"
              onClick={() => setPontosMedicao((pontos) => pontos.slice(0, -1))}
              aria-label="Desfazer último ponto"
              title="Desfazer último ponto"
            >
              <IconeDesfazer />
            </button>
          )}
          {pontosMedicao.length > 0 && !capturandoGps && (
            <button type="button" className="botao-acao-secundario" onClick={() => setPontosMedicao([])}>
              Limpar
            </button>
          )}
          {resultadoMedicaoAtual && !capturandoGps && (
            <button type="button" className="botao-acao-primario" onClick={() => exportarMedicaoZip()}>
              Exportar relatório
            </button>
          )}
          <button
            type="button"
            className="botao-acao-icone"
            onClick={() => setMedindo(false)}
            aria-label="Fechar medição"
            title="Fechar medição"
          >
            <IconeFechar />
          </button>
        </div>
      </div>
    </div>
  );
}
