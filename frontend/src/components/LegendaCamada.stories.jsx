import LegendaCamada, { IconeFormaPonto, FaixaCores } from "./LegendaCamada.jsx";
import { SEPARADOR_CAMPOS } from "../lib/estiloCamada.js";

export default {
  title: "Componentes/LegendaCamada",
  component: LegendaCamada,
};

export const PreenchimentoCategorizado = {
  args: {
    ehPonto: false,
    preenchimento: {
      modo: "categorizado",
      campo: "OCORRENCIA",
      categorias: [
        { valor: "Corte 2026", cor: "#00ff04" },
        { valor: "Corte 2027", cor: "#86d0fe" },
        // Valor combinado de 2 campos (SEPARADOR_CAMPOS) — formatarValorCategoria
        // troca pelo " / " visível, mesmo caso de "Valores únicos, muitos
        // campos" do ArcGIS Pro.
        { valor: `Em Colheita${SEPARADOR_CAMPOS}2026`, cor: "#ff9500" },
      ],
      corSemCategoria: "#f7f9fa",
      classes: [],
    },
    contorno: { modo: "simples", cor: "#000000" },
    simbolo: { modo: "fixo", forma: "circulo" },
  },
};

export const PreenchimentoGraduado = {
  args: {
    ehPonto: false,
    preenchimento: {
      modo: "graduado",
      campoNumerico: "AREA",
      classes: [
        { ate: 5, cor: "#cde4cd" },
        { ate: 20, cor: "#7fbf7f" },
        { ate: 100, cor: "#2c6b47" },
      ],
      corAbaixoDoMinimo: "#eeeeee",
      categorias: [],
    },
    contorno: { modo: "simples", cor: "#000000" },
    simbolo: { modo: "fixo", forma: "circulo" },
  },
};

export const PreenchimentoGradiente = {
  args: {
    ehPonto: false,
    preenchimento: {
      modo: "gradiente",
      campoNumerico: "AREA",
      corInicial: "#ffffcc",
      corFinal: "#006837",
      min: 0,
      max: 2600,
      categorias: [],
      classes: [],
    },
    contorno: { modo: "simples", cor: "#000000" },
    simbolo: { modo: "fixo", forma: "circulo" },
  },
};

export const FormaCategorizadaEmPonto = {
  args: {
    ehPonto: true,
    preenchimento: { modo: "simples", cor: "#2c6b47", categorias: [], classes: [] },
    contorno: { modo: "simples", cor: "#000000" },
    simbolo: {
      modo: "categorizado",
      campo: "TIPO",
      categorias: [
        { valor: "Sede", forma: "quadrado" },
        { valor: "Captação", forma: "triangulo" },
        { valor: "Outro", forma: "estrela" },
      ],
    },
  },
};

export const Formas = {
  render: () => (
    <div style={{ display: "flex", gap: 12, alignItems: "center" }}>
      <IconeFormaPonto forma="circulo" cor="#2c6b47" corBorda="#000" />
      <IconeFormaPonto forma="quadrado" cor="#2c6b47" corBorda="#000" />
      <IconeFormaPonto forma="triangulo" cor="#2c6b47" corBorda="#000" />
      <IconeFormaPonto forma="estrela" cor="#2c6b47" corBorda="#000" />
    </div>
  ),
};

export const Faixa = {
  render: () => <FaixaCores cores={["#00ff04", "#86d0fe", "#ff9500", "#fd8aff"]} />,
};
