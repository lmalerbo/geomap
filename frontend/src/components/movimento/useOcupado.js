import { createElement, Fragment, useCallback, useEffect, useRef, useState } from "react";
import Campo from "./Campo.jsx";
import { criarFimUnico, DURACAO_ERRO, DURACAO_OK } from "../../lib/movimento.js";

// Botão vivo enquanto espera — porte de Mo.ocupado do Hub. O rótulo sobe e
// some, o campo entra no lugar (com um texto opcional) e uma faixa de luz
// atravessa o botão; a largura fica travada para nada pular na tela. No fim,
// ✓ verde (900 ms) ou ✕ vermelho com tremida (1200 ms), e o botão volta ao
// normal. `travado`: continua desabilitado depois do fim até `liberar()`.
//
//   const salvar = useOcupado();
//   <button {...salvar.propsBotao({ className: "botao", onClick })}>
//     {salvar.conteudo("Salvar")}
//   </button>
//   ...
//   await salvar.executar(() => api(), { texto: "Salvando…" });
export default function useOcupado() {
  const [estado, setEstado] = useState("parado"); // parado | ocupado | ok | erro
  const [texto, setTexto] = useState("");
  const [travado, setTravado] = useState(false);
  const [largura, setLargura] = useState(null);
  const refBotao = useRef(null);
  const montado = useRef(true);
  const timer = useRef(null);
  // Cada iniciar() abre uma rodada; um fim() de rodada antiga não mexe na atual.
  const rodada = useRef(0);

  useEffect(() => {
    montado.current = true; // StrictMode monta, desmonta e monta de novo
    return () => {
      montado.current = false;
      clearTimeout(timer.current);
    };
  }, []);

  const iniciar = useCallback(({ texto: textoOcupado = "" } = {}) => {
    clearTimeout(timer.current);
    const minha = ++rodada.current;
    const w = refBotao.current?.getBoundingClientRect().width;
    setLargura(w || null);
    setTexto(textoOcupado);
    setTravado(false);
    setEstado("ocupado");

    const fimUnico = criarFimUnico((ok, { travado: manterTravado = false } = {}) => {
      if (!montado.current || minha !== rodada.current) return Promise.resolve();
      setEstado(ok ? "ok" : "erro");
      return new Promise((resolve) => {
        timer.current = setTimeout(
          () => {
            if (montado.current && minha === rodada.current) {
              setEstado("parado");
              setTravado(!!manterTravado);
              setLargura(null);
            }
            resolve();
          },
          ok ? DURACAO_OK : DURACAO_ERRO,
        );
      });
    });
    return (ok, opcoes) => fimUnico(ok, opcoes) ?? Promise.resolve();
  }, []);

  // Roda `fn` com o botão ocupado; espera o ✓/✕ terminar antes de devolver
  // o resultado (ou relançar o erro), para quem chamou seguir depois dele.
  const executar = useCallback(
    async (fn, { texto: textoOcupado, travado: manterTravado } = {}) => {
      const fim = iniciar({ texto: textoOcupado });
      let resultado;
      try {
        resultado = await fn();
      } catch (erro) {
        await fim(false);
        throw erro;
      }
      await fim(true, { travado: manterTravado });
      return resultado;
    },
    [iniciar],
  );

  const liberar = useCallback(() => setTravado(false), []);

  const propsBotao = ({ className = "", disabled = false, style, ...resto } = {}) => {
    const classes = [className, "mo-btn"];
    if (estado === "ocupado") classes.push("mo-ocupado");
    if (estado === "ok" || estado === "erro") classes.push("mo-fim", `mo-${estado}`);
    return {
      ...resto,
      ref: refBotao,
      className: classes.filter(Boolean).join(" "),
      disabled: disabled || estado !== "parado" || travado,
      "aria-busy": estado === "ocupado" ? true : undefined,
      style: largura ? { ...style, minWidth: `${largura}px` } : style,
    };
  };

  const conteudo = (children) => {
    let sobre = null;
    if (estado === "ocupado") {
      sobre = createElement(
        Fragment,
        null,
        createElement(Campo, { herdaCor: true }),
        texto ? createElement("span", null, texto) : null,
      );
    } else if (estado === "ok" || estado === "erro") {
      sobre = createElement("span", { className: "ico" }, estado === "ok" ? "✓" : "✕");
    }
    return createElement(
      Fragment,
      null,
      createElement("span", { className: "mo-rot" }, children),
      createElement("span", { className: "mo-sobre", "aria-hidden": estado === "parado" ? true : undefined }, sobre),
    );
  };

  return { estado, ocupado: estado === "ocupado", iniciar, executar, liberar, propsBotao, conteudo };
}
