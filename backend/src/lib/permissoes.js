import { pool } from "../db/pool.js";

// Permissão vale pro mapa inteiro (todas as camadas), via grupo ou individual
// — mesma view de mapas.js. Movida de voos.js para ser compartilhada com pins.js.
export async function usuarioTemPermissaoMapa(usuarioId, mapaId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM permissoes_efetivas
     WHERE usuario_id = $1 AND mapa_id = $2
     LIMIT 1`,
    [usuarioId, mapaId]
  );
  return rows.length > 0;
}

export async function mapaExiste(mapaId) {
  const { rows } = await pool.query("SELECT 1 FROM mapas WHERE id = $1", [mapaId]);
  return rows.length > 0;
}

export async function usuarioPodeVerMapa(usuarioId, mapaId, papel) {
  if (papel === "admin") return mapaExiste(mapaId);
  return usuarioTemPermissaoMapa(usuarioId, mapaId);
}

// Anotar (pins) exige pode_editar naquele mapa, via grupo ou individual.
// Admin sempre pode, desde que o mapa exista.
export async function usuarioPodeEditarMapa(usuarioId, mapaId, papel) {
  if (papel === "admin") return mapaExiste(mapaId);
  const { rows } = await pool.query(
    `SELECT 1 FROM permissoes_efetivas
     WHERE usuario_id = $1 AND mapa_id = $2 AND pode_editar
     LIMIT 1`,
    [usuarioId, mapaId]
  );
  return rows.length > 0;
}
