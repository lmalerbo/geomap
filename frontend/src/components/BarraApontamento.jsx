import { useState } from "react";
import { IconeFechar } from "./IconesAcao.jsx";

// Data local (não UTC) no formato do <input type="date"> — new Date()
// .toISOString() daria o dia seguinte depois das 21h no horário de Brasília.
function dataLocal(deslocamentoDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + deslocamentoDias);
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function diaMes(iso) {
  const [, m, d] = iso.split("-");
  return `${d}/${m}`;
}

// Barra do modo de apontamento no rodapé (redesenho, fase 4): o que já foi
// marcado, a data do voo em um toque e confirmar. Sem sinal, confirmar vira
// "Guardar" — o lote vai pra fila do aparelho. Quando o talhão tocado tem
// 2+ pendências, a escolha aparece acima da barra, com botões grandes.
export default function BarraApontamento({ apontamento }) {
  const {
    selecionados,
    removerSelecionado,
    escolhaPendente,
    escolherRegistro,
    marcarTodasDaEscolha,
    fecharEscolha,
    dataVoo,
    setDataVoo,
    enviando,
    confirmarLote,
    cancelarModo,
    online,
  } = apontamento;
  const hoje = dataLocal(0);
  const ontem = dataLocal(-1);
  const [outroDia, setOutroDia] = useState(dataVoo !== hoje && dataVoo !== ontem);

  const itens = [...selecionados.values()];
  const n = itens.length;
  const ha = itens.reduce((s, r) => s + (r.areaHa || 0), 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 });
  const rotuloConfirmar = enviando
    ? "Enviando…"
    : n === 0
      ? "Toque nos talhões no mapa"
      : online
        ? n === 1
          ? "Confirmar 1 apontamento"
          : `Confirmar ${n} apontamentos`
        : n === 1
          ? "Guardar 1 apontamento"
          : `Guardar ${n} apontamentos`;

  return (
    <>
      {escolhaPendente && (
        <div className="barra-acao escolha-pendencias" role="dialog" aria-label="Qual pendência você voou">
          <div className="valor-barra-acao">
            <strong>
              Talhão {escolhaPendente.talhao} tem {escolhaPendente.registros.length} pendências
            </strong>
            <span>Qual você voou? Pode marcar mais de uma.</span>
          </div>
          <div className="opcoes-escolha">
            {escolhaPendente.registros.map((r) => {
              const marcado = selecionados.has(r.id);
              return (
                <button
                  key={r.id}
                  type="button"
                  className={`opcao-escolha${marcado ? " marcada" : ""}`}
                  aria-pressed={marcado}
                  onClick={() => escolherRegistro(r)}
                >
                  <span className="caixa-escolha" aria-hidden="true">
                    {marcado && (
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="m5 12 5 5 9-10" />
                      </svg>
                    )}
                  </span>
                  {r.projeto}
                </button>
              );
            })}
          </div>
          <div className="acoes-barra-acao">
            <button type="button" className="botao-acao-secundario" onClick={marcarTodasDaEscolha}>
              Marcar todas
            </button>
            <button type="button" className="botao-acao-primario" onClick={fecharEscolha}>
              Pronto
            </button>
          </div>
        </div>
      )}

      <div className="barra-acao barra-apontamento" role="toolbar" aria-label="Apontamento de voo">
        <div className="linha-barra-acao">
          <span className="ponto-apontando" aria-hidden="true" />
          <div className="valor-barra-acao">
            <strong>{n === 0 ? "Apontando voo" : `${n} ${n === 1 ? "selecionado" : "selecionados"} · ${ha} ha`}</strong>
            <span>{online ? "Toque nos talhões que você voou" : "Sem sinal: fica guardado e envia depois"}</span>
          </div>
          <button
            type="button"
            className="botao-acao-icone"
            onClick={cancelarModo}
            aria-label="Cancelar apontamento"
            title="Cancelar apontamento"
          >
            <IconeFechar />
          </button>
        </div>

        {n > 0 && (
          <div className="selecionados-apontamento">
            {itens.map((r) => (
              <span key={r.id} className="chip-selecionado">
                Talhão {r.talhao} · {r.projeto}
                <button type="button" onClick={() => removerSelecionado(r.id)} aria-label={`Tirar talhão ${r.talhao} (${r.projeto})`}>
                  <IconeFechar />
                </button>
              </span>
            ))}
          </div>
        )}

        <div className="linha-barra-acao linha-data-voo">
          <span className="rotulo-data-voo">Data do voo</span>
          <div className="segmentado" role="group" aria-label="Data do voo">
            <button
              type="button"
              className={!outroDia && dataVoo === hoje ? "ativo" : ""}
              aria-pressed={!outroDia && dataVoo === hoje}
              onClick={() => {
                setOutroDia(false);
                setDataVoo(hoje);
              }}
            >
              Hoje · {diaMes(hoje)}
            </button>
            <button
              type="button"
              className={!outroDia && dataVoo === ontem ? "ativo" : ""}
              aria-pressed={!outroDia && dataVoo === ontem}
              onClick={() => {
                setOutroDia(false);
                setDataVoo(ontem);
              }}
            >
              Ontem · {diaMes(ontem)}
            </button>
            <button type="button" className={outroDia ? "ativo" : ""} aria-pressed={outroDia} onClick={() => setOutroDia(true)}>
              Outro dia
            </button>
          </div>
          {outroDia && (
            <input
              type="date"
              className="campo-data-voo"
              value={dataVoo}
              max={hoje}
              onChange={(e) => setDataVoo(e.target.value)}
              aria-label="Escolher a data do voo"
            />
          )}
        </div>

        <button
          type="button"
          className="botao-confirmar-apontamento"
          onClick={confirmarLote}
          disabled={n === 0 || enviando}
        >
          {enviando && <span className="spinner" aria-hidden="true" />}
          {rotuloConfirmar}
        </button>
      </div>
    </>
  );
}
