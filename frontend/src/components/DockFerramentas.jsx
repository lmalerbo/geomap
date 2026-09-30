// Barra de ferramentas à esquerda do mapa (redesenho, fase 1 — ver
// docs/REDESENHO_FRONTEND.md). Ícone + rótulo em cada botão: substitui os
// botões sem nome que antes ficavam misturados com zoom/bússola no canto
// direito. Grupos separados por um divisor: consulta (abre painel ao lado)
// e ferramentas (mudam o que o clique no mapa faz).
export default function DockFerramentas({ grupos }) {
  const gruposVisiveis = grupos.map((g) => g.filter((item) => item.visivel !== false)).filter((g) => g.length > 0);
  return (
    <nav className="dock-ferramentas" aria-label="Ferramentas do mapa">
      {gruposVisiveis.map((itens, i) => (
        <div key={i} className="dock-grupo">
          {i > 0 && <span className="dock-divisor" aria-hidden="true" />}
          {itens.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`dock-botao${item.ativo ? " ativo" : ""}`}
              onClick={item.aoClicar}
              aria-pressed={item.ativo}
              aria-label={item.rotuloCompleto || item.rotulo}
              title={item.rotuloCompleto || item.rotulo}
            >
              {item.icone}
              <span className="dock-rotulo" aria-hidden="true">
                {item.rotulo}
              </span>
            </button>
          ))}
        </div>
      ))}
    </nav>
  );
}

function Svg({ children }) {
  return (
    <svg
      width="22"
      height="22"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconeDockCamadas() {
  return (
    <Svg>
      <path d="M12 3 3 8l9 5 9-5-9-5Z" />
      <path d="m3 13 9 5 9-5" />
    </Svg>
  );
}

export function IconeDockMedir() {
  return (
    <Svg>
      <path d="M3 17 17 3l4 4L7 21l-4-4Z" />
      <path d="m7 13 2 2M10 10l2 2M13 7l2 2" />
    </Svg>
  );
}

export function IconeDockPercurso() {
  return (
    <Svg>
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="5" r="2" />
      <path d="M8 19h7a3.5 3.5 0 0 0 0-7H9a3.5 3.5 0 0 1 0-7h7" />
    </Svg>
  );
}

export function IconeDockAnotar() {
  return (
    <Svg>
      <path d="M12 21s-6-5.3-6-11a6 6 0 0 1 12 0c0 5.7-6 11-6 11Z" />
      <path d="M12 7.5v5M9.5 10h5" />
    </Svg>
  );
}

export function IconeDockTipoVoo() {
  return (
    <Svg>
      <path d="M9 6h11M9 12h11M9 18h11" />
      <circle cx="4.5" cy="6" r="1.5" />
      <circle cx="4.5" cy="12" r="1.5" />
      <circle cx="4.5" cy="18" r="1.5" />
    </Svg>
  );
}
