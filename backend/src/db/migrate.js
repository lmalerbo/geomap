import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "./pool.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

// Sem isso, toda migration precisava ser reescrita pra tolerar rodar de
// novo do zero pra sempre — o que já se provou frágil (uma migration que
// renomeia uma coluna quebra outra migration antiga que ainda referencia
// o nome velho). Controla quais arquivos já rodaram e só aplica os novos.
async function garantirTabelaControle() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      arquivo TEXT PRIMARY KEY,
      aplicada_em TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);
}

async function migracoesJaAplicadas() {
  const { rows } = await pool.query("SELECT arquivo FROM schema_migrations");
  return new Set(rows.map((r) => r.arquivo));
}

async function main() {
  await garantirTabelaControle();
  const aplicadas = await migracoesJaAplicadas();
  const arquivos = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  let novas = 0;
  for (const arquivo of arquivos) {
    if (aplicadas.has(arquivo)) continue;
    const sql = readFileSync(path.join(migrationsDir, arquivo), "utf8");
    console.log(`Aplicando migration: ${arquivo}`);
    await pool.query(sql);
    await pool.query("INSERT INTO schema_migrations (arquivo) VALUES ($1)", [arquivo]);
    novas++;
  }

  console.log(novas > 0 ? "Migrations aplicadas com sucesso." : "Nenhuma migration nova — nada a fazer.");
  await pool.end();
}

main().catch((err) => {
  console.error("Falha ao aplicar migrations:", err);
  process.exit(1);
});
