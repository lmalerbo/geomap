import { useEffect, useRef, useState } from "react";
import usePosicaoNoPai from "./usePosicaoNoPai.js";
import { prefereMenosMovimento } from "./usePrefereMenosMovimento.js";
import { DURACAO_CONCLUIDO, gerarConfete } from "../../lib/movimento.js";

// Comemoração de fim — porte de Mo.concluido do Hub: véu branco, selo verde
// que se desenha, onda e confete curto por 1,9 s, por cima do elemento pai.
// Quem mostra tira da tela no `onFim` (ou troca a `key` para tocar de novo).
export default function Concluido({ texto = "Concluído", onFim }) {
  const ref = useRef(null);
  usePosicaoNoPai(ref);
  const [confete] = useState(() => (prefereMenosMovimento() ? [] : gerarConfete()));
  const aoFim = useRef(onFim);
  aoFim.current = onFim;

  useEffect(() => {
    const t = setTimeout(() => aoFim.current?.(), DURACAO_CONCLUIDO);
    return () => clearTimeout(t);
  }, []);

  return (
    <div ref={ref} className="mo-conc" role="status">
      <div className="mo-conc-fundo" />
      {confete.map((p, i) => (
        <i
          key={i}
          className="mo-conc-p"
          style={{
            background: p.cor,
            "--dx": `${p.dx}px`,
            "--dy": `${p.dy}px`,
            "--r": `${p.r}deg`,
            animationDelay: `${p.atraso}ms`,
          }}
        />
      ))}
      <div className="mo-conc-selo" aria-hidden="true">
        <div className="mo-conc-onda" />
        <svg viewBox="0 0 64 64">
          <circle cx="32" cy="32" r="32" />
          <path d="M19 33l9 9 17-19" />
        </svg>
      </div>
      <div className="mo-conc-txt">{texto}</div>
    </div>
  );
}
