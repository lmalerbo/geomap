import CartaoKpi from "./CartaoKpi.jsx";
import BarraProgresso from "./BarraProgresso.jsx";
import BarrasPorTipo from "./BarrasPorTipo.jsx";
import ColunasSemanais from "./ColunasSemanais.jsx";

const porTipo = [
  { tipo: "Falhas Soca", realizadoHa: 9673, aVoarHa: 2400, realizadoTalhoes: 600, aVoarTalhoes: 150 },
  { tipo: "Falhas Plantio", realizadoHa: 4841, aVoarHa: 900, realizadoTalhoes: 300, aVoarTalhoes: 60 },
  { tipo: "Falhas Plantio Forn.", realizadoHa: 1628, aVoarHa: 1872, realizadoTalhoes: 100, aVoarTalhoes: 110 },
  { tipo: "Ervas Daninhas", realizadoHa: 3754, aVoarHa: 0, realizadoTalhoes: 250, aVoarTalhoes: 0 },
  { tipo: "Outros", realizadoHa: 489, aVoarHa: 20, realizadoTalhoes: 40, aVoarTalhoes: 2 },
];
const semanas = Array.from({ length: 26 }, (_, i) => {
  const d = new Date(Date.UTC(2026, 2, 30 + i * 7));
  return { semana: `S${i}`, inicio: d.toISOString().slice(0, 10), ha: Math.round(400 + 600 * Math.abs(Math.sin(i))), talhoes: 20 };
});

export default { title: "Indicadores/Componentes" };

export const Cartoes = {
  render: () => (
    <div className="ind-kpis" style={{ maxWidth: 1000 }}>
      <CartaoKpi rotulo="Área total" valor="30.112" unidade="ha" detalhe="1.733 voados + 410 a voar" />
      <CartaoKpi rotulo="HA realizado" valor="24.723" unidade="ha" detalhe="82% do total" cor="realizado" />
      <CartaoKpi rotulo="A voar" valor="5.389" unidade="ha" detalhe="situação atual" cor="aVoar" />
      <CartaoKpi rotulo="Últimos 15 dias úteis" valor="3.668" unidade="ha" detalhe="12 dias com voo" cor="recente" />
    </div>
  ),
};

export const Progresso = { render: () => <BarraProgresso progresso={0.67} /> };
export const PorTipo = { render: () => <BarrasPorTipo itens={porTipo} /> };
export const PorTipoVazio = { render: () => <BarrasPorTipo itens={[]} /> };
export const Semanal = { render: () => <ColunasSemanais semanas={semanas} /> };
