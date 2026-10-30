import { CORES_EXCEDENTE, ROTULOS_STATUS } from "../lib/excedente.js";

const GRUPOS = [
  { chave: "aguardando", rotulo: "Aguardando", cor: CORES_EXCEDENTE.aguardando },
  { chave: "precisa_ajuste", rotulo: "Precisam ajuste", cor: CORES_EXCEDENTE.precisa_ajuste },
  { chave: "concluidos", rotulo: "Concluídos", cor: CORES_EXCEDENTE.sem_ajuste },
];

export default function PainelExcedente({ excedente }) {
  const { contagem, filtroStatus, setFiltroStatus, itensFila, retentar, descartar, avisoAtualizacao, atualizando, carregando } = excedente;
  const pendentes = itensFila.filter((i) => i.estado === "pendente");
  const recusados = itensFila.filter((i) => i.estado === "recusado");

  function alternar(chave) {
    const atual = filtroStatus ? new Set(filtroStatus) : new Set(GRUPOS.map((g) => g.chave));
    if (atual.has(chave)) atual.delete(chave);
    else atual.add(chave);
    setFiltroStatus(atual.size === GRUPOS.length ? null : atual);
  }

  return (
    <section className="painel-excedente" aria-label="Plantio excedente">
      {carregando && <p>Carregando análises…</p>}
      <div className="chips-excedente">
        {GRUPOS.map((g) => (
          <button
            key={g.chave}
            type="button"
            className={`chip-excedente${!filtroStatus || filtroStatus.has(g.chave) ? " ativo" : ""}`}
            style={{ "--cor-status": g.cor }}
            aria-pressed={!filtroStatus || filtroStatus.has(g.chave)}
            onClick={() => alternar(g.chave)}
          >
            {g.rotulo} <strong>{contagem[g.chave]}</strong>
          </button>
        ))}
      </div>
      {atualizando && !carregando && <p className="aviso-discreto">Atualizando com o DroneManagement…</p>}
      {avisoAtualizacao && <p className="aviso-discreto">{avisoAtualizacao}</p>}
      {pendentes.length > 0 && <p>{pendentes.length === 1 ? "1 apontamento aguardando envio" : `${pendentes.length} apontamentos aguardando envio`}</p>}
      {recusados.map((i) => (
        <div key={i.id} className="item-recusado">
          <p>{ROTULOS_STATUS[i.status]} recusado: {i.erro}</p>
          <button type="button" onClick={() => retentar(i.id)}>Tentar de novo</button>
          <button type="button" onClick={() => descartar(i.id)}>Descartar</button>
        </div>
      ))}
    </section>
  );
}
