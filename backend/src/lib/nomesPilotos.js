import { pool } from "../db/pool.js";

// Pilotos = usuários do GeoMap com linha em pilotos_dronemgmt (migration
// 011). O DroneManagement só devolve o UUID de AD do piloto, sem nome.

export async function lerNomesPilotos() {
  const { rows } = await pool.query(
    `SELECT p.pilot_user_ad_id::text AS id, u.nome
     FROM pilotos_dronemgmt p JOIN usuarios u ON u.id = p.usuario_id`
  );
  return Object.fromEntries(rows.map((r) => [r.id.toLowerCase(), r.nome]));
}

export async function pilotoDoUsuario(usuarioId) {
  const { rows } = await pool.query(
    "SELECT pilot_user_ad_id::text AS id FROM pilotos_dronemgmt WHERE usuario_id = $1",
    [usuarioId]
  );
  return rows[0]?.id.toLowerCase() ?? null;
}
