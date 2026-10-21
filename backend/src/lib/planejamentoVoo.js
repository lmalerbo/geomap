// Validação do planejamento de voos (ver
// docs/superpowers/specs/2026-10-16-planejamento-voos-design.md).
const MAX_TALHOES = 2000;
const REGEX_DATA = /^\d{4}-\d{2}-\d{2}$/;

export function dataValida(texto) {
  if (typeof texto !== "string" || !REGEX_DATA.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}

function posicaoValida(p) {
  return Array.isArray(p) && p.length >= 2 && Number.isFinite(p[0]) && Number.isFinite(p[1]) &&
    p[0] >= -180 && p[0] <= 180 && p[1] >= -90 && p[1] <= 90;
}

function poligonoValido(g) {
  if (!g || g.type !== "Polygon" || !Array.isArray(g.coordinates)) return false;
  const anel = g.coordinates[0];
  if (!Array.isArray(anel) || anel.length < 4 || !anel.every(posicaoValida)) return false;
  const [a, b] = [anel[0], anel[anel.length - 1]];
  return a[0] === b[0] && a[1] === b[1];
}

function talhaoValido(t) {
  return t && typeof t === "object" && ["secao", "talhao", "fazenda"].every((k) => typeof t[k] === "string" && t[k].length > 0);
}

export function validarPlanejamento(corpo) {
  if (!corpo || typeof corpo !== "object") return "corpo inválido";
  if (!dataValida(corpo.data)) return "data inválida (use AAAA-MM-DD)";
  if (!poligonoValido(corpo.poligono)) return "polígono inválido";
  const t = corpo.talhoes;
  if (!Array.isArray(t) || t.length > MAX_TALHOES || !t.every(talhaoValido)) return "lista de talhões inválida";
  return null;
}

export function hojeEmSaoPaulo(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}