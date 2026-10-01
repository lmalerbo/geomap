import { useEffect, useState } from "react";
import { buscarAcessoIndicadores } from "../lib/api.js";

// Decide se o link "Indicadores de voo" aparece no menu. Admin sempre;
// piloto descoberto pelo backend (pilotos_dronemgmt). A última resposta fica
// salva por usuário pra o link continuar aparecendo offline.
export function usePodeVerIndicadores(sessao) {
  const ehAdmin = sessao?.usuario?.papel === "admin";
  const chave = `geomap_pode_ver_indicadores_${sessao?.usuario?.id ?? ""}`;
  const [podeVer, setPodeVer] = useState(() => {
    if (ehAdmin) return true;
    try {
      return localStorage.getItem(chave) === "1";
    } catch {
      return false;
    }
  });

  useEffect(() => {
    if (ehAdmin || !sessao?.token) return;
    let cancelado = false;
    buscarAcessoIndicadores(sessao.token)
      .then(({ podeVer: pode }) => {
        if (cancelado) return;
        setPodeVer(pode);
        try {
          localStorage.setItem(chave, pode ? "1" : "0");
        } catch {
          // sem armazenamento: só não lembra offline
        }
      })
      .catch(() => {}); // offline: fica com o valor salvo
    return () => {
      cancelado = true;
    };
  }, [ehAdmin, sessao?.token, chave]);

  return ehAdmin || podeVer;
}
