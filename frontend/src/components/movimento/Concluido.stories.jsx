import { useState } from "react";
import { expect, waitFor, within } from "storybook/test";
import Concluido from "./Concluido.jsx";

export default {
  title: "Movimento/Concluido",
  component: Concluido,
};

const cartao = { width: 420, height: 260, border: "1px solid var(--border)", borderRadius: 14, background: "#eef0e8" };

function DemoConcluido() {
  const [chave, setChave] = useState(0);
  const [fins, setFins] = useState(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={cartao}>
        <Concluido key={chave} texto="Camada pronta" onFim={() => setFins((n) => n + 1)} />
      </div>
      <p>
        onFim chamado <strong className="contador">{fins}</strong> vez(es)
      </p>
      <button className="botao-secundario" onClick={() => setChave((k) => k + 1)}>
        Tocar de novo
      </button>
    </div>
  );
}

export const NoCartao = {
  render: () => <DemoConcluido />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    expect(canvas.getByRole("status").textContent).toContain("Camada pronta");
    await waitFor(() => expect(canvasElement.querySelector(".contador").textContent).toBe("1"), {
      timeout: 4000,
    });
  },
};
