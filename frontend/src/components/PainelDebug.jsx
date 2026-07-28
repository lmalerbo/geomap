import { useEffect, useState } from "react";

// Painel de diagnóstico temporário — só liga com ?debug=1 na URL (nunca
// aparece pro usuário normal). Existe pra investigar o bug de geometria
// fragmentada no iOS sem precisar de Mac/Web Inspector: captura erros de
// JS, rejeições de Promise não tratadas, erros do próprio MapLibre e
// perda de contexto WebGL, tudo renderizado na tela pra dar pra tirar
// print. Remover depois de diagnosticar.
//
// Erros repetidos (ex: um por feição, dezenas de vezes seguidas) viram
// UMA linha só com contador (ex: "×45") em vez de spam — sem isso um
// print do painel só mostrava a mesma mensagem repetida a tela toda,
// sem espaço pro stack trace de verdade (o que importa pra achar a
// causa).
const ATIVO = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");

export default function PainelDebug({ mapRef, mapaPronto }) {
  const [linhas, setLinhas] = useState([]);
  const [aberto, setAberto] = useState(true);

  useEffect(() => {
    if (!ATIVO) return;

    function registrar(tipo, texto) {
      const chave = `${tipo}: ${texto}`;
      setLinhas((atual) => {
        const ultima = atual[atual.length - 1];
        if (ultima && ultima.chave === chave) {
          const atualizada = { ...ultima, contagem: ultima.contagem + 1, hora: new Date().toLocaleTimeString("pt-BR") };
          return [...atual.slice(0, -1), atualizada];
        }
        const nova = { chave, tipo, texto, contagem: 1, hora: new Date().toLocaleTimeString("pt-BR") };
        return [...atual.slice(-59), nova];
      });
    }

    function formatarArgs(args) {
      return args
        .map((a) => {
          if (a instanceof Error) return `${a.name}: ${a.message}${a.stack ? `\n${a.stack}` : ""}`;
          if (a && typeof a === "object") {
            try {
              return JSON.stringify(a);
            } catch {
              return String(a);
            }
          }
          return String(a);
        })
        .join(" ");
    }

    registrar("info", `userAgent: ${navigator.userAgent}`);
    registrar("info", `webgl2 disponível: ${!!document.createElement("canvas").getContext("webgl2")}`);
    registrar("info", `memória do dispositivo (GB, se exposto): ${navigator.deviceMemory ?? "não exposto"}`);

    const consoleErrorOriginal = console.error;
    console.error = (...args) => {
      registrar("console.error", formatarArgs(args));
      consoleErrorOriginal(...args);
    };
    const consoleWarnOriginal = console.warn;
    console.warn = (...args) => {
      registrar("console.warn", formatarArgs(args));
      consoleWarnOriginal(...args);
    };

    function aoErroGlobal(e) {
      registrar("window.onerror", `${e.message} (${e.filename}:${e.lineno})${e.error?.stack ? `\n${e.error.stack}` : ""}`);
    }
    function aoRejeicaoNaoTratada(e) {
      registrar("unhandledrejection", formatarArgs([e.reason]));
    }
    window.addEventListener("error", aoErroGlobal);
    window.addEventListener("unhandledrejection", aoRejeicaoNaoTratada);

    return () => {
      console.error = consoleErrorOriginal;
      console.warn = consoleWarnOriginal;
      window.removeEventListener("error", aoErroGlobal);
      window.removeEventListener("unhandledrejection", aoRejeicaoNaoTratada);
    };
  }, []);

  useEffect(() => {
    if (!ATIVO || !mapaPronto) return;
    const map = mapRef.current;
    if (!map) return;

    function registrar(tipo, texto) {
      const chave = `${tipo}: ${texto}`;
      setLinhas((atual) => {
        const ultima = atual[atual.length - 1];
        if (ultima && ultima.chave === chave) {
          return [...atual.slice(0, -1), { ...ultima, contagem: ultima.contagem + 1 }];
        }
        return [...atual.slice(-59), { chave, tipo, texto, contagem: 1, hora: new Date().toLocaleTimeString("pt-BR") }];
      });
    }

    function aoErroMapa(e) {
      const erro = e?.error;
      const detalhe = erro
        ? `${erro.name || "Error"}: ${erro.message}${erro.stack ? `\n${erro.stack}` : ""}`
        : JSON.stringify(e) || "erro sem detalhe";
      registrar("map.error", detalhe);
    }
    map.on("error", aoErroMapa);

    const canvas = map.getCanvas();
    function aoPerderContexto(e) {
      e.preventDefault();
      registrar("webglcontextlost", "CONTEXTO WEBGL PERDIDO — provável causa da geometria quebrada");
    }
    function aoRestaurarContexto() {
      registrar("webglcontextrestored", "contexto restaurado pelo navegador");
    }
    canvas.addEventListener("webglcontextlost", aoPerderContexto, false);
    canvas.addEventListener("webglcontextrestored", aoRestaurarContexto, false);

    return () => {
      map.off("error", aoErroMapa);
      canvas.removeEventListener("webglcontextlost", aoPerderContexto);
      canvas.removeEventListener("webglcontextrestored", aoRestaurarContexto);
    };
  }, [mapaPronto, mapRef]);

  if (!ATIVO) return null;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        maxHeight: aberto ? "60vh" : "auto",
        overflowY: "auto",
        background: "rgba(0,0,0,0.9)",
        color: "#3dff5c",
        fontSize: 10,
        fontFamily: "monospace",
        padding: 8,
        zIndex: 99999,
        whiteSpace: "pre-wrap",
      }}
    >
      <div style={{ color: "#fff", marginBottom: 4, cursor: "pointer" }} onClick={() => setAberto((a) => !a)}>
        DEBUG ({linhas.length} linhas únicas) — toque pra {aberto ? "recolher" : "expandir"}
      </div>
      {aberto &&
        linhas.map((l, i) => (
          <div key={i} style={{ marginBottom: 6, borderBottom: "1px solid #333", paddingBottom: 4 }}>
            [{l.hora}] {l.tipo}
            {l.contagem > 1 ? ` (×${l.contagem})` : ""}: {l.texto}
          </div>
        ))}
    </div>
  );
}
