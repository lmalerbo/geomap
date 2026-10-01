import { useEffect, useState } from "react";
import { listarLotesApontamento } from "../lib/db.js";
import { EVENTO_FILA_APONTAMENTOS } from "../lib/filaApontamentosApp.js";

// Lotes da fila offline de apontamentos (redesenho, fase 4) — pendentes
// (aguardando sinal) e recusados (o servidor não aceitou; aguardam o piloto
// tentar de novo ou descartar). Recarrega a cada mudança da fila e de tempos
// em tempos (a fila pode ser esvaziada pela sincronização geral).
export function useApontamentosNaFila() {
  const [lotes, setLotes] = useState([]);
  useEffect(() => {
    let ativo = true;
    async function atualizar() {
      const todos = await listarLotesApontamento().catch(() => []);
      if (ativo) setLotes(todos);
    }
    atualizar();
    window.addEventListener(EVENTO_FILA_APONTAMENTOS, atualizar);
    const intervalo = setInterval(atualizar, 15000);
    return () => {
      ativo = false;
      window.removeEventListener(EVENTO_FILA_APONTAMENTOS, atualizar);
      clearInterval(intervalo);
    };
  }, []);

  const pendentes = lotes.filter((l) => l.estado === "pendente");
  const recusados = lotes.filter((l) => l.estado === "recusado");
  return {
    lotes,
    pendentes,
    recusados,
    qtdPendentes: pendentes.reduce((n, l) => n + l.registros.length, 0),
    idsNaFila: new Set(pendentes.flatMap((l) => l.registros.map((r) => r.id))),
  };
}
