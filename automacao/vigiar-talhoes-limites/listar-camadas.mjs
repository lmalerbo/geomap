// Utilitário pra descobrir os ids de camada sem precisar abrir o DevTools
// do navegador — loga (credenciais só em memória, nunca gravadas em
// disco) e imprime uma tabela "mapa | camada | id" pra preencher
// mapeamento-camadas.json à mão. Rodar com `node listar-camadas.mjs`
// (ou `npm run listar-camadas`).
import path from "path";
import fs from "fs/promises";
import readline from "readline/promises";
import { fileURLToPath } from "url";
import { criarClienteApi } from "./lib/api.mjs";

const DIR_SCRIPT = path.dirname(fileURLToPath(import.meta.url));

async function carregarEnv(caminhoEnv) {
  try {
    const conteudo = await fs.readFile(caminhoEnv, "utf8");
    for (const linhaBruta of conteudo.split(/\r?\n/)) {
      const linha = linhaBruta.trim();
      if (!linha || linha.startsWith("#")) continue;
      const posIgual = linha.indexOf("=");
      if (posIgual === -1) continue;
      const chave = linha.slice(0, posIgual).trim();
      const valor = linha.slice(posIgual + 1).trim();
      if (!(chave in process.env)) process.env[chave] = valor;
    }
  } catch (erro) {
    if (erro.code !== "ENOENT") throw erro;
  }
}

async function perguntar(rl, pergunta, { ocultar = false } = {}) {
  if (!ocultar) return rl.question(pergunta);
  // Esconde a senha digitada no terminal (sem lib nova — só intercepta o
  // _writeToOutput do readline enquanto essa pergunta específica roda).
  const escritaOriginal = rl._writeToOutput;
  rl._writeToOutput = function (stringZero) {
    if (stringZero.trim() && !pergunta.includes(stringZero)) rl.output.write("*");
    else rl.output.write(stringZero);
  };
  const resposta = await rl.question(pergunta);
  rl._writeToOutput = escritaOriginal;
  rl.output.write("\n");
  return resposta;
}

async function main() {
  await carregarEnv(path.join(DIR_SCRIPT, ".env"));
  const baseUrl = process.env.GEOMAP_API_URL;
  if (!baseUrl) {
    console.error("Faltando GEOMAP_API_URL (ver .env.example)");
    process.exit(1);
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const email = process.env.GEOMAP_EMAIL || (await perguntar(rl, "E-mail (admin): "));
  const senha = process.env.GEOMAP_SENHA || (await perguntar(rl, "Senha: ", { ocultar: true }));
  rl.close();

  const cliente = criarClienteApi({ baseUrl, email, senha });
  await cliente.login();

  const [mapas, camadas] = await Promise.all([cliente.listarMapas(), cliente.listarCamadas()]);
  const nomeDoMapa = new Map(mapas.map((m) => [m.id, m.nome]));

  const linhas = camadas
    .map((c) => ({ mapa: nomeDoMapa.get(c.mapa_id) || `(mapa ${c.mapa_id})`, camada: c.nome, id: c.id }))
    .sort((a, b) => a.mapa.localeCompare(b.mapa) || a.camada.localeCompare(b.camada));

  const largMapa = Math.max(4, ...linhas.map((l) => l.mapa.length));
  const largCamada = Math.max(6, ...linhas.map((l) => l.camada.length));

  console.log(`\n${"MAPA".padEnd(largMapa)}  ${"CAMADA".padEnd(largCamada)}  ID`);
  console.log(`${"-".repeat(largMapa)}  ${"-".repeat(largCamada)}  ---`);
  for (const l of linhas) {
    console.log(`${l.mapa.padEnd(largMapa)}  ${l.camada.padEnd(largCamada)}  ${l.id}`);
  }
  console.log(
    `\nUse esses ids pra preencher talhoesCamadaIds/limitesCamadaIds em mapeamento-camadas.json (todo mapa que tiver Talhões/Limites da unidade entra no array).`
  );
}

main().catch((erro) => {
  console.error("Falha:", erro.message);
  process.exit(1);
});
