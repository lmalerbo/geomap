import { pool } from "../db/pool.js";

// Permissão vale pro mapa inteiro (todas as camadas), via grupo — mesmo JOIN
// de mapas.js. Movida de voos.js para ser compartilhada com pins.js.
export async function usuarioTemPermissaoMapa(usuarioId, mapaId) {
  const { rows } = await pool.query(
    `SELECT 1 FROM permissoes p
     JOIN usuarios_grupos ug ON ug.grupo_id = p.grupo_id
     WHERE ug.usuario_id = $1 AND p.mapa_id = $2
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

// Anotar (pins) exige algum grupo do usuário com pode_editar naquele mapa.
// Admin sempre pode, desde que o mapa exista.
export async function usuarioPodeEditarMapa(usuarioId, mapaId, papel) {
  if (papel === "admin") return mapaExiste(mapaId);
  const { rows } = await pool.query(
    `SELECT 1 FROM permissoes p
     JOIN usuarios_grupos ug ON ug.grupo_id = p.grupo_id
     WHERE ug.usuario_id = $1 AND p.mapa_id = $2 AND p.pode_editar
     LIMIT 1`,
    [usuarioId, mapaId]
  );
  return rows.length > 0;
}
