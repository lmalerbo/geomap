// Cálculo dos indicadores de voo (página /indicadores e API do agente de
// apresentação) — função pura, sem rede nem banco. Ver
// docs/superpowers/specs/2026-10-01-indicadores-voo-design.md.
//
// Datas sempre como "AAAA-MM-DD" no fuso de Brasília: o DroneManagement
// grava startDateFlight em UTC, e um voo às 22h cairia no dia seguinte.

export const TIPOS_PRINCIPAIS = [
  "Falhas Soca",
  "Falhas Plantio",
  "Ervas Daninhas",
  "Sistematização",
  "Levantamento Topográfico",
  "Projeto Plantio",
  "Projeto Colheita",
];
export const TIPO_OUTROS = "Outros";
export const TIPO_FALHAS_PLANTIO_FORN = "Falhas Plantio Forn.";

const DIAS_UTEIS_JANELA = 15;

const formatadorDataLocal = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

export function dataLocal(iso) {
  return formatadorDataLocal.format(new Date(iso));
}

export function hojeLocal(agora = new Date()) {
  return formatadorDataLocal.format(agora);
}

function paraData(dia) {
  return new Date(`${dia}T00:00:00Z`);
}

function somarDias(dia, n) {
  const d = paraData(dia);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

function diaDaSemana(dia) {
  return paraData(dia).getUTCDay(); // 0 = domingo
}

function segundaDaSemana(dia) {
  return somarDias(dia, -((diaDaSemana(dia) + 6) % 7));
}

// Semana ISO: pertence ao ano da sua quinta-feira.
function rotuloSemana(segunda) {
  const quinta = somarDias(segunda, 3);
  const ano = quinta.slice(0, 4);
  const diaDoAno = Math.round((paraData(quinta) - paraData(`${ano}-01-01`)) / 86_400_000) + 1;
  const numero = Math.floor((diaDoAno - 1) / 7) + 1;
  return `${ano}-W${String(numero).padStart(2, "0")}`;
}

function arredondar(n, casas = 2) {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

function area(registro) {
  return Number(registro.areaHa) || 0;
}

export function safraDe(hoje) {
  const [ano, mes] = hoje.split("-").map(Number);
  const inicio = mes >= 4 ? ano : ano - 1;
  return { de: `${inicio}-04-01`, ate: `${inicio + 1}-03-31` };
}

function dataValida(dia) {
  return typeof dia === "string" && /^\d{4}-\d{2}-\d{2}$/.test(dia) && !Number.isNaN(paraData(dia).getTime()) &&
    paraData(dia).toISOString().slice(0, 10) === dia;
}

export function lerPeriodo({ de, ate } = {}, hoje) {
  if (!de && !ate) return safraDe(hoje);
  if (!dataValida(de) || !dataValida(ate)) return { erro: "de e ate precisam estar no formato AAAA-MM-DD" };
  if (de > ate) return { erro: "de não pode ser depois de ate" };
  return { de, ate };
}

export function ehFornecedor(propriedade) {
  return /FORNEC/i.test(propriedade || "");
}

export function categoriaDoTipo(tipo, propriedade) {
  if (tipo === "Falhas Plantio" && ehFornecedor(propriedade)) return TIPO_FALHAS_PLANTIO_FORN;
  return TIPOS_PRINCIPAIS.includes(tipo) ? tipo : TIPO_OUTROS;
}

function nomeDoPiloto(pilotoId, nomesPilotos) {
  return nomesPilotos[pilotoId] ?? `Piloto não cadastrado (${String(pilotoId).slice(0, 8)})`;
}

// Semanas (segunda a domingo) de `de` até `fim`; vazio se fim < de.
function semanasDoPeriodo(de, fim) {
  const semanas = [];
  if (fim < de) return semanas;
  for (let s = segundaDaSemana(de); s <= fim; s = somarDias(s, 7)) semanas.push(s);
  return semanas;
}

function agruparPorSemana(voos, segundas) {
  const porSegunda = new Map(segundas.map((s) => [s, { semana: rotuloSemana(s), inicio: s, ha: 0, talhoes: 0 }]));
  for (const v of voos) {
    const item = porSegunda.get(segundaDaSemana(v.dia));
    if (!item) continue;
    item.ha += area(v);
    item.talhoes += 1;
  }
  return [...porSegunda.values()].map((s) => ({ ...s, ha: arredondar(s.ha) }));
}

function estatisticasPiloto(voos) {
  const ha = voos.reduce((s, v) => s + area(v), 0);
  const diasVoados = new Set(voos.map((v) => v.dia)).size;
  return {
    ha: arredondar(ha),
    talhoes: voos.length,
    diasVoados,
    mediaHaPorDia: diasVoados ? arredondar(ha / diasVoados) : 0,
  };
}

function ultimosDiasUteis(fim, quantidade) {
  const dias = [];
  for (let d = fim; dias.length < quantidade; d = somarDias(d, -1)) {
    const dow = diaDaSemana(d);
    if (dow !== 0 && dow !== 6) dias.push(d);
  }
  return { de: dias[dias.length - 1], ate: dias[0] };
}

export function calcularIndicadores({
  realizados,
  pendentes,
  de,
  ate,
  hoje,
  pilotoId = null,
  nomesPilotos = {},
  incluirPorPiloto = false,
}) {
  const todos = realizados.map((r) => ({ ...r, dia: dataLocal(r.dataVoo) }));
  const noPeriodo = todos.filter((r) => r.dia >= de && r.dia <= ate);
  const fimAteHoje = ate < hoje ? ate : hoje;

  const realizadoHa = noPeriodo.reduce((s, r) => s + area(r), 0);
  const aVoarHa = pendentes.reduce((s, p) => s + area(p), 0);
  const totalHa = realizadoHa + aVoarHa;

  // Janela dos 15 dias úteis: conta todo voo entre o 1º e o último dia útil
  // (inclusive fim de semana no meio), independente do início do período.
  const janela = ultimosDiasUteis(fimAteHoje, DIAS_UTEIS_JANELA);
  const naJanela = todos.filter((r) => r.dia >= janela.de && r.dia <= janela.ate);

  const tipos = new Map();
  const doTipo = (nome) => {
    if (!tipos.has(nome)) tipos.set(nome, { tipo: nome, realizadoHa: 0, realizadoTalhoes: 0, aVoarHa: 0, aVoarTalhoes: 0 });
    return tipos.get(nome);
  };
  for (const r of noPeriodo) {
    const t = doTipo(categoriaDoTipo(r.tipo, r.propriedade));
    t.realizadoHa += area(r);
    t.realizadoTalhoes += 1;
  }
  for (const p of pendentes) {
    const t = doTipo(categoriaDoTipo(p.projeto, p.propriedade));
    t.aVoarHa += area(p);
    t.aVoarTalhoes += 1;
  }
  const porTipo = [...tipos.values()]
    .map((t) => ({ ...t, realizadoHa: arredondar(t.realizadoHa), aVoarHa: arredondar(t.aVoarHa) }))
    .sort((a, b) => {
      if (a.tipo === TIPO_OUTROS) return 1;
      if (b.tipo === TIPO_OUTROS) return -1;
      return b.realizadoHa + b.aVoarHa - (a.realizadoHa + a.aVoarHa);
    });

  const segundas = semanasDoPeriodo(de, fimAteHoje);

  const resultado = {
    periodo: { de, ate },
    resumo: {
      realizadoHa: arredondar(realizadoHa),
      realizadoTalhoes: noPeriodo.length,
      aVoarHa: arredondar(aVoarHa),
      aVoarTalhoes: pendentes.length,
      totalHa: arredondar(totalHa),
      progresso: totalHa > 0 ? arredondar(realizadoHa / totalHa, 4) : 0,
    },
    ultimos15DiasUteis: {
      ...janela,
      ha: arredondar(naJanela.reduce((s, r) => s + area(r), 0)),
      talhoes: naJanela.length,
      diasComVoo: new Set(naJanela.map((r) => r.dia)).size,
    },
    porTipo,
    porSemana: agruparPorSemana(noPeriodo, segundas),
  };

  if (incluirPorPiloto) {
    const porId = new Map();
    for (const r of noPeriodo) {
      if (!porId.has(r.pilotoId)) porId.set(r.pilotoId, []);
      porId.get(r.pilotoId).push(r);
    }
    resultado.porPiloto = [...porId.entries()]
      .map(([id, voos]) => ({ pilotoId: id, piloto: nomeDoPiloto(id, nomesPilotos), ...estatisticasPiloto(voos) }))
      .sort((a, b) => b.ha - a.ha);
  }

  if (pilotoId) {
    const meus = noPeriodo.filter((r) => r.pilotoId === pilotoId);
    resultado.meuRendimento = {
      pilotoId,
      piloto: nomeDoPiloto(pilotoId, nomesPilotos),
      ...estatisticasPiloto(meus),
      porSemana: agruparPorSemana(meus, segundas),
    };
  }

  return resultado;
}
