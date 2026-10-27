import { Campo } from "./movimento/index.js";

// Aparece no login quando a resposta passa de 8 s (useFormularioLogin):
// o backend no Render dorme e a primeira entrada do dia demora.
export default function NotaServidorAcordando() {
  return (
    <p className="nota-espera" role="status">
      <Campo tamanho="pequeno" />
      <span>
        O servidor estava em repouso e está acordando. A primeira entrada do dia leva até 1
        minuto.
      </span>
    </p>
  );
}
