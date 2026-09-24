// Instância real do motor de sync de pins (lib/syncPins.js), com as
// dependências de verdade injetadas (fetch via api.js, IndexedDB via db.js).
// Mantido separado de syncPins.js pra esse arquivo continuar testável sem
// rede nem IndexedDB — ver syncPins.test.js.
import { criarSyncPins } from "./syncPins.js";
import { listarPinsRemoto, salvarPinRemoto, removerPinRemoto } from "./api.js";
import {
  salvarPinLocal,
  buscarPinLocal,
  removerPinLocal,
  listarPinsPendentes,
  listarTodosPins,
  obterCursorPins,
  salvarCursorPins,
} from "./db.js";

// Eventos de janela desacoplam o motor (chamado de sync.js, de usePins e do
// evento `online`) de quem desenha/avisa (usePins, usePinsPendentes).
export const EVENTO_PINS_ATUALIZADOS = "geomap:pins-atualizados";
export const EVENTO_PIN_DESCARTADO = "geomap:pin-descartado";

export function avisarPinsAtualizados(mapaIds) {
  window.dispatchEvent(new CustomEvent(EVENTO_PINS_ATUALIZADOS, { detail: { mapaIds } }));
}

export const syncPins = criarSyncPins({
  api: { listarPins: listarPinsRemoto, salvarPin: salvarPinRemoto, removerPin: removerPinRemoto },
  store: {
    salvar: salvarPinLocal,
    buscar: buscarPinLocal,
    remover: removerPinLocal,
    listarPendentes: listarPinsPendentes,
    listarTodos: listarTodosPins,
    obterCursor: obterCursorPins,
    salvarCursor: salvarCursorPins,
  },
  aoDescartar: (pin, erro) => {
    const mensagem =
      erro.status === 403
        ? `Você não tem mais permissão para anotar neste mapa. A anotação "${pin.titulo}" não foi enviada.`
        : `A anotação "${pin.titulo}" foi recusada pelo servidor: ${erro.message}`;
    window.dispatchEvent(new CustomEvent(EVENTO_PIN_DESCARTADO, { detail: { pin, mensagem } }));
  },
});

export async function enviarPinsPendentes(token) {
  const pendentesAntes = await listarPinsPendentes();
  await syncPins.enviarPendentes(token);
  avisarPinsAtualizados([...new Set(pendentesAntes.map((p) => p.mapaId))]);
}
