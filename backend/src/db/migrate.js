import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { pool } from "./pool.js";

const migrationsDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");

async function main() {
  const arquivos = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();

  for (const arquivo of arquivos) {
    const sql = readFileSync(path.join(migrationsDir, arquivo), "utf8");
    console.log(`Aplicando migration: ${arquivo}`);
    await pool.query(sql);
  }

  console.log("Migrations aplicadas com sucesso.");
  await pool.end();
}

main().catch((err) => {
  console.error("Falha ao aplicar migrations:", err);
  process.exit(1);
});
