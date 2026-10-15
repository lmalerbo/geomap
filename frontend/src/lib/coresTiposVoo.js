// Cores dos tipos de voo no mapa de Voos (contorno dos talhões pendentes e
// chips do painel). A lista fixa vale como padrão e define a ordem; o admin
// pode trocar qualquer cor no estilo da camada de voos
// (estilo_config.coresTiposVoo, pedido do Leo em 2026-10-15). Os nomes vêm
// literais de flightProjectDetails.description no DroneManagement.
export const TIPOS_VOO_PADRAO = [
  ["Falhas Plantio", "#16a34a"],
  ["Falhas Soca", "#eab308"],
  ["Sistematização", "#ffffff"],
  ["Ervas Daninhas", "#dc2626"],
  ["Drone Aplicação", "#ccff00"],
  ["Ambiental", "#ec4899"],
  ["Experimentação Agrícola", "#9333ea"],
  ["Levantamento Topográfico", "#c19a6b"],
  ["Projeto Plantio", "#2563eb"],
];

export const CHAVE_FALHAS_PLANTIO_FORNECEDOR = "Falhas Plantio (fornecedor)";
export const COR_FALHAS_PLANTIO_FORNECEDOR = "#38bdf8";

export const TIPOS_VOO_EDITAVEIS = (() => {
  const idx = TIPOS_VOO_PADRAO.findIndex(([nome]) => nome === "Falhas Plantio");
  const copia = [...TIPOS_VOO_PADRAO];
  copia.splice(idx + 1, 0, [CHAVE_FALHAS_PLANTIO_FORNECEDOR, COR_FALHAS_PLANTIO_FORNECEDOR]);
  return copia;
})();

const REGEX_HEX = /^#[0-9a-fA-F]{6}$/;

function ehCorValida(cor) {
  return typeof cor === "string" && REGEX_HEX.test(cor);
}

export function normalizarCoresTiposVoo(bruto) {
  if (!bruto || typeof bruto !== "object" || Array.isArray(bruto)) {
    return {};
  }
  const resultado = {};
  for (const [chave, valor] of Object.entries(bruto)) {
    if (ehCorValida(valor)) {
      resultado[chave] = valor.toLowerCase();
    }
  }
  return resultado;
}

function corFallbackHash(nome) {
  let h = 0;
  for (let i = 0; i < nome.length; i++) {
    h = (h * 31 + nome.charCodeAt(i)) >>> 0;
  }
  const paletaFallback = ["#2a78d6", "#1baf7a", "#4a3aa7", "#e87ba4", "#eb6834"];
  return paletaFallback[h % paletaFallback.length];
}

export function corTipoVoo(nome, personalizadas = {}) {
  if (personalizadas && ehCorValida(personalizadas[nome])) {
    return personalizadas[nome].toLowerCase();
  }
  const editavel = TIPOS_VOO_EDITAVEIS.find(([n]) => n === nome);
  if (editavel) {
    return editavel[1].toLowerCase();
  }
  return corFallbackHash(nome);
}

export function ordemTipoVoo(nome) {
  const idx = TIPOS_VOO_PADRAO.findIndex(([n]) => n === nome);
  return idx === -1 ? Infinity : idx;
}