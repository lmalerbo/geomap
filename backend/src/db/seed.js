// Seed de dados de dev — usuário, mapas (projetos) e camadas fictícios
// pra testar login, tela inicial e download local. NÃO é dado real.
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

async function upsertMapa(nome, descricao) {
  const { rows } = await pool.query(`SELECT id FROM mapas WHERE nome = $1`, [nome]);
  if (rows[0]) return rows[0].id;

  const inserted = await pool.query(
    `INSERT INTO mapas (nome, descricao) VALUES ($1, $2) RETURNING id`,
    [nome, descricao]
  );
  return inserted.rows[0].id;
}

async function upsertCamada(mapaId, nome, versao, categoria, arquivoPath) {
  const { rows } = await pool.query(`SELECT id FROM camadas WHERE nome = $1`, [nome]);
  if (rows[0]) return rows[0].id;

  const inserted = await pool.query(
    `INSERT INTO camadas (mapa_id, nome, versao, categoria, arquivo_path)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [mapaId, nome, versao, categoria, arquivoPath]
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

  const { rows: adminRows } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, departamento, status, papel)
     VALUES ('Admin de Teste', 'admin@geoportal.local', $1, 'TI', 'ativo', 'admin')
     ON CONFLICT (email) DO UPDATE SET senha_hash = EXCLUDED.senha_hash, papel = 'admin'
     RETURNING id`,
    [senhaHash]
  );
  const adminId = adminRows[0].id;
  await pool.query(
    `INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES ($1, $2)
     ON CONFLICT DO NOTHING`,
    [adminId, grupoAgronomia]
  );

  // Mapa (projeto) visível pro usuário de teste (grupo Agronomia), com
  // uma camada fake dentro dele.
  const mapaVisivel = await upsertMapa(
    "Fazenda Fictícia (teste)",
    "Mapa de dev usado pra testar login/sincronização"
  );
  await pool.query(
    `INSERT INTO permissoes (mapa_id, grupo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [mapaVisivel, grupoAgronomia]
  );
  await upsertCamada(
    mapaVisivel,
    "Talhões — Fazenda Fictícia (dado fake)",
    "1.0",
    "Agronomia",
    "talhoes_teste.pmtiles"
  );

  // Mapa (projeto) fora do grupo do usuário de teste — prova que o
  // filtro de permissão por mapa inteiro funciona.
  const mapaRestrito = await upsertMapa(
    "Projeto restrito (teste)",
    "Mapa fake usado pra testar permissão por grupo"
  );
  await pool.query(
    `INSERT INTO permissoes (mapa_id, grupo_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [mapaRestrito, grupoDiretoria]
  );
  await upsertCamada(
    mapaRestrito,
    "Mapa restrito — Diretoria (dado fake)",
    "1.0",
    "Diretoria",
    "restrito_teste.pmtiles"
  );

  console.log("Seed aplicado: teste@geoportal.local / senha123 (usuario)");
  console.log("Seed aplicado: admin@geoportal.local / senha123 (admin)");
  console.log(`Mapa visível: id=${mapaVisivel} (Fazenda Fictícia (teste))`);
  await pool.end();
}

main().catch((err) => {
  console.error("Falha ao aplicar seed:", err);
  process.exit(1);
});
