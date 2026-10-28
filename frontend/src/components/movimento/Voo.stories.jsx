import { useEffect, useState } from "react";
import { expect, waitFor, within } from "storybook/test";
import Voo from "./Voo.jsx";

const quadro = { width: 420, height: 260, border: "1px solid var(--border)", borderRadius: 14, background: "#eef0e8" };

export default {
  title: "Movimento/Voo",
  component: Voo,
  render: (args) => (
    <div style={quadro}>
      <Voo {...args} />
    </div>
  ),
};

export const Voando = {
  args: {
    texto: "Convertendo Talhões · 3 min",
  },
  play: async ({ canvasElement }) => {
    const voo = canvasElement.querySelector(".mo-voo");
    expect(voo).not.toBeNull();
    expect(voo.textContent).toContain("Convertendo Talhões · 3 min");
  },
};

export const ContinuaDeOndeEstava = {
  render: () => (
    <div style={quadro}>
      <Voo texto="Convertendo Talhões · 3 min" desde={Date.now() - 5000} />
    </div>
  ),
};

// Voa 2,5 s e depois recebe o resultado do pouso.
function DemoPouso({ ok, textoPouso }) {
  const [pousar, setPousar] = useState(false);
  const [fins, setFins] = useState(0);

  useEffect(() => {
    const t = setTimeout(() => setPousar(true), 2500);
    return () => clearTimeout(t);
  }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <div style={quadro}>
        <Voo
          texto="Convertendo Talhões"
          pouso={pousar ? { ok, texto: textoPouso } : null}
          onFim={() => setFins((n) => n + 1)}
        />
      </div>
      <p>
        onFim chamado <strong className="contador">{fins}</strong> vez(es)
      </p>
    </div>
  );
}

// "Repetir" remonta o demo com nova key.
function ComRepetir({ ok, textoPouso }) {
  const [chave, setChave] = useState(0);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <DemoPouso key={chave} ok={ok} textoPouso={textoPouso} />
      <button className="botao-secundario" onClick={() => setChave((k) => k + 1)}>
        Repetir
      </button>
    </div>
  );
}

export const PousoOk = {
  render: () => <ComRepetir ok textoPouso="Camada pronta" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByText("Camada pronta"), { timeout: 8000 });
    await waitFor(() => expect(canvasElement.querySelector(".contador").textContent).toBe("1"), {
      timeout: 4000,
    });
  },
};

export const PousoErro = {
  render: () => <ComRepetir ok={false} textoPouso="Shapefile sem .prj" />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await waitFor(() => canvas.getByText("✕ Shapefile sem .prj"), { timeout: 8000 });
    await waitFor(() => expect(canvasElement.querySelector(".contador").textContent).toBe("1"), {
      timeout: 4000,
    });
  },
};
