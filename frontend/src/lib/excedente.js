// Plantio Excedente — regras puras da tela (ver
// docs/superpowers/specs/2026-10-30-plantio-excedente-design.md).

export const CORES_EXCEDENTE = {
  aguardando: "#facc15",
  precisa_ajuste: "#dc2626",
  sem_ajuste: "#16a34a",
  ajustado: "#16a34a",
};
// "Ajustado" e "sem ajuste" são o mesmo verde; o ajustado ganha contorno
// escuro grosso (o ✓ no rótulo não existe na fonte offline, só 0-255).
export const COR_CONTORNO_AJUSTADO = "#14532d";

export const ROTULOS_STATUS = {
  aguardando: "Aguardando análise",
  precisa_ajuste: "Precisa de ajuste",
  sem_ajuste: "Sem ajuste",
  ajustado: "Ajuste concluído",
};

export function chaveTalhao(secao, talhao) {
  return `${secao}-${talhao}`;
}

export function casoVigentePorTalhao(casos) {
  const m = new Map();
  for (const c of casos) {
    const k = chaveTalhao(c.secao, c.talhao);
    const atual = m.get(k);
    if (!atual || c.dataVoo > atual.dataVoo) m.set(k, c);
  }
  return m;
}

// Itens da fila do aparelho ainda não enviados valem na tela na hora
// (o servidor confirma depois).
export function aplicarPendentes(casos, itensFila) {
  const pendentes = itensFila
    .filter((i) => i.estado === "pendente")
    .sort((a, b) => a.feitoEm.localeCompare(b.feitoEm));
  if (pendentes.length === 0) return casos;
  const porId = new Map(casos.map((c) => [c.id, { ...c }]));
  for (const i of pendentes) {
    const c = porId.get(i.casoId);
    if (!c) continue;
    Object.assign(c, i.campos, { status: i.status, pendente: true });
  }
  return casos.map((c) => porId.get(c.id));
}

export function contarPorStatus(casos) {
  const r = { aguardando: 0, precisa_ajuste: 0, concluidos: 0 };
  for (const c of casos) {
    if (c.status === "aguardando") r.aguardando++;
    else if (c.status === "precisa_ajuste") r.precisa_ajuste++;
    else r.concluidos++;
  }
  return r;
}

const REABRIR = { status: "aguardando", rotulo: "Reabrir" };
export function botoesDoStatus(status) {
  if (status === "aguardando") {
    return [
      { status: "precisa_ajuste", rotulo: "Precisa de ajuste" },
      { status: "sem_ajuste", rotulo: "Sem ajuste" },
    ];
  }
  if (status === "precisa_ajuste") return [{ status: "ajustado", rotulo: "Ajuste concluído" }, REABRIR];
  return [REABRIR];
}