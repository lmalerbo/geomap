import { formatarDataCurta, formatarHa } from "../../lib/periodoIndicadores.js";

const ALTURA = 140;

// Colunas de hectares por semana, em SVG simples. Rótulo de data a cada N
// colunas pra não embolar quando o período é longo (safra inteira = ~27).
export default function ColunasSemanais({ semanas }) {
  if (!semanas.length) return <p className="ind-vazio">Sem semanas no período.</p>;
  const maximo = Math.max(...semanas.map((s) => s.ha), 1);
  const largura = 100 / semanas.length;
  const passoRotulo = Math.ceil(semanas.length / 8);
  return (
    <figure className="ind-colunas">
      <svg viewBox={`0 0 100 ${ALTURA}`} preserveAspectRatio="none" role="img" aria-label="Hectares voados por semana">
        {semanas.map((s, i) => {
          const h = (s.ha / maximo) * (ALTURA - 4);
          return (
            <rect
              key={s.semana}
              className="ind-coluna"
              x={i * largura + largura * 0.15}
              y={ALTURA - h}
              width={largura * 0.7}
              height={h}
            >
              <title>{`Semana de ${formatarDataCurta(s.inicio)}: ${formatarHa(s.ha)} ha, ${s.talhoes} talhões`}</title>
            </rect>
          );
        })}
      </svg>
      <div className="ind-colunas-eixo" style={{ gridTemplateColumns: `repeat(${semanas.length}, 1fr)` }}>
        {semanas.map((s, i) => (
          <span key={s.semana}>{i % passoRotulo === 0 ? formatarDataCurta(s.inicio) : ""}</span>
        ))}
      </div>
      <figcaption className="ind-colunas-legenda">Máximo da semana: {formatarHa(maximo)} ha</figcaption>
    </figure>
  );
}
