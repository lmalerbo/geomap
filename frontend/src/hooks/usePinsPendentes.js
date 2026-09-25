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
