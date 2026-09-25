import { Router } from "express";
import { pool } from "../db/pool.js";
import { exigirAutenticacao } from "../middleware/auth.js";
import { usuarioPodeVerMapa, usuarioPodeEditarMapa, mapaExiste } from "../lib/permissoes.js";
import { CHAVES_ICONES_PREPARO } from "../lib/iconesPreparo.js";

// Anotações (pins) do Mapa do Preparo — ver
// docs/superpowers/specs/2026-09-24-mapa-preparo-anotacoes-design.md.
// O id vem do aparelho: PUT/DELETE são idempotentes (reenviar é seguro),
// o que a fila offline do frontend (lib/syncPins.js) depende.
export const pinsRouter = Router();
pinsRouter.use("/mapas/:id/pins", exigirAutenticacao);

const REGEX_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const REGEX_COR = /^#[0-9a-fA-F]{6}$/;

const SELECT_PIN = `
  SELECT p.*, uc.nome AS criado_por_nome, ua.nome AS atualizado_por_nome
  FROM pins p
  LEFT JOIN usuarios uc ON uc.id = p.criado_por
  LEFT JOIN usuarios ua ON ua.id = p.atualizado_por`;

function mapearPin(r) {
  return {
    id: r.id,
    mapaId: r.mapa_id,
    icone: r.icone,
    cor: r.cor,
    titulo: r.titulo,
    nota: r.nota,
    lng: r.lng,
    lat: r.lat,
    criadoPor: r.criado_por,
    criadoPorNome: r.criado_por_nome,
    atualizadoPor: r.atualizado_por,
    atualizadoPorNome: r.atualizado_por_nome,
    criadoEm: r.criado_em.toISOString(),
    atualizadoEm: r.atualizado_em.toISOString(),
    removidoEm: r.removido_em ? r.removido_em.toISOString() : null,
  };
}

function dataValida(valor) {
  if (typeof valor !== "string") return null;
  const d = new Date(valor);
  return Number.isNaN(d.getTime()) ? null : d;
}

// Relógio do aparelho adiantado não pode "congelar" um pin: com
// última-edição-vence, um atualizadoEm de daqui a 2 dias bloquearia toda
// edição real até lá. Datas vindas do cliente são limitadas a agora + 5 min.
const FOLGA_RELOGIO_MS = 5 * 60 * 1000;
function limitarAoFuturoProximo(data) {
  const limite = new Date(Date.now() + FOLGA_RELOGIO_MS);
  return data > limite ? limite : data;
}

function validarPin(body) {
  const icone = body?.icone;
  const cor = body?.cor;
  const titulo = typeof body?.titulo === "string" ? body.titulo.trim() : "";
  const nota = typeof body?.nota === "string" ? body.nota : "";
  const lng = body?.lng;
  const lat = body?.lat;
  const criadoEm = dataValida(body?.criadoEm);
  const atualizadoEm = dataValida(body?.atualizadoEm);

  if (!CHAVES_ICONES_PREPARO.has(icone)) return { erro: "ícone inválido" };
  if (typeof cor !== "string" || !REGEX_COR.test(cor)) return { erro: "cor inválida" };
  if (titulo.length < 1 || titulo.length > 120) return { erro: "título deve ter entre 1 e 120 caracteres" };
  if (nota.length > 2000) return { erro: "nota deve ter no máximo 2000 caracteres" };
  if (typeof lng !== "number" || !Number.isFinite(lng) || lng < -180 || lng > 180) return { erro: "longitude inválida" };
  if (typeof lat !== "number" || !Number.isFinite(lat) || lat < -90 || lat > 90) return { erro: "latitude inválida" };
  if (!criadoEm || !atualizadoEm) return { erro: "datas inválidas" };
  return {
    dados: { icone, cor, titulo, nota, lng, lat, criadoEm: limitarAoFuturoProximo(criadoEm), atualizadoEm: limitarAoFuturoProximo(atualizadoEm) },
  };
}

// Valida parâmetros e permissão de escrita; responde o erro e devolve null
// quando a requisição não pode seguir.
async function prepararEscrita(req, res) {
  const mapaId = Number(req.params.id);
  const pinId = req.params.uuid;
  if (!Number.isInteger(mapaId)) {
    res.status(400).json({ erro: "id de mapa inválido" });
    return null;
  }
  if (!REGEX_UUID.test(pinId)) {
    res.status(400).json({ erro: "id de pin inválido" });
    return null;
  }
  if (!(await mapaExiste(mapaId))) {
    res.status(404).json({ erro: "mapa não encontrado" });
    return null;
  }
  if (!(await usuarioPodeEditarMapa(req.usuarioId, mapaId, req.usuarioPapel))) {
    res.status(403).json({ erro: "sem permissão para anotar neste mapa" });
    return null;
  }
  return { mapaId, pinId };
}

async function buscarPin(cliente, pinId) {
  const { rows } = await cliente.query(`${SELECT_PIN} WHERE p.id = $1`, [pinId]);
  return rows[0] ? mapearPin(rows[0]) : null;
}

async function registrarLog(cliente, usuarioId, detalhe, ip) {
  await cliente.query(`INSERT INTO logs (usuario_id, acao, detalhe, ip) VALUES ($1, 'anotacao', $2, $3)`, [usuarioId, detalhe, ip]);
}

pinsRouter.get("/mapas/:id/pins", async (req, res) => {
  const mapaId = Number(req.params.id);
  if (!Number.isInteger(mapaId)) return res.status(400).json({ erro: "id de mapa inválido" });
  let desde = null;
  if (req.query.desde !== undefined) {
    desde = dataValida(req.query.desde);
    if (!desde) return res.status(400).json({ erro: "parâmetro desde inválido" });
  }
  if (!(await usuarioPodeVerMapa(req.usuarioId, mapaId, req.usuarioPapel))) {
    return res.status(404).json({ erro: "mapa não encontrado" });
  }
  // Cursor recua 1 minuto: uma escrita cujo recebido_em (now() da
  // transação dela) é anterior a este instante pode commitar DEPOIS desta
  // leitura e ficaria de fora para sempre. Reentregar alguns pins na
  // próxima rodada é inofensivo (o cliente faz upsert).
  const { rows: agoraRows } = await pool.query(`SELECT now() - interval '1 minute' AS agora`);
  const { rows } = await pool.query(
    `${SELECT_PIN} WHERE p.mapa_id = $1 AND ($2::timestamptz IS NULL OR p.recebido_em > $2) ORDER BY p.recebido_em`,
    [mapaId, desde]
  );
  res.json({ pins: rows.map(mapearPin), agora: agoraRows[0].agora.toISOString() });
});

pinsRouter.put("/mapas/:id/pins/:uuid", async (req, res) => {
  const alvo = await prepararEscrita(req, res);
  if (!alvo) return;
  const v = validarPin(req.body);
  if (v.erro) return res.status(400).json({ erro: v.erro });
  const d = v.dados;

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const inserido = await cliente.query(
      `INSERT INTO pins (id, mapa_id, icone, cor, titulo, nota, lng, lat, criado_por, atualizado_por, criado_em, atualizado_em)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9, $10, $11)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [alvo.pinId, alvo.mapaId, d.icone, d.cor, d.titulo, d.nota, d.lng, d.lat, req.usuarioId, d.criadoEm, d.atualizadoEm]
    );
    if (inserido.rows.length > 0) {
      await registrarLog(cliente, req.usuarioId, `criar pin ${alvo.pinId} "${d.titulo}" (mapa ${alvo.mapaId})`, req.ip);
    } else {
      const { rows } = await cliente.query(`SELECT mapa_id, atualizado_em, removido_em FROM pins WHERE id = $1 FOR UPDATE`, [alvo.pinId]);
      const atual = rows[0];
      if (atual.mapa_id !== alvo.mapaId) {
        await cliente.query("ROLLBACK");
        return res.status(409).json({ erro: "este pin pertence a outro mapa" });
      }
      // Pin removido não ressuscita; edição mais antiga que a do servidor
      // é ignorada ("última edição vence") — nos dois casos devolve o
      // estado do servidor para o cliente se alinhar.
      if (!atual.removido_em && d.atualizadoEm > atual.atualizado_em) {
        await cliente.query(
          `UPDATE pins SET icone = $2, cor = $3, titulo = $4, nota = $5, lng = $6, lat = $7,
             atualizado_por = $8, atualizado_em = $9, recebido_em = now()
           WHERE id = $1`,
          [alvo.pinId, d.icone, d.cor, d.titulo, d.nota, d.lng, d.lat, req.usuarioId, d.atualizadoEm]
        );
        await registrarLog(cliente, req.usuarioId, `editar pin ${alvo.pinId} "${d.titulo}" (mapa ${alvo.mapaId})`, req.ip);
      }
    }
    await cliente.query("COMMIT");
    res.json({ pin: await buscarPin(cliente, alvo.pinId) });
  } catch (err) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
});

pinsRouter.delete("/mapas/:id/pins/:uuid", async (req, res) => {
  const alvo = await prepararEscrita(req, res);
  if (!alvo) return;
  const removidoEm = limitarAoFuturoProximo(dataValida(req.query.removidoEm) || new Date());

  const cliente = await pool.connect();
  try {
    await cliente.query("BEGIN");
    const { rows } = await cliente.query(`SELECT mapa_id, titulo, removido_em FROM pins WHERE id = $1 FOR UPDATE`, [alvo.pinId]);
    const atual = rows[0];
    if (!atual) {
      // Pin criado e removido offline, nunca enviado: nada a fazer.
      await cliente.query("COMMIT");
      return res.json({ pin: null });
    }
    if (atual.mapa_id !== alvo.mapaId) {
      await cliente.query("ROLLBACK");
      return res.status(409).json({ erro: "este pin pertence a outro mapa" });
    }
    if (!atual.removido_em) {
      await cliente.query(`UPDATE pins SET removido_em = $2, atualizado_por = $3, recebido_em = now() WHERE id = $1`, [
        alvo.pinId,
        removidoEm,
        req.usuarioId,
      ]);
      await registrarLog(cliente, req.usuarioId, `remover pin ${alvo.pinId} "${atual.titulo}" (mapa ${alvo.mapaId})`, req.ip);
    }
    await cliente.query("COMMIT");
    res.json({ pin: await buscarPin(cliente, alvo.pinId) });
  } catch (err) {
    await cliente.query("ROLLBACK").catch(() => {});
    throw err;
  } finally {
    cliente.release();
  }
});
