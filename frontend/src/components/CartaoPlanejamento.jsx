import { resumirPlanejamento, tituloDia } from "../lib/planejamentoVoo.js";

function formatarHa(valor) {
  return valor.toLocaleString("pt-BR", { maximumFractionDigits: 1 });
}

// Cartão do polígono de planejamento de voo (ver usePlanejamentos). Mesma
// moldura do painel de atributos. Os números são calculados aqui, a partir
// dos talhões guardados no polígono e das pendências do aparelho.
export default function CartaoPlanejamento({ planejamento, pendentes, aoFechar }) {
  const resumo = planejamento ? resumirPlanejamento(planejamento.talhoes, pendentes) : null;
  return (
    <aside className={`painel-flutuante painel-atributos painel-planejamento${planejamento ? " aberto" : ""}`}>
      {planejamento && resumo && (
        <>
          <button type="button" className="fechar" onClick={aoFechar} aria-label="Fechar" title="Fechar">
            ×
          </button>
          <h2>{tituloDia(planejamento.data)}</h2>
          {resumo.qtdTalhoes === 0 ? (
            <p>Nenhum talhão pendente nesta área</p>
          ) : (
            <>
              <p>
                {formatarHa(resumo.hectares)} ha · {resumo.qtdTalhoes}{" "}
                {resumo.qtdTalhoes === 1 ? "talhão pendente" : "talhões pendentes"}
              </p>
              <p>{resumo.porTipo.map((t) => `${t.sigla} ${formatarHa(t.hectares)} ha`).join(" · ")}</p>
              <ul>
                {resumo.porFazenda.map((f) => (
                  <li key={f.secao}>
                    {f.fazenda} — {formatarHa(f.hectares)} ha — {f.siglas.join(" ")}
                  </li>
                ))}
              </ul>
            </>
          )}
        </>
      )}
    </aside>
  );
}
