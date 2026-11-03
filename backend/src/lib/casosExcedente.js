import { dataLocal, ehFornecedor } from "./indicadoresVoo.js";

// Plantio Excedente — regras puras (sem banco nem rede). Ver
// docs/superpowers/specs/2026-10-30-plantio-excedente-design.md.

// Decidido com o Leo: só a safra atual em diante. Fixo (e não safraDe(hoje))
// pra a virada de safra não fazer casos novos pararem de entrar errado — os
// casos já criados ficam no banco de qualquer jeito.
export const INICIO_EXCEDENTE = "2026-04-01";
const TIPO_FLP = "Falhas Plantio";

export const STATUS_EXCEDENTE = ["aguardando", "precisa_ajuste", "sem_ajuste", "ajustado"];

const TRANSICOES = {
  aguardando: ["precisa_ajuste", "sem_ajuste"],
  precisa_ajuste: ["ajustado"],
  sem_ajuste: [],
  ajustado: [],
};

export function transicaoPermitida(de, para) {
  if (!STATUS_EXCEDENTE.includes(para)) return false;
  if (para === "aguardando") return true; // "Reabrir", de qualquer status
  return (TRANSICOES[de] || []).includes(para);
}

function diaDoVoo(iso) {
  if (!iso) return null;
  try {
    return dataLocal(iso);
  } catch {
    return null; // data inválida vinda do DroneManagement: descarta o voo
  }
}

// `realizados` = itens de mapearRegistroRealizado (lib/fonteIndicadoresVoo.js).
export function selecionarVoosFLP(realizados) {
  const saida = [];
  for (const r of realizados) {
    if (r.tipo !== TIPO_FLP) continue;
    const dia = diaDoVoo(r.dataVoo);
    if (!dia || dia < INICIO_EXCEDENTE) continue;
    saida.push({
      vooId: String(r.id),
      secao: String(r.secao),
      talhao: String(r.talhao),
      fazenda: r.fazenda ?? null,
      fornecedor: ehFornecedor(r.propriedade),
      dataVoo: dia,
    });
  }
  return saida;
}

const FOLGA_RELOGIO_MS = 5 * 60 * 1000;
export function limitarFeitoEm(data, agora = new Date()) {
  const limite = new Date(agora.getTime() + FOLGA_RELOGIO_MS);
  return data > limite ? limite : data;
}