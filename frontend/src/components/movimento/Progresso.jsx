import { fracao, textoMb } from "../../lib/movimento.js";

// Barra de progresso — porte de Mo.progresso do Hub, declarativa.
// `valor`/`total` em bytes (ou em passos, com mb={false}). Chegou em 100 %
// e o servidor ainda grava → a barra "respira" (estado "processando", ou
// "enviando" com valor >= total). `ok` troca o % por ✓.
const TEXTO_PADRAO = {
  enviando: "Preparando…",
  processando: "Gravando no servidor…",
  ok: "Enviado",
  erro: "Envio interrompido",
};

export default function Progresso({ valor = 0, total = 0, mb = true, texto, estado = "enviando", className = "" }) {
  const f = estado === "ok" || estado === "processando" ? 1 : fracao(valor, total);
  const pct = Math.round(f * 100);
  const processando = estado === "processando" || (estado === "enviando" && f >= 1);
  const classes = ["mo-prog", className];
  if (processando) classes.push("mo-proc");
  if (estado === "ok") classes.push("mo-ok");
  if (estado === "erro") classes.push("mo-erro");

  return (
    <div
      className={classes.filter(Boolean).join(" ")}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={pct}
      aria-valuetext={texto || TEXTO_PADRAO[estado]}
    >
      <div className="mo-prog-cab">
        <span className="mo-prog-txt">{texto || TEXTO_PADRAO[estado]}</span>
        <span className="mo-prog-pct">{estado === "ok" ? "✓" : `${pct}%`}</span>
      </div>
      <div className="mo-prog-trilho">
        <div className="mo-prog-barra" style={{ transform: `scaleX(${f})` }} />
      </div>
      <div className="mo-prog-mb">{mb ? textoMb(valor, total) : ""}</div>
    </div>
  );
}
