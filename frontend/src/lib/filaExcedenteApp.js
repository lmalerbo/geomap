// Instância real da fila do Plantio Excedente (motor em filaExcedente.js),
// mesmo esquema de filaApontamentosApp.js.
import { criarFilaExcedente } from "./filaExcedente.js";
import { apontarExcedente } from "./api.js";
import { salvarItemFilaExcedente, removerItemFilaExcedente, listarFilaExcedente } from "./db.js";

export const EVENTO_FILA_EXCEDENTE = "geomap:fila-excedente";

export const filaExcedente = criarFilaExcedente({
  api: { apontar: apontarExcedente },
  store: { salvar: salvarItemFilaExcedente, remover: removerItemFilaExcedente, listar: listarFilaExcedente },
  aoMudar: (detalhe) => window.dispatchEvent(new CustomEvent(EVENTO_FILA_EXCEDENTE, { detail: detalhe })),
});

export function assinarFilaExcedente(fn) {
  const ouvinte = (e) => fn(e.detail);
  window.addEventListener(EVENTO_FILA_EXCEDENTE, ouvinte);
  return () => window.removeEventListener(EVENTO_FILA_EXCEDENTE, ouvinte);
}

// Só um envio por vez (evento `online`, intervalo e apontamento novo podem
// disparar juntos).
let envioEmAndamento = null;
export function enviarExcedentePendentes(token) {
  if (!envioEmAndamento) {
    envioEmAndamento = filaExcedente.enviarPendentes(token).finally(() => {
      envioEmAndamento = null;
    });
  }
  return envioEmAndamento;
}
