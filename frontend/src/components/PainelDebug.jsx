import { useEffect, useRef, useState } from "react";

// Painel de diagnóstico temporário — só liga com ?debug=1 na URL (nunca
// aparece pro usuário normal). Existe pra investigar o bug de geometria
// fragmentada no iOS sem precisar de Mac/Web Inspector: captura erros de
// JS, rejeições de Promise não tratadas, erros do próprio MapLibre e
// perda de contexto WebGL (o sintoma mais provável dado o padrão
// observado — corrupção sob muita geometria de uma vez, característico
// de estouro de memória do WebGL no WebKit/iOS), tudo renderizado na
// tela pra dar pra tirar print. Remover depois de diagnosticar.
const ATIVO = typeof window !== "undefined" && new URLSearchParams(window.location.search).has("debug");

export default function PainelDebug({ mapRef, mapaPronto }) {
  const [linhas, setLinhas] = useState([]);
  const [aberto, setAberto] = useState(true);

  useEffect(() => {
    if (!ATIVO) return;

    function registrar(tipo, ...args) {
      const texto = args
        .map((a) => {
          if (a instanceof Error) return `${a.name}: ${a.message}`;
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
      const linha = `[${new Date().toLocaleTimeString("pt-BR")}] ${tipo}: ${texto}`;
      setLinhas((atual) => [...atual.slice(-79), linha]);
    }

    registrar("info", "userAgent:", navigator.userAgent);
    registrar("info", "webgl2 disponível:", !!document.createElement("canvas").getContext("webgl2"));
    registrar(
      "info",
      "memória do dispositivo (GB, se exposto):",
      navigator.deviceMemory ?? "não exposto neste navegador"
    );

    const consoleErrorOriginal = console.error;
    console.error = (...args) => {
      registrar("console.error", ...args);
      consoleErrorOriginal(...args);
    };
    const consoleWarnOriginal = console.warn;
    console.warn = (...args) => {
      registrar("console.warn", ...args);
      consoleWarnOriginal(...args);
    };

    function aoErroGlobal(e) {
      registrar("window.onerror", e.message, `${e.filename}:${e.lineno}`);
    }
    function aoRejeicaoNaoTratada(e) {
      registrar("unhandledrejection", e.reason);
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
      const linha = `[${new Date().toLocaleTimeString("pt-BR")}] ${tipo}: ${texto}`;
      setLinhas((atual) => [...atual.slice(-79), linha]);
    }

    function aoErroMapa(e) {
      registrar("map.error", e?.error?.message || JSON.stringify(e?.error) || "erro sem mensagem");
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
        maxHeight: aberto ? "45vh" : "auto",
        overflowY: "auto",
        background: "rgba(0,0,0,0.88)",
        color: "#3dff5c",
        fontSize: 10,
        fontFamily: "monospace",
        padding: 8,
        zIndex: 99999,
        whiteSpace: "pre-wrap",
      }}
    >
      <div
        style={{ color: "#fff", marginBottom: 4, cursor: "pointer" }}
        onClick={() => setAberto((a) => !a)}
      >
        DEBUG ({linhas.length} linhas) — toque pra {aberto ? "recolher" : "expandir"}
      </div>
      {aberto && linhas.map((l, i) => <div key={i}>{l}</div>)}
    </div>
  );
}
