import { useEffect, useState } from "react";
import { expect, within } from "storybook/test";
import Progresso from "./Progresso.jsx";

const MB = 1048576;

export default {
  title: "Movimento/Progresso",
  component: Progresso,
};

// Simula um envio de 20 MB em ~3 s, depois grava no servidor (1,5 s) e termina.
function DemoSimulado() {
  const [rodada, setRodada] = useState(0);
  const [valor, setValor] = useState(0);
  const [estado, setEstado] = useState("enviando");

  useEffect(() => {
    setValor(0);
    setEstado("enviando");
    let passos = 0;
    let fim;
    const avanco = setInterval(() => {
      passos += 1;
      setValor(Math.round((20 * MB * passos) / 50));
      if (passos >= 50) {
        clearInterval(avanco);
        setEstado("processando");
        fim = setTimeout(() => setEstado("ok"), 1500);
      }
    }, 60);
    return () => {
      clearInterval(avanco);
      clearTimeout(fim);
    };
  }, [rodada]);

  const texto = estado === "ok" ? "Pronto para usar sem internet" : undefined;

  return (
    <div style={{ width: 420, display: "flex", flexDirection: "column", gap: 12 }}>
      <Progresso valor={valor} total={20 * MB} estado={estado} texto={texto} />
      <button className="botao-secundario" onClick={() => setRodada((r) => r + 1)}>
        Recomeçar
      </button>
    </div>
  );
}

export const Enviando = {
  args: {
    valor: 8 * MB,
    total: 31 * MB,
    texto: "Talhões · 2 de 6 camadas",
    estado: "enviando",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const barra = canvas.getByRole("progressbar");
    expect(barra.getAttribute("aria-valuenow")).toBe("26");
    expect(canvasElement.textContent).toContain("8 MB de 31 MB");
  },
};

export const Simulado = {
  render: () => <DemoSimulado />,
};

export const Erro = {
  args: {
    valor: 12 * MB,
    total: 31 * MB,
    estado: "erro",
    texto: "Sem conexão",
  },
};

export const PorPassos = {
  args: {
    mb: false,
    valor: 3,
    total: 6,
  },
};
