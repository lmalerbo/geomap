// Dias corridos da legenda de cada talhão no mapa de voos (pedido do Leo,
// 2026-10-01): Falhas contam do plantio/corte, as demais demandas do
// agendamento no DroneManagement (o backend manda a data certa em
// `dataReferencia`, ver dataReferenciaVoo). Calculado no aparelho, então a
// contagem continua certa sem internet.

// Datas "só dia" (plantio, corte) chegam como meia-noite UTC — no horário de
// Brasília isso viraria 21h do dia anterior; essas usam o dia como está.
// Datas com hora (agendamento) usam o dia local do aparelho.
function diaDa(dataIso) {
  const texto = String(dataIso);
  if (/T00:00:00(\.0+)?Z$/.test(texto)) {
    const [a, m, d] = texto.slice(0, 10).split("-").map(Number);
    return Date.UTC(a, m - 1, d);
  }
  const data = new Date(texto);
  if (Number.isNaN(data.getTime())) return null;
  return Date.UTC(data.getFullYear(), data.getMonth(), data.getDate());
}

export function diasCorridos(dataIso, hoje = new Date()) {
  if (!dataIso) return null;
  const inicio = diaDa(dataIso);
  if (inicio == null) return null;
  const fim = Date.UTC(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());
  return Math.round((fim - inicio) / 86400000);
}

// Texto da legenda de um talhão: um número por tipo de voo pendente, na
// ordem de exibição dos tipos (registros já vêm ordenados). Ex.: "12 d" ou
// "12 d · 40 d". Sem data, o tipo fica de fora.
export function textoLegendaDias(registros, hoje = new Date()) {
  const vistos = new Set();
  const partes = [];
  for (const r of registros) {
    if (vistos.has(r.projeto)) continue;
    vistos.add(r.projeto);
    const dias = diasCorridos(r.dataReferencia, hoje);
    if (dias != null && dias >= 0) partes.push(`${dias} d`);
  }
  return partes.join(" · ");
}
