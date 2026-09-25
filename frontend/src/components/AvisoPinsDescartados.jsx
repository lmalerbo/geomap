import { useEffect } from "react";
import { useJobs } from "../context/JobsContext.jsx";
import { EVENTO_PIN_DESCARTADO } from "../lib/syncPinsApp.js";

// Avisa (toast global) quando o servidor recusa de vez uma anotação
// pendente — em qualquer tela, não só no mapa do pin: o envio também roda
// pela sincronização da tela inicial e pelo evento `online`. Montado no
// App.jsx dentro do JobsProvider (dono da pilha de toasts).
export default function AvisoPinsDescartados() {
  const { adicionarToast } = useJobs();
  useEffect(() => {
    function aoDescartar(e) {
      adicionarToast({ tipo: "erro", mensagem: e.detail.mensagem });
    }
    window.addEventListener(EVENTO_PIN_DESCARTADO, aoDescartar);
    return () => window.removeEventListener(EVENTO_PIN_DESCARTADO, aoDescartar);
  }, [adicionarToast]);
  return null;
}
