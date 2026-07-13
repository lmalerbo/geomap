import { useState } from "react";
import { MemoryRouter } from "react-router-dom";
import MenuLateral from "./MenuLateral.jsx";

// MenuLateral usa <Link> (react-router-dom) — precisa de um Router por
// baixo mesmo isolado no Storybook, senão quebra ao renderizar os itens
// de admin.
function ComRouter(Story) {
  return (
    <MemoryRouter>
      <Story />
    </MemoryRouter>
  );
}

export default {
  title: "Componentes/MenuLateral",
  component: MenuLateral,
  decorators: [ComRouter],
  parameters: {
    // O componente é position:fixed cobrindo a tela inteira (backdrop +
    // aside) — o layout "fullscreen" do Storybook mostra a transição de
    // verdade em vez de espremer num iframe pequeno.
    layout: "fullscreen",
  },
  args: {
    aoFechar: () => {},
    aoSair: () => {},
  },
};

// Estados fixos — dá pra inspecionar cada um parado (sem interação) e
// comparar lado a lado no painel de Controls.
export const FechadoUsuarioComum = {
  args: { aberto: false, ehAdmin: false },
};

export const AbertoUsuarioComum = {
  args: { aberto: true, ehAdmin: false },
};

export const AbertoAdmin = {
  args: { aberto: true, ehAdmin: true },
};

// Story interativa: um botão fora do componente liga/desliga `aberto`,
// pra ver a transição de slide+fade rodar de verdade (não só o
// estado final), igual aconteceria clicando no botão de menu real.
export const TransicaoAoVivo = {
  render: function Render(args) {
    const [aberto, setAberto] = useState(false);
    return (
      <>
        <button
          type="button"
          style={{ position: "fixed", top: 16, left: 16, zIndex: 30, padding: "8px 16px" }}
          onClick={() => setAberto((v) => !v)}
        >
          {aberto ? "Fechar menu" : "Abrir menu"}
        </button>
        <MenuLateral {...args} aberto={aberto} aoFechar={() => setAberto(false)} />
      </>
    );
  },
  args: { ehAdmin: true },
};
