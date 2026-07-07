// Seed de dados de dev — usuário fictício pra testar o login local.
// NÃO é dado real. Uso: npm run seed (depois de rodar npm run migrate).
import bcrypt from "bcrypt";
import { pool } from "./pool.js";

async function main() {
  const senhaHash = await bcrypt.hash("senha123", 10);

  const { rows: grupoRows } = await pool.query(
    `INSERT INTO grupos (nome) VALUES ('Agronomia')
     ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
     RETURNING id`
  );
  const grupoId = grupoRows[0].id;

  const { rows: usuarioRows } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, departamento, status)
     VALUES ('Usuário de Teste', 'teste@geoportal.local', $1, 'Agronomia', 'ativo')
     ON CONFLICT (email) DO UPDATE SET senha_hash = EXCLUDED.senha_hash
     RETURNING id`,
    [senhaHash]
  );
  const usuarioId = usuarioRows[0].id;

  await pool.query(
    `INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [usuarioId, grupoId]
  );

  console.log("Seed aplicado: teste@geoportal.local / senha123");
  await pool.end();
}

main().catch((err) => {
  console.error("Falha ao aplicar seed:", err);
  process.exit(1);
});
