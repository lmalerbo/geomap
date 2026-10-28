// Cartão de número grande do painel de indicadores (mesmo formato dos
// cartões do slide "Voos com Drone": rótulo, número, linha de detalhe).
export default function CartaoKpi({ rotulo, valor, unidade, detalhe, cor = "neutra" }) {
  return (
    <section className={`ind-kpi ind-kpi--${cor}`}>
      <h3 className="ind-kpi-rotulo">{rotulo}</h3>
      <p className="ind-kpi-valor">
        {valor}
        {unidade && <span className="ind-kpi-unidade"> {unidade}</span>}
      </p>
      {detalhe && <p className="ind-kpi-detalhe">{detalhe}</p>}
    </section>
  );
}
