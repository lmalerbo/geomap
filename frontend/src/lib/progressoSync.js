import { textoMb } from "./movimento.js";

// Progresso da sincronização de camadas (lib/sync.js), sem React e sem DOM.
// Cada camada que precisa ser baixada passa por baixando → guardando
// (gravando no IndexedDB) → feita (ou falhou). As camadas descem em
// paralelo, então o total em MB só existe quando TODAS informaram o tamanho
// (Content-Length); antes disso o progresso é contado por camada. A troca
// para MB só acontece quando não faz a barra voltar atrás (camadas pequenas
// podem terminar antes de a maior informar o tamanho), e não desfaz.
// Avisos de bytes chegam a cada pedaço do download e são segurados por
// `intervalo` ms; mudança de estado de uma camada sempre avisa na hora.
export function criarProgressoSync(camadas, aoAvisar, { agora = Date.now, intervalo = 100 } = {}) {
  const estado = new Map(
    camadas.map((c) => [c.id, { nome: c.nome, fase: "baixando", recebidos: 0, tamanho: undefined }])
  );
  let ultimoAviso = -Infinity;
  let usandoBytes = false;

  function retrato() {
    const lista = [...estado.values()];
    const feitas = lista.filter((c) => c.fase === "feita" || c.fase === "falhou");
    const baixando = lista.filter((c) => c.fase === "baixando");
    const guardando = lista.some((c) => c.fase === "guardando");
    const bytes = lista.reduce((soma, c) => soma + c.recebidos, 0);
    if (!usandoBytes && lista.every((c) => Number.isFinite(c.tamanho))) {
      const bytesTotal = lista.reduce((soma, c) => soma + c.tamanho, 0);
      usandoBytes = bytes / bytesTotal >= feitas.length / lista.length;
    }
    return {
      fase: baixando.length > 0 ? "baixando" : guardando ? "guardando" : "pronto",
      camadaAtual: baixando[0]?.nome ?? null,
      camadasFeitas: feitas.length,
      camadasTotal: lista.length,
      falhas: lista.filter((c) => c.fase === "falhou").length,
      bytes,
      bytesTotal: usandoBytes ? lista.reduce((soma, c) => soma + c.tamanho, 0) : null,
    };
  }

  function avisar(forcar) {
    const t = agora();
    if (!forcar && t - ultimoAviso < intervalo) return;
    ultimoAviso = t;
    aoAvisar(retrato());
  }

  function mudarFase(id, fase) {
    const c = estado.get(id);
    if (!c) return;
    c.fase = fase;
    if ((fase === "guardando" || fase === "feita") && Number.isFinite(c.tamanho)) c.recebidos = c.tamanho;
    avisar(true);
  }

  avisar(true);

  return {
    bytes(id, recebidos, tamanho) {
      const c = estado.get(id);
      if (!c) return;
      const tinhaTamanho = c.tamanho !== undefined;
      c.recebidos = recebidos;
      c.tamanho = Number.isFinite(tamanho) && tamanho > 0 ? tamanho : null;
      // O primeiro tamanho de cada camada pode completar o total: avisa já.
      avisar(!tinhaTamanho);
    },
    guardando: (id) => mudarFase(id, "guardando"),
    concluida: (id) => mudarFase(id, "feita"),
    falhou: (id) => mudarFase(id, "falhou"),
  };
}

// Textos e números para o <Progresso> (components/movimento).
export function textosProgressoSync(p) {
  const camadas = `${p.camadasFeitas} de ${p.camadasTotal} ${p.camadasTotal === 1 ? "camada" : "camadas"}`;
  const comMb = Number.isFinite(p.bytesTotal) && p.bytesTotal > 0;
  const numeros = comMb
    ? { valor: p.bytes, total: p.bytesTotal }
    : { valor: p.camadasFeitas, total: p.camadasTotal };
  const detalhe = comMb ? `${camadas} · ${textoMb(p.bytes, p.bytesTotal)}` : camadas;

  if (p.fase === "pronto") return { ...numeros, detalhe, texto: "Tudo baixado", estado: "ok" };
  if (p.fase === "guardando") return { ...numeros, detalhe, texto: "Guardando no aparelho…", estado: "processando" };
  return { ...numeros, detalhe, texto: `Baixando ${p.camadaAtual}`, estado: "enviando" };
}
