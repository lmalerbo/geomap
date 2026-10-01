import { useEffect, useState } from "react";

// Mesmo corte das regras de celular do index.css (max-width: 640px). Usado
// onde o layout do celular muda a ESTRUTURA da tela (gaveta inferior no
// lugar da barra de ferramentas — redesenho, fase 3), não só o estilo:
// renderizar os dois e esconder um via CSS duplicaria a lista de camadas.
const CONSULTA = "(max-width: 640px)";

export function useEhCelular() {
  const [ehCelular, setEhCelular] = useState(
    () => typeof window !== "undefined" && window.matchMedia(CONSULTA).matches
  );
  useEffect(() => {
    const mql = window.matchMedia(CONSULTA);
    const aoMudar = () => setEhCelular(mql.matches);
    mql.addEventListener("change", aoMudar);
    return () => mql.removeEventListener("change", aoMudar);
  }, []);
  return ehCelular;
}
