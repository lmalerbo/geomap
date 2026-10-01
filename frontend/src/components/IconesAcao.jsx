// Ícones de traço das barras de ação e do painel de atributos (redesenho,
// fase 2) — mesmo estilo dos ícones da barra de ferramentas.
function Svg({ tamanho = 18, children }) {
  return (
    <svg
      width={tamanho}
      height={tamanho}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export function IconeFechar() {
  return (
    <Svg>
      <path d="M6 6l12 12M18 6 6 18" />
    </Svg>
  );
}

export function IconeDesfazer() {
  return (
    <Svg>
      <path d="M9 14 4 9l5-5" />
      <path d="M4 9h11a5 5 0 0 1 0 10h-3" />
    </Svg>
  );
}

export function IconeCentralizar({ tamanho = 20 }) {
  return (
    <Svg tamanho={tamanho}>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2" />
    </Svg>
  );
}

export function IconeComoChegar({ tamanho = 20 }) {
  return (
    <Svg tamanho={tamanho}>
      <path d="m3 11 18-8-8 18-2-8-8-2Z" />
    </Svg>
  );
}

export function IconeCompartilhar({ tamanho = 20 }) {
  return (
    <Svg tamanho={tamanho}>
      <circle cx="18" cy="5" r="2.5" />
      <circle cx="6" cy="12" r="2.5" />
      <circle cx="18" cy="19" r="2.5" />
      <path d="m8.2 10.8 7.6-4.4M8.2 13.2l7.6 4.4" />
    </Svg>
  );
}

export function IconeAnterior() {
  return (
    <Svg tamanho={16}>
      <path d="m15 6-6 6 6 6" />
    </Svg>
  );
}

export function IconeProximo() {
  return (
    <Svg tamanho={16}>
      <path d="m9 6 6 6-6 6" />
    </Svg>
  );
}
