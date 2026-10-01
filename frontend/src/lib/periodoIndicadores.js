// Datas, atalhos de período, formatação e cache local da página
// /indicadores. A safra (abril a março) espelha safraDe() do backend
// (backend/src/lib/indicadoresVoo.js) — mudou lá, muda aqui.

const formatadorDia = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/Sao_Paulo",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});
const formatadorHa = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 0 });
const formatadorDataHora = new Intl.DateTimeFormat("pt-BR", {
  timeZone: "America/Sao_Paulo",
  day: "2-digit",
  month: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

export function hojeLocal(agora = new Date()) {
  return formatadorDia.format(agora);
}

function somarDias(dia, n) {
  const d = new Date(`${dia}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

export function safraDe(hoje) {
  const [ano, mes] = hoje.split("-").map(Number);
  const inicio = mes >= 4 ? ano : ano - 1;
  return { de: `${inicio}-04-01`, ate: `${inicio + 1}-03-31` };
}

export function ultimos30Dias(hoje) {
  return { de: somarDias(hoje, -29), ate: hoje };
}

export function mesAtual(hoje) {
  return { de: `${hoje.slice(0, 8)}01`, ate: hoje };
}

export function formatarHa(n) {
  return formatadorHa.format(Number(n) || 0);
}

export function formatarPercentual(x) {
  return `${Math.round((Number(x) || 0) * 100)}%`;
}

export function formatarDataCurta(dia) {
  return `${dia.slice(8, 10)}/${dia.slice(5, 7)}`;
}

export function formatarDataHora(iso) {
  return formatadorDataHora.format(new Date(iso)).replace(",", "");
}

// Por usuário: num aparelho compartilhado, o piloto não pode ver offline o
// resultado salvo pelo admin (que traz a lista por piloto).
export function chaveResultado({ de, ate, piloto, usuarioId }) {
  return `geomap_indicadores_u${usuarioId ?? ""}_${de}_${ate}_${piloto || "equipe"}`;
}

// Descarta resposta antiga: a 1ª carga pode levar ~30s, e uma troca de
// período nesse meio-tempo não pode ser sobrescrita pela resposta velha.
export function criarSequenciaRequisicoes() {
  let atual = 0;
  return {
    nova: () => ++atual,
    ehAtual: (id) => id === atual,
  };
}

// Último resultado visto neste aparelho, pra mostrar sem internet.
export function salvarUltimoResultado(chave, dados) {
  try {
    localStorage.setItem(chave, JSON.stringify({ dados, salvoEm: new Date().toISOString() }));
  } catch {
    // armazenamento cheio ou bloqueado: só não guarda
  }
}

export function lerUltimoResultado(chave) {
  try {
    const bruto = localStorage.getItem(chave);
    return bruto ? JSON.parse(bruto) : null;
  } catch {
    return null;
  }
}
