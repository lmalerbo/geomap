// Painel do mapa de voos (redesenho, fase 4 — ver docs/REDESENHO_FRONTEND.md):
// total pendente em hectares, filtro por tipo (que também é a legenda das
// cores do mapa), a fila de apontamentos guardados no aparelho e o botão de
// apontar. Usado no painel lateral (desktop) e na aba Voos da gaveta
// (celular).
export default function PainelVoos({ apontamento, aoApontar, compacto = false }) {
  const {
    carregandoPendentes,
    atualizandoPendentes,
    erroPendentes,
    pendenciasDeCache,
    areaPendenteHa,
    qtdTalhoesPendentes,
    legendaProjetos,
    filtroProjetos,
    alternarFiltroProjeto,
    fila,
    online,
    retentarLote,
    descartarLote,
    enviarFilaAgora,
    pendentes,
  } = apontamento;
  const temUrgente = pendentes.some((r) => r.urgente);

  const ha = areaPendenteHa.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const horaCache = pendenciasDeCache
    ? new Date(pendenciasDeCache).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })
    : null;

  return (
    <div className="painel-voos">
      {carregandoPendentes ? (
        <p className="status-voos">
          <span className="spinner" aria-hidden="true" /> Carregando pendências…
        </p>
      ) : erroPendentes ? (
        <p className="status-voos status-voos--erro">Não foi possível carregar as pendências: {erroPendentes}</p>
      ) : (
        <div className="total-voos">
          <strong>{ha} ha</strong>
          <span>
            pendentes · {qtdTalhoesPendentes} {qtdTalhoesPendentes === 1 ? "talhão" : "talhões"}
          </span>
        </div>
      )}
      {!carregandoPendentes && atualizandoPendentes && (
        <p className="status-voos status-voos--atualizando">
          <span className="spinner" aria-hidden="true" /> Atualizando com o DroneManagement…
        </p>
      )}
      {horaCache && !atualizandoPendentes && (
        <p className="status-voos status-voos--aviso">
          {online ? "Não foi possível atualizar agora" : "Sem conexão"} — mostrando as pendências de {horaCache}.
        </p>
      )}

      {fila.qtdPendentes > 0 && (
        <div className="cartao-fila cartao-fila--aguardando" role="status">
          <strong>
            {fila.qtdPendentes === 1
              ? "1 apontamento aguardando sinal"
              : `${fila.qtdPendentes} apontamentos aguardando sinal`}
          </strong>
          <span>Guardados no aparelho — enviam sozinhos quando a internet voltar.</span>
          {online && (
            <button type="button" className="botao-acao-secundario" onClick={enviarFilaAgora}>
              Enviar agora
            </button>
          )}
        </div>
      )}

      {fila.recusados.map((lote) => (
        <div key={lote.id} className="cartao-fila cartao-fila--recusado" role="alert">
          <strong>
            {lote.falhas.length === 1
              ? "1 apontamento não foi aceito"
              : `${lote.falhas.length} apontamentos não foram aceitos`}
          </strong>
          <ul>
            {lote.falhas.map((f) => (
              <li key={f.id}>
                Talhão {f.talhao}
                {f.projeto ? ` · ${f.projeto}` : ""}: {f.erro}
              </li>
            ))}
          </ul>
          <div className="acoes-cartao-fila">
            <button type="button" className="botao-acao-secundario" onClick={() => retentarLote(lote.id)}>
              Tentar de novo
            </button>
            <button type="button" className="botao-acao-secundario" onClick={() => descartarLote(lote.id)}>
              Descartar
            </button>
          </div>
        </div>
      ))}

      {temUrgente && (
        <p className="legenda-urgente">
          <span className="swatch-urgente" aria-hidden="true" />
          Pontilhado vermelho: Falhas com “Voar urgente” · número embaixo do talhão: dias corridos
        </p>
      )}

      {!compacto && legendaProjetos.length > 0 && (
        <div className="filtro-tipos-voo" role="group" aria-label="Filtrar por tipo de voo">
          {legendaProjetos.map(({ chave, rotulo, cor, projeto }) => {
            const ativo = filtroProjetos?.has(projeto) ?? true;
            return (
              <button
                key={chave}
                type="button"
                className={`chip-tipo-voo${ativo ? "" : " chip-tipo-voo--inativo"}`}
                style={{ borderColor: ativo ? cor : undefined }}
                aria-pressed={ativo}
                onClick={() => alternarFiltroProjeto(projeto)}
              >
                <span className="swatch-tipo-voo" style={{ backgroundColor: cor }} aria-hidden="true" />
                {rotulo}
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        className="botao-apontar-voo"
        onClick={aoApontar}
        disabled={carregandoPendentes || qtdTalhoesPendentes === 0}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="m5 12 5 5 9-10" />
        </svg>
        Apontar voo
      </button>
    </div>
  );
}
