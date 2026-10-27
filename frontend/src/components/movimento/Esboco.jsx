import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Campo from "./Campo.jsx";
import { prefereMenosMovimento } from "./usePrefereMenosMovimento.js";
import { linhasEsboco, MAX_CASCATA, PASSO_CASCATA, SAIDA_ESBOCO } from "../../lib/movimento.js";

// Carregando / pronto — porte de Mo.carregando e Mo.pronto do Hub.
// Enquanto `carregando`, um esboço de linhas com brilho cobre o conteúdo
// (que fica apagado). Ao terminar, o esboço some e os 10 primeiros filhos
// entram em cascata curta. `discreto`: o conteúdo continua à vista, só uma
// linha de luz no topo e o campo no canto (recarga curta de um painel que
// já está na tela). `cascata={false}`: sem cascata (mapa, painel redesenhado).
export default function Esboco({
  carregando = false,
  discreto = false,
  cascata = true,
  linhas,
  as: Elemento = "div",
  className = "",
  children,
  ...resto
}) {
  const ref = useRef(null);
  const [esboco, setEsboco] = useState(carregando ? "visivel" : null); // visivel | saindo | null
  const [nLinhas, setNLinhas] = useState(linhas ?? 6);
  const estavaCarregando = useRef(carregando);

  useLayoutEffect(() => {
    if (carregando) {
      setNLinhas(linhas ?? linhasEsboco(ref.current?.clientHeight));
      setEsboco("visivel");
    }
  }, [carregando, linhas]);

  useEffect(() => {
    const terminou = estavaCarregando.current && !carregando;
    estavaCarregando.current = carregando;
    if (!terminou) return undefined;

    setEsboco("saindo");
    const t = setTimeout(() => setEsboco(null), SAIDA_ESBOCO);

    if (cascata && !prefereMenosMovimento() && ref.current) {
      [...ref.current.children]
        .filter((filho) => !filho.classList.contains("mo-esboco"))
        .slice(0, MAX_CASCATA)
        .forEach((filho, i) => {
          filho.style.animationDelay = `${i * PASSO_CASCATA}ms`;
          filho.classList.add("mo-surge");
          filho.addEventListener(
            "animationend",
            () => {
              filho.classList.remove("mo-surge");
              filho.style.animationDelay = "";
            },
            { once: true },
          );
        });
    }
    return () => clearTimeout(t);
  }, [carregando, cascata]);

  // mo-esboco-pai segura o position:relative também nos 180 ms de saída,
  // quando mo-carregando já saiu (senão o esboço escapa do contêiner).
  const classes = [className];
  if (esboco) classes.push("mo-esboco-pai");
  if (carregando) classes.push("mo-carregando");
  if (esboco && discreto) classes.push("mo-discreto");

  return (
    <Elemento ref={ref} className={classes.filter(Boolean).join(" ") || undefined} aria-busy={carregando || undefined} {...resto}>
      {children}
      {esboco && (
        <div className={`mo-esboco${esboco === "saindo" ? " mo-sai" : ""}`} aria-hidden="true">
          {!discreto && Array.from({ length: nLinhas }, (_, i) => <i key={i} />)}
          <Campo />
        </div>
      )}
    </Elemento>
  );
}
