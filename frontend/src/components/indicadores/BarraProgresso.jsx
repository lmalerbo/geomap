import { formatarPercentual } from "../../lib/periodoIndicadores.js";

export default function BarraProgresso({ progresso }) {
  const pct = Math.max(0, Math.min(1, Number(progresso) || 0));
  return (
    <div className="ind-progresso">
      <span className="ind-progresso-rotulo">Progresso geral</span>
      <div
        className="ind-progresso-trilho"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct * 100)}
        aria-label="Progresso geral"
      >
        <div className="ind-progresso-preenchido" style={{ width: `${pct * 100}%` }} />
      </div>
      <strong className="ind-progresso-valor">{formatarPercentual(pct)}</strong>
    </div>
  );
}
