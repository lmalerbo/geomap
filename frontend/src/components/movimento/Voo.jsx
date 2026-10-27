import { useEffect, useRef, useState } from "react";
import Campo from "./Campo.jsx";
import Concluido from "./Concluido.jsx";
import usePosicaoNoPai from "./usePosicaoNoPai.js";
import { prefereMenosMovimento } from "./usePrefereMenosMovimento.js";
import { atrasoVoo } from "../../lib/movimento.js";

// Drone sobrevoando o elemento pai — porte de Mo.voo do Hub, para esperas
// longas (conversão de camada). Faz três passadas, como faixas de aplicação,
// e volta ao início num laço de 12 s. `desde` (Date.now() de quando a espera
// começou) mantém a fase: sair e voltar à tela continua o voo de onde estava.
// Quando `pouso` chega ({ok, texto?}), o drone vai ao centro e:
//   ok   → desce e vira <Concluido texto>; `onFim` quando ele termina;
//   erro → balança e mostra "✕ texto" por 1,4 s; depois `onFim`.
const HELICES = [
  [16, -16],
  [-16, -16],
  [16, 16],
  [-16, 16],
];

function Drone() {
  return (
    <svg viewBox="-32 -32 64 64" aria-hidden="true">
      <path className="mo-voo-braco" d="M-16-16L16 16M16-16L-16 16" />
      {HELICES.map(([x, y]) => (
        <g key={`${x},${y}`} transform={`translate(${x} ${y})`}>
          <circle r="10.5" className="mo-voo-disco" />
          <g className="mo-helice">
            <rect x="-10" y="-1.6" width="20" height="3.2" rx="1.6" />
          </g>
          <circle r="2.2" className="mo-voo-eixo" />
        </g>
      ))}
      <rect x="-8" y="-11" width="16" height="22" rx="6" className="mo-voo-corpo" />
      <circle cy="-6.5" r="2" className="mo-voo-luz" />
    </svg>
  );
}

const CURVA_POUSO = "cubic-bezier(.65,0,.35,1)";
const DURACAO_IDA = 650;
const DURACAO_DESCIDA = 420;
const DURACAO_ERRO_VISIVEL = 1400;

const espera = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

export default function Voo({ texto = "", desde, pouso = null, onFim }) {
  const ref = useRef(null);
  const rotaRef = useRef(null);
  const rumoRef = useRef(null);
  const droneRef = useRef(null);
  usePosicaoNoPai(ref);
  const [atraso] = useState(() => atrasoVoo(desde ?? Date.now()));
  // voando | pousando | descendo | concluido | erro | fim
  const [fase, setFase] = useState("voando");
  const aoFim = useRef(onFim);
  aoFim.current = onFim;

  const pousoOk = pouso ? !!pouso.ok : null;
  useEffect(() => {
    if (pousoOk === null) return undefined;
    const voo = ref.current;
    const rota = rotaRef.current;
    const rumo = rumoRef.current;
    if (!voo || !rota || !rumo) return undefined;
    let cancelado = false;
    const calmo = prefereMenosMovimento();

    // Congela onde está e leva ao centro (WAAPI vence a animação em laço do CSS).
    const de = getComputedStyle(rota).transform;
    const giro = getComputedStyle(rumo).transform;
    rota.style.transform = de;
    rumo.style.transform = giro;
    setFase(pousoOk ? "pousando" : "erro");
    const curva = { duration: calmo ? 0 : DURACAO_IDA, easing: CURVA_POUSO, fill: "forwards" };
    const centro = `translate(${voo.clientWidth / 2}px, ${voo.clientHeight / 2}px)`;
    rumo.animate([{ transform: giro }, { transform: "rotate(0deg)" }], curva);
    const ida = rota.animate([{ transform: de }, { transform: centro }], curva);

    (async () => {
      try {
        await ida.finished;
        if (cancelado) return;
        if (pousoOk) {
          setFase("descendo");
          await espera(calmo ? 0 : DURACAO_DESCIDA);
          if (!cancelado) setFase("concluido");
          return;
        }
        if (!calmo && droneRef.current) {
          await droneRef.current.animate(
            [
              { transform: "rotate(0)" },
              { transform: "rotate(-12deg)" },
              { transform: "rotate(10deg)" },
              { transform: "rotate(-6deg)" },
              { transform: "rotate(0)" },
            ],
            { duration: 500 },
          ).finished;
        }
        await espera(DURACAO_ERRO_VISIVEL);
        if (cancelado) return;
        setFase("fim");
        aoFim.current?.();
      } catch {
        // animação cancelada (desmontou no meio): nada a fazer
      }
    })();
    return () => {
      cancelado = true;
    };
  }, [pousoOk]);

  if (fase === "fim") return <div ref={ref} hidden />;

  const classes = ["mo-voo"];
  if (fase !== "voando") classes.push("mo-pousa");
  if (fase === "descendo" || fase === "concluido") classes.push("mo-desce");
  const erro = fase === "erro";
  const mostraTexto = erro ? true : fase === "voando" || fase === "pousando" ? !!texto : false;

  return (
    <>
      <div
        ref={ref}
        className={classes.join(" ")}
        role="status"
        style={{ "--mo-voo-atraso": `${atraso}ms` }}
      >
        <div className="mo-voo-rota" ref={rotaRef} hidden={fase === "concluido"}>
          <div className="mo-voo-sombra" />
          <div className="mo-voo-rumo" ref={rumoRef}>
            <div className="mo-voo-drone" ref={droneRef}>
              <Drone />
            </div>
          </div>
        </div>
        {mostraTexto && (
          <div className={`mo-voo-txt${erro ? " mo-erro" : ""}`}>
            {!erro && <Campo tamanho="pequeno" herdaCor />}
            <span>{erro ? `✕ ${pouso?.texto || "Não deu certo"}` : texto}</span>
          </div>
        )}
      </div>
      {fase === "concluido" && (
        <Concluido
          texto={pouso?.texto || "Concluído"}
          onFim={() => {
            setFase("fim");
            aoFim.current?.();
          }}
        />
      )}
    </>
  );
}
