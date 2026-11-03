// Painel do Plantio Excedente, no mesmo molde do PainelVoos: destaque no
// topo, filtro por status (que também é a legenda das cores do mapa) e a fila
// de apontamentos guardados no aparelho. Usado no painel lateral (desktop) e
// na aba da gaveta (celular).
import { Esboco } from "./movimento/index.js";
import { CORES_EXCEDENTE, ROTULOS_STATUS } from "../lib/excedente.js";

const GRUPOS = [
  { chave: "aguardando", rotulo: "Aguardando", cor: CORES_EXCEDENTE.aguardando },
  { chave: "precisa_ajuste", rotulo: "Precisam ajuste", cor: CORES_EXCEDENTE.precisa_ajuste },
  { chave: "concluidos", rotulo: "Concluídos", cor: CORES_EXCEDENTE.sem_ajuste },
];

const fmtHa = (n) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });
const talhoes = (n) => `${n} ${n === 1 ? "talhão" : "talhões"}`;

export default function PainelExcedente({ excedente }) {
  const {
    contagem, casoPorChave, filtroStatus, setFiltroStatus, itensFila, retentar, descartar,
    avisoAtualizacao, atualizando, carregando,
  } = excedente;
  const pendentes = itensFila.filter((i) => i.estado === "pendente");
  const recusados = itensFila.filter((i) => i.estado === "recusado");
  let haAjustar = 0;
  for (const c of casoPorChave.values()) {
    if (c.status === "precisa_ajuste") haAjustar += Number(c.areaExcedenteHa) || 0;
  }

  function alternar(chave) {
    const atual = filtroStatus ? new Set(filtroStatus) : new Set(GRUPOS.map((g) => g.chave));
    if (atual.has(chave)) atual.delete(chave);
    else atual.add(chave);
    setFiltroStatus(atual.size === GRUPOS.length ? null : atual);
  }

  return (
    <Esboco
      discreto
      cascata={false}
      carregando={carregando || atualizando}
      className="painel-voos painel-excedente"
      aria-label={atualizando ? "Atualizando com o DroneManagement" : undefined}
    >
      {carregando ? (
        <p className="status-voos">Carregando análises…</p>
      ) : (
        <div className="total-voos">
          <strong>{talhoes(contagem.aguardando)}</strong>
          <span>
            aguardando análise
            {contagem.precisa_ajuste > 0 &&
              ` · ${talhoes(contagem.precisa_ajuste)} a ajustar (${fmtHa(haAjustar)} ha)`}
          </span>
        </div>
      )}
      {avisoAtualizacao && <p className="status-voos status-voos--aviso">{avisoAtualizacao}</p>}

      {pendentes.length > 0 && (
        <div className="cartao-fila cartao-fila--aguardando" role="status">
          <strong>
            {pendentes.length === 1 ? "1 apontamento aguardando envio" : `${pendentes.length} apontamentos aguardando envio`}
          </strong>
          <span>Guardados no aparelho — enviam sozinhos quando houver internet.</span>
        </div>
      )}

      {recusados.map((i) => (
        <div key={i.id} className="cartao-fila cartao-fila--recusado" role="alert">
          <strong>“{ROTULOS_STATUS[i.status]}” não foi aceito</strong>
          <span>{i.erro}</span>
          <div className="acoes-cartao-fila">
            <button type="button" className="botao-acao-secundario" onClick={() => retentar(i.id)}>
              Tentar de novo
            </button>
            <button type="button" className="botao-acao-secundario" onClick={() => descartar(i.id)}>
              Descartar
            </button>
          </div>
        </div>
      ))}

      <div className="filtro-tipos-voo" role="group" aria-label="Filtrar por situação">
        {GRUPOS.map((g) => {
          const ativo = !filtroStatus || filtroStatus.has(g.chave);
          return (
            <button
              key={g.chave}
              type="button"
              className={`chip-tipo-voo${ativo ? "" : " chip-tipo-voo--inativo"}`}
              style={{ borderColor: ativo ? g.cor : undefined }}
              aria-pressed={ativo}
              onClick={() => alternar(g.chave)}
            >
              <span className="swatch-tipo-voo" style={{ backgroundColor: g.cor }} aria-hidden="true" />
              {g.rotulo}
              <span className="contagem-chip">{contagem[g.chave]}</span>
            </button>
          );
        })}
      </div>
    </Esboco>
  );
}
