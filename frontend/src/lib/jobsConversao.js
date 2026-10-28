// Textos e escolhas do voo de conversão de camada (AdminCamadas.jsx), sem
// React, para testar. Ver docs/movimento-esperas.md, sessão 4.

export function formatarDecorrido(ms) {
  const segundos = Number.isFinite(ms) ? Math.max(0, Math.floor(ms / 1000)) : 0;
  return `${Math.floor(segundos / 60)}:${String(segundos % 60).padStart(2, "0")}`;
}

// "Convertendo Talhões · 3:12". Jobs guardados antes de existir `inicio`
// (localStorage de versões antigas) ficam só com o nome.
export function textoConversao(job, agora = Date.now()) {
  const base = `Convertendo ${job.rotulo}`;
  return Number.isFinite(job.inicio) ? `${base} · ${formatarDecorrido(agora - job.inicio)}` : base;
}

// O que o drone mostra ao pousar: o selo de publicada ou o erro do servidor.
export function pousoDoResultado(resultado) {
  if (resultado.status === "concluido") {
    const versao = resultado.versao ? ` · versão ${resultado.versao}` : "";
    return { ok: true, texto: `${resultado.rotulo} publicada${versao}` };
  }
  return { ok: false, texto: resultado.erro || "Não deu certo" };
}

// Qual job voa sobre o palco: o da camada aberta no detalhe; sem camada
// aberta, a camada nova que está sendo criada.
export function vooDoPalco(jobs, camadaSelecionadaId) {
  const achado =
    camadaSelecionadaId != null
      ? jobs.find((j) => j.camadaId === camadaSelecionadaId)
      : jobs.find((j) => j.tipo === "criar");
  return achado ?? null;
}
