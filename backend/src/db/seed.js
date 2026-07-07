// Seed de dados de dev — usuário e mapas fictícios pra testar login,
// catálogo e download local. NÃO é dado real.
// Uso: npm run seed (depois de rodar npm run migrate).
import bcrypt from "bcrypt";
import { pool } from "./pool.js";

async function upsertGrupo(nome) {
  const { rows } = await pool.query(
    `INSERT INTO grupos (nome) VALUES ($1)
     ON CONFLICT (nome) DO UPDATE SET nome = EXCLUDED.nome
     RETURNING id`,
    [nome]
  );
  return rows[0].id;
}

async function upsertMapa(nome, versao, categoria, arquivoPath) {
  const { rows } = await pool.query(
    `SELECT id FROM mapas WHERE nome = $1`,
    [nome]
  );
  if (rows[0]) return rows[0].id;

  const inserted = await pool.query(
    `INSERT INTO mapas (nome, versao, categoria, arquivo_path)
     VALUES ($1, $2, $3, $4)
     RETURNING id`,
    [nome, versao, categoria, arquivoPath]
  );
  return inserted.rows[0].id;
}

async function main() {
  const senhaHash = await bcrypt.hash("senha123", 10);

  const grupoAgronomia = await upsertGrupo("Agronomia");
  const grupoDiretoria = await upsertGrupo("Diretoria");

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
    [usuarioId, grupoAgronomia]
  );

  // Mapa visível pro usuário de teste (grupo Agronomia).
  const mapaVisivel = await upsertMapa(
    "Talhões — Fazenda Fictícia (dado fake)",
    "1.0",
    "Agronomia",
    "talhoes_teste.pmtiles"
  );
  await pool.query(
    `INSERT INTO permissoes (mapa_id, grupo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [mapaVisivel, grupoAgronomia]
  );

  // Mapa fora do grupo do usuário de teste — só pra provar que o filtro funciona.
  await upsertMapa(
    "Mapa restrito — Diretoria (dado fake)",
    "1.0",
    "Diretoria",
    "restrito_teste.pmtiles"
  ).then((mapaRestritoId) =>
    pool.query(
      `INSERT INTO permissoes (mapa_id, grupo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
      [mapaRestritoId, grupoDiretoria]
    )
  );

  console.log("Seed aplicado: teste@geoportal.local / senha123");
  console.log(`Mapa visível: id=${mapaVisivel} (arquivo: talhoes_teste.pmtiles)`);
  await pool.end();
}

main().catch((err) => {
  console.error("Falha ao aplicar seed:", err);
  process.exit(1);
});
