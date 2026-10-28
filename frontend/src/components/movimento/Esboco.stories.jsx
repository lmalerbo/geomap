import { useEffect, useRef, useState } from "react";
import { expect, waitFor } from "storybook/test";
import Esboco from "./Esboco.jsx";

export default {
  title: "Movimento/Esboco",
  component: Esboco,
};

const CAMADAS = ["Talhões", "Limites", "Municípios", "Malhas Viárias", "Unidades", "Pontos de Captação"];

// Botão "Recarregar" liga `carregando` por 1,5 s. Começa carregando e, no
// mount, termina sozinho depois de 1,5 s (senão o esboço nunca sai).
function DemoEsboco({ discreto = false, cascata = true, children }) {
  const [carregando, setCarregando] = useState(true);
  const timer = useRef(null);

  useEffect(() => {
    timer.current = setTimeout(() => setCarregando(false), 1500);
    return () => clearTimeout(timer.current);
  }, []);

  const recarregar = () => {
    clearTimeout(timer.current);
    setCarregando(true);
    timer.current = setTimeout(() => setCarregando(false), 1500);
  };

  return (
    <div style={{ width: 360 }}>
      <button className="botao-secundario" onClick={recarregar}>
        Recarregar
      </button>
      <Esboco carregando={carregando} discreto={discreto} cascata={cascata} style={{ marginTop: 12 }}>
        {children}
      </Esboco>
    </div>
  );
}

const listaCamadas = (
  <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
    {CAMADAS.map((nome) => (
      <li key={nome} style={{ padding: "8px 0", borderBottom: "1px solid var(--border)" }}>
        {nome}
      </li>
    ))}
  </ul>
);

export const Lista = {
  render: () => <DemoEsboco>{listaCamadas}</DemoEsboco>,
  play: async ({ canvasElement }) => {
    const contorno = canvasElement.querySelector('[aria-busy="true"]');
    expect(contorno).not.toBeNull();
    expect(contorno.querySelector(".mo-esboco")).not.toBeNull();
    await waitFor(() => expect(canvasElement.querySelector(".mo-esboco")).toBeNull(), { timeout: 4000 });
  },
};

export const Discreto = {
  render: () => (
    <DemoEsboco discreto>
      <div style={{ display: "flex", gap: 24 }}>
        <div>
          <strong style={{ fontSize: 28 }}>128</strong> hectares pendentes
        </div>
        <div>
          <strong style={{ fontSize: 28 }}>14</strong> talhões
        </div>
      </div>
    </DemoEsboco>
  ),
};

export const SemCascata = {
  render: () => <DemoEsboco cascata={false}>{listaCamadas}</DemoEsboco>,
};
