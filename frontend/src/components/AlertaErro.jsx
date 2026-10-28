// Mensagem de erro dos formulários de entrada. `semTremida`: quando o erro
// vem junto do ✕ do botão (useOcupado), só o botão treme — duas tremidas
// ao mesmo tempo ficam confusas.
export default function AlertaErro({ children, semTremida = false }) {
  return (
    <p className={semTremida ? "alerta-erro sem-tremida" : "alerta-erro"} role="alert">
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" />
        <line x1="12" y1="16" x2="12.01" y2="16" />
      </svg>
      {children}
    </p>
  );
}
