// Roda UMA VEZ (agendado via Windows Task Scheduler todo dia às 8:05,
// ver README.md) e mantem as camadas Talhoes/Limites da unidade Pedra
// atualizadas no GeoMap, sem depender de alguem lembrar de fazer upload
// manual. Ver README.md pra configurar/agendar.
//
// Já foi um processo de "vigiar a pasta em tempo real" (chokidar) — trocado
// por execução diária agendada por pedido explícito: mais simples (não
// precisa de nenhum processo rodando 24h, nem lidar com a instabilidade do
// watch nativo em compartilhamento de rede SMB, que chegou a quebrar esse
// modelo em produção real) e a exportação (FME) só solta um conjunto novo
// por dia mesmo, então "vigiar em tempo real" nunca foi necessário de
// verdade.
import path from "path";
import fs from "fs/promises";
import { fileURLToPath, pathToFileURL } from "url";
import { criarClienteApi, aguardarJobConcluir } from "./lib/api.mjs";
import {
  interpretarNomeArquivo,
  unidadeSuportada,
  EXTENSOES_OBRIGATORIAS,
  EXTENSOES_OPCIONAIS,
} from "./lib/nomeArquivo.mjs";
import { lerEstado, salvarEstado, jaProcessado, marcarProcessado } from "./lib/estado.mjs";

const DIR_SCRIPT = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_ESTADO = path.join(DIR_SCRIPT, "estado.json");
const CAMINHO_LOG = path.join(DIR_SCRIPT, "log.txt");
const CAMINHO_MAPEAMENTO = path.join(DIR_SCRIPT, "mapeamento-camadas.json");

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
      // Nunca sobrescreve uma env var já setada de verdade (ex: definida
      // pelo Task Scheduler) — o .env é só o valor padrão local.
      if (!(chave in process.env)) process.env[chave] = valor;
    }
  } catch (erro) {
    if (erro.code !== "ENOENT") throw erro;
  }
}

async function log(mensagem) {
  const linha = `[${new Date().toISOString()}] ${mensagem}`;
  console.log(linha);
  await fs.appendFile(CAMINHO_LOG, linha + "\n").catch(() => {});
}

async function carregarMapeamento() {
  const conteudo = await fs.readFile(CAMINHO_MAPEAMENTO, "utf8");
  return JSON.parse(conteudo);
}

// Varre a pasta e devolve só o arquivo .shp MAIS RECENTE por (unidade,
// tipo) — evita reprocessar dias antigos acumulados na pasta um por um
// (o export nunca apaga nada, então a pasta acumula histórico).
async function candidatosAtuais(pasta) {
  const arquivos = await fs.readdir(pasta);
  const porGrupo = new Map();
  for (const nomeArquivo of arquivos) {
    const info = interpretarNomeArquivo(nomeArquivo);
    if (!info || info.extensao !== "shp" || !unidadeSuportada(info.unidade)) continue;
    const chave = `${info.unidade}:${info.tipo}`;
    const atual = porGrupo.get(chave);
    if (!atual || info.data > atual.data) porGrupo.set(chave, info);
  }
  return [...porGrupo.values()];
}

// A exportação (FME) normalmente já terminou de escrever todos os
// arquivos do dia bem antes do horário agendado (ver README) — mas, pra
// não depender 100% disso, tenta um punhado de vezes com espera entre
// tentativas antes de desistir do dia. Sem chokidar/watcher nenhum
// backup aqui: se esgotar as tentativas, esse conjunto fica pra ser
// pego no dia seguinte (quando ele deixar de ser "o mais recente" e um
// novo válido assumir o lugar) ou numa reexecução manual.
async function aguardarArquivosCompletos(pasta, info, { tentativas = 5, esperaMs = 120_000 } = {}) {
  for (let tentativa = 1; tentativa <= tentativas; tentativa++) {
    const caminhos = [];
    let completo = true;
    for (const ext of EXTENSOES_OBRIGATORIAS) {
      const caminho = path.join(pasta, `${info.baseSemExtensao}.${ext}`);
      try {
        await fs.access(caminho);
        caminhos.push(caminho);
      } catch {
        completo = false;
        break;
      }
    }
    if (completo) {
      for (const ext of EXTENSOES_OPCIONAIS) {
        const caminho = path.join(pasta, `${info.baseSemExtensao}.${ext}`);
        try {
          await fs.access(caminho);
          caminhos.push(caminho);
        } catch {
          // opcional — tudo bem não existir.
        }
      }
      return caminhos;
    }
    if (tentativa < tentativas) {
      await log(`(${info.unidade}/${info.tipo}) ${info.data}: conjunto de arquivos incompleto, tentativa ${tentativa}/${tentativas}, aguardando ${esperaMs / 1000}s...`);
      await new Promise((resolver) => setTimeout(resolver, esperaMs));
    }
  }
  return null;
}

// Processa um candidato (Talhões OU Limites de uma unidade, na data mais
// recente encontrada) — envia a camada correspondente em CADA mapa que a
// tem (ver mapeamento-camadas.json), uma de cada vez (sequencial, nunca
// duas conversões pesadas ao mesmo tempo no Render — já visto causar
// erro em produção real).
async function processarCandidato({ pasta, mapeamento, cliente }, info) {
  const estadoAtual = await lerEstado(CAMINHO_ESTADO);
  if (jaProcessado(estadoAtual, info.unidade, info.tipo, info.data)) {
    await log(`(${info.unidade}/${info.tipo}) ${info.data} já processado, ignorando`);
    return;
  }

  const config = mapeamento[info.unidade];
  if (!config) {
    await log(`(${info.unidade}) sem entrada em mapeamento-camadas.json, ignorando`);
    return;
  }
  const camadaIds = info.tipo === "talhoes" ? config.talhoesCamadaIds : config.limitesCamadaIds;
  if (!camadaIds || camadaIds.length === 0) {
    await log(`(${info.unidade}/${info.tipo}) sem camadaIds configurados, ignorando`);
    return;
  }

  const caminhos = await aguardarArquivosCompletos(pasta, info);
  if (!caminhos) {
    await log(`(${info.unidade}/${info.tipo}) ${info.data}: conjunto de arquivos nunca completou, desistindo por hoje`);
    return;
  }

  await log(`(${info.unidade}/${info.tipo}) processando ${info.data} -> camadas [${camadaIds.join(", ")}]`);
  for (const camadaId of camadaIds) {
    await log(`  camada ${camadaId}: enviando...`);
    const jobId = await cliente.enviarArquivoCamada(camadaId, caminhos, info.data);
    await log(`  camada ${camadaId}: job ${jobId} criado, aguardando conclusão...`);
    await aguardarJobConcluir(cliente, jobId, {
      aoFalharTemporariamente: (erro, tentativa) =>
        log(`  camada ${camadaId}: consulta de status falhou (tentativa ${tentativa}), tentando de novo — ${erro.message}`),
    });
    await log(`  camada ${camadaId}: concluída`);
  }

  const novoEstado = marcarProcessado(await lerEstado(CAMINHO_ESTADO), info.unidade, info.tipo, info.data);
  await salvarEstado(CAMINHO_ESTADO, novoEstado);
  await log(`(${info.unidade}/${info.tipo}) ${info.data}: todas as camadas atualizadas`);
}

async function main() {
  await carregarEnv(path.join(DIR_SCRIPT, ".env"));

  const pasta = process.env.PASTA_MONITORADA;
  const baseUrl = process.env.GEOMAP_API_URL;
  const email = process.env.GEOMAP_EMAIL;
  const senha = process.env.GEOMAP_SENHA;

  const faltando = ["PASTA_MONITORADA", "GEOMAP_API_URL", "GEOMAP_EMAIL", "GEOMAP_SENHA"].filter(
    (chave) => !process.env[chave]
  );
  if (faltando.length > 0) {
    console.error(`Faltando variável(is) de ambiente: ${faltando.join(", ")} (ver .env.example)`);
    process.exit(1);
  }

  const mapeamento = await carregarMapeamento();
  const cliente = criarClienteApi({ baseUrl, email, senha });

  await log(`iniciando execução diária — pasta="${pasta}" api="${baseUrl}"`);
  const candidatos = await candidatosAtuais(pasta);
  await log(`varredura: ${candidatos.length} arquivo(s) candidato(s) encontrado(s)`);

  for (const info of candidatos) {
    try {
      await processarCandidato({ pasta, mapeamento, cliente }, info);
    } catch (erro) {
      await log(`ERRO (${info.unidade}/${info.tipo}): ${erro.message}`);
    }
  }

  await log("execução diária concluída");
}

// Só roda main() quando executado diretamente (`node vigiar.mjs`) — não
// quando importado por um teste, que só quer reusar as funções.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro) => {
    console.error("Falha fatal:", erro);
    process.exit(1);
  });
}

export { candidatosAtuais, processarCandidato, aguardarArquivosCompletos };
