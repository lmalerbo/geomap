import { useEffect, useState } from "react";
import { listarPinsPendentes } from "../lib/db.js";
import { EVENTO_PINS_ATUALIZADOS } from "../lib/syncPinsApp.js";

// Quantas anotações ainda não foram enviadas (todos os mapas) — usado no
// cabeçalho e para avisar antes de sair da conta.
export function usePinsPendentes() {
  const [quantidade, setQuantidade] = useState(0);
  useEffect(() => {
    let ativo = true;
    async function atualizar() {
      const n = (await listarPinsPendentes()).length;
      if (ativo) setQuantidade(n);
    }
    atualizar();
    window.addEventListener(EVENTO_PINS_ATUALIZADOS, atualizar);
    const intervalo = setInterval(atualizar, 15000);
    return () => {
      ativo = false;
      window.removeEventListener(EVENTO_PINS_ATUALIZADOS, atualizar);
      clearInterval(intervalo);
    };
  }, []);
  return quantidade;
}

// Confirmação de saída da conta quando há anotações ainda não enviadas —
// usado por handleSair em Mapa.jsx e Inicio.jsx (extraído pra não duplicar
// o mesmo texto/regra nos dois lugares, achado de revisão 2026-09-25).
// Retorna true quando pode seguir com o logout (sem pendentes, ou o usuário
// confirmou mesmo assim).
export function confirmarSaidaComPendentes(quantidade) {
  if (quantidade <= 0) return true;
  return window.confirm(
    `Você tem ${quantidade} anotação(ões) ainda não enviada(s). Sair agora vai descartá-las. Sair mesmo assim?`
  );
}
