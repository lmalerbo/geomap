import {
  CONTROL_STATUS_A_VOAR,
  estagioValidoParaFalhasSoca,
  ehFalhasUrgente,
  dataReferenciaVoo,
} from "./regrasApontamento.js";

// Regra de "pendente de voo" — extraída de routes/voos.js (2026-10-01) pra
// ser a mesma no mapa de Voos e nos indicadores de voo ("a voar").

// Critério de "pendente pra voar de verdade" — pedido explícito do Leo
// (2026-09-22), depois de reparar que talhões com Verificar Porte
// "Aguardar porte"/"Verificar porte" (valores 2/3) apareciam no mapa como
// se estivessem prontos, mesmo Status já mostrando "A voar": esses dois
// valores só significam "na fila, esperando o porte da cana", não "pode
// voar agora" — só 4 (Voar), 5 (Voo liberado) e 6 (Voar urgente) são de
// verdade acionáveis. Restrito ainda mais aqui (só 5/6, sem o 4) porque
// foi exatamente o que o Leo pediu ao descrever a regra.
export const VERIFY_FLIGHT_SIZE_PRONTOS = [5, 6]; // "Verificar Porte" = Voo liberado, Voar urgente

// Falhas Soca tem uma trava extra: só considerar pendente quem está nos
// estágios permitidos pra safra do talhão (layerDetails.harvest +
// layerDetails.internship) — ver estagioValidoParaFalhasSoca em
// lib/regrasApontamento.js. Antes era só 02º/03º Corte em qualquer safra.
const FINALIDADE_FALHAS_SOCA = "Falhas Soca";

// Falhas Soca também não voa em área de fornecedor (Propriedade =
// layerDetails.transferProperty) — pedido do Leo (2026-09-24), mesmo
// critério do script de limpeza _cancelar_fornecedores_soca.mjs. Precisa
// estar aqui também porque o DroneManagement reagenda sozinho o que foi
// cancelado. Só vale pra Falhas Soca: Falhas Plantio voa em fornecedor
// de verdade.
export const PROPRIEDADES_FORNECEDOR = new Set(["FORNECEDOR", "FORNEC. SUBPARCERIA", "FORNECEDOR TROCA"]);

export function filtroPendentesDroneMgmt(unitId) {
  return JSON.stringify({
    $and: [
      { unitId: `UUID('${unitId}')` },
      { controlStatus: CONTROL_STATUS_A_VOAR },
      { $or: VERIFY_FLIGHT_SIZE_PRONTOS.map((v) => ({ verifyFlightSize: v })) },
    ],
  });
}

export function mapearRegistroPendente(r) {
  const projeto = r.flightProjectDetails?.description || null;
  return {
    id: r.id,
    // Nome do projeto/campanha de voo (ex: "Falhas Plantio", "Projeto
    // Plantio") — vem de flightProjectDetails porque pedimos
    // expand=flightProject na query; sem isso só teríamos o uuid
    // de flightProject, inútil pra mostrar/filtrar na tela.
    projeto,
    secao: r.section,
    talhao: r.landPlot,
    controlStatus: r.controlStatus,
    verifyFlightSize: r.verifyFlightSize,
    // Área do talhão em hectares (layerDetails.totalArea, vem de
    // expand=layer) — pedido do Leo (2026-08-20) pra mostrar
    // hectares pendentes em vez de contagem de talhões no painel do
    // mapa (ver useApontamentoVoo.js).
    areaHa: r.layerDetails?.totalArea ?? null,
    // Área de fornecedor (mesmo PROPRIEDADES_FORNECEDOR usado acima pra
    // excluir Falhas Soca) — aqui em TODO registro, não só Falhas Soca,
    // porque Falhas Plantio voa em fornecedor de verdade e só precisa
    // dessa informação pra se destacar com outra cor no mapa (pedido do
    // Leo, 2026-09-29), não pra ser filtrado.
    fornecedor: PROPRIEDADES_FORNECEDOR.has(r.layerDetails?.transferProperty),
    // Falhas com Voar urgente ganham pontilhado vermelho no mapa; a data de
    // referência vira a legenda de dias corridos de cada talhão (pedido do
    // Leo, 2026-10-01 — ver regrasApontamento.js).
    urgente: ehFalhasUrgente(projeto, r.verifyFlightSize),
    dataReferencia: dataReferenciaVoo(projeto, r),
    // Propriedade crua — os indicadores de voo dividem Falhas Plantio em
    // próprio/fornecedor por ela (qualquer valor com "FORNEC").
    propriedade: r.layerDetails?.transferProperty ?? null,
  };
}

// Falhas Soca fora dos estágios permitidos pra safra ou em área de
// fornecedor não conta como pendente de verdade (ver
// estagioValidoParaFalhasSoca e PROPRIEDADES_FORNECEDOR acima) — as
// outras finalidades não têm essas travas extras.
export function filtrarEMapearPendentes(brutos) {
  return brutos
    .filter((r) => {
      if (r.flightProjectDetails?.description === FINALIDADE_FALHAS_SOCA) {
        return (
          estagioValidoParaFalhasSoca(r.layerDetails) &&
          !PROPRIEDADES_FORNECEDOR.has(r.layerDetails?.transferProperty)
        );
      }
      return true;
    })
    .map(mapearRegistroPendente);
}
