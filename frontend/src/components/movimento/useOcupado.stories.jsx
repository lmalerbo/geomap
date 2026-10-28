import { useState } from "react";
import { expect, userEvent, waitFor, within } from "storybook/test";
import useOcupado from "./useOcupado.js";

export default {
  title: "Movimento/useOcupado",
};

// Demonstração do hook: botão "Salvar" que espera 1200 ms e termina com
// sucesso ou com falha, conforme `falha`.
function DemoSalvar({ falha = false, opcoes = {}, classe = "botao", mostrarLiberar = false }) {
  const ocupado = useOcupado();
  const [erro, setErro] = useState(false);

  const aoClicar = async () => {
    setErro(false);
    try {
      await ocupado.executar(
        () =>
          new Promise((resolve, reject) =>
            setTimeout(() => (falha ? reject(new Error("falha")) : resolve()), 1200),
          ),
        { texto: "Salvando…", ...opcoes },
      );
    } catch {
      setErro(true);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      <button {...ocupado.propsBotao({ className: classe, onClick: aoClicar })}>
        {ocupado.conteudo("Salvar")}
      </button>
      {mostrarLiberar && (
        <button className="botao-secundario" onClick={ocupado.liberar}>
          Liberar
        </button>
      )}
      {erro && <p className="erro">Não foi possível salvar.</p>}
    </div>
  );
}

// Desmonta o componente que espera; o botão "Esconder" fica fora dele.
function DemoDesmontaNoMeio() {
  const [visivel, setVisivel] = useState(true);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, alignItems: "flex-start" }}>
      {visivel && <DemoSalvar />}
      <button className="botao-secundario" onClick={() => setVisivel(false)}>
        Esconder
      </button>
    </div>
  );
}

export const Sucesso = {
  render: () => <DemoSalvar />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const botao = canvas.getByRole("button", { name: "Salvar" });
    await userEvent.click(botao);
    await waitFor(() => expect(botao.getAttribute("aria-busy")).toBe("true"));
    expect(getComputedStyle(botao).opacity).toBe("1");
    // "Salvando…" é mais largo que "Salvar": o botão cresce em vez de cortar.
    await waitFor(() => expect(botao.scrollWidth).toBeLessThanOrEqual(botao.clientWidth));
    await waitFor(() => canvas.getByText("✓"), { timeout: 4000 });
    await waitFor(() => expect(botao.disabled).toBe(false), { timeout: 4000 });
  },
};

export const Erro = {
  render: () => <DemoSalvar falha />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Salvar" }));
    await waitFor(() => canvas.getByText("✕"), { timeout: 4000 });
    await waitFor(() => canvas.getByText("Não foi possível salvar."), { timeout: 4000 });
  },
};

export const Travado = {
  render: () => <DemoSalvar opcoes={{ travado: true }} mostrarLiberar />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const botao = canvas.getByRole("button", { name: "Salvar" });
    await userEvent.click(botao);
    await waitFor(() => canvas.getByText("✓"), { timeout: 4000 });
    await waitFor(() => expect(canvasElement.querySelector(".mo-sobre .ico")).toBeNull(), { timeout: 4000 });
    expect(botao.disabled).toBe(true);
    await userEvent.click(canvas.getByRole("button", { name: "Liberar" }));
    await waitFor(() => expect(botao.disabled).toBe(false));
  },
};

export const Secundario = {
  render: () => <DemoSalvar classe="botao-secundario" />,
};

export const DesmontaNoMeio = {
  render: () => <DemoDesmontaNoMeio />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "Salvar" }));
    await userEvent.click(canvas.getByRole("button", { name: "Esconder" }));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    expect(canvas.queryByRole("button", { name: "Salvar" })).toBeNull();
  },
};
