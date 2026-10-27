// Cálculos puros da biblioteca de movimento das esperas (porte do
// app/motion.js do hub-geotech). Sem React e sem DOM, para testar em Node.
// Os componentes estão em src/components/movimento/.

// Tempos do Hub (não mudar sem mudar o CSS junto).
export const DURACAO_OK = 900; // ✓ no botão até voltar ao normal
export const DURACAO_ERRO = 1200; // ✕ no botão até voltar ao normal
export const DURACAO_CONCLUIDO = 1900; // selo de concluído (keyframes de 1.9s)
export const LACO_VOO = 12000; // laço do drone (mo-voo-rota de 12s)
export const SAIDA_ESBOCO = 180; // fade do esboço
export const PASSO_CASCATA = 28; // atraso entre itens da cascata
export const MAX_CASCATA = 10; // só os primeiros entram em cascata

const numeroOuZero = (n) => (Number.isFinite(n) && n > 0 ? n : 0);

export function formatarBytes(b) {
  const bytes = numeroOuZero(b);
  if (bytes >= 1048576) {
    return `${(bytes / 1048576).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`;
  }
  return `${Math.max(1, Math.round(bytes / 1024)).toLocaleString("pt-BR")} KB`;
}

export function fracao(valor, total) {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(valor)) return 0;
  return Math.min(1, Math.max(0, valor / total));
}

export function textoMb(valor, total) {
  if (!Number.isFinite(total) || total <= 0) return "";
  const feito = Math.min(numeroOuZero(valor), total);
  return `${formatarBytes(feito)} de ${formatarBytes(total)}`;
}

// Atraso negativo da animação em laço para o drone continuar de onde
// estava quando a tela é redesenhada (o voo começou em `desde`).
export function atrasoVoo(desde, agora = Date.now(), laco = LACO_VOO) {
  if (!Number.isFinite(desde)) return 0;
  const resto = Math.max(0, agora - desde) % laco;
  return resto === 0 ? 0 : -resto;
}

const CORES_CONFETE = ["var(--mo-c1)", "var(--mo-c2)", "var(--mo-c3)", "var(--mo-c4)"];

export function gerarConfete(n = 18, aleatorio = Math.random) {
  return Array.from({ length: n }, (_, i) => {
    const ang = (i / n) * 2 * Math.PI + aleatorio() * 0.4;
    const d = 60 + aleatorio() * 70;
    return {
      cor: CORES_CONFETE[i % CORES_CONFETE.length],
      dx: Math.trunc(Math.cos(ang) * d),
      dy: Math.trunc(Math.sin(ang) * d - 20),
      r: Math.trunc(aleatorio() * 540 - 270),
      atraso: Math.trunc(120 + aleatorio() * 80),
    };
  });
}

export function linhasEsboco(altura) {
  return Math.max(4, Math.min(12, Math.floor((altura || 160) / 26)));
}

// fim() do botão ocupado: chamar duas vezes não pode animar duas vezes.
export function criarFimUnico(fn) {
  let feito = false;
  return (...args) => {
    if (feito) return undefined;
    feito = true;
    return fn(...args);
  };
}
