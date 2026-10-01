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

// Falhas Soca só é voada em certos estágios, que dependem da safra do
// talhão (pedido do Leo, 2026-10-01). Códigos de estágio do DroneManagement
// (layerDetails.internship) confirmados cruzando o ESTAGIO da camada
// Talhões publicada com os registros do DroneManagement.
//
// Ainda sem código confirmado (nenhum talhão nesses estágios tinha
// cadastro no DroneManagement em 2026-10-01): INVERNO FORMAÇÃO e ANO
// FORMAÇÃO (safra 2026), REMAN-02° (2026 e 2027) e REMAN-03° (2027). Pelo
// padrão observado (18 MESES = 51, 18 MESES FORMAÇÃO = 50), os de formação
// devem ser 60 e 40 — entram aqui quando houver um caso real que confirme.
export const ESTAGIO = {
  CORTE_02: 2,
  CORTE_03: 3,
  ANO: 41,
  DEZOITO_MESES_FORMACAO: 50,
  DEZOITO_MESES: 51,
  INVERNO: 61,
};

export const ESTAGIOS_FALHAS_SOCA_POR_SAFRA = {
  2026: new Set([ESTAGIO.INVERNO, ESTAGIO.ANO, ESTAGIO.DEZOITO_MESES, ESTAGIO.DEZOITO_MESES_FORMACAO, ESTAGIO.CORTE_02]),
  2027: new Set([ESTAGIO.CORTE_02, ESTAGIO.CORTE_03]),
};

// Muda sempre que a regra acima mudar: o cache de pendências
// (voos_pendentes_cache) guarda esse texto e é descartado quando não bate,
// senão a regra nova só valeria quando a contagem do DroneManagement
// mudasse por outro motivo.
export const VERSAO_REGRA_PENDENTES = "falhas-soca-safra-v1";

export function estagioValidoParaFalhasSoca(layerDetails) {
  const permitidos = ESTAGIOS_FALHAS_SOCA_POR_SAFRA[layerDetails?.harvest];
  return Boolean(permitidos?.has(layerDetails?.internship));
}
