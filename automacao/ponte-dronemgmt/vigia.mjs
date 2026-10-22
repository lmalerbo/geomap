// Vigia da ponte: roda a cada 5 min (tarefa agendada por horário, que não
// exige administrador; a "ao fazer login" exige). Olha os processos de
// verdade, não só o arquivo de sinal de vida, pra nunca abrir uma segunda
// ponte:
// - sinal de vida com menos de 3 min: tudo certo;
// - Node da ponte rodando mas sem sinal de vida (travada, ou presa no portal
//   da rede): encerra o Node; o laço do iniciar.cmd sobe de novo em 10 s;
// - só o laço do iniciar.cmd (no intervalo de 10 s entre tentativas): espera;
// - nada rodando (janela fechada, PC reiniciado): abre o iniciar.cmd.
// `node vigia.mjs --reiniciar` (atalho "Reiniciar ponte") encerra tudo e
// abre uma ponte nova.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LIMITE_MS = 3 * 60 * 1000;
const reiniciar = process.argv.includes("--reiniciar");
const agora = new Date();

async function registrar(msg) {
  await fs.appendFile(path.join(DIR, "log.txt"), `[${agora.toISOString()}] vigia: ${msg}\n`).catch(() => {});
}

// Processos do próprio usuário: Get-CimInstance não exige administrador.
function processosDaPonte() {
  const script =
    "Get-CimInstance Win32_Process -Filter \"Name='node.exe' OR Name='cmd.exe'\" | " +
    "ForEach-Object { \"$($_.ProcessId)|$($_.Name)|$($_.CommandLine)\" }";
  let saida = "";
  try {
    saida = execFileSync("powershell.exe", ["-NoProfile", "-Command", script], { encoding: "utf8", windowsHide: true });
  } catch {
    return { nodes: [], lacos: [] };
  }
  const nodes = [];
  const lacos = [];
  for (const linha of saida.split(/\r?\n/)) {
    const [pid, nome, ...resto] = linha.split("|");
    const cmd = resto.join("|").toLowerCase();
    if (!pid || !nome || !cmd.includes("ponte")) continue;
    if (nome.toLowerCase() === "node.exe" && cmd.includes("ponte.mjs")) nodes.push(Number(pid));
    if (nome.toLowerCase() === "cmd.exe" && cmd.includes("ponte-dronemgmt") && cmd.includes("iniciar.cmd")) lacos.push(Number(pid));
  }
  return { nodes, lacos };
}

function encerrar(pids) {
  for (const pid of pids) {
    try {
      execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { windowsHide: true, stdio: "ignore" });
    } catch {
      // já tinha saído
    }
  }
}

function abrirPonte() {
  // Linha de comando literal: sem windowsVerbatimArguments o Node escapa as
  // aspas do título e o `start` não abre o iniciar.cmd.
  const comando = `start "GeoMap - Ponte DroneManagement" /min "${path.join(DIR, "iniciar.cmd")}"`;
  spawn("cmd.exe", ["/d", "/s", "/c", `"${comando}"`], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
    windowsVerbatimArguments: true,
    cwd: DIR,
  }).unref();
}

const { nodes, lacos } = processosDaPonte();

if (reiniciar) {
  await registrar(`reinício pedido pelo atalho (encerrando ${nodes.length + lacos.length} processo(s))`);
  encerrar([...lacos, ...nodes]);
  abrirPonte();
  process.exit(0);
}

let estado = null;
try {
  estado = JSON.parse(await fs.readFile(path.join(DIR, "estado.json"), "utf8"));
} catch {
  // sem arquivo: ponte nunca conectou desde a atualização
}
const idade = estado ? agora - new Date(estado.ultimaConsultaOk) : Infinity;
if (idade <= LIMITE_MS && nodes.length > 0) process.exit(0); // ponte viva

if (nodes.length > 0) {
  const desde = Number.isFinite(idade) ? `há ${Math.round(idade / 60000)} min` : "desde o início";
  await registrar(`sem sinal de vida ${desde}; encerrando a ponte travada para o laço religar`);
  encerrar(nodes);
  if (lacos.length === 0) abrirPonte(); // Node solto, sem o laço: abre o laço
  process.exit(0);
}

if (lacos.length > 0) process.exit(0); // laço no intervalo entre tentativas

await registrar("ponte não está rodando; abrindo de novo");
abrirPonte();
