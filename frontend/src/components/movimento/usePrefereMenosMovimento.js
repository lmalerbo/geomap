import { useEffect, useState } from "react";

const CONSULTA = "(prefers-reduced-motion: reduce)";

function consultar() {
  return typeof window !== "undefined" && !!window.matchMedia && window.matchMedia(CONSULTA).matches;
}

// Para o que o CSS sozinho não resolve: confete (não é nem gerado) e a
// duração do pouso do drone (Web Animations API).
export function prefereMenosMovimento() {
  return consultar();
}

export default function usePrefereMenosMovimento() {
  const [calmo, setCalmo] = useState(consultar);
  useEffect(() => {
    if (!window.matchMedia) return undefined;
    const mq = window.matchMedia(CONSULTA);
    const aoMudar = () => setCalmo(mq.matches);
    mq.addEventListener("change", aoMudar);
    return () => mq.removeEventListener("change", aoMudar);
  }, []);
  return calmo;
}
