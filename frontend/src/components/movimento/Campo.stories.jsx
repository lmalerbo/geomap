import { expect } from "storybook/test";
import Campo from "./Campo.jsx";

export default {
  title: "Movimento/Campo",
  component: Campo,
};

const TAMANHOS = [
  ["normal", "Normal"],
  ["grande", "Grande"],
  ["pequeno", "Pequeno"],
];

export const Tamanhos = {
  render: () => (
    <div style={{ display: "flex", gap: 32, alignItems: "flex-end" }}>
      {TAMANHOS.map(([tamanho, rotulo]) => (
        <div key={tamanho} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8 }}>
          <Campo tamanho={tamanho} />
          <span style={{ fontSize: 12 }}>{rotulo}</span>
        </div>
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const campos = canvasElement.querySelectorAll(".mo-campo");
    expect(campos.length).toBe(3);
    campos.forEach((campo) => {
      expect(campo.querySelectorAll("i").length).toBe(4);
      expect(campo.getAttribute("aria-hidden")).toBe("true");
    });
  },
};

export const DentroDeBotao = {
  render: () => (
    <button className="botao">
      <Campo herdaCor tamanho="pequeno" /> Entrando…
    </button>
  ),
};

export const ComTextoRespirando = {
  render: () => (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <Campo tamanho="grande" />
      <p className="mo-respira">Abrindo o mapa…</p>
    </div>
  ),
};
