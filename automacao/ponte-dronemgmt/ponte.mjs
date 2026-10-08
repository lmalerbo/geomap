// Ponte do DroneManagement — roda no servidor geo (dentro da rede da
// empresa), sempre ligado. O GeoMap na nuvem não alcança mais a plataforma
// pela internet (ver docs/PONTE_DRONEMGMT.md); este programa busca os
// pedidos dele, executa aqui dentro com o mesmo chamarApi() do backend
// (login via Playwright, sessão compartilhada) e devolve as respostas.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const CAMINHO_LOG = path.join(DIR, "log.txt");

async function carregarEnv(caminhoEnv) {
  try {
    const conteudo = await fs.readFile(caminhoEnv, "utf8");
    for (const linhaBruta of conteudo.split(/\r?\n/)) {
      const linha = linhaBruta.trim();
      if (!linha || linha.startsWith("#")) continue;
      const posIgual = linha.indexOf("=");
      if (posIgual === -1) continue;
      const chave = linha.slice(0, posIgual).trim();
      if (!(chave in process.env)) process.env[chave] = linha.slice(posIgual + 1).trim();
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

const dormir = (ms) => new Promise((r) => setTimeout(r, ms));

await carregarEnv(path.join(DIR, ".env"));
// Aqui a chamada é sempre direta (estamos dentro da rede): nunca pela ponte.
delete process.env.DM_VIA_PONTE;

const faltando = [
  "GEOMAP_API_URL",
  "PONTE_DM_TOKEN",
  "DRONEMGMT_BASE_URL",
  "DRONEMGMT_FORM_ID",
  "DRONEMGMT_UNIT_ID",
  "DRONEMGMT_USUARIO",
  "DRONEMGMT_SENHA",
].filter((k) => !process.env[k]);
if (faltando.length) {
  console.error(`Faltando no .env: ${faltando.join(", ")} (ver .env.example)`);
  process.exit(1);
}

// Importado só depois do .env: dronemgmt.js lê as variáveis ao carregar.
const { chamarApi } = await import("../../backend/src/lib/dronemgmt.js");

const API = process.env.GEOMAP_API_URL.replace(/\/+$/, "");
const CABECALHO = { "x-ponte-token": process.env.PONTE_DM_TOKEN };

async function devolver(id, resultado) {
  const r = await fetch(`${API}/ponte-dm/tarefas/${id}`, {
    method: "POST",
    headers: { ...CABECALHO, "Content-Type": "application/json" },
    body: JSON.stringify(resultado),
  });
  if (!r.ok) throw new Error(`GeoMap recusou a resposta (HTTP ${r.status})`);
}

let executadas = 0;
async function executar(tarefa) {
  let resultado;
  try {
    const resp = await chamarApi(tarefa.caminho, { method: tarefa.method, params: tarefa.params, body: tarefa.body });
    resultado = { status: resp.status, contentType: resp.headers.get("content-type"), corpo: await resp.text() };
  } catch (erro) {
    await log(`erro executando ${tarefa.method || "GET"} ${tarefa.caminho}: ${erro.message}`);
    resultado = { status: 502, contentType: "application/json", corpo: JSON.stringify({ erro: erro.message }) };
  }
  try {
    await devolver(tarefa.id, resultado);
    executadas++;
  } catch (erro) {
    await log(`não consegui devolver a resposta ao GeoMap: ${erro.message}`);
  }
}

// Registro sem inundar o log: só mudanças de estado + um resumo por hora.
let conectado = null;
let ultimoErro = null;
let ultimoResumo = Date.now();

await log(`ponte iniciada — GeoMap em ${API}`);
for (;;) {
  try {
    const r = await fetch(`${API}/ponte-dm/tarefas`, { headers: CABECALHO, signal: AbortSignal.timeout(60_000) });
    if (r.status === 401) throw new Error("o GeoMap recusou o token da ponte (PONTE_DM_TOKEN diferente do Render?)");
    if (!r.ok) throw new Error(`GeoMap respondeu HTTP ${r.status}`);
    if (!(r.headers.get("content-type") || "").includes("json")) {
      throw new Error("resposta não é do GeoMap (o portal de autenticação da rede expirou?)");
    }
    const { tarefas } = await r.json();
    if (conectado !== true) {
      conectado = true;
      ultimoErro = null;
      await log("conectado ao GeoMap — aguardando pedidos");
    }
    // Sem await: a próxima busca não espera os pedidos terminarem (um login
    // no DroneManagement pode levar segundos e o GeoMap considera a ponte
    // desligada se ela ficar 45 s sem buscar).
    for (const tarefa of tarefas) executar(tarefa);
  } catch (erro) {
    if (conectado !== false || erro.message !== ultimoErro) {
      await log(`sem conexão com o GeoMap: ${erro.message} — tentando de novo`);
    }
    conectado = false;
    ultimoErro = erro.message;
    await dormir(5000);
  }
  if (Date.now() - ultimoResumo > 3_600_000) {
    await log(`resumo: ${executadas} pedido(s) atendido(s) na última hora`);
    executadas = 0;
    ultimoResumo = Date.now();
  }
}
