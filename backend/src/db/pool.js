import pg from "pg";
import "dotenv/config";

// Neon (produção) exige SSL; Postgres local de dev não usa. `sslmode=require`
// na própria connection string não basta sozinho pro driver `pg` — precisa
// também da opção `ssl` explícita aqui, daí o flag PGSSL em vez de tentar
// inferir da URL.
export const pool = new pg.Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.PGSSL === "true" ? { rejectUnauthorized: false } : undefined,
});
