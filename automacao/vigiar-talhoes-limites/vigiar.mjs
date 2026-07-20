// Observa a pasta de exportacao FME e mantem as camadas Talhoes/Limites
// da unidade Pedra atualizadas no GeoMap, sem depender de alguem lembrar
// de fazer upload manual. Ver README.md pra configurar/rodar.
import path from "path";
import fs from "fs/promises";
import { fileURLToPath, pathToFileURL } from "url";
import chokidar from "chokidar";
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
      // pelo Task Scheduler/serviço) — o .env é só o valor padrão local.
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

// Varre a pasta uma vez no start (não via evento do chokidar) e devolve
// só o arquivo .shp MAIS RECENTE por (unidade, tipo) — evita reprocessar
// dias antigos acumulados na pasta um por um (o export nunca apaga nada,
// então uma pasta já em uso pode ter semanas de histórico).
async function candidatosIniciais(pasta) {
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

export function criarVigia({ pasta, mapeamento, cliente, debounceMs = 60_000 }) {
  const timers = new Map();

  function agendar(info) {
    const chave = info.baseSemExtensao;
    if (timers.has(chave)) clearTimeout(timers.get(chave));
    timers.set(
      chave,
      setTimeout(() => {
        timers.delete(chave);
        processar(info).catch((erro) => log(`ERRO (${chave}): ${erro.message}`));
      }, debounceMs)
    );
  }

  async function processar(info) {
    const estadoAtual = await lerEstado(CAMINHO_ESTADO);
    if (jaProcessado(estadoAtual, info.unidade, info.tipo, info.data)) {
      await log(`(${info.unidade}/${info.tipo}) ${info.data} já processado, ignorando`);
      return;
    }

    const caminhos = [];
    for (const ext of EXTENSOES_OBRIGATORIAS) {
      const caminho = path.join(pasta, `${info.baseSemExtensao}.${ext}`);
      try {
        await fs.access(caminho);
        caminhos.push(caminho);
      } catch {
        await log(`(${info.unidade}/${info.tipo}) ${info.data}: falta .${ext}, tentando de novo em breve`);
        agendar(info);
        return;
      }
    }
    for (const ext of EXTENSOES_OPCIONAIS) {
      const caminho = path.join(pasta, `${info.baseSemExtensao}.${ext}`);
      try {
        await fs.access(caminho);
        caminhos.push(caminho);
      } catch {
        // opcional — tudo bem não existir.
      }
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

    await log(`(${info.unidade}/${info.tipo}) processando ${info.data} -> camadas [${camadaIds.join(", ")}]`);
    for (const camadaId of camadaIds) {
      const jobId = await cliente.enviarArquivoCamada(camadaId, caminhos, info.data);
      await log(`  camada ${camadaId}: job ${jobId} criado, aguardando conclusão...`);
      await aguardarJobConcluir(cliente, jobId);
      await log(`  camada ${camadaId}: concluída`);
    }

    const novoEstado = marcarProcessado(await lerEstado(CAMINHO_ESTADO), info.unidade, info.tipo, info.data);
    await salvarEstado(CAMINHO_ESTADO, novoEstado);
    await log(`(${info.unidade}/${info.tipo}) ${info.data}: todas as camadas atualizadas`);
  }

  function tratarEvento(caminhoCompleto) {
    const info = interpretarNomeArquivo(path.basename(caminhoCompleto));
    if (!info) return;
    if (!unidadeSuportada(info.unidade)) return;
    agendar(info);
  }

  return { agendar, tratarEvento };
}

async function main() {
  await carregarEnv(path.join(DIR_SCRIPT, ".env"));

  const pasta = process.env.PASTA_MONITORADA;
  const baseUrl = process.env.GEOMAP_API_URL;
  const email = process.env.GEOMAP_EMAIL;
  const senha = process.env.GEOMAP_SENHA;
  const debounceMs = Number(process.env.DEBOUNCE_MS || 60_000);

  const faltando = ["PASTA_MONITORADA", "GEOMAP_API_URL", "GEOMAP_EMAIL", "GEOMAP_SENHA"].filter(
    (chave) => !process.env[chave]
  );
  if (faltando.length > 0) {
    console.error(`Faltando variável(is) de ambiente: ${faltando.join(", ")} (ver .env.example)`);
    process.exit(1);
  }

  const mapeamento = await carregarMapeamento();
  const cliente = criarClienteApi({ baseUrl, email, senha });
  const vigia = criarVigia({ pasta, mapeamento, cliente, debounceMs });

  await log(`iniciando — pasta="${pasta}" api="${baseUrl}" debounce=${debounceMs}ms`);

  const candidatos = await candidatosIniciais(pasta);
  for (const info of candidatos) vigia.agendar(info);
  await log(`varredura inicial: ${candidatos.length} arquivo(s) candidato(s) agendado(s)`);

  const watcher = chokidar.watch(pasta, {
    depth: 0,
    ignoreInitial: true,
    awaitWriteFinish: { stabilityThreshold: 5000, pollInterval: 1000 },
  });
  watcher.on("add", (caminho) => vigia.tratarEvento(caminho));
  watcher.on("change", (caminho) => vigia.tratarEvento(caminho));
  watcher.on("error", (erro) => log(`ERRO no watcher: ${erro.message}`));

  await log("vigiando pasta em tempo real...");

  for (const sinal of ["SIGINT", "SIGTERM"]) {
    process.on(sinal, async () => {
      await log(`recebido ${sinal}, encerrando...`);
      await watcher.close();
      process.exit(0);
    });
  }
}

// Só roda main() quando executado diretamente (`node vigiar.mjs`) — não
// quando importado por um teste, que só quer reusar `criarVigia`.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((erro) => {
    console.error("Falha fatal:", erro);
    process.exit(1);
  });
}
