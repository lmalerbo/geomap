// Instância real da fila de apontamentos (lib/filaApontamentos.js) com as
// dependências de verdade (api.js + IndexedDB). Mesmo esquema de
// syncPinsApp.js: um evento de janela avisa quem desenha/mostra (o hook do
// apontamento) sem acoplar o motor a React.
import { criarFilaApontamentos } from "./filaApontamentos.js";
import { apontarVoos } from "./api.js";
import { salvarLoteApontamento, removerLoteApontamento, listarLotesApontamento } from "./db.js";

export const EVENTO_FILA_APONTAMENTOS = "geomap:fila-apontamentos";

export const filaApontamentos = criarFilaApontamentos({
  api: { apontar: apontarVoos },
  store: { salvar: salvarLoteApontamento, remover: removerLoteApontamento, listar: listarLotesApontamento },
  aoMudar: (detalhe) => window.dispatchEvent(new CustomEvent(EVENTO_FILA_APONTAMENTOS, { detail: detalhe })),
});

// Só um envio por vez: o evento `online` e a sincronização geral podem
// disparar juntos, e dois envios do mesmo lote apontariam o voo duas vezes.
let envioEmAndamento = null;
export function enviarApontamentosPendentes(token) {
  if (!envioEmAndamento) {
    envioEmAndamento = filaApontamentos.enviarPendentes(token).finally(() => {
      envioEmAndamento = null;
    });
  }
  return envioEmAndamento;
}
