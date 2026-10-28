import { formatarHa } from "../../lib/periodoIndicadores.js";

// Uma barra por tipo de voo: a largura toda é o total do tipo (realizado +
// a voar) e a parte verde é o realizado — mesma leitura do slide do gerente.
// Os números ficam escritos na barra, sem depender de passar o mouse.
export default function BarrasPorTipo({ itens }) {
  if (!itens.length) return <p className="ind-vazio">Nenhum voo nem pendência no período.</p>;
  return (
    <ul className="ind-barras-tipo">
      {itens.map((t) => {
        const total = t.realizadoHa + t.aVoarHa;
        const pct = total > 0 ? (t.realizadoHa / total) * 100 : 0;
        return (
          <li key={t.tipo} className="ind-barra-tipo">
            <span className="ind-barra-tipo-nome">{t.tipo}</span>
            <div
              className="ind-barra-tipo-trilho"
              title={`${t.tipo}: ${formatarHa(t.realizadoHa)} ha realizados, ${formatarHa(t.aVoarHa)} ha a voar`}
            >
              <div className="ind-barra-tipo-realizado" style={{ width: `${pct}%` }} />
              <span className="ind-barra-tipo-valor">{formatarHa(t.realizadoHa)}</span>
            </div>
            <span className="ind-barra-tipo-total">{formatarHa(total)}</span>
          </li>
        );
      })}
    </ul>
  );
}
