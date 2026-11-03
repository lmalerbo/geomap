// Instância real da fila do Plantio Excedente (motor em filaExcedente.js),
// mesmo esquema de filaApontamentosApp.js.
import { criarFilaExcedente, criarEnvioUnico } from "./filaExcedente.js";
import { apontarExcedente } from "./api.js";
import { salvarItemFilaExcedente, removerItemFilaExcedente, listarFilaExcedente, salvarCasosExcedente } from "./db.js";

export const EVENTO_FILA_EXCEDENTE = "geomap:fila-excedente";

export const filaExcedente = criarFilaExcedente({
  api: { apontar: apontarExcedente },
  store: { salvar: salvarItemFilaExcedente, remover: removerItemFilaExcedente, listar: listarFilaExcedente },
  aoMudar: (detalhe) => {
    // Guarda no aparelho os casos que voltaram do envio (também quando o
    // envio vem do sync geral, com o mapa fechado).
    for (const [mapaId, casos] of Object.entries(detalhe.casosPorMapa || {})) {
      salvarCasosExcedente(Number(mapaId), casos).catch(() => {});
    }
    window.dispatchEvent(new CustomEvent(EVENTO_FILA_EXCEDENTE, { detail: detalhe }));
  },
});

export function assinarFilaExcedente(fn) {
  const ouvinte = (e) => fn(e.detail);
  window.addEventListener(EVENTO_FILA_EXCEDENTE, ouvinte);
  return () => window.removeEventListener(EVENTO_FILA_EXCEDENTE, ouvinte);
}

// Evento `online`, intervalo, sync geral e apontamento novo podem disparar juntos.
export const enviarExcedentePendentes = criarEnvioUnico((token) => filaExcedente.enviarPendentes(token));
