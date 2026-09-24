import jwt from "jsonwebtoken";
import { pool } from "../src/db/pool.js";

// Trava de segurança: backend/.env desta máquina aponta pro banco de
// PRODUÇÃO (Neon). Os testes só podem rodar com DATABASE_URL sobrescrita
// para o Postgres local — dotenv não sobrescreve env var já setada.
if (!/@(localhost|127\.0\.0\.1)[:/]/.test(process.env.DATABASE_URL || "")) {
  throw new Error(
    'Testes só rodam contra Postgres local. Use DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL=""'
  );
}

export { pool };

export async function iniciarServidor() {
  const { app } = await import("../src/app.js");
  const server = app.listen(0);
  await new Promise((r) => server.once("listening", r));
  const { port } = server.address();
  return {
    url: `http://127.0.0.1:${port}`,
    fechar: () => new Promise((r) => server.close(r)),
  };
}

export function tokenPara(usuario) {
  return jwt.sign({ sub: usuario.id, email: `${usuario.nome}@teste.local`, papel: usuario.papel }, process.env.JWT_SECRET, {
    expiresIn: "1h",
  });
}

export async function req(url, token, { method = "GET", body } = {}) {
  const resp = await fetch(url, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const texto = await resp.text();
  return { status: resp.status, corpo: texto ? JSON.parse(texto) : null };
}

async function criarUsuario(nome, papel) {
  const { rows } = await pool.query(
    `INSERT INTO usuarios (nome, email, senha_hash, papel) VALUES ($1, $2, 'x', $3) RETURNING id, nome, papel`,
    [nome, `${nome}@teste.local`, papel]
  );
  return rows[0];
}

// Monta um cenário isolado (nomes com sufixo aleatório) — nunca reaproveita
// dado existente do banco de dev.
export async function criarCenario() {
  const sufixo = `t${Date.now()}${Math.floor(Math.random() * 1000)}`;
  const g = async (nome) => (await pool.query(`INSERT INTO grupos (nome) VALUES ($1) RETURNING id`, [nome])).rows[0];
  const m = async (nome) => (await pool.query(`INSERT INTO mapas (nome) VALUES ($1) RETURNING id`, [nome])).rows[0];

  const grupoEditor = await g(`__editor_${sufixo}`);
  const grupoLeitor = await g(`__leitor_${sufixo}`);
  const mapa = await m(`__mapa_${sufixo}`);
  const mapaOutro = await m(`__mapa_outro_${sufixo}`);

  await pool.query(`INSERT INTO permissoes (mapa_id, grupo_id, pode_editar) VALUES ($1, $2, true), ($1, $3, false), ($4, $2, true)`, [
    mapa.id,
    grupoEditor.id,
    grupoLeitor.id,
    mapaOutro.id,
  ]);

  const editor = await criarUsuario(`__editor_${sufixo}`, "usuario");
  const leitor = await criarUsuario(`__leitor_${sufixo}`, "usuario");
  const semGrupo = await criarUsuario(`__semgrupo_${sufixo}`, "usuario");
  const admin = await criarUsuario(`__admin_${sufixo}`, "admin");
  await pool.query(`INSERT INTO usuarios_grupos (usuario_id, grupo_id) VALUES ($1, $2), ($3, $4)`, [
    editor.id,
    grupoEditor.id,
    leitor.id,
    grupoLeitor.id,
  ]);

  return { sufixo, grupoEditor, grupoLeitor, mapa, mapaOutro, editor, leitor, semGrupo, admin };
}

export async function limparCenario(c) {
  const usuarios = [c.editor.id, c.leitor.id, c.semGrupo.id, c.admin.id];
  await pool.query(`DELETE FROM logs WHERE usuario_id = ANY($1)`, [usuarios]);
  await pool.query(`DELETE FROM mapas WHERE id = ANY($1) OR nome LIKE $2`, [[c.mapa.id, c.mapaOutro.id], `%${c.sufixo}%`]);
  await pool.query(`DELETE FROM usuarios WHERE id = ANY($1)`, [usuarios]);
  await pool.query(`DELETE FROM grupos WHERE id = ANY($1)`, [[c.grupoEditor.id, c.grupoLeitor.id]]);
}
