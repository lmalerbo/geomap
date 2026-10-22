// Vigia da ponte: roda a cada 5 min (tarefa agendada por horário, sem admin).
// Ponte sem sinal de vida há mais de 3 min: se o processo ainda existe
// (travado), encerra — o laço do iniciar.cmd sobe de novo; se não existe
// (janela fechada, PC reiniciado com login), abre o iniciar.cmd minimizado.
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn, execFileSync } from "node:child_process";

const DIR = path.dirname(fileURLToPath(import.meta.url));
const LIMITE_MS = 3 * 60 * 1000;
const agora = new Date();

async function registrar(msg) {
  await fs.appendFile(path.join(DIR, "log.txt"), `[${agora.toISOString()}] vigia: ${msg}\n`).catch(() => {});
}

function processoExiste(pid) {
  try { process.kill(pid, 0); return true; } catch { return false; }
}

let estado = null;
try { estado = JSON.parse(await fs.readFile(path.join(DIR, "estado.json"), "utf8")); } catch {}
const idade = estado ? agora - new Date(estado.ultimaConsultaOk) : Infinity;

if (idade <= LIMITE_MS) process.exit(0); // ponte viva

if (estado?.pid && processoExiste(estado.pid)) {
  await registrar(`sem sinal de vida há ${Math.round(idade / 60000)} min; encerrando o processo travado ${estado.pid}`);
  try { execFileSync("taskkill", ["/PID", String(estado.pid), "/F"]); } catch {}
  process.exit(0); // o iniciar.cmd religa em 10 s
}

await registrar("ponte não está rodando; abrindo de novo");
spawn("cmd.exe", ["/c", "start", "\"GeoMap - Ponte DroneManagement\"", "/min", path.join(DIR, "iniciar.cmd")], {
  detached: true, stdio: "ignore", windowsHide: true, cwd: DIR,
}).unref();