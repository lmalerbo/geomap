// Planejamento de voos (ver docs/superpowers/specs/2026-10-16-planejamento-voos-design.md):
// geometria, resumo e rótulos — sem React/MapLibre, testável sozinho.
import { ordemTipoVoo } from "./coresTiposVoo.js";

const SIGLAS = new Map([
  ["Falhas Plantio", "FP"],
  ["Falhas Soca", "FS"],
  ["Sistematização", "SIS"],
  ["Ervas Daninhas", "ED"],
  ["Drone Aplicação", "DA"],
  ["Ambiental", "AMB"],
  ["Experimentação Agrícola", "EA"],
  ["Levantamento Topográfico", "LT"],
  ["Projeto Plantio", "PP"],
]);
const DIAS_CURTOS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const DIAS_LONGOS = ["Domingo", "Segunda-feira", "Terça-feira", "Quarta-feira", "Quinta-feira", "Sexta-feira", "Sábado"];
// Dom..Sáb — fortes no satélite e distintas das cores dos tipos de voo.
const CORES_DIAS = ["#94a3b8", "#22d3ee", "#facc15", "#f472b6", "#a78bfa", "#fb923c", "#e2e8f0"];

export function pontoNoPoligono([x, y], anel) {
  let dentro = false;
  for (let i = 0, j = anel.length - 1; i < anel.length; j = i++) {
    const [xi, yi] = anel[i];
    const [xj, yj] = anel[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) dentro = !dentro;
  }
  return dentro;
}

export function talhoesDentro(pontos, poligono) {
  const anel = poligono.coordinates[0];
  const vistos = new Map();
  for (const p of pontos) {
    const chave = `${p.secao}-${p.talhao}`;
    if (vistos.has(chave) || !pontoNoPoligono([p.lon, p.lat], anel)) continue;
    vistos.set(chave, { secao: String(p.secao), talhao: String(p.talhao), fazenda: p.fazenda });
  }
  return [...vistos.values()];
}

export function siglaTipoVoo(nome) {
  if (SIGLAS.has(nome)) return SIGLAS.get(nome);
  return String(nome).split(/\s+/).filter(Boolean).map((p) => p[0].toUpperCase()).join("");
}

function arredondar(n) {
  return Math.round(n * 10) / 10;
}

export function resumirPlanejamento(talhoesDoPlano, pendentes) {
  const fazendaPorChave = new Map(talhoesDoPlano.map((t) => [`${t.secao}-${t.talhao}`, t]));
  const porTipo = new Map();
  const porFazenda = new Map();
  const talhoesComPendencia = new Set();
  let hectares = 0;
  for (const r of pendentes) {
    const chave = `${r.secao}-${r.talhao}`;
    const t = fazendaPorChave.get(chave);
    if (!t) continue;
    const ha = r.areaHa || 0;
    hectares += ha;
    talhoesComPendencia.add(chave);
    porTipo.set(r.projeto, (porTipo.get(r.projeto) || 0) + ha);
    const f = porFazenda.get(t.secao) || { fazenda: t.fazenda, secao: t.secao, hectares: 0, siglas: new Set() };
    f.hectares += ha;
    f.siglas.add(siglaTipoVoo(r.projeto));
    porFazenda.set(t.secao, f);
  }
  return {
    hectares: arredondar(hectares),
    qtdTalhoes: talhoesComPendencia.size,
    porTipo: [...porTipo.entries()]
      .sort(([a], [b]) => ordemTipoVoo(a) - ordemTipoVoo(b) || a.localeCompare(b))
      .map(([nome, ha]) => ({ sigla: siglaTipoVoo(nome), nome, hectares: arredondar(ha) })),
    porFazenda: [...porFazenda.values()]
      .sort((a, b) => b.hectares - a.hectares)
      .map((f) => ({ ...f, hectares: arredondar(f.hectares), siglas: [...f.siglas].sort() })),
  };
}

function diaDaSemana(dataIso) {
  return new Date(`${dataIso}T12:00:00Z`).getUTCDay();
}

function ddmm(dataIso) {
  const [, m, d] = dataIso.split("-");
  return `${d}/${m}`;
}

export function rotuloDia(dataIso) {
  return `${DIAS_CURTOS[diaDaSemana(dataIso)]} ${ddmm(dataIso)}`;
}

export function tituloDia(dataIso) {
  return `${DIAS_LONGOS[diaDaSemana(dataIso)]}, ${ddmm(dataIso)}`;
}

export function corDoDia(dataIso) {
  return CORES_DIAS[diaDaSemana(dataIso)];
}

export function hojeLocal(agora = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" }).format(agora);
}

export function filtrarDeHojeEmDiante(planejamentos, hoje = hojeLocal()) {
  return planejamentos.filter((p) => p.data >= hoje);
}