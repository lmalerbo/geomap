// Regras de negócio do apontamento de voo que não dependem do DroneManagement
// em si — separadas de routes/voos.js pra serem testáveis sem rede/SSO.

// "Status" = A voar (formdata.controlStatus) — mesmo critério de pendente
// usado em GET /voos/pendentes.
export const CONTROL_STATUS_A_VOAR = 2;

// Antes de marcar um registro como voado, confere se ele AINDA está pendente
// no DroneManagement. Com a fila offline (apontamento guardado no celular sem
// sinal e enviado horas depois — redesenho fase 4, ver
// docs/REDESENHO_FRONTEND.md), o registro pode ter sido apontado ou cancelado
// por outra pessoa nesse meio-tempo; apontar de novo sobrescreveria a data de
// voo de verdade com a do lote atrasado. Devolve null quando pode apontar, ou
// o motivo (texto pro piloto) quando não pode.
export function motivoParaNaoApontar(registroAtual) {
  if (!registroAtual || registroAtual.controlStatus !== CONTROL_STATUS_A_VOAR) {
    return "Este talhão não estava mais pendente no DroneManagement — outra pessoa pode ter apontado ou cancelado o voo.";
  }
  return null;
}
