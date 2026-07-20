// Persistencia simples do "ultima data processada por (unidade, tipo)" --
// json plano, sem banco nenhum (a automacao inteira e um processo leve,
// nao precisa de mais infra que isso). Le/grava sempre o arquivo inteiro
// (sem lock/concorrencia -- so 1 instancia do vigiar.mjs roda por vez).
import fs from "fs/promises";

export async function lerEstado(caminho) {
  try {
    const conteudo = await fs.readFile(caminho, "utf8");
    return JSON.parse(conteudo);
  } catch (erro) {
    if (erro.code === "ENOENT") return {};
    throw erro;
  }
}

export async function salvarEstado(caminho, estado) {
  await fs.writeFile(caminho, JSON.stringify(estado, null, 2), "utf8");
}

function chave(unidade, tipo) {
  return `${unidade}:${tipo}`;
}

// Datas no formato ISO (YYYY-MM-DD) -- comparacao de string ja e
// cronologica, sem precisar de Date.
export function jaProcessado(estado, unidade, tipo, data) {
  const ultimaData = estado[chave(unidade, tipo)];
  return ultimaData != null && data <= ultimaData;
}

export function marcarProcessado(estado, unidade, tipo, data) {
  return { ...estado, [chave(unidade, tipo)]: data };
}
