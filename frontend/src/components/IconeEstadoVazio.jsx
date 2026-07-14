// Ícone compartilhado pros "empty states" do app (sem mapas, sem camadas,
// sem downloads, busca sem resultado) — antes era só texto puro em todo
// lugar. Mesmo estilo de traço (stroke 2px, currentColor) dos ícones já
// existentes em Mapa.jsx/MenuLateral.jsx, pra não destoar visualmente.
// Placeholder até a conexão com o MCP do Lordicon ser resolvida (ver
// PROPOSTA_ANIMACOES.md) — trocar por um ícone animado (buscar "empty
// box"/"no data") quando disponível, mantendo o mesmo tamanho/posição.
export default function IconeEstadoVazio({ tamanho = 20 }) {
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
      style={{ flexShrink: 0 }}
    >
      <path d="M3 8.5 12 4l9 4.5-9 4.5-9-4.5Z" />
      <path d="M3 8.5V16l9 4.5 9-4.5V8.5" />
      <path d="M12 13v7.5" strokeDasharray="2 2.5" />
    </svg>
  );
}
