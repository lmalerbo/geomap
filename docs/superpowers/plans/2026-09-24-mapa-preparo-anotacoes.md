# Mapa do Preparo — Anotações Compartilhadas Offline — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir que usuários de grupos autorizados criem/editem/removam pins anotados (ícone do catálogo de preparo, cor, título, nota) num mapa, inclusive offline, com todos os outros usuários do mapa vendo esses pins; e, em todos os mapas, clicar fora de feição passa a mostrar a coordenada.

**Architecture:** Backend ganha `permissoes.pode_editar`, tabela `pins` (UUID gerado no cliente, remoção lógica, `recebido_em` para sync incremental) e rotas REST idempotentes. Frontend grava tudo primeiro no IndexedDB com um campo `pendente` (outbox), envia em segundo plano (`lib/syncPins.js`) e recebe o incremental junto do sync de camadas já existente (`lib/sync.js`). A UI de pins é isolada em `hooks/usePins.js` + componentes em `components/pins/`, plugados em `pages/Mapa.jsx`.

**Tech Stack:** Node 20 + Express 4 + `pg` (backend), `node:test` (testes backend, sem dependência nova); React 19 + Vite 6 + MapLibre GL 5 + `idb` (frontend), Vitest 4 (testes unitários, projeto novo `unit`), Playwright (verificação ponta a ponta).

**Spec:** `docs/superpowers/specs/2026-09-24-mapa-preparo-anotacoes-design.md`

## Global Constraints

- Nenhum teste roda contra produção: `backend/.env` aponta para Neon/R2 **de produção**. Todo comando de backend neste plano usa `DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL=""` explícito; o helper de teste recusa rodar se `DATABASE_URL` não for localhost.
- Node do frontend: rodar `fnm use` dentro de `frontend/` antes de `npm`/`npx` (Node 22.12.0, ver `frontend/.nvmrc`).
- Nunca passar texto acentuado por argumento/variável de shell (corrompe encoding nesta máquina). Payload com acento vai por arquivo escrito com a tool Write + `--data-binary @arquivo`.
- Coordenada exibida sempre em graus decimais, 6 casas, formato `"<lat>, <lng>"` (ex: `-21.123456, -47.654321`).
- Catálogo de ícones: exatamente as 15 chaves `pedra, toco, erosao, alagamento, formigueiro, cupinzeiro, curva_nivel, carreador, cerca, rede_eletrica, tubulacao, compactacao, mato, maquina, observacao`.
- Limites de campo: `titulo` 1–120 caracteres (após trim), `nota` 0–2000, `cor` `^#[0-9a-fA-F]{6}$`, `lng` −180..180, `lat` −90..90.
- Não fazer `git push` enquanto a automação diária (`automacao/vigiar-talhoes-limites`, ~8:05) estiver rodando — push dispara redeploy no Render e mata jobs em andamento.
- Limpar todo dado de teste criado no banco local ao final de cada verificação.
- Commits pequenos, mensagens em português, terminando com `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`. Não commitar os arquivos soltos não relacionados que já existem no working tree (`*.kml`, `Municípios.*`, `backend/_*.mjs|json|html|png`, `automacao/.../backup_estilo_talhoes.json`) — sempre `git add` com caminhos explícitos.

## Review Focus

- **Edição local feita enquanto o envio daquele mesmo pin está em voo** — a edição nova não pode ser apagada quando a resposta antiga chegar (teste no Task 5: "não apaga edição local feita durante o envio").
- **Pin criado e removido offline, nunca enviado** — `DELETE` de um UUID inexistente precisa responder 200 e o cliente apagar o registro local sem erro (teste backend no Task 2 e unit no Task 5).
- **Escrita concorrente no servidor perdida pelo sync incremental** — uma escrita cujo `recebido_em` é anterior ao `agora` devolvido mas commitou depois da leitura; o cursor recua 1 minuto para cobrir isso (teste no Task 2: "cursor devolvido fica no passado").
- **Usuário perde permissão de anotar com pendências offline** — envio recebe 403, descarta o local e avisa; a próxima recepção restaura o estado do servidor (teste no Task 5).
- **`PUT` com `mapaId` diferente do mapa real do pin** (UUID reaproveitado entre mapas) — deve responder 409 e nunca mover o pin de mapa (teste no Task 2).

---

## Mapa de arquivos

**Backend**
- Create `backend/src/db/migrations/014_pins_anotacoes.sql` — coluna `pode_editar`, tabela `pins`, `CHECK` de `logs.acao`.
- Create `backend/src/lib/permissoes.js` — `usuarioTemPermissaoMapa`, `usuarioPodeVerMapa`, `usuarioPodeEditarMapa`, `mapaExiste`.
- Create `backend/src/lib/iconesPreparo.js` — `CHAVES_ICONES_PREPARO`.
- Create `backend/src/routes/pins.js` — `GET/PUT/DELETE` de pins.
- Modify `backend/src/app.js` — monta `pinsRouter` antes do `adminRouter`.
- Modify `backend/src/routes/voos.js` — importa `usuarioTemPermissaoMapa` de `lib/permissoes.js`.
- Modify `backend/src/routes/mapas.js` — `GET /mapas` devolve `podeEditar`.
- Modify `backend/src/routes/admin.js` — `permissoes: [{grupoId, podeEditar}]` em GET/POST/PUT de mapas; duplicar copia `pode_editar`.
- Create `backend/test/helpers.js`, `backend/test/permissoes.test.js`, `backend/test/pins.test.js`, `backend/test/mapas-permissoes.test.js`.
- Modify `backend/package.json` — script `test`.

**Frontend**
- Modify `frontend/vite.config.js` + `frontend/package.json` — projeto Vitest `unit` e script `test:unit`.
- Create `frontend/src/lib/iconesPreparo.js` (+ `iconesPreparo.test.js`) — catálogo, SVG do pin, carregamento como imagem do MapLibre.
- Create `frontend/src/lib/coordenadas.js` (+ `coordenadas.test.js`).
- Modify `frontend/src/lib/db.js` — stores `pins` e `pins_cursor` (versão 4, redefinida), `podeEditar` em mapas disponíveis.
- Create `frontend/src/lib/syncPins.js` (+ `syncPins.test.js`) — outbox/envio/recebimento com dependências injetadas.
- Modify `frontend/src/lib/api.js` — `status` no erro; `listarPinsRemoto`, `salvarPinRemoto`, `removerPinRemoto`; admin com `permissoes`.
- Modify `frontend/src/lib/sync.js` — envia e recebe pins no ciclo de sync.
- Rewrite `frontend/src/hooks/usePins.js` — estado/camadas/ações de pins.
- Create `frontend/src/hooks/usePinsPendentes.js` — contagem global de pendentes.
- Create `frontend/src/components/LinhaCoordenada.jsx`, `frontend/src/components/CartaoPonto.jsx`.
- Create `frontend/src/components/pins/FormularioPin.jsx`, `CartaoPin.jsx`, `BarraAnotar.jsx`.
- Modify `frontend/src/pages/Mapa.jsx` — clique vazio, pins, controle "Anotar", painel de camadas, busca, cabeçalho, logout.
- Modify `frontend/src/pages/Inicio.jsx` — confirmação de logout com pendentes.
- Modify `frontend/src/context/JobsContext.jsx` — expõe `adicionarToast`.
- Modify `frontend/src/pages/AdminMapas.jsx` — caixa "pode anotar" por grupo.
- Modify `frontend/src/index.css` — estilos novos.
- Delete nada. `frontend/src/lib/coresFerramentas.js` mantém `pinPadrao` (mudança local já existente, entra no commit do Task 8).

**Docs:** `docs/SCHEMA_BANCO.md`, `docs/ROADMAP.md`, `CLAUDE.md` (Task 12).

---

### Task 1: Harness de teste do backend, migration 014 e módulo de permissões

**Files:**
- Create: `backend/test/helpers.js`
- Create: `backend/test/permissoes.test.js`
- Create: `backend/src/db/migrations/014_pins_anotacoes.sql`
- Create: `backend/src/lib/permissoes.js`
- Modify: `backend/src/routes/voos.js` (remover a função local `usuarioTemPermissaoMapa`, linhas ~43-54, e importar)
- Modify: `backend/package.json`

**Interfaces:**
- Produces:
  - `usuarioTemPermissaoMapa(usuarioId: number, mapaId: number): Promise<boolean>` — só por grupo (semântica atual de `voos.js`).
  - `usuarioPodeVerMapa(usuarioId, mapaId, papel: string): Promise<boolean>` — admin ⇒ true se o mapa existe; senão por grupo.
  - `usuarioPodeEditarMapa(usuarioId, mapaId, papel): Promise<boolean>` — admin ⇒ true se o mapa existe; senão algum grupo com `pode_editar = true`.
  - `mapaExiste(mapaId): Promise<boolean>`.
  - Test helpers: `criarCenario(): Promise<Cenario>`, `limparCenario(c)`, `iniciarServidor(): Promise<{url, fechar}>`, `tokenPara(usuario)`, `req(url, token, {method, body})`, `pool`.
  - `Cenario = { sufixo, grupoEditor, grupoLeitor, mapa, mapaOutro, editor, leitor, semGrupo, admin }` (cada usuário `{id, nome, papel}`; grupos/mapas `{id}`).

- [ ] **Step 1: Garantir o banco local migrado até a 013**

Run (Git Bash, de `backend/`):
```bash
DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" npm run migrate
```
Expected: termina sem erro ("Nenhuma migration nova" ou aplica pendentes até a 013).

- [ ] **Step 2: Criar o helper de testes**

`backend/test/helpers.js`:
```js
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
```
(`pins` e `permissoes` somem em cascata com `mapas`.)

- [ ] **Step 3: Adicionar script de teste**

Em `backend/package.json`, `scripts`:
```json
"test": "node --test test/"
```

- [ ] **Step 4: Escrever o teste de permissões (falha)**

`backend/test/permissoes.test.js`:
```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { criarCenario, limparCenario, pool } from "./helpers.js";
import { usuarioPodeVerMapa, usuarioPodeEditarMapa, usuarioTemPermissaoMapa, mapaExiste } from "../src/lib/permissoes.js";

let c;
before(async () => {
  c = await criarCenario();
});
after(async () => {
  await limparCenario(c);
  await pool.end();
});

test("leitor vê mas não edita", async () => {
  assert.equal(await usuarioPodeVerMapa(c.leitor.id, c.mapa.id, "usuario"), true);
  assert.equal(await usuarioPodeEditarMapa(c.leitor.id, c.mapa.id, "usuario"), false);
});

test("editor vê e edita", async () => {
  assert.equal(await usuarioPodeVerMapa(c.editor.id, c.mapa.id, "usuario"), true);
  assert.equal(await usuarioPodeEditarMapa(c.editor.id, c.mapa.id, "usuario"), true);
});

test("usuário sem grupo não vê nem edita", async () => {
  assert.equal(await usuarioPodeVerMapa(c.semGrupo.id, c.mapa.id, "usuario"), false);
  assert.equal(await usuarioPodeEditarMapa(c.semGrupo.id, c.mapa.id, "usuario"), false);
  assert.equal(await usuarioTemPermissaoMapa(c.semGrupo.id, c.mapa.id), false);
});

test("admin vê e edita qualquer mapa existente, mas não mapa inexistente", async () => {
  assert.equal(await usuarioPodeEditarMapa(c.admin.id, c.mapa.id, "admin"), true);
  assert.equal(await usuarioPodeVerMapa(c.admin.id, c.mapa.id, "admin"), true);
  assert.equal(await usuarioPodeEditarMapa(c.admin.id, 999999999, "admin"), false);
  assert.equal(await mapaExiste(999999999), false);
});
```

- [ ] **Step 5: Rodar e ver falhar**

Run (de `backend/`):
```bash
DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" node --test test/permissoes.test.js
```
Expected: FAIL — `column "pode_editar" of relation "permissoes" does not exist` (no `criarCenario`) ou `Cannot find module .../lib/permissoes.js`.

- [ ] **Step 6: Escrever a migration 014**

`backend/src/db/migrations/014_pins_anotacoes.sql`:
```sql
-- Mapa do Preparo: anotações (pins) compartilhadas, editáveis offline por
-- grupos autorizados. Ver docs/superpowers/specs/2026-09-24-mapa-preparo-anotacoes-design.md.

-- Nível de permissão novo por mapa×grupo. Default false: toda permissão
-- existente continua só-leitura.
ALTER TABLE permissoes ADD COLUMN IF NOT EXISTS pode_editar BOOLEAN NOT NULL DEFAULT false;

-- id é gerado no aparelho (crypto.randomUUID) para o pin existir offline;
-- reenviar a mesma escrita nunca duplica. criado_em/atualizado_em/
-- removido_em são a hora DO APARELHO no momento da ação (regra "última
-- edição vence"); recebido_em é a hora do servidor da última escrita
-- aceita — base do sync incremental (GET ...?desde=).
CREATE TABLE IF NOT EXISTS pins (
    id UUID PRIMARY KEY,
    mapa_id INTEGER NOT NULL REFERENCES mapas (id) ON DELETE CASCADE,
    icone TEXT NOT NULL,
    cor TEXT NOT NULL,
    titulo TEXT NOT NULL,
    nota TEXT NOT NULL DEFAULT '',
    lng DOUBLE PRECISION NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    criado_por INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
    atualizado_por INTEGER REFERENCES usuarios (id) ON DELETE SET NULL,
    criado_em TIMESTAMPTZ NOT NULL,
    atualizado_em TIMESTAMPTZ NOT NULL,
    removido_em TIMESTAMPTZ,
    recebido_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS pins_mapa_recebido_idx ON pins (mapa_id, recebido_em);

-- logs.acao ganha 'anotacao' (mesmo padrão da migration 007: acha o nome
-- da constraint dinamicamente e recria com a lista completa).
DO $$
DECLARE
  nome_constraint TEXT;
BEGIN
  SELECT con.conname INTO nome_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'logs' AND con.contype = 'c' AND pg_get_constraintdef(con.oid) LIKE '%acao%';

  IF nome_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE logs DROP CONSTRAINT %I', nome_constraint);
  END IF;

  ALTER TABLE logs ADD CONSTRAINT logs_acao_check CHECK (acao IN ('login', 'download', 'admin', 'anotacao'));
END $$;
```

- [ ] **Step 7: Aplicar a migration no banco local**

Run:
```bash
DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" npm run migrate
```
Expected: `Aplicando migration: 014_pins_anotacoes.sql`.

- [ ] **Step 8: Implementar `lib/permissoes.js`**

`backend/src/lib/permissoes.js`:
```js
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
```

- [ ] **Step 9: Trocar a função local de `voos.js` pelo import**

Em `backend/src/routes/voos.js`: apagar o bloco
```js
// Mesmo JOIN já usado em mapas.js (GET /mapas, GET /camadas/:id/download)
// — permissão vale pro mapa inteiro, não por camada.
async function usuarioTemPermissaoMapa(usuarioId, mapaId) {
  ...
}
```
e acrescentar aos imports do topo:
```js
import { usuarioTemPermissaoMapa } from "../lib/permissoes.js";
```
(A query nova é equivalente: o `JOIN mapas m` antigo só filtrava `m.id = p.mapa_id`, e a FK garante que o mapa existe.)

- [ ] **Step 10: Rodar o teste e ver passar**

Run:
```bash
DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" node --test test/permissoes.test.js
```
Expected: 4 testes `ok`, 0 falhas.

- [ ] **Step 11: Checar que o backend ainda sobe**

Run:
```bash
DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" node -e "import('./src/app.js').then(()=>{console.log('ok');process.exit(0)})"
```
Expected: `ok`.

- [ ] **Step 12: Commit**

```bash
git add backend/test/helpers.js backend/test/permissoes.test.js backend/src/db/migrations/014_pins_anotacoes.sql backend/src/lib/permissoes.js backend/src/routes/voos.js backend/package.json
git commit -m "Adiciona permissao de anotar por grupo, tabela de pins e harness de testes do backend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 2: Rotas de pins (GET incremental, PUT idempotente, DELETE lógico)

**Files:**
- Create: `backend/src/lib/iconesPreparo.js`
- Create: `backend/src/routes/pins.js`
- Modify: `backend/src/app.js` (import + `app.use(pinsRouter)` logo depois de `app.use(voosRouter)`)
- Test: `backend/test/pins.test.js`

**Interfaces:**
- Consumes: `usuarioPodeVerMapa`, `usuarioPodeEditarMapa`, `mapaExiste` (Task 1); helpers de teste (Task 1).
- Produces (contrato HTTP usado pelo frontend no Task 6):
  - `GET /mapas/:id/pins?desde=<ISO>` → `200 { pins: PinApi[], agora: ISO }`; 404 sem permissão de leitura ou mapa inexistente; 400 `desde` inválido.
  - `PUT /mapas/:id/pins/:uuid` corpo `{icone, cor, titulo, nota, lng, lat, criadoEm, atualizadoEm}` → `200 { pin: PinApi }`; 400 validação; 403 sem permissão de editar; 404 mapa inexistente; 409 pin de outro mapa.
  - `DELETE /mapas/:id/pins/:uuid?removidoEm=<ISO>` → `200 { pin: PinApi | null }`; mesmos 400/403/404/409.
  - `PinApi = { id, mapaId, icone, cor, titulo, nota, lng, lat, criadoPor, criadoPorNome, atualizadoPor, atualizadoPorNome, criadoEm, atualizadoEm, removidoEm }` (datas em ISO string; `removidoEm` null se ativo).

- [ ] **Step 1: Escrever os testes (falham)**

`backend/test/pins.test.js`:
```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarCenario, limparCenario, iniciarServidor, tokenPara, req, pool } from "./helpers.js";

let c, srv, tEditor, tLeitor, tSemGrupo, tAdmin;
before(async () => {
  c = await criarCenario();
  srv = await iniciarServidor();
  tEditor = tokenPara(c.editor);
  tLeitor = tokenPara(c.leitor);
  tSemGrupo = tokenPara(c.semGrupo);
  tAdmin = tokenPara(c.admin);
});
after(async () => {
  await srv.fechar();
  await limparCenario(c);
  await pool.end();
});

function corpo(extra = {}) {
  const agora = new Date().toISOString();
  return { icone: "pedra", cor: "#16a34a", titulo: "Pedra", nota: "grande", lng: -47.6, lat: -21.1, criadoEm: agora, atualizadoEm: agora, ...extra };
}
const url = (mapaId, id = "") => `${srv.url}/mapas/${mapaId}/pins${id ? `/${id}` : ""}`;

test("editor cria pin e leitor recebe", async () => {
  const id = randomUUID();
  const r = await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo() });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.pin.id, id);
  assert.equal(r.corpo.pin.criadoPorNome, c.editor.nome);
  const lista = await req(url(c.mapa.id), tLeitor);
  assert.equal(lista.status, 200);
  assert.ok(lista.corpo.pins.some((p) => p.id === id));
  const log = await pool.query(`SELECT detalhe FROM logs WHERE usuario_id = $1 AND acao = 'anotacao'`, [c.editor.id]);
  assert.ok(log.rows.some((l) => l.detalhe.includes(id)));
});

test("leitor e usuário sem grupo não podem escrever; sem grupo não lê", async () => {
  const id = randomUUID();
  assert.equal((await req(url(c.mapa.id, id), tLeitor, { method: "PUT", body: corpo() })).status, 403);
  assert.equal((await req(url(c.mapa.id, id), tSemGrupo, { method: "PUT", body: corpo() })).status, 403);
  assert.equal((await req(url(c.mapa.id), tSemGrupo)).status, 404);
});

test("admin escreve mesmo sem grupo; mapa inexistente é 404", async () => {
  assert.equal((await req(url(c.mapa.id, randomUUID()), tAdmin, { method: "PUT", body: corpo() })).status, 200);
  assert.equal((await req(url(999999999, randomUUID()), tAdmin, { method: "PUT", body: corpo() })).status, 404);
});

test("PUT repetido é idempotente e edição mais antiga é ignorada", async () => {
  const id = randomUUID();
  const t0 = new Date(Date.now() - 60000).toISOString();
  const t1 = new Date().toISOString();
  await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo({ criadoEm: t0, atualizadoEm: t0 }) });
  await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo({ criadoEm: t0, atualizadoEm: t0 }) });
  const novo = await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo({ criadoEm: t0, atualizadoEm: t1, titulo: "Novo" }) });
  assert.equal(novo.corpo.pin.titulo, "Novo");
  const velho = await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo({ criadoEm: t0, atualizadoEm: t0, titulo: "Velho" }) });
  assert.equal(velho.status, 200);
  assert.equal(velho.corpo.pin.titulo, "Novo");
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM pins WHERE id = $1`, [id]);
  assert.equal(rows[0].n, 1);
});

test("pin removido não ressuscita e DELETE é idempotente", async () => {
  const id = randomUUID();
  await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo() });
  const rem = new Date().toISOString();
  const d1 = await req(`${url(c.mapa.id, id)}?removidoEm=${encodeURIComponent(rem)}`, tEditor, { method: "DELETE" });
  assert.equal(d1.status, 200);
  assert.ok(d1.corpo.pin.removidoEm);
  const d2 = await req(`${url(c.mapa.id, id)}?removidoEm=${encodeURIComponent(rem)}`, tEditor, { method: "DELETE" });
  assert.equal(d2.status, 200);
  const futuro = new Date(Date.now() + 60000).toISOString();
  const put = await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo({ atualizadoEm: futuro, titulo: "Zumbi" }) });
  assert.equal(put.corpo.pin.titulo, "Pedra");
  assert.ok(put.corpo.pin.removidoEm);
});

test("DELETE de pin que nunca chegou ao servidor responde 200 com pin null", async () => {
  const r = await req(`${url(c.mapa.id, randomUUID())}?removidoEm=${encodeURIComponent(new Date().toISOString())}`, tEditor, { method: "DELETE" });
  assert.equal(r.status, 200);
  assert.equal(r.corpo.pin, null);
});

test("PUT de um pin de outro mapa responde 409 e não move o pin", async () => {
  const id = randomUUID();
  await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo() });
  const r = await req(url(c.mapaOutro.id, id), tEditor, { method: "PUT", body: corpo({ atualizadoEm: new Date(Date.now() + 1000).toISOString() }) });
  assert.equal(r.status, 409);
  const { rows } = await pool.query(`SELECT mapa_id FROM pins WHERE id = $1`, [id]);
  assert.equal(rows[0].mapa_id, c.mapa.id);
});

test("validação: ícone fora do catálogo, cor, título vazio, coordenada, uuid", async () => {
  const id = randomUUID();
  for (const ruim of [{ icone: "nave" }, { cor: "verde" }, { titulo: "   " }, { lat: 91 }, { lng: "x" }, { atualizadoEm: "ontem" }, { nota: "a".repeat(2001) }]) {
    const r = await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo(ruim) });
    assert.equal(r.status, 400, JSON.stringify(ruim));
  }
  assert.equal((await req(url(c.mapa.id, "nao-e-uuid"), tEditor, { method: "PUT", body: corpo() })).status, 400);
});

test("?desde= devolve só alterados, inclui removidos, e o cursor fica no passado", async () => {
  const antes = await req(url(c.mapa.id), tLeitor);
  const cursor = antes.corpo.agora;
  assert.ok(new Date(cursor).getTime() < Date.now(), "cursor recua para cobrir commits concorrentes");
  const id = randomUUID();
  await req(url(c.mapa.id, id), tEditor, { method: "PUT", body: corpo() });
  await req(`${url(c.mapa.id, id)}?removidoEm=${encodeURIComponent(new Date().toISOString())}`, tEditor, { method: "DELETE" });
  const depois = await req(`${url(c.mapa.id)}?desde=${encodeURIComponent(cursor)}`, tLeitor);
  const achado = depois.corpo.pins.find((p) => p.id === id);
  assert.ok(achado && achado.removidoEm);
  assert.equal((await req(`${url(c.mapa.id)}?desde=abc`, tLeitor)).status, 400);
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run:
```bash
DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" node --test test/pins.test.js
```
Expected: FAIL — respostas `404` do Express para `/mapas/:id/pins` (rota inexistente).

- [ ] **Step 3: Catálogo de chaves do backend**

`backend/src/lib/iconesPreparo.js`:
```js
// Chaves válidas do catálogo de ícones do Mapa do Preparo. O desenho (SVG)
// vive só no frontend (frontend/src/lib/iconesPreparo.js); aqui basta
// validar a chave recebida. Manter as duas listas em sincronia.
export const CHAVES_ICONES_PREPARO = new Set([
  "pedra",
  "toco",
  "erosao",
  "alagamento",
  "formigueiro",
  "cupinzeiro",
  "curva_nivel",
  "carreador",
  "cerca",
  "rede_eletrica",
  "tubulacao",
  "compactacao",
  "mato",
  "maquina",
  "observacao",
]);
```

- [ ] **Step 4: Implementar as rotas**

`backend/src/routes/pins.js`:
```js
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
  return { dados: { icone, cor, titulo, nota, lng, lat, criadoEm, atualizadoEm } };
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
  const removidoEm = dataValida(req.query.removidoEm) || new Date();

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
```

- [ ] **Step 5: Montar o router**

Em `backend/src/app.js`, adicionar o import junto dos outros:
```js
import { pinsRouter } from "./routes/pins.js";
```
e, logo abaixo de `app.use(voosRouter);` (antes de `app.use(adminRouter);` — o `adminRouter` aplica `exigirAdmin` a qualquer requisição que chegue nele):
```js
app.use(pinsRouter);
```

Atenção: `mapasRouter` faz `mapasRouter.use(exigirAutenticacao)` sem prefixo e é montado antes — isso é compatível (só autentica). Nenhuma rota dele casa `/mapas/:id/pins`, então a requisição segue até `pinsRouter`.

- [ ] **Step 6: Rodar e ver passar**

Run:
```bash
DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" node --test test/
```
Expected: todos os testes de `permissoes.test.js` e `pins.test.js` `ok`.

- [ ] **Step 7: Commit**

```bash
git add backend/src/lib/iconesPreparo.js backend/src/routes/pins.js backend/src/app.js backend/test/pins.test.js
git commit -m "Adiciona rotas de pins com escrita idempotente e sync incremental

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 3: `podeEditar` no catálogo, permissões com "pode anotar" no admin e duplicar mapa

**Files:**
- Modify: `backend/src/routes/mapas.js` (query do `GET /mapas`)
- Modify: `backend/src/routes/admin.js` (`GET/POST/PUT /admin/mapas`, `POST /admin/mapas/:id/duplicar`)
- Test: `backend/test/mapas-permissoes.test.js`

**Interfaces:**
- Consumes: helpers (Task 1).
- Produces:
  - `GET /mapas` → cada mapa com `podeEditar: boolean` (true se admin ou algum grupo com `pode_editar`).
  - `GET /admin/mapas` → cada mapa com `grupoIds: number[]` (inalterado) **e** `permissoes: [{grupoId, podeEditar}]`.
  - `POST /admin/mapas` / `PUT /admin/mapas/:id` aceitam `permissoes: [{grupoId, podeEditar}]`; se ausente, usam `grupoIds` com `podeEditar: false`. Respondem com `grupoIds` e `permissoes`.
  - `POST /admin/mapas/:id/duplicar` copia `pode_editar`; não copia pins; resposta inclui `permissoes`.

- [ ] **Step 1: Escrever os testes (falham)**

`backend/test/mapas-permissoes.test.js`:
```js
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { criarCenario, limparCenario, iniciarServidor, tokenPara, req, pool } from "./helpers.js";

let c, srv;
before(async () => {
  c = await criarCenario();
  srv = await iniciarServidor();
});
after(async () => {
  await srv.fechar();
  await limparCenario(c);
  await pool.end();
});

test("GET /mapas informa podeEditar por usuário", async () => {
  const doEditor = await req(`${srv.url}/mapas`, tokenPara(c.editor));
  const doLeitor = await req(`${srv.url}/mapas`, tokenPara(c.leitor));
  assert.equal(doEditor.corpo.find((m) => m.id === c.mapa.id).podeEditar, true);
  assert.equal(doLeitor.corpo.find((m) => m.id === c.mapa.id).podeEditar, false);
  assert.equal(doEditor.corpo.filter((m) => m.id === c.mapa.id).length, 1, "sem duplicar mapa");
});

test("admin grava e lê permissoes com podeEditar; grupoIds antigo continua aceito", async () => {
  const t = tokenPara(c.admin);
  const put = await req(`${srv.url}/admin/mapas/${c.mapa.id}`, t, {
    method: "PUT",
    body: { nome: `__mapa_${c.sufixo}`, permissoes: [{ grupoId: c.grupoLeitor.id, podeEditar: true }, { grupoId: c.grupoEditor.id, podeEditar: false }] },
  });
  assert.equal(put.status, 200);
  const lista = await req(`${srv.url}/admin/mapas`, t);
  const m = lista.corpo.find((x) => x.id === c.mapa.id);
  assert.deepEqual(
    m.permissoes.sort((a, b) => a.grupoId - b.grupoId),
    [{ grupoId: c.grupoEditor.id, podeEditar: false }, { grupoId: c.grupoLeitor.id, podeEditar: true }].sort((a, b) => a.grupoId - b.grupoId)
  );
  const legado = await req(`${srv.url}/admin/mapas/${c.mapa.id}`, t, { method: "PUT", body: { nome: `__mapa_${c.sufixo}`, grupoIds: [c.grupoEditor.id] } });
  assert.deepEqual(legado.corpo.permissoes, [{ grupoId: c.grupoEditor.id, podeEditar: false }]);
  // restaura o cenário
  await req(`${srv.url}/admin/mapas/${c.mapa.id}`, t, {
    method: "PUT",
    body: { nome: `__mapa_${c.sufixo}`, permissoes: [{ grupoId: c.grupoEditor.id, podeEditar: true }, { grupoId: c.grupoLeitor.id, podeEditar: false }] },
  });
});

test("duplicar mapa copia pode_editar e não copia pins", async () => {
  const t = tokenPara(c.admin);
  const agora = new Date().toISOString();
  await req(`${srv.url}/mapas/${c.mapa.id}/pins/${randomUUID()}`, tokenPara(c.editor), {
    method: "PUT",
    body: { icone: "toco", cor: "#000000", titulo: "Toco", nota: "", lng: -47, lat: -21, criadoEm: agora, atualizadoEm: agora },
  });
  const dup = await req(`${srv.url}/admin/mapas/${c.mapa.id}/duplicar`, t, { method: "POST" });
  assert.equal(dup.status, 201);
  assert.ok(dup.corpo.permissoes.some((p) => p.grupoId === c.grupoEditor.id && p.podeEditar === true));
  const { rows } = await pool.query(`SELECT count(*)::int AS n FROM pins WHERE mapa_id = $1`, [dup.corpo.id]);
  assert.equal(rows[0].n, 0);
  await pool.query(`DELETE FROM mapas WHERE id = $1`, [dup.corpo.id]);
});
```
(O mapa do cenário não tem camadas, então `duplicar` não chama o R2.)

- [ ] **Step 2: Rodar e ver falhar**

Run:
```bash
DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" node --test test/mapas-permissoes.test.js
```
Expected: FAIL — `podeEditar` undefined / `permissoes` undefined.

- [ ] **Step 3: `GET /mapas` com `podeEditar`**

Em `backend/src/routes/mapas.js`, trocar a primeira query e o `res.json` final:
```js
  const { rows: mapas } = await pool.query(
    `SELECT m.id, m.nome, m.descricao, bool_or(p.pode_editar) AS pode_editar
     FROM mapas m
     JOIN permissoes p ON p.mapa_id = m.id
     JOIN usuarios_grupos ug ON ug.grupo_id = p.grupo_id
     WHERE ug.usuario_id = $1
     GROUP BY m.id
     ORDER BY m.nome`,
    [req.usuarioId]
  );
```
```js
  const ehAdmin = req.usuarioPapel === "admin";
  res.json(
    mapas.map(({ pode_editar, ...m }) => ({
      ...m,
      podeEditar: ehAdmin || pode_editar === true,
      camadas: camadasPorMapa.get(m.id) || [],
    }))
  );
```

- [ ] **Step 4: Helpers de permissão no admin**

Em `backend/src/routes/admin.js`, logo acima de `adminRouter.get("/admin/mapas", ...)`, adicionar:
```js
// Aceita o formato novo (permissoes: [{grupoId, podeEditar}]) e o antigo
// (grupoIds: number[] — equivale a podeEditar false), pra não quebrar um
// cliente desatualizado.
function lerPermissoesDoCorpo(body) {
  if (Array.isArray(body.permissoes)) {
    return body.permissoes
      .filter((p) => Number.isInteger(p?.grupoId))
      .map((p) => ({ grupoId: p.grupoId, podeEditar: p.podeEditar === true }));
  }
  const grupoIds = Array.isArray(body.grupoIds) ? body.grupoIds.filter(Number.isInteger) : [];
  return grupoIds.map((grupoId) => ({ grupoId, podeEditar: false }));
}

async function gravarPermissoes(mapaId, permissoes) {
  if (permissoes.length === 0) return;
  await pool.query(
    `INSERT INTO permissoes (mapa_id, grupo_id, pode_editar)
     SELECT $1, g, e FROM unnest($2::int[], $3::bool[]) AS t(g, e)
     ON CONFLICT (mapa_id, grupo_id) DO UPDATE SET pode_editar = EXCLUDED.pode_editar`,
    [mapaId, permissoes.map((p) => p.grupoId), permissoes.map((p) => p.podeEditar)]
  );
}
```

- [ ] **Step 5: Usar os helpers em GET/POST/PUT**

`GET /admin/mapas`: trocar `SELECT mapa_id, grupo_id FROM permissoes` por `SELECT mapa_id, grupo_id, pode_editar FROM permissoes`, montar também `permissoesPorMapa` e incluir no retorno:
```js
  const gruposPorMapa = new Map();
  const permissoesPorMapa = new Map();
  for (const p of permissoes) {
    if (!gruposPorMapa.has(p.mapa_id)) gruposPorMapa.set(p.mapa_id, []);
    gruposPorMapa.get(p.mapa_id).push(p.grupo_id);
    if (!permissoesPorMapa.has(p.mapa_id)) permissoesPorMapa.set(p.mapa_id, []);
    permissoesPorMapa.get(p.mapa_id).push({ grupoId: p.grupo_id, podeEditar: p.pode_editar });
  }
```
```js
    mapas.map((m) => ({
      ...m,
      grupoIds: gruposPorMapa.get(m.id) || [],
      permissoes: permissoesPorMapa.get(m.id) || [],
      camadaCount: camadasPorMapa.get(m.id) || 0,
    }))
```

`POST /admin/mapas`: substituir `const grupoIds = Array.isArray(...) ...;` por `const permissoes = lerPermissoesDoCorpo(req.body);`, trocar o bloco `if (grupoIds.length > 0) { ... INSERT ... }` por `await gravarPermissoes(mapa.id, permissoes);` e a resposta por:
```js
  res.status(201).json({ ...mapa, grupoIds: permissoes.map((p) => p.grupoId), permissoes });
```

`PUT /admin/mapas/:id`: mesma troca (`lerPermissoesDoCorpo`), manter o `DELETE FROM permissoes WHERE mapa_id = $1`, trocar o `INSERT` por `await gravarPermissoes(mapaId, permissoes);` e a resposta por:
```js
  res.json({ ...rows[0], grupoIds: permissoes.map((p) => p.grupoId), permissoes });
```

- [ ] **Step 6: Duplicar copia `pode_editar`**

Em `POST /admin/mapas/:id/duplicar`: trocar a query `SELECT grupo_id FROM permissoes WHERE mapa_id = $1` por `SELECT grupo_id, pode_editar FROM permissoes WHERE mapa_id = $1`; trocar o bloco que monta `grupoIds` e faz o `INSERT` por:
```js
  const permissoesCopia = permissoesOrigem.map((p) => ({ grupoId: p.grupo_id, podeEditar: p.pode_editar }));
  await gravarPermissoes(novoMapa.id, permissoesCopia);
  const grupoIds = permissoesCopia.map((p) => p.grupoId);
```
e a resposta final por:
```js
  res.status(201).json({ ...novoMapa, grupoIds, permissoes: permissoesCopia, camadaCount: camadasOrigem.length });
```
Pins não são tocados (continuam só no mapa de origem) — comentar isso acima do bloco de camadas:
```js
  // Pins (anotações) NÃO são copiados: um mapa duplicado começa sem anotações.
```

- [ ] **Step 7: Rodar todos os testes do backend**

Run:
```bash
DATABASE_URL="postgresql://geoportal@localhost:5432/geoportal_dev" PGSSL="" node --test test/
```
Expected: todos `ok`.

- [ ] **Step 8: Commit**

```bash
git add backend/src/routes/mapas.js backend/src/routes/admin.js backend/test/mapas-permissoes.test.js
git commit -m "Expoe podeEditar no catalogo e permissao de anotar por grupo no admin

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 4: Projeto de testes unitários do frontend e catálogo de 15 ícones (com aprovação visual)

**Files:**
- Modify: `frontend/vite.config.js` (bloco `test.projects`)
- Modify: `frontend/package.json` (script `test:unit`)
- Create: `frontend/src/lib/iconesPreparo.js`
- Create: `frontend/src/lib/iconesPreparo.test.js`
- Create (temporário, fora do repo): `<scratchpad>/prancha-icones.html`

**Interfaces:**
- Produces:
  - `ICONES_PREPARO: Array<{chave: string, nome: string, desenho: string}>` (ordem de exibição; `desenho` = elementos SVG internos num viewBox 24×24).
  - `ICONE_PADRAO = "observacao"`.
  - `nomeIcone(chave): string`.
  - `svgPin(chave: string, cor: string): string` — SVG completo 36×46 (gota colorida + pictograma branco).
  - `urlSvgPin(chave, cor): string` — data URL.
  - `idImagemPin(chave, cor): string` → `"pin-<chave>-<hex sem #, minúsculo>"`.
  - `garantirImagensPins(map, pares: Array<{icone, cor}>): Promise<void>` — registra no MapLibre as imagens que faltam.
  - `PALETA_PINS: string[]` — 8 cores.

- [ ] **Step 1: Criar o projeto Vitest `unit`**

Em `frontend/vite.config.js`, dentro de `test: { projects: [ ... ] }`, adicionar um segundo item ao array (depois do projeto `storybook`):
```js
    }, {
      test: {
        name: 'unit',
        environment: 'node',
        include: ['src/**/*.test.js']
      }
    }]
```
(Sem `extends: true`, para não carregar os plugins de PWA/CSP nem o browser do Storybook.)

Em `frontend/package.json`, `scripts`:
```json
"test:unit": "vitest run --project unit"
```

- [ ] **Step 2: Escrever o teste do catálogo (falha)**

`frontend/src/lib/iconesPreparo.test.js`:
```js
import { describe, it, expect } from "vitest";
import { ICONES_PREPARO, ICONE_PADRAO, idImagemPin, svgPin, nomeIcone, PALETA_PINS } from "./iconesPreparo.js";

const CHAVES = [
  "pedra", "toco", "erosao", "alagamento", "formigueiro", "cupinzeiro", "curva_nivel", "carreador",
  "cerca", "rede_eletrica", "tubulacao", "compactacao", "mato", "maquina", "observacao",
];

describe("catálogo de ícones do preparo", () => {
  it("tem exatamente as 15 chaves combinadas com o backend", () => {
    expect(ICONES_PREPARO.map((i) => i.chave)).toEqual(CHAVES);
    expect(CHAVES).toContain(ICONE_PADRAO);
  });
  it("todo ícone tem nome e desenho", () => {
    for (const i of ICONES_PREPARO) {
      expect(i.nome.length).toBeGreaterThan(0);
      expect(i.desenho).toMatch(/<(path|circle|ellipse|rect)/);
    }
  });
  it("id de imagem é estável e sem #", () => {
    expect(idImagemPin("pedra", "#16A34A")).toBe("pin-pedra-16a34a");
  });
  it("svg do pin usa a cor e o desenho do ícone", () => {
    const svg = svgPin("toco", "#123456");
    expect(svg).toContain('fill="#123456"');
    expect(svg).toContain(ICONES_PREPARO.find((i) => i.chave === "toco").desenho);
  });
  it("nome de chave desconhecida cai no padrão", () => {
    expect(nomeIcone("xyz")).toBe(nomeIcone(ICONE_PADRAO));
  });
  it("paleta tem 8 cores hex", () => {
    expect(PALETA_PINS).toHaveLength(8);
    for (const c of PALETA_PINS) expect(c).toMatch(/^#[0-9a-f]{6}$/);
  });
});
```

- [ ] **Step 3: Rodar e ver falhar**

Run (de `frontend/`, depois de `fnm use`):
```bash
npm run test:unit
```
Expected: FAIL — `Failed to resolve import "./iconesPreparo.js"`.

- [ ] **Step 4: Implementar o catálogo**

`frontend/src/lib/iconesPreparo.js`:
```js
// Catálogo fixo de ícones do Mapa do Preparo (anotações/pins) — ver
// docs/superpowers/specs/2026-09-24-mapa-preparo-anotacoes-design.md.
// As chaves precisam bater com backend/src/lib/iconesPreparo.js.
// `desenho` são elementos SVG num viewBox 24×24, traço branco sem
// preenchimento (o estilo de traço vem do <g> em svgPin).
export const ICONES_PREPARO = [
  { chave: "pedra", nome: "Pedra", desenho: '<path d="M4 17.5 6.5 11l4-3.5 5 1.5 3.5 4-1 4.5z"/><path d="M10.5 7.5l1 5 7 1"/>' },
  { chave: "toco", nome: "Toco / raiz", desenho: '<ellipse cx="12" cy="7" rx="4.5" ry="1.8"/><path d="M7.5 7v8M16.5 7v8"/><path d="M7.5 15 4.5 20M16.5 15l3 5M12 16v4M10 15.5l-2 4.5M14 15.5l2 4.5"/>' },
  { chave: "erosao", nome: "Erosão / voçoroca", desenho: '<path d="M3 8h5l4 11 4-11h5"/><path d="M12 3v6M9.5 6.5 12 9l2.5-2.5"/>' },
  { chave: "alagamento", nome: "Área alagada", desenho: '<path d="M3 8c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0"/><path d="M3 13c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0"/><path d="M3 18c1.5-1.5 3-1.5 4.5 0s3 1.5 4.5 0 3-1.5 4.5 0 3 1.5 4.5 0"/>' },
  { chave: "formigueiro", nome: "Formigueiro", desenho: '<circle cx="12" cy="6.5" r="2"/><ellipse cx="12" cy="11.5" rx="1.8" ry="2.2"/><ellipse cx="12" cy="17.5" rx="2.6" ry="3"/><path d="M10.2 10.5 6 8.5M13.8 10.5 18 8.5M10.2 12.5 6 13.5M13.8 12.5l4.2 1M10.5 15 7 18M13.5 15l3.5 3M11 4.8 9.5 2.5M13 4.8l1.5-2.3"/>' },
  { chave: "cupinzeiro", nome: "Cupinzeiro", desenho: '<path d="M5.5 20c1-6 3-13.5 6.5-16 3.5 2.5 5.5 10 6.5 16z"/><path d="M3 20h18"/><path d="M11 10h2M10 14h4"/>' },
  { chave: "curva_nivel", nome: "Curva de nível danificada", desenho: '<path d="M3 8c2.5-1.8 5-1.8 7.5 0"/><path d="M14.5 8c2.2-1.5 4.4-1.5 6.5 0"/><path d="M11 5.5l1.5 3.5L14 6"/><path d="M3 13.5c6-3 12-3 18 0"/><path d="M3 18.5c6-3 12-3 18 0"/>' },
  { chave: "carreador", nome: "Carreador / estrada", desenho: '<path d="M8.5 3 5 21M15.5 3 19 21"/><path d="M12 4v3M12 10.5v3M12 17v3"/>' },
  { chave: "cerca", nome: "Cerca", desenho: '<path d="M5 5v16M12 5v16M19 5v16"/><path d="M5 5l0-1.5M12 5V3.5M19 5V3.5"/><path d="M3 9.5h18M3 15h18"/>' },
  { chave: "rede_eletrica", nome: "Rede elétrica / poste", desenho: '<path d="M10 3v18M6 21h8"/><path d="M5 6.5h10M6.5 10h7"/><path d="M19 11l-2.5 4h3L17 19.5"/>' },
  { chave: "tubulacao", nome: "Tubulação / irrigação", desenho: '<path d="M3 7h11v4H3z"/><path d="M14 9h3.5a2 2 0 0 1 2 2v1.5"/><path d="M19.5 15.5c-1 1.4-1.6 2.3-1.6 3a1.6 1.6 0 0 0 3.2 0c0-.7-.6-1.6-1.6-3z"/>' },
  { chave: "compactacao", nome: "Compactação do solo", desenho: '<path d="M12 2.5v7M9 6.5l3 3 3-3"/><path d="M3 13h18M3 17h18M3 21h18"/>' },
  { chave: "mato", nome: "Mato / planta daninha", desenho: '<path d="M12 21V11"/><path d="M12 14.5C8 14.5 6 11.5 6 8.5c3 0 6 2 6 6z"/><path d="M12 12c0-4 3-7 6-7 0 4-2 7-6 7z"/><path d="M4 21h16"/>' },
  { chave: "maquina", nome: "Máquina / implemento", desenho: '<circle cx="7" cy="16" r="4"/><circle cx="18" cy="17.5" r="2.5"/><path d="M4 12V6h6l2 6h7v3.5"/><path d="M11 17.5h4.5"/>' },
  { chave: "observacao", nome: "Observação geral", desenho: '<path d="M4 5h16v11H10l-4.5 4v-4H4z"/><path d="M8 9h8M8 12.5h5"/>' },
];

export const ICONE_PADRAO = "observacao";

// 8 cores fortes, legíveis sobre o fundo claro e sobre satélite.
export const PALETA_PINS = ["#16a34a", "#dc2626", "#ea580c", "#ca8a04", "#2563eb", "#7c3aed", "#db2777", "#475569"];

export function nomeIcone(chave) {
  const icone = ICONES_PREPARO.find((i) => i.chave === chave) || ICONES_PREPARO.find((i) => i.chave === ICONE_PADRAO);
  return icone.nome;
}

function desenhoIcone(chave) {
  return (ICONES_PREPARO.find((i) => i.chave === chave) || ICONES_PREPARO.find((i) => i.chave === ICONE_PADRAO)).desenho;
}

// Pin em gota (36×46, ponta embaixo no centro) preenchido com a cor
// escolhida + contorno escuro fino (contraste sobre satélite) +
// pictograma branco dentro da parte redonda.
export function svgPin(chave, cor) {
  return (
    '<svg xmlns="http://www.w3.org/2000/svg" width="36" height="46" viewBox="0 0 36 46">' +
    `<path d="M18 44.5C18 44.5 3 28.5 3 17a15 15 0 0 1 30 0C33 28.5 18 44.5 18 44.5z" fill="${cor}" stroke="#1f2933" stroke-width="1.5"/>` +
    '<g transform="translate(7 6) scale(0.9167)" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">' +
    desenhoIcone(chave) +
    "</g></svg>"
  );
}

export function urlSvgPin(chave, cor) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgPin(chave, cor))}`;
}

export function idImagemPin(chave, cor) {
  return `pin-${chave}-${cor.replace("#", "").toLowerCase()}`;
}

function carregarImagem(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = url;
  });
}

// Rasteriza cada combinação ícone+cor ainda não registrada e adiciona ao
// MapLibre. Não é SDF (o ícone tem duas cores). Desenha em 2× para ficar
// nítido em telas de alta densidade.
export async function garantirImagensPins(map, pares) {
  const RAZAO = 2;
  const vistos = new Set();
  for (const { icone, cor } of pares) {
    const id = idImagemPin(icone, cor);
    if (vistos.has(id) || map.hasImage(id)) continue;
    vistos.add(id);
    const img = await carregarImagem(urlSvgPin(icone, cor));
    const canvas = document.createElement("canvas");
    canvas.width = 36 * RAZAO;
    canvas.height = 46 * RAZAO;
    const ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Re-checa: outra chamada concorrente pode ter registrado no meio.
    if (!map.hasImage(id)) {
      map.addImage(id, ctx.getImageData(0, 0, canvas.width, canvas.height), { pixelRatio: RAZAO });
    }
  }
}
```

- [ ] **Step 5: Rodar e ver passar**

Run: `npm run test:unit`
Expected: 6 testes PASS.

- [ ] **Step 6: Gerar a prancha de aprovação**

Criar um script temporário `frontend/_prancha.mjs` (apagar depois):
```js
import { writeFileSync } from "node:fs";
import { ICONES_PREPARO, svgPin, PALETA_PINS } from "./src/lib/iconesPreparo.js";
const celulas = ICONES_PREPARO.map(
  (i, n) => `<figure>${svgPin(i.chave, PALETA_PINS[n % 8])}${svgPin(i.chave, PALETA_PINS[n % 8]).replace('width="36" height="46"', 'width="18" height="23"')}<figcaption>${i.nome}</figcaption></figure>`
).join("");
writeFileSync(process.argv[2], `<!doctype html><meta charset="utf-8"><title>Ícones do Preparo</title><style>body{font-family:system-ui;display:grid;grid-template-columns:repeat(5,1fr);gap:24px;padding:24px;background:#eef2f0}figure{margin:0;text-align:center}svg{margin:0 6px}figcaption{font-size:13px;margin-top:6px}</style>${celulas}`);
```
Run (de `frontend/`): `node _prancha.mjs "<scratchpad>/prancha-icones.html"` e depois `rm _prancha.mjs`.
Tirar um screenshot com Playwright (script temporário dentro de `frontend/`, apagado depois) e enviar ao Leo (Artifact ou SendUserFile).

- [ ] **Step 7: CHECKPOINT — aprovação dos ícones pelo Leo**

Mostrar a prancha e perguntar se algum ícone precisa mudar. Ajustar `desenho` dos ícones reprovados, repetir Steps 5–6 até aprovar. Não seguir para o Task 8 sem essa aprovação (Tasks 5–7 podem avançar em paralelo).

- [ ] **Step 8: Commit**

```bash
git add frontend/vite.config.js frontend/package.json frontend/src/lib/iconesPreparo.js frontend/src/lib/iconesPreparo.test.js
git commit -m "Adiciona catalogo de 15 icones do preparo e testes unitarios do frontend

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 5: Armazenamento local de pins e motor de sincronização (outbox)

**Files:**
- Modify: `frontend/src/lib/db.js` (bloco `versaoAnterior < 4`, funções de pin, `salvarMapasDisponiveis`)
- Create: `frontend/src/lib/syncPins.js`
- Test: `frontend/src/lib/syncPins.test.js`

**Interfaces:**
- Produces (db.js):
  - `salvarPinLocal(pin: PinLocal): Promise<void>`
  - `buscarPinLocal(id): Promise<PinLocal | undefined>`
  - `listarPinsDoMapa(mapaId): Promise<PinLocal[]>` (inclui `pendente: "remover"`; a UI filtra)
  - `listarPinsPendentes(): Promise<PinLocal[]>`
  - `listarTodosPins(): Promise<PinLocal[]>`
  - `removerPinLocal(id): Promise<void>`
  - `obterCursorPins(mapaId): Promise<string | null>` / `salvarCursorPins(mapaId, desde: string): Promise<void>`
  - `salvarMapasDisponiveis(mapas)` passa a gravar `podeEditar`.
  - `PinLocal = PinApi & { pendente: null | "salvar" | "remover" }`
- Produces (syncPins.js):
  - `criarSyncPins({ api, store, aoDescartar? }) → { enviarPendentes(token): Promise<{enviados: number, restantes: boolean}>, receberPins(token, mapaId): Promise<number>, limparMapasSemPermissao(idsPermitidos: number[]): Promise<void> }`
  - `api = { listarPins(token, mapaId, desde) → {pins, agora}, salvarPin(token, mapaId, id, corpo) → {pin}, removerPin(token, mapaId, id, removidoEm) → {pin} }` — erros HTTP têm `.status`; erro de rede não tem.
  - `store = { salvar, buscar, remover, listarPendentes, listarTodos, obterCursor, salvarCursor }` (mesmas assinaturas das funções de db.js acima).
  - `corpoParaApi(pin) → {icone, cor, titulo, nota, lng, lat, criadoEm, atualizadoEm}`.

- [ ] **Step 1: Escrever os testes do motor (falham)**

`frontend/src/lib/syncPins.test.js`:
```js
import { describe, it, expect, vi } from "vitest";
import { criarSyncPins } from "./syncPins.js";

function criarStore(iniciais = []) {
  const pins = new Map(iniciais.map((p) => [p.id, { ...p }]));
  const cursores = new Map();
  return {
    pins,
    salvar: async (p) => void pins.set(p.id, { ...p }),
    buscar: async (id) => (pins.has(id) ? { ...pins.get(id) } : undefined),
    remover: async (id) => void pins.delete(id),
    listarPendentes: async () => [...pins.values()].filter((p) => p.pendente).map((p) => ({ ...p })),
    listarTodos: async () => [...pins.values()].map((p) => ({ ...p })),
    obterCursor: async (m) => cursores.get(m) ?? null,
    salvarCursor: async (m, d) => void cursores.set(m, d),
    cursores,
  };
}
const pin = (extra = {}) => ({
  id: "a", mapaId: 1, icone: "pedra", cor: "#16a34a", titulo: "Pedra", nota: "", lng: -47, lat: -21,
  criadoEm: "2026-09-24T10:00:00.000Z", atualizadoEm: "2026-09-24T10:00:00.000Z", removidoEm: null, pendente: "salvar", ...extra,
});
const erroHttp = (status) => Object.assign(new Error(`HTTP ${status}`), { status });

describe("enviarPendentes", () => {
  it("envia pendente e grava a versão do servidor sem pendente", async () => {
    const store = criarStore([pin()]);
    const api = { salvarPin: vi.fn(async (_t, _m, id) => ({ pin: { ...pin({ id }), pendente: undefined, criadoPorNome: "Ana" } })) };
    const r = await criarSyncPins({ api, store }).enviarPendentes("tk");
    expect(r).toEqual({ enviados: 1, restantes: false });
    expect(store.pins.get("a").pendente).toBeNull();
    expect(store.pins.get("a").criadoPorNome).toBe("Ana");
    expect(api.salvarPin).toHaveBeenCalledWith("tk", 1, "a", expect.objectContaining({ titulo: "Pedra", atualizadoEm: "2026-09-24T10:00:00.000Z" }));
  });

  it("erro de rede mantém pendente e para a fila", async () => {
    const store = criarStore([pin({ id: "a" }), pin({ id: "b", atualizadoEm: "2026-09-24T11:00:00.000Z" })]);
    const api = { salvarPin: vi.fn(async () => { throw new TypeError("Failed to fetch"); }) };
    const r = await criarSyncPins({ api, store }).enviarPendentes("tk");
    expect(r.restantes).toBe(true);
    expect(api.salvarPin).toHaveBeenCalledTimes(1);
    expect(store.pins.get("a").pendente).toBe("salvar");
  });

  it("403 descarta o local e avisa", async () => {
    const store = criarStore([pin()]);
    const aoDescartar = vi.fn();
    const api = { salvarPin: async () => { throw erroHttp(403); } };
    await criarSyncPins({ api, store, aoDescartar }).enviarPendentes("tk");
    expect(store.pins.has("a")).toBe(false);
    expect(aoDescartar).toHaveBeenCalledWith(expect.objectContaining({ id: "a" }), expect.objectContaining({ status: 403 }));
  });

  it("não apaga edição local feita durante o envio", async () => {
    const store = criarStore([pin()]);
    const api = {
      salvarPin: async () => {
        await store.salvar(pin({ titulo: "Editado", atualizadoEm: "2026-09-24T12:00:00.000Z" }));
        return { pin: pin({ pendente: undefined }) };
      },
    };
    const sync = criarSyncPins({ api, store });
    await sync.enviarPendentes("tk");
    expect(store.pins.get("a").titulo).toBe("Editado");
    expect(store.pins.get("a").pendente).toBe("salvar");
  });

  it("remoção pendente de pin que nunca chegou ao servidor apaga o local", async () => {
    const store = criarStore([pin({ pendente: "remover", removidoEm: "2026-09-24T10:05:00.000Z", atualizadoEm: "2026-09-24T10:05:00.000Z" })]);
    const api = { removerPin: vi.fn(async () => ({ pin: null })) };
    await criarSyncPins({ api, store }).enviarPendentes("tk");
    expect(api.removerPin).toHaveBeenCalledWith("tk", 1, "a", "2026-09-24T10:05:00.000Z");
    expect(store.pins.has("a")).toBe(false);
  });

  it("chamadas concorrentes não enviam o mesmo pin duas vezes ao mesmo tempo", async () => {
    const store = criarStore([pin()]);
    let emVoo = 0;
    let maxEmVoo = 0;
    const api = {
      salvarPin: async () => {
        emVoo++;
        maxEmVoo = Math.max(maxEmVoo, emVoo);
        await new Promise((r) => setTimeout(r, 10));
        emVoo--;
        return { pin: pin({ pendente: undefined }) };
      },
    };
    const sync = criarSyncPins({ api, store });
    await Promise.all([sync.enviarPendentes("tk"), sync.enviarPendentes("tk")]);
    expect(maxEmVoo).toBe(1);
  });
});

describe("receberPins", () => {
  it("aplica novos, apaga removidos, não sobrescreve pendente e salva o cursor", async () => {
    const store = criarStore([
      pin({ id: "pendente", titulo: "Local" }),
      pin({ id: "velho", pendente: null }),
    ]);
    const api = {
      listarPins: vi.fn(async () => ({
        pins: [
          pin({ id: "pendente", titulo: "Servidor", pendente: undefined }),
          pin({ id: "velho", removidoEm: "2026-09-24T13:00:00.000Z", pendente: undefined }),
          pin({ id: "novo", pendente: undefined }),
        ],
        agora: "2026-09-24T13:30:00.000Z",
      })),
    };
    const n = await criarSyncPins({ api, store }).receberPins("tk", 1);
    expect(n).toBe(3);
    expect(api.listarPins).toHaveBeenCalledWith("tk", 1, null);
    expect(store.pins.get("pendente").titulo).toBe("Local");
    expect(store.pins.has("velho")).toBe(false);
    expect(store.pins.get("novo").pendente).toBeNull();
    expect(store.cursores.get(1)).toBe("2026-09-24T13:30:00.000Z");
  });
});

describe("limparMapasSemPermissao", () => {
  it("apaga pins de mapas que saíram do catálogo", async () => {
    const store = criarStore([pin({ id: "fica", mapaId: 1 }), pin({ id: "sai", mapaId: 2 })]);
    await criarSyncPins({ api: {}, store }).limparMapasSemPermissao([1]);
    expect([...store.pins.keys()]).toEqual(["fica"]);
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:unit`
Expected: FAIL — `Failed to resolve import "./syncPins.js"`.

- [ ] **Step 3: Implementar `syncPins.js`**

`frontend/src/lib/syncPins.js`:
```js
// Motor de sincronização das anotações (pins) — ver
// docs/superpowers/specs/2026-09-24-mapa-preparo-anotacoes-design.md.
// Toda escrita já foi aplicada no IndexedDB com `pendente` marcado (outbox);
// aqui só enviamos em ordem e recebemos o incremental. Dependências
// injetadas (api/store) para testar sem rede nem IndexedDB.

export function corpoParaApi(pin) {
  return {
    icone: pin.icone,
    cor: pin.cor,
    titulo: pin.titulo,
    nota: pin.nota,
    lng: pin.lng,
    lat: pin.lat,
    criadoEm: pin.criadoEm,
    atualizadoEm: pin.atualizadoEm,
  };
}

// 400/403/404/409 são definitivos: reenviar não vai mudar a resposta.
const STATUS_DESCARTE = new Set([400, 403, 404, 409]);

export function criarSyncPins({ api, store, aoDescartar }) {
  let execucao = null;
  let pedirDeNovo = false;

  async function enviarUmaRodada(token) {
    const pendentes = (await store.listarPendentes()).sort((a, b) => a.atualizadoEm.localeCompare(b.atualizadoEm));
    let enviados = 0;
    for (const pin of pendentes) {
      let resposta;
      try {
        resposta =
          pin.pendente === "remover"
            ? await api.removerPin(token, pin.mapaId, pin.id, pin.removidoEm)
            : await api.salvarPin(token, pin.mapaId, pin.id, corpoParaApi(pin));
      } catch (erro) {
        if (STATUS_DESCARTE.has(erro?.status)) {
          await store.remover(pin.id);
          aoDescartar?.(pin, erro);
          continue;
        }
        // Rede/5xx/401: mantém tudo e tenta na próxima oportunidade, sem
        // pular a ordem da fila.
        return { enviados, restantes: true };
      }
      // O usuário pode ter editado o mesmo pin enquanto a requisição
      // estava em voo — nesse caso o registro local é mais novo e continua
      // pendente para a próxima rodada.
      const atual = await store.buscar(pin.id);
      if (atual && (atual.atualizadoEm !== pin.atualizadoEm || atual.pendente !== pin.pendente)) continue;
      const doServidor = resposta?.pin;
      if (!doServidor || doServidor.removidoEm) {
        await store.remover(pin.id);
      } else {
        await store.salvar({ ...doServidor, pendente: null });
      }
      enviados++;
    }
    return { enviados, restantes: false };
  }

  // Uma execução por vez; pedidos durante a execução disparam mais uma
  // rodada no fim (para não perder pendências criadas no meio).
  function enviarPendentes(token) {
    if (execucao) {
      pedirDeNovo = true;
      return execucao;
    }
    execucao = (async () => {
      let total = 0;
      let resultado;
      do {
        pedirDeNovo = false;
        resultado = await enviarUmaRodada(token);
        total += resultado.enviados;
      } while (pedirDeNovo && !resultado.restantes);
      return { enviados: total, restantes: resultado.restantes };
    })().finally(() => {
      execucao = null;
    });
    return execucao;
  }

  async function receberPins(token, mapaId) {
    const desde = await store.obterCursor(mapaId);
    const { pins, agora } = await api.listarPins(token, mapaId, desde);
    for (const remoto of pins) {
      const local = await store.buscar(remoto.id);
      if (local?.pendente) continue;
      if (remoto.removidoEm) {
        await store.remover(remoto.id);
      } else {
        await store.salvar({ ...remoto, pendente: null });
      }
    }
    await store.salvarCursor(mapaId, agora);
    return pins.length;
  }

  async function limparMapasSemPermissao(idsPermitidos) {
    const permitidos = new Set(idsPermitidos);
    for (const p of await store.listarTodos()) {
      if (!permitidos.has(p.mapaId)) await store.remover(p.id);
    }
  }

  return { enviarPendentes, receberPins, limparMapasSemPermissao };
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test:unit`
Expected: todos PASS (catálogo + syncPins).

- [ ] **Step 5: Atualizar `db.js`**

Em `frontend/src/lib/db.js`:
- Constantes: manter `const STORE_PINS = "pins";` e adicionar `const STORE_PINS_CURSOR = "pins_cursor";`.
- Substituir o bloco `if (versaoAnterior < 4) { ... }` por:
```js
      if (versaoAnterior < 4) {
        // Anotações (pins) compartilhadas do mapa — ver lib/syncPins.js.
        // Vários registros por mapa (índice porMapa); `pendente` marca o
        // que ainda não foi enviado ao servidor (outbox offline).
        const store = db.createObjectStore(STORE_PINS, { keyPath: "id" });
        store.createIndex("porMapa", "mapaId");
        // Até onde já recebemos pins de cada mapa (cursor `desde` do GET
        // incremental) — separado do registro do mapa para não misturar
        // com o sync de camadas.
        db.createObjectStore(STORE_PINS_CURSOR, { keyPath: "mapaId" });
      }
```
- Em `salvarMapasDisponiveis`, gravar também `podeEditar`:
```js
    await tx.store.put({ id: mapa.id, nome: mapa.nome, descricao: mapa.descricao, podeEditar: mapa.podeEditar === true });
```
- Substituir as funções `salvarPin`/`listarPinsDoMapa`/`removerPin` do fim do arquivo por:
```js
export async function salvarPinLocal(pin) {
  const db = await abrirDb();
  await db.put(STORE_PINS, pin);
}

export async function buscarPinLocal(id) {
  const db = await abrirDb();
  return db.get(STORE_PINS, id);
}

export async function listarPinsDoMapa(mapaId) {
  const db = await abrirDb();
  return db.getAllFromIndex(STORE_PINS, "porMapa", mapaId);
}

export async function listarTodosPins() {
  const db = await abrirDb();
  return db.getAll(STORE_PINS);
}

export async function listarPinsPendentes() {
  return (await listarTodosPins()).filter((p) => p.pendente);
}

export async function removerPinLocal(id) {
  const db = await abrirDb();
  await db.delete(STORE_PINS, id);
}

export async function obterCursorPins(mapaId) {
  const db = await abrirDb();
  return (await db.get(STORE_PINS_CURSOR, mapaId))?.desde ?? null;
}

export async function salvarCursorPins(mapaId, desde) {
  const db = await abrirDb();
  await db.put(STORE_PINS_CURSOR, { mapaId, desde });
}
```
(A versão 4 nunca foi publicada — só existia na cópia local do Leo. Se o navegador de desenvolvimento dele já estiver na versão 4 sem `pins_cursor`, apagar o banco `geoportal` no DevTools → Application → IndexedDB antes de testar; nenhum usuário real tem a versão 4.)

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/syncPins.js frontend/src/lib/syncPins.test.js frontend/src/lib/db.js
git commit -m "Adiciona armazenamento local de pins com fila de envio offline

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 6: API de pins no frontend e integração com o sync existente

**Files:**
- Modify: `frontend/src/lib/api.js` (`tratarResposta`, funções novas, admin de mapas)
- Modify: `frontend/src/lib/sync.js`
- Create: `frontend/src/lib/syncPinsApp.js` (instância real do motor)

**Interfaces:**
- Consumes: `criarSyncPins` (Task 5), funções de db.js (Task 5), contrato HTTP (Task 2/3).
- Produces:
  - `listarPinsRemoto(token, mapaId, desde|null) → {pins, agora}`
  - `salvarPinRemoto(token, mapaId, id, corpo) → {pin}`
  - `removerPinRemoto(token, mapaId, id, removidoEm) → {pin}`
  - `criarMapaAdmin(token, {nome, descricao, permissoes})`, `atualizarMapaAdmin(token, mapaId, {nome, descricao, permissoes})`
  - `syncPins` (instância) e `EVENTO_PINS_ATUALIZADOS = "geomap:pins-atualizados"` (detail `{mapaIds: number[]}`), `EVENTO_PIN_DESCARTADO = "geomap:pin-descartado"` (detail `{pin, mensagem}`), `enviarPinsPendentes(token): Promise<void>` (envia e dispara o evento de atualizados).
  - `sincronizarMapas(token)` passa a enviar/receber pins de todos os mapas do catálogo.

- [ ] **Step 1: Status HTTP nos erros**

Em `frontend/src/lib/api.js`, substituir `tratarResposta` por:
```js
async function tratarResposta(resp) {
  if (!resp.ok) {
    const corpo = await resp.json().catch(() => ({}));
    const erro = new Error(corpo.erro || `Erro HTTP ${resp.status}`);
    // A fila offline de pins (lib/syncPins.js) decide entre "tentar de novo"
    // e "descartar" pelo status — erro de rede não tem status.
    erro.status = resp.status;
    throw erro;
  }
  return resp;
}
```

- [ ] **Step 2: Funções de pins e admin**

No fim de `api.js`:
```js
// --- Anotações (pins) do mapa — ver lib/syncPins.js ---

export async function listarPinsRemoto(token, mapaId, desde) {
  const qs = desde ? `?desde=${encodeURIComponent(desde)}` : "";
  const resp = await fetch(`${API_URL}/mapas/${mapaId}/pins${qs}`, {
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function salvarPinRemoto(token, mapaId, id, corpo) {
  const resp = await fetch(`${API_URL}/mapas/${mapaId}/pins/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify(corpo),
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function removerPinRemoto(token, mapaId, id, removidoEm) {
  const resp = await fetch(`${API_URL}/mapas/${mapaId}/pins/${id}?removidoEm=${encodeURIComponent(removidoEm)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  await tratarResposta(resp);
  return resp.json();
}
```
E trocar `criarMapaAdmin`/`atualizarMapaAdmin` para mandar `permissoes`:
```js
export async function criarMapaAdmin(token, { nome, descricao, permissoes }) {
  const resp = await fetch(`${API_URL}/admin/mapas`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nome, descricao, permissoes }),
  });
  await tratarResposta(resp);
  return resp.json();
}

export async function atualizarMapaAdmin(token, mapaId, { nome, descricao, permissoes }) {
  const resp = await fetch(`${API_URL}/admin/mapas/${mapaId}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
    body: JSON.stringify({ nome, descricao, permissoes }),
  });
  await tratarResposta(resp);
  return resp.json();
}
```

- [ ] **Step 3: Instância real do motor**

`frontend/src/lib/syncPinsApp.js`:
```js
import { criarSyncPins } from "./syncPins.js";
import { listarPinsRemoto, salvarPinRemoto, removerPinRemoto } from "./api.js";
import {
  salvarPinLocal,
  buscarPinLocal,
  removerPinLocal,
  listarPinsPendentes,
  listarTodosPins,
  obterCursorPins,
  salvarCursorPins,
} from "./db.js";

// Eventos de janela desacoplam o motor (chamado de sync.js, de usePins e do
// evento `online`) de quem desenha/avisa (usePins, usePinsPendentes).
export const EVENTO_PINS_ATUALIZADOS = "geomap:pins-atualizados";
export const EVENTO_PIN_DESCARTADO = "geomap:pin-descartado";

export function avisarPinsAtualizados(mapaIds) {
  window.dispatchEvent(new CustomEvent(EVENTO_PINS_ATUALIZADOS, { detail: { mapaIds } }));
}

export const syncPins = criarSyncPins({
  api: { listarPins: listarPinsRemoto, salvarPin: salvarPinRemoto, removerPin: removerPinRemoto },
  store: {
    salvar: salvarPinLocal,
    buscar: buscarPinLocal,
    remover: removerPinLocal,
    listarPendentes: listarPinsPendentes,
    listarTodos: listarTodosPins,
    obterCursor: obterCursorPins,
    salvarCursor: salvarCursorPins,
  },
  aoDescartar: (pin, erro) => {
    const mensagem =
      erro.status === 403
        ? `Você não tem mais permissão para anotar neste mapa. A anotação "${pin.titulo}" não foi enviada.`
        : `A anotação "${pin.titulo}" foi recusada pelo servidor: ${erro.message}`;
    window.dispatchEvent(new CustomEvent(EVENTO_PIN_DESCARTADO, { detail: { pin, mensagem } }));
  },
});

export async function enviarPinsPendentes(token) {
  const pendentesAntes = await listarPinsPendentes();
  await syncPins.enviarPendentes(token);
  avisarPinsAtualizados([...new Set(pendentesAntes.map((p) => p.mapaId))]);
}
```

- [ ] **Step 4: Plugar no `sincronizarMapas`**

Em `frontend/src/lib/sync.js`, importar:
```js
import { syncPins, enviarPinsPendentes, avisarPinsAtualizados } from "./syncPinsApp.js";
```
e, logo antes de `const atualizadas = await listarMapasBaixados();`, inserir:
```js
  // Anotações (pins): envia a fila offline ANTES de receber (o recebimento
  // nunca sobrescreve pendentes, mas enviar primeiro deixa o estado local
  // já alinhado). Falha aqui nunca derruba o sync de camadas.
  try {
    await enviarPinsPendentes(token);
    const idsMapas = catalogo.map((m) => m.id);
    await syncPins.limparMapasSemPermissao(idsMapas);
    await Promise.allSettled(idsMapas.map((id) => syncPins.receberPins(token, id)));
    avisarPinsAtualizados(idsMapas);
  } catch (erro) {
    console.warn("Falha ao sincronizar anotações:", erro);
  }
```

- [ ] **Step 5: Build e testes unitários**

Run (de `frontend/`): `npm run test:unit && npm run build`
Expected: testes PASS; build sem erro.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/api.js frontend/src/lib/sync.js frontend/src/lib/syncPinsApp.js
git commit -m "Integra envio e recebimento de pins ao sync do app

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 7: Coordenada no clique — cartão "Ponto selecionado" e rodapé nos atributos (todos os mapas)

**Files:**
- Create: `frontend/src/lib/coordenadas.js`
- Create: `frontend/src/lib/coordenadas.test.js`
- Create: `frontend/src/components/LinhaCoordenada.jsx`
- Create: `frontend/src/components/CartaoPonto.jsx`
- Modify: `frontend/src/pages/Mapa.jsx` (state `pontoSelecionado`, `handleClick`, efeito 8 do marcador, JSX dos painéis)
- Modify: `frontend/src/index.css`

**Interfaces:**
- Produces:
  - `formatarCoordenada({lat, lng}) → "-21.123456, -47.654321"`
  - `copiarTexto(texto): Promise<boolean>`
  - `<LinhaCoordenada lngLat={{lng, lat}} />`
  - `<CartaoPonto lngLat={...|null} podeAnotar={bool} aoAdicionarPin={() => void} aoFechar={() => void} />`
  - Em `Mapa.jsx`: `const [pontoSelecionado, setPontoSelecionado] = useState(null)` (`{lngLat}` | null), usado pelo Task 9.

- [ ] **Step 1: Teste de formatação (falha)**

`frontend/src/lib/coordenadas.test.js`:
```js
import { describe, it, expect } from "vitest";
import { formatarCoordenada } from "./coordenadas.js";

describe("formatarCoordenada", () => {
  it("usa lat, lng em graus decimais com 6 casas", () => {
    expect(formatarCoordenada({ lat: -21.1234564, lng: -47.6543216 })).toBe("-21.123456, -47.654322");
  });
  it("preenche zeros", () => {
    expect(formatarCoordenada({ lat: -21, lng: -47.5 })).toBe("-21.000000, -47.500000");
  });
});
```

- [ ] **Step 2: Rodar e ver falhar**

Run: `npm run test:unit` — Expected: FAIL (módulo inexistente).

- [ ] **Step 3: Implementar `coordenadas.js`**

```js
// Coordenada sempre em graus decimais (pedido do Leo): é o formato que
// Google Maps/WhatsApp entendem ao colar.
export function formatarCoordenada({ lat, lng }) {
  return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
}

// navigator.clipboard só existe em contexto seguro (HTTPS/localhost);
// fallback com textarea + execCommand para navegadores antigos.
export async function copiarTexto(texto) {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(texto);
      return true;
    }
  } catch {
    // cai no fallback
  }
  const area = document.createElement("textarea");
  area.value = texto;
  area.setAttribute("readonly", "");
  area.style.position = "fixed";
  area.style.opacity = "0";
  document.body.appendChild(area);
  area.select();
  const ok = document.execCommand("copy");
  document.body.removeChild(area);
  return ok;
}
```

- [ ] **Step 4: Rodar e ver passar**

Run: `npm run test:unit` — Expected: PASS.

- [ ] **Step 5: Componentes**

`frontend/src/components/LinhaCoordenada.jsx`:
```jsx
import { useEffect, useState } from "react";
import { formatarCoordenada, copiarTexto } from "../lib/coordenadas.js";

export default function LinhaCoordenada({ lngLat }) {
  const [copiado, setCopiado] = useState(false);
  const texto = formatarCoordenada(lngLat);

  useEffect(() => {
    if (!copiado) return;
    const t = setTimeout(() => setCopiado(false), 2000);
    return () => clearTimeout(t);
  }, [copiado]);

  return (
    <div className="linha-coordenada">
      <span className="texto-coordenada">{texto}</span>
      <button
        type="button"
        className="botao-copiar-coordenada"
        onClick={async () => setCopiado(await copiarTexto(texto))}
        aria-label="Copiar coordenada"
        title="Copiar coordenada"
      >
        {copiado ? "Copiado" : "Copiar"}
      </button>
    </div>
  );
}
```

`frontend/src/components/CartaoPonto.jsx`:
```jsx
import LinhaCoordenada from "./LinhaCoordenada.jsx";

// Clique fora de qualquer feição: mostra a coordenada do ponto (todos os
// mapas). Em mapa com anotação liberada, oferece criar um pin ali.
export default function CartaoPonto({ lngLat, podeAnotar, aoAdicionarPin, aoFechar }) {
  return (
    <aside className={`painel-flutuante painel-atributos painel-ponto${lngLat ? " aberto" : ""}`}>
      {lngLat && (
        <>
          <button type="button" className="fechar" onClick={aoFechar} aria-label="Fechar ponto selecionado" title="Fechar">
            ×
          </button>
          <h2>Ponto selecionado</h2>
          <LinhaCoordenada lngLat={lngLat} />
          {podeAnotar && (
            <button type="button" className="botao botao-adicionar-pin" onClick={aoAdicionarPin}>
              + Adicionar pin aqui
            </button>
          )}
        </>
      )}
    </aside>
  );
}
```

- [ ] **Step 6: Ligar no `Mapa.jsx`**

1. Imports (topo):
```js
import CartaoPonto from "../components/CartaoPonto.jsx";
import LinhaCoordenada from "../components/LinhaCoordenada.jsx";
```
2. Estado, logo abaixo de `const [selecao, setSelecao] = useState(null);`:
```js
  // Clique fora de qualquer feição consultável: mostra a coordenada
  // (CartaoPonto). Mutuamente exclusivo com `selecao` — no máximo 1 card
  // de informação aberto por vez.
  const [pontoSelecionado, setPontoSelecionado] = useState(null);
```
3. Em `handleClick` (efeito 6), trocar os dois blocos
```js
      if (layerIds.length === 0) {
        setSelecao(null);
        return;
      }

      const features = map.queryRenderedFeatures(e.point, { layers: layerIds });
      if (features.length === 0) {
        setSelecao(null);
        return;
      }
```
por:
```js
      const features = layerIds.length > 0 ? map.queryRenderedFeatures(e.point, { layers: layerIds }) : [];
      if (features.length === 0) {
        setSelecao(null);
        setPainelCamadasAberto(false);
        setPainelTipoVooAberto(false);
        setPontoSelecionado({ lngLat: e.lngLat });
        return;
      }
      setPontoSelecionado(null);
```
4. Efeito 8 (marcador): trocar `if (selecao) { ... .setLngLat(selecao.lngLat) ... }` por:
```js
    const alvo = selecao?.lngLat || pontoSelecionado?.lngLat;
    if (alvo) {
      marcadorRef.current = new maplibregl.Marker({ color: CORES_FERRAMENTAS.marcadorSelecao })
        .setLngLat(alvo)
        .addTo(map);
    }
```
e as dependências do efeito para `[selecao, pontoSelecionado]`.
5. Em todos os lugares que fecham `selecao` para abrir outro card (buscar `setSelecao(null); // fecha Atributos também`), acrescentar `setPontoSelecionado(null);` na mesma linha seguinte. O `aoIniciar` da medição também: trocar `useMedicao(mapRef, mapaPronto, () => setSelecao(null), nomeMapaAtual)` por `useMedicao(mapRef, mapaPronto, () => { setSelecao(null); setPontoSelecionado(null); }, nomeMapaAtual)`.
6. JSX: no painel de atributos, logo após o `</dl>` de `atributos-grid` (antes da paginação), inserir:
```jsx
              <LinhaCoordenada lngLat={selecao.lngLat} />
```
e, logo depois do `</aside>` do painel de atributos, inserir (o Task 9 troca `podeAnotar`/`aoAdicionarPin`):
```jsx
        <CartaoPonto
          lngLat={pontoSelecionado?.lngLat || null}
          podeAnotar={false}
          aoAdicionarPin={() => {}}
          aoFechar={() => setPontoSelecionado(null)}
        />
```

- [ ] **Step 7: CSS**

No fim de `frontend/src/index.css`:
```css
/* Coordenada do ponto clicado (CartaoPonto / rodapé dos atributos) */
.linha-coordenada {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-top: 10px;
  padding-top: 8px;
  border-top: 1px solid var(--borda, #e2e8f0);
  font-size: 13px;
}
.texto-coordenada {
  font-variant-numeric: tabular-nums;
  user-select: all;
}
.botao-copiar-coordenada {
  padding: 2px 10px;
  font-size: 12px;
}
.painel-ponto h2 {
  margin: 0 28px 0 0;
  font-size: 15px;
}
.botao-adicionar-pin {
  margin-top: 10px;
  width: 100%;
}
```
Antes de colar, abrir `index.css` e trocar `var(--borda, #e2e8f0)` pelo token de borda que já existe em `:root` (buscar `--` em `:root`) — manter o fallback.

- [ ] **Step 8: Verificação manual rápida**

Subir backend/frontend locais conforme a skill `verify` e, via Playwright, clicar numa área sem feição: esperar `.painel-ponto.aberto` com texto no formato `-dd.dddddd, -dd.dddddd`; clicar num talhão: `.painel-atributos .linha-coordenada` visível e `.painel-ponto` sem `aberto`. Matar os processos e apagar o script ao final.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/lib/coordenadas.js frontend/src/lib/coordenadas.test.js frontend/src/components/LinhaCoordenada.jsx frontend/src/components/CartaoPonto.jsx frontend/src/pages/Mapa.jsx frontend/src/index.css
git commit -m "Mostra a coordenada ao clicar em qualquer lugar do mapa

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 8: Hook `usePins` — pins no mapa, clique e cartão de leitura

**Files:**
- Rewrite: `frontend/src/hooks/usePins.js`
- Create: `frontend/src/components/pins/CartaoPin.jsx`
- Modify: `frontend/src/pages/Mapa.jsx`
- Modify: `frontend/src/lib/coresFerramentas.js` (já tem `pinPadrao`; entra neste commit)
- Modify: `frontend/src/context/JobsContext.jsx` (expõe `adicionarToast`)
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `garantirImagensPins`, `idImagemPin`, `ICONE_PADRAO`, `nomeIcone` (Task 4); `salvarPinLocal`, `listarPinsDoMapa`, `buscarPinLocal` (Task 5); `enviarPinsPendentes`, `EVENTO_PINS_ATUALIZADOS`, `EVENTO_PIN_DESCARTADO` (Task 6); `LinhaCoordenada` (Task 7).
- Produces — `usePins(mapRef, mapaPronto, mapaId, { podeEditar, sessao, aoAviso })` retorna:
  - `pins: PinLocal[]` (sem os `pendente === "remover"`), `pinSelecionado: PinLocal | null`, `visivel: boolean`, `setVisivel`
  - `layerIds: string[]` (`["camada-pins"]` — para o clique)
  - `selecionarPin(id)`, `fecharPin()`
  - `rascunho: null | {id?: string, lngLat, precisao?: number, inicial: {icone, cor, titulo, nota}}` — formulário aberto (novo ou edição)
  - `abrirNovo(lngLat, precisao?)`, `abrirEdicao(id)`, `cancelarRascunho()`, `salvarRascunho({icone, cor, titulo, nota})`
  - `modoAdicionar: boolean`, `setModoAdicionar`
  - `obtendoGps: boolean`, `adicionarNaMinhaLocalizacao()`
  - `movendoId: string | null`, `iniciarMover(id)`, `confirmarMover()`, `cancelarMover()`
  - `removerPin(id)`
  - `voarParaPin(id)`
- `<CartaoPin pin podeEditar aoEditar aoMover aoRemover aoFechar />`
- `useJobs().adicionarToast({ tipo: "sucesso" | "erro", mensagem })`.

- [ ] **Step 1: Expor `adicionarToast`**

Em `frontend/src/context/JobsContext.jsx`, trocar
```jsx
    <JobsContext.Provider value={{ jobsPendentes, resultadosRecentes, adicionarJob }}>
```
por
```jsx
    <JobsContext.Provider value={{ jobsPendentes, resultadosRecentes, adicionarJob, adicionarToast }}>
```
Confirmar no mesmo arquivo quais valores de `tipo` o CSS de `.toast--<tipo>` usa (buscar `adicionarToast(` e `toast--` em `index.css`) e usar os mesmos nomes no Step 2.

- [ ] **Step 2: Reescrever `usePins.js`**

`frontend/src/hooks/usePins.js`:
```js
import { useCallback, useEffect, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import { garantirImagensPins, idImagemPin, ICONE_PADRAO, nomeIcone } from "../lib/iconesPreparo.js";
import { CORES_FERRAMENTAS } from "../lib/coresFerramentas.js";
import { salvarPinLocal, listarPinsDoMapa, buscarPinLocal } from "../lib/db.js";
import { enviarPinsPendentes, EVENTO_PINS_ATUALIZADOS, EVENTO_PIN_DESCARTADO } from "../lib/syncPinsApp.js";

const FONTE_PINS = "fonte-pins";
const CAMADA_PINS = "camada-pins";
const CAMADA_PINS_PENDENTES = "camada-pins-pendentes";
const PRECISAO_MAXIMA_GPS = 30; // metros — acima disso pede confirmação

function pinParaFeature(pin) {
  return {
    type: "Feature",
    geometry: { type: "Point", coordinates: [pin.lng, pin.lat] },
    properties: { id: pin.id, titulo: pin.titulo, imagem: idImagemPin(pin.icone, pin.cor), pendente: Boolean(pin.pendente) },
  };
}

// Anotações compartilhadas do mapa (Mapa do Preparo) — ver
// docs/superpowers/specs/2026-09-24-mapa-preparo-anotacoes-design.md.
// Toda escrita vai primeiro pro IndexedDB com `pendente` (funciona sem
// rede) e depois dispara o envio em segundo plano (lib/syncPinsApp.js).
export function usePins(mapRef, mapaPronto, mapaId, { podeEditar, sessao, aoAviso }) {
  const [pins, setPins] = useState([]);
  const [visivel, setVisivel] = useState(true);
  const [pinSelecionadoId, setPinSelecionadoId] = useState(null);
  const [rascunho, setRascunho] = useState(null);
  const [modoAdicionar, setModoAdicionar] = useState(false);
  const [obtendoGps, setObtendoGps] = useState(false);
  const [movendoId, setMovendoId] = useState(null);
  const marcadorMoverRef = useRef(null);

  const recarregar = useCallback(async () => {
    if (!Number.isFinite(mapaId)) return;
    const todos = await listarPinsDoMapa(mapaId);
    setPins(todos.filter((p) => p.pendente !== "remover"));
  }, [mapaId]);

  // Carga inicial + recarga quando o sync (ou outra aba) mexer nos pins.
  useEffect(() => {
    recarregar();
    function aoAtualizar(e) {
      if (!e.detail?.mapaIds || e.detail.mapaIds.includes(mapaId)) recarregar();
    }
    function aoDescartar(e) {
      if (e.detail.pin.mapaId !== mapaId) return;
      aoAviso?.(e.detail.mensagem);
      recarregar();
    }
    window.addEventListener(EVENTO_PINS_ATUALIZADOS, aoAtualizar);
    window.addEventListener(EVENTO_PIN_DESCARTADO, aoDescartar);
    return () => {
      window.removeEventListener(EVENTO_PINS_ATUALIZADOS, aoAtualizar);
      window.removeEventListener(EVENTO_PIN_DESCARTADO, aoDescartar);
    };
    // aoAviso muda a cada render do pai; o comportamento não depende dele.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recarregar, mapaId]);

  // Voltou a internet: tenta esvaziar a fila.
  useEffect(() => {
    function aoFicarOnline() {
      enviarPinsPendentes(sessao.token);
    }
    window.addEventListener("online", aoFicarOnline);
    return () => window.removeEventListener("online", aoFicarOnline);
  }, [sessao.token]);

  // Camadas do MapLibre: cria na primeira vez, depois só setData (mesmo
  // idioma da medição/track). Sem beforeId: anotação fica por cima de tudo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto) return;
    let cancelado = false;
    (async () => {
      await garantirImagensPins(map, pins);
      if (cancelado) return;
      const dados = { type: "FeatureCollection", features: pins.map(pinParaFeature) };
      const fonte = map.getSource(FONTE_PINS);
      if (fonte) {
        fonte.setData(dados);
      } else {
        map.addSource(FONTE_PINS, { type: "geojson", data: dados });
        map.addLayer({
          id: CAMADA_PINS,
          type: "symbol",
          source: FONTE_PINS,
          layout: {
            "icon-image": ["get", "imagem"],
            "icon-anchor": "bottom",
            "icon-allow-overlap": true,
            "text-field": ["get", "titulo"],
            "text-font": ["Noto Sans Regular"],
            "text-size": 12,
            "text-anchor": "top",
            "text-offset": [0, 0.2],
            "text-optional": true,
          },
          paint: {
            "text-color": "#1f2933",
            "text-halo-color": "#ffffff",
            "text-halo-width": 1.5,
          },
        });
        // Bolinha laranja no "ombro" do pin = ainda não enviado.
        map.addLayer({
          id: CAMADA_PINS_PENDENTES,
          type: "circle",
          source: FONTE_PINS,
          filter: ["==", ["get", "pendente"], true],
          paint: {
            "circle-radius": 5,
            "circle-color": CORES_FERRAMENTAS.pinPendente,
            "circle-stroke-color": "#ffffff",
            "circle-stroke-width": 1.5,
            "circle-translate": [12, -40],
          },
        });
      }
      const vis = visivel ? "visible" : "none";
      map.setLayoutProperty(CAMADA_PINS, "visibility", vis);
      map.setLayoutProperty(CAMADA_PINS_PENDENTES, "visibility", vis);
    })();
    return () => {
      cancelado = true;
    };
  }, [pins, visivel, mapaPronto, mapRef]);

  // Cursor mira enquanto "tocar no mapa" está ativo.
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;
    map.getCanvas().style.cursor = modoAdicionar ? "crosshair" : "";
    return () => {
      if (mapRef.current) mapRef.current.getCanvas().style.cursor = "";
    };
  }, [modoAdicionar, mapRef]);

  // Remove o marcador de mover ao desmontar.
  useEffect(() => () => marcadorMoverRef.current?.remove(), []);

  async function gravar(pin) {
    await salvarPinLocal(pin);
    await recarregar();
    enviarPinsPendentes(sessao.token);
  }

  function selecionarPin(id) {
    setModoAdicionar(false);
    setRascunho(null);
    setPinSelecionadoId(id);
  }

  function fecharPin() {
    setPinSelecionadoId(null);
  }

  function abrirNovo(lngLat, precisao) {
    if (!podeEditar) return;
    setModoAdicionar(false);
    setPinSelecionadoId(null);
    setRascunho({
      lngLat,
      precisao,
      inicial: { icone: ICONE_PADRAO, cor: CORES_FERRAMENTAS.pinPadrao, titulo: nomeIcone(ICONE_PADRAO), nota: "" },
    });
  }

  function abrirEdicao(id) {
    const pin = pins.find((p) => p.id === id);
    if (!pin || !podeEditar) return;
    setRascunho({ id, lngLat: { lng: pin.lng, lat: pin.lat }, inicial: { icone: pin.icone, cor: pin.cor, titulo: pin.titulo, nota: pin.nota } });
  }

  function cancelarRascunho() {
    setRascunho(null);
  }

  async function salvarRascunho(campos) {
    if (!rascunho) return;
    const agora = new Date().toISOString();
    const usuario = sessao.usuario;
    if (rascunho.id) {
      const atual = await buscarPinLocal(rascunho.id);
      if (!atual) return setRascunho(null);
      await gravar({ ...atual, ...campos, atualizadoEm: agora, atualizadoPor: usuario.id, atualizadoPorNome: usuario.nome, pendente: "salvar" });
      setPinSelecionadoId(rascunho.id);
    } else {
      const novo = {
        id: crypto.randomUUID(),
        mapaId,
        ...campos,
        lng: rascunho.lngLat.lng,
        lat: rascunho.lngLat.lat,
        criadoPor: usuario.id,
        criadoPorNome: usuario.nome,
        atualizadoPor: usuario.id,
        atualizadoPorNome: usuario.nome,
        criadoEm: agora,
        atualizadoEm: agora,
        removidoEm: null,
        pendente: "salvar",
      };
      await gravar(novo);
      setPinSelecionadoId(novo.id);
    }
    setRascunho(null);
  }

  async function removerPin(id) {
    const atual = await buscarPinLocal(id);
    if (!atual) return;
    const agora = new Date().toISOString();
    await gravar({ ...atual, removidoEm: agora, atualizadoEm: agora, pendente: "remover" });
    if (pinSelecionadoId === id) setPinSelecionadoId(null);
  }

  function adicionarNaMinhaLocalizacao() {
    if (!navigator.geolocation) {
      aoAviso?.("Este aparelho não oferece localização por GPS.");
      return;
    }
    setObtendoGps(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setObtendoGps(false);
        const precisao = Math.round(pos.coords.accuracy);
        if (precisao > PRECISAO_MAXIMA_GPS && !window.confirm(`A precisão do GPS agora é de ±${precisao} m. Usar mesmo assim?`)) return;
        abrirNovo({ lng: pos.coords.longitude, lat: pos.coords.latitude }, precisao);
      },
      (erro) => {
        setObtendoGps(false);
        aoAviso?.(erro.code === erro.PERMISSION_DENIED ? "Permissão de localização negada." : "Não foi possível obter a localização. Tente de novo.");
      },
      { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 }
    );
  }

  function iniciarMover(id) {
    const map = mapRef.current;
    const pin = pins.find((p) => p.id === id);
    if (!map || !pin || !podeEditar) return;
    marcadorMoverRef.current?.remove();
    marcadorMoverRef.current = new maplibregl.Marker({ draggable: true, color: pin.cor }).setLngLat([pin.lng, pin.lat]).addTo(map);
    setMovendoId(id);
  }

  async function confirmarMover() {
    const marcador = marcadorMoverRef.current;
    const id = movendoId;
    marcadorMoverRef.current = null;
    setMovendoId(null);
    if (!marcador || !id) return;
    const { lng, lat } = marcador.getLngLat();
    marcador.remove();
    const atual = await buscarPinLocal(id);
    if (!atual) return;
    const usuario = sessao.usuario;
    await gravar({ ...atual, lng, lat, atualizadoEm: new Date().toISOString(), atualizadoPor: usuario.id, atualizadoPorNome: usuario.nome, pendente: "salvar" });
  }

  function cancelarMover() {
    marcadorMoverRef.current?.remove();
    marcadorMoverRef.current = null;
    setMovendoId(null);
  }

  function voarParaPin(id) {
    const map = mapRef.current;
    const pin = pins.find((p) => p.id === id);
    if (!map || !pin) return;
    map.flyTo({ center: [pin.lng, pin.lat], zoom: Math.max(map.getZoom(), 16), duration: 800 });
    selecionarPin(id);
  }

  return {
    pins,
    pinSelecionado: pins.find((p) => p.id === pinSelecionadoId) || null,
    visivel,
    setVisivel,
    layerIds: [CAMADA_PINS],
    selecionarPin,
    fecharPin,
    rascunho,
    abrirNovo,
    abrirEdicao,
    cancelarRascunho,
    salvarRascunho,
    modoAdicionar,
    setModoAdicionar,
    obtendoGps,
    adicionarNaMinhaLocalizacao,
    movendoId,
    iniciarMover,
    confirmarMover,
    cancelarMover,
    removerPin,
    voarParaPin,
  };
}
```

Em `frontend/src/lib/coresFerramentas.js`, logo abaixo de `pinPadrao: "#16a34a",` adicionar:
```js
  pinPendente: "#f59e0b",
```

Verificar em `Mapa.jsx` qual `text-font` as camadas de rótulo usam (buscar `"text-font"`) e usar o mesmo valor no layout acima — os glyphs só existem para essa fonte (`public/fonts/`).

- [ ] **Step 3: Cartão de leitura do pin**

`frontend/src/components/pins/CartaoPin.jsx`:
```jsx
import LinhaCoordenada from "../LinhaCoordenada.jsx";
import { nomeIcone, urlSvgPin } from "../../lib/iconesPreparo.js";

function formatarDataHora(iso) {
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function CartaoPin({ pin, podeEditar, aoEditar, aoMover, aoRemover, aoFechar }) {
  return (
    <aside className={`painel-flutuante painel-atributos painel-pin${pin ? " aberto" : ""}`}>
      {pin && (
        <>
          <button type="button" className="fechar" onClick={aoFechar} aria-label="Fechar anotação" title="Fechar">
            ×
          </button>
          <h2 className="titulo-pin">
            <img src={urlSvgPin(pin.icone, pin.cor)} alt="" width="22" height="28" />
            <span>{pin.titulo}</span>
          </h2>
          <p className="tipo-pin">{nomeIcone(pin.icone)}</p>
          {pin.nota && <p className="nota-pin">{pin.nota}</p>}
          <LinhaCoordenada lngLat={{ lng: pin.lng, lat: pin.lat }} />
          <p className="autoria-pin">
            Criado por {pin.criadoPorNome || "usuário removido"} em {formatarDataHora(pin.criadoEm)}
            {pin.atualizadoEm !== pin.criadoEm && (
              <>
                <br />
                Editado por {pin.atualizadoPorNome || "usuário removido"} em {formatarDataHora(pin.atualizadoEm)}
              </>
            )}
          </p>
          {pin.pendente && <p className="pendente-pin">Aguardando envio (sem internet)</p>}
          {podeEditar && (
            <div className="acoes-pin">
              <button type="button" onClick={aoEditar}>Editar</button>
              <button type="button" onClick={aoMover}>Mover</button>
              <button
                type="button"
                className="botao-perigo"
                onClick={() => {
                  if (window.confirm(`Remover a anotação "${pin.titulo}"?`)) aoRemover();
                }}
              >
                Remover
              </button>
            </div>
          )}
        </>
      )}
    </aside>
  );
}
```
Conferir em `index.css` se já existe classe de botão de perigo (buscar `perigo` ou `remover` em botões do admin) e usar essa em vez de `botao-perigo` se houver.

- [ ] **Step 4: Ligar no `Mapa.jsx`**

1. Imports:
```js
import { usePins } from "../hooks/usePins.js";
import CartaoPin from "../components/pins/CartaoPin.jsx";
import { useJobs } from "../context/JobsContext.jsx";
```
2. Estado `podeEditar`, junto de `nomeMapaAtual`:
```js
  // Vem do catálogo salvo no IndexedDB (GET /mapas.podeEditar) — funciona
  // offline. Libera as ferramentas de anotação (pins).
  const [podeEditar, setPodeEditar] = useState(false);
```
No efeito que lê `listarMapasDisponiveis()` para `nomeMapaAtual`, acrescentar `setPodeEditar(atual?.podeEditar === true);` junto do `setNomeMapaAtual`. No efeito 3 (sync), dentro de `if (resultado.online) { const disponiveis = ...`, acrescentar:
```js
        const atualizado = disponiveis.find((m) => m.id === mapaId);
        if (!cancelado && atualizado) setPodeEditar(atualizado.podeEditar === true);
```
3. Hook, logo depois de `const apontamento = useApontamentoVoo(...)`:
```js
  const { adicionarToast } = useJobs();
  const pins = usePins(mapRef, mapaPronto, mapaId, {
    podeEditar,
    sessao,
    aoAviso: (mensagem) => adicionarToast({ tipo: "erro", mensagem }),
  });
```
(Usar o nome de `tipo` confirmado no Step 1.)
4. `handleClick`: logo depois do bloco do `apontamento.modoApontamento` e antes de `const layerIds = ...`, inserir:
```js
      // Anotações (pins): modo "tocar no mapa" cria o pin ali; clique num
      // pin existente abre o cartão dele. Checado antes das camadas para o
      // pin (que fica por cima de tudo) ganhar do talhão embaixo dele.
      if (pins.movendoId) return;
      if (pins.modoAdicionar) {
        setSelecao(null);
        setPontoSelecionado(null);
        pins.abrirNovo(e.lngLat);
        return;
      }
      const idsCamadaPins = pins.layerIds.filter((id) => map.getLayer(id));
      if (idsCamadaPins.length > 0) {
        const clicados = map.queryRenderedFeatures(e.point, { layers: idsCamadaPins });
        if (clicados.length > 0) {
          setSelecao(null);
          setPontoSelecionado(null);
          setPainelCamadasAberto(false);
          setPainelTipoVooAberto(false);
          pins.selecionarPin(clicados[0].properties.id);
          return;
        }
      }
      pins.fecharPin();
```
e acrescentar às dependências do efeito 6: `pins.modoAdicionar, pins.movendoId` (as funções do hook leem estado via closure; o efeito é re-registrado quando esses dois mudam, e `abrirNovo`/`selecionarPin` só usam setters).

Atenção: `pins.abrirNovo` usa `podeEditar` da closure do render em que o efeito foi registrado — acrescentar também `podeEditar` às dependências do efeito 6.
5. JSX: logo depois do `<CartaoPonto ... />` (Task 7), inserir:
```jsx
        <CartaoPin
          pin={pins.pinSelecionado}
          podeEditar={podeEditar}
          aoEditar={() => pins.abrirEdicao(pins.pinSelecionado.id)}
          aoMover={() => pins.iniciarMover(pins.pinSelecionado.id)}
          aoRemover={() => pins.removerPin(pins.pinSelecionado.id)}
          aoFechar={pins.fecharPin}
        />
```

- [ ] **Step 5: CSS do cartão**

No fim de `index.css`:
```css
.titulo-pin {
  display: flex;
  align-items: center;
  gap: 8px;
  margin: 0 28px 0 0;
  font-size: 15px;
}
.tipo-pin {
  margin: 2px 0 0;
  font-size: 12px;
  opacity: 0.7;
}
.nota-pin {
  margin: 8px 0 0;
  white-space: pre-wrap;
  font-size: 14px;
}
.autoria-pin {
  margin: 8px 0 0;
  font-size: 12px;
  opacity: 0.75;
}
.pendente-pin {
  margin: 6px 0 0;
  font-size: 12px;
  color: #b45309;
}
.acoes-pin {
  display: flex;
  gap: 8px;
  margin-top: 10px;
}
.acoes-pin button {
  flex: 1;
}
```

- [ ] **Step 6: Verificação**

Com backend local (`verify`) e um pin inserido direto no banco local para um mapa que o usuário de teste vê:
```sql
INSERT INTO pins (id, mapa_id, icone, cor, titulo, nota, lng, lat, criado_em, atualizado_em)
VALUES (gen_random_uuid(), 1, 'pedra', '#dc2626', 'Pedra teste', 'nota', <lng dentro do mapa 1>, <lat>, now(), now());
```
(pegar `lng/lat` de uma feição do mapa 1 via `window.__map.getCenter()` após carregar). Playwright: carregar o mapa, conferir `window.__map.getSource("fonte-pins").serialize().data.features.length === 1`, clicar no pin (projetar com `window.__map.project([lng, lat])`, clicar ~15 px acima do ponto por causa da âncora `bottom`) e esperar `.painel-pin.aberto` com "Pedra teste". Apagar o pin (`DELETE FROM pins WHERE titulo = 'Pedra teste'`) e o script ao final.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/hooks/usePins.js frontend/src/components/pins/CartaoPin.jsx frontend/src/pages/Mapa.jsx frontend/src/lib/coresFerramentas.js frontend/src/context/JobsContext.jsx frontend/src/index.css
git commit -m "Mostra anotacoes compartilhadas no mapa com cartao de leitura

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 9: Ferramentas do editor — Anotar, formulário, GPS, editar, mover, remover

**Files:**
- Create: `frontend/src/components/pins/FormularioPin.jsx`
- Create: `frontend/src/components/pins/BarraAnotar.jsx`
- Modify: `frontend/src/pages/Mapa.jsx` (classe `AnotarControl`, efeito que adiciona/remove o controle, estado `barraAnotarAberta`, JSX, `CartaoPonto` ligado)
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `usePins` (Task 8), `ICONES_PREPARO`, `PALETA_PINS`, `urlSvgPin`, `nomeIcone` (Task 4), `CartaoPonto` (Task 7).
- Produces:
  - `<FormularioPin rascunho={{lngLat, precisao?, inicial, id?}} aoSalvar={(campos) => Promise<void>} aoCancelar={() => void} />`
  - `<BarraAnotar aberta modoAdicionar obtendoGps movendo aoTocarNoMapa aoMinhaLocalizacao aoConfirmarMover aoCancelarMover aoFechar />`

- [ ] **Step 1: Formulário**

`frontend/src/components/pins/FormularioPin.jsx`:
```jsx
import { useState } from "react";
import { ICONES_PREPARO, PALETA_PINS, urlSvgPin, nomeIcone } from "../../lib/iconesPreparo.js";
import { formatarCoordenada } from "../../lib/coordenadas.js";

export default function FormularioPin({ rascunho, aoSalvar, aoCancelar }) {
  const [icone, setIcone] = useState(rascunho.inicial.icone);
  const [cor, setCor] = useState(rascunho.inicial.cor);
  const [titulo, setTitulo] = useState(rascunho.inicial.titulo);
  const [nota, setNota] = useState(rascunho.inicial.nota);
  // Enquanto o usuário não digitar um título próprio, o título acompanha o
  // nome do ícone escolhido.
  const [tituloEditado, setTituloEditado] = useState(Boolean(rascunho.id));
  const [salvando, setSalvando] = useState(false);

  function escolherIcone(chave) {
    setIcone(chave);
    if (!tituloEditado) setTitulo(nomeIcone(chave));
  }

  async function enviar(e) {
    e.preventDefault();
    const t = titulo.trim();
    if (!t) return;
    setSalvando(true);
    await aoSalvar({ icone, cor, titulo: t.slice(0, 120), nota: nota.slice(0, 2000) });
    setSalvando(false);
  }

  return (
    <aside className="painel-flutuante painel-formulario-pin aberto" aria-label={rascunho.id ? "Editar anotação" : "Nova anotação"}>
      <form onSubmit={enviar}>
        <h2>{rascunho.id ? "Editar anotação" : "Nova anotação"}</h2>
        <p className="coordenada-formulario-pin">
          {formatarCoordenada(rascunho.lngLat)}
          {rascunho.precisao ? ` (GPS ±${rascunho.precisao} m)` : ""}
        </p>

        <fieldset className="grade-icones-pin">
          <legend>Tipo</legend>
          {ICONES_PREPARO.map((i) => (
            <button
              key={i.chave}
              type="button"
              className={`opcao-icone-pin${icone === i.chave ? " selecionado" : ""}`}
              onClick={() => escolherIcone(i.chave)}
              aria-pressed={icone === i.chave}
            >
              <img src={urlSvgPin(i.chave, cor)} alt="" width="28" height="36" />
              <span>{i.nome}</span>
            </button>
          ))}
        </fieldset>

        <fieldset className="paleta-pin">
          <legend>Cor</legend>
          {PALETA_PINS.map((c) => (
            <button
              key={c}
              type="button"
              className={`amostra-cor-pin${cor === c ? " selecionado" : ""}`}
              style={{ backgroundColor: c }}
              onClick={() => setCor(c)}
              aria-label={`Cor ${c}`}
              aria-pressed={cor === c}
            />
          ))}
          <input type="color" value={cor} onChange={(e) => setCor(e.target.value)} aria-label="Outra cor" />
        </fieldset>

        <label className="campo-pin">
          Título
          <input
            type="text"
            value={titulo}
            maxLength={120}
            required
            onChange={(e) => {
              setTitulo(e.target.value);
              setTituloEditado(true);
            }}
          />
        </label>
        <label className="campo-pin">
          Nota
          <textarea value={nota} maxLength={2000} rows={4} onChange={(e) => setNota(e.target.value)} />
        </label>

        <div className="acoes-pin">
          <button type="button" onClick={aoCancelar} disabled={salvando}>
            Cancelar
          </button>
          <button type="submit" disabled={salvando || !titulo.trim()}>
            {salvando && <span className="spinner" aria-hidden="true" />} Salvar
          </button>
        </div>
      </form>
    </aside>
  );
}
```

- [ ] **Step 2: Barra de ferramentas**

`frontend/src/components/pins/BarraAnotar.jsx`:
```jsx
export default function BarraAnotar({
  aberta,
  modoAdicionar,
  obtendoGps,
  movendo,
  aoTocarNoMapa,
  aoMinhaLocalizacao,
  aoConfirmarMover,
  aoCancelarMover,
  aoFechar,
}) {
  if (movendo) {
    return (
      <div className="barra-anotar" role="toolbar" aria-label="Mover anotação">
        <span>Arraste o pin até o novo local.</span>
        <button type="button" onClick={aoConfirmarMover}>Confirmar</button>
        <button type="button" onClick={aoCancelarMover}>Cancelar</button>
      </div>
    );
  }
  if (!aberta) return null;
  return (
    <div className="barra-anotar" role="toolbar" aria-label="Anotar">
      <button type="button" className={modoAdicionar ? "ativo" : ""} onClick={aoTocarNoMapa} aria-pressed={modoAdicionar}>
        {modoAdicionar ? "Toque no mapa…" : "Tocar no mapa"}
      </button>
      <button type="button" onClick={aoMinhaLocalizacao} disabled={obtendoGps}>
        {obtendoGps && <span className="spinner" aria-hidden="true" />} Na minha localização
      </button>
      <button type="button" className="fechar" onClick={aoFechar} aria-label="Fechar ferramenta de anotação">
        ×
      </button>
    </div>
  );
}
```

- [ ] **Step 3: Controle "Anotar" no MapLibre**

Em `Mapa.jsx`, logo depois da classe `MedicaoControl`, adicionar:
```js
// Botão "Anotar" — só existe em mapa onde o usuário pode anotar (pins);
// adicionado/removido por efeito quando `podeEditar` muda.
class AnotarControl {
  constructor(aoClicar) {
    this._aoClicar = aoClicar;
  }
  onAdd() {
    this._container = document.createElement("div");
    this._container.className = "maplibregl-ctrl maplibregl-ctrl-group";
    const botao = document.createElement("button");
    botao.type = "button";
    botao.title = "Anotar no mapa";
    botao.setAttribute("aria-label", "Anotar no mapa");
    botao.innerHTML =
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="display:block;margin:auto"><path d="M12 22s-7-7.5-7-13a7 7 0 0 1 14 0c0 5.5-7 13-7 13z"/><path d="M12 6v6M9 9h6"/></svg>';
    botao.onclick = () => this._aoClicar();
    this._container.appendChild(botao);
    return this._container;
  }
  onRemove() {
    this._container.parentNode?.removeChild(this._container);
  }
}
```
Estado (junto dos outros `useState`):
```js
  const [barraAnotarAberta, setBarraAnotarAberta] = useState(false);
```
Efeito novo, logo depois do efeito 1:
```js
  // Controle "Anotar" só para quem pode anotar neste mapa.
  useEffect(() => {
    const map = mapRef.current;
    if (!map || !mapaPronto || !podeEditar) return;
    const controle = new AnotarControl(() => setBarraAnotarAberta((a) => !a));
    map.addControl(controle, "top-right");
    return () => {
      map.removeControl(controle);
      setBarraAnotarAberta(false);
    };
  }, [mapaPronto, podeEditar]);
```
Exclusão mútua com a medição: efeito novo
```js
  // Medição e anotação disputariam o mesmo clique — ligar uma desliga a outra.
  useEffect(() => {
    if (medicao.medindo) {
      setBarraAnotarAberta(false);
      pins.setModoAdicionar(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [medicao.medindo]);
  useEffect(() => {
    if (barraAnotarAberta && medicao.medindo) medicao.setMedindo(false);
    if (!barraAnotarAberta) pins.setModoAdicionar(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [barraAnotarAberta]);
```
(Conferir em `hooks/useMedicao.js` o nome real do setter exposto — `Mapa.jsx` já usa `medicao.setMedindo`.)

- [ ] **Step 4: JSX do editor**

Trocar o `<CartaoPonto ... />` do Task 7 por:
```jsx
        <CartaoPonto
          lngLat={pontoSelecionado?.lngLat || null}
          podeAnotar={podeEditar}
          aoAdicionarPin={() => {
            const lngLat = pontoSelecionado.lngLat;
            setPontoSelecionado(null);
            pins.abrirNovo(lngLat);
          }}
          aoFechar={() => setPontoSelecionado(null)}
        />
```
E, logo depois do `<CartaoPin ... />`:
```jsx
        <BarraAnotar
          aberta={barraAnotarAberta}
          modoAdicionar={pins.modoAdicionar}
          obtendoGps={pins.obtendoGps}
          movendo={Boolean(pins.movendoId)}
          aoTocarNoMapa={() => pins.setModoAdicionar((m) => !m)}
          aoMinhaLocalizacao={pins.adicionarNaMinhaLocalizacao}
          aoConfirmarMover={pins.confirmarMover}
          aoCancelarMover={pins.cancelarMover}
          aoFechar={() => setBarraAnotarAberta(false)}
        />
        {pins.rascunho && (
          <FormularioPin
            key={pins.rascunho.id || "novo"}
            rascunho={pins.rascunho}
            aoSalvar={pins.salvarRascunho}
            aoCancelar={pins.cancelarRascunho}
          />
        )}
```
Imports:
```js
import BarraAnotar from "../components/pins/BarraAnotar.jsx";
import FormularioPin from "../components/pins/FormularioPin.jsx";
```
Ao iniciar mover, fechar o cartão do pin: em `aoMover` do `CartaoPin`, usar `() => { const id = pins.pinSelecionado.id; pins.fecharPin(); pins.iniciarMover(id); }`.

- [ ] **Step 5: CSS**

No fim de `index.css`:
```css
.barra-anotar {
  position: absolute;
  top: 12px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 6;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  background: var(--superficie, #fff);
  border-radius: 12px;
  box-shadow: 0 4px 16px rgb(0 0 0 / 0.18);
  max-width: calc(100vw - 32px);
  flex-wrap: wrap;
}
.barra-anotar .ativo {
  outline: 2px solid var(--accent);
}
.barra-anotar .fechar {
  background: none;
  color: inherit;
  padding: 0 6px;
  font-size: 18px;
}
.painel-formulario-pin {
  right: 16px;
  bottom: 16px;
  width: min(380px, calc(100vw - 32px));
  max-height: min(80vh, calc(100% - 32px));
  overflow-y: auto;
}
.painel-formulario-pin h2 {
  margin: 0;
  font-size: 15px;
}
.coordenada-formulario-pin {
  margin: 4px 0 8px;
  font-size: 12px;
  opacity: 0.75;
}
.grade-icones-pin,
.paleta-pin {
  border: none;
  padding: 0;
  margin: 8px 0;
}
.grade-icones-pin {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(76px, 1fr));
  gap: 6px;
}
.grade-icones-pin legend,
.paleta-pin legend {
  font-size: 12px;
  font-weight: 600;
  margin-bottom: 4px;
}
.opcao-icone-pin {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 6px 2px;
  background: transparent;
  color: inherit;
  border: 1px solid transparent;
  border-radius: 8px;
  font-size: 10.5px;
  line-height: 1.15;
}
.opcao-icone-pin.selecionado {
  border-color: var(--accent);
  background: rgb(0 0 0 / 0.04);
}
.paleta-pin {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}
.amostra-cor-pin {
  width: 26px;
  height: 26px;
  padding: 0;
  border-radius: 50%;
  border: 2px solid #fff;
  box-shadow: 0 0 0 1px rgb(0 0 0 / 0.25);
}
.amostra-cor-pin.selecionado {
  box-shadow: 0 0 0 2px var(--accent);
}
.campo-pin {
  display: flex;
  flex-direction: column;
  gap: 4px;
  margin-top: 8px;
  font-size: 12px;
  font-weight: 600;
}
.campo-pin input,
.campo-pin textarea {
  font: inherit;
  font-weight: 400;
  font-size: 14px;
}
```
Antes de colar, conferir em `:root` do `index.css` os nomes reais dos tokens de superfície/accent e trocar `var(--superficie, #fff)` pelo equivalente (manter fallback). Se `.painel-flutuante` definir `position`, a posição de `.painel-formulario-pin` sobrescreve só `right/bottom/width`.

- [ ] **Step 6: Verificação (online)**

Com backend local (`verify`): no banco local, dar `pode_editar = true` na permissão do grupo do usuário de teste no mapa 1 (guardar o valor anterior para reverter). Playwright:
1. Login, abrir o mapa 1, esperar `window.__map.loaded()`.
2. Clicar no controle `button[aria-label="Anotar no mapa"]`, depois "Tocar no mapa", clicar no centro do canvas.
3. Esperar `.painel-formulario-pin`, clicar o ícone "Cupinzeiro", conferir que o título virou "Cupinzeiro", preencher nota, Salvar.
4. Esperar `.painel-pin.aberto` com "Cupinzeiro"; esperar até 10 s por `SELECT count(*) FROM pins WHERE titulo = 'Cupinzeiro'` = 1 no banco local (via `pg` num script Node ou `psql`).
5. Editar → mudar título para "Cupinzeiro grande" → Salvar; conferir no banco.
6. Mover: clicar Mover, conferir que a barra "Arraste o pin até o novo local." aparece e que existe um `.maplibregl-marker` na tela. Arraste sintético não funciona no Chromium headless (ver skill `verify`), então clicar Confirmar sem arrastar e conferir no banco que `atualizado_em` mudou e `lng/lat` se mantiveram. Depois, Mover → Cancelar: a barra some e o marcador também.
7. Remover → confirmar diálogo (`page.on("dialog", d => d.accept())`) → conferir `removido_em` preenchido no banco e pin fora de `fonte-pins`.
8. GPS: `context.setGeolocation({latitude, longitude, accuracy: 5})` com `permissions: ["geolocation"]`, clicar "Na minha localização", conferir o formulário com "(GPS ±5 m)".
9. Clique em área vazia → "Ponto selecionado" mostra "+ Adicionar pin aqui" para o editor.

Limpeza: `DELETE FROM pins WHERE mapa_id = 1 AND (titulo LIKE 'Cupinzeiro%' OR titulo LIKE 'Observa%');` (títulos criados no passo 2-8), `DELETE FROM logs WHERE acao = 'anotacao' AND detalhe LIKE '%(mapa 1)%' AND data_hora > now() - interval '1 hour';`, reverter `pode_editar` ao valor anotado, apagar o script.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/components/pins/FormularioPin.jsx frontend/src/components/pins/BarraAnotar.jsx frontend/src/pages/Mapa.jsx frontend/src/index.css
git commit -m "Adiciona ferramentas de anotacao para editores (tocar, GPS, editar, mover, remover)

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 10: Painel de camadas, legenda, busca, aviso de pendentes e logout seguro

**Files:**
- Create: `frontend/src/hooks/usePinsPendentes.js`
- Modify: `frontend/src/pages/Mapa.jsx` (painel de camadas, busca, cabeçalho, `handleSair`)
- Modify: `frontend/src/pages/Inicio.jsx` (`handleSair`)
- Modify: `frontend/src/index.css`

**Interfaces:**
- Consumes: `usePins` (Task 8), `listarPinsPendentes` (Task 5), `EVENTO_PINS_ATUALIZADOS` (Task 6), `ICONES_PREPARO`, `urlSvgPin` (Task 4).
- Produces: `usePinsPendentes(): number` (quantidade total de pins pendentes em todos os mapas; atualiza em `EVENTO_PINS_ATUALIZADOS` e a cada 15 s).

- [ ] **Step 1: Contagem global de pendentes**

`frontend/src/hooks/usePinsPendentes.js`:
```js
import { useEffect, useState } from "react";
import { listarPinsPendentes } from "../lib/db.js";
import { EVENTO_PINS_ATUALIZADOS } from "../lib/syncPinsApp.js";

// Quantas anotações ainda não foram enviadas (todos os mapas) — usado no
// cabeçalho e para avisar antes de sair da conta.
export function usePinsPendentes() {
  const [quantidade, setQuantidade] = useState(0);
  useEffect(() => {
    let ativo = true;
    async function atualizar() {
      const n = (await listarPinsPendentes()).length;
      if (ativo) setQuantidade(n);
    }
    atualizar();
    window.addEventListener(EVENTO_PINS_ATUALIZADOS, atualizar);
    const intervalo = setInterval(atualizar, 15000);
    return () => {
      ativo = false;
      window.removeEventListener(EVENTO_PINS_ATUALIZADOS, atualizar);
      clearInterval(intervalo);
    };
  }, []);
  return quantidade;
}
```
Em `usePins.gravar` (Task 8), depois de `await recarregar();`, disparar o evento para a contagem reagir na hora — adicionar o import `avisarPinsAtualizados` de `syncPinsApp.js` e a linha:
```js
    avisarPinsAtualizados([mapaId]);
```

- [ ] **Step 2: Logout com pendentes (Mapa e Início)**

Em `Mapa.jsx` e `Inicio.jsx`: importar `usePinsPendentes`, chamar `const pinsPendentes = usePinsPendentes();` no componente e trocar `handleSair` por:
```js
  function handleSair() {
    if (
      pinsPendentes > 0 &&
      !window.confirm(
        `Você tem ${pinsPendentes} anotação(ões) ainda não enviada(s). Sair agora vai descartá-las. Sair mesmo assim?`
      )
    ) {
      return;
    }
    sair();
    navigate("/login");
  }
```

- [ ] **Step 3: Aviso no cabeçalho do mapa**

Em `Mapa.jsx`, logo depois do `</span>` de `status-sync`:
```jsx
        {pinsPendentes > 0 && (
          <span className="status-pins-pendentes" aria-live="polite">
            {pinsPendentes === 1 ? "1 anotação aguardando envio" : `${pinsPendentes} anotações aguardando envio`}
          </span>
        )}
```

- [ ] **Step 4: Entrada "Anotações" no painel de camadas, com legenda**

Em `Mapa.jsx`, logo antes de `{temporaria.arquivoTemporario && (` no painel de camadas, inserir:
```jsx
                {(pins.pins.length > 0 || podeEditar) && (
                  <div className="linha-camada-bloco">
                    <label className="linha-camada">
                      <input type="checkbox" checked={pins.visivel} onChange={() => pins.setVisivel((v) => !v)} />
                      <img className="swatch-pin" src={urlSvgPin("observacao", CORES_FERRAMENTAS.pinPadrao)} alt="" width="14" height="18" />
                      <span className="nome-camada">Anotações ({pins.pins.length})</span>
                    </label>
                    {pins.pins.length > 0 && (
                      <ul className="legenda-pins">
                        {ICONES_PREPARO.filter((i) => pins.pins.some((p) => p.icone === i.chave)).map((i) => (
                          <li key={i.chave}>
                            <img src={urlSvgPin(i.chave, "#475569")} alt="" width="12" height="16" />
                            {i.nome} ({pins.pins.filter((p) => p.icone === i.chave).length})
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                )}
```
Import: `import { ICONES_PREPARO, urlSvgPin } from "../lib/iconesPreparo.js";`

- [ ] **Step 5: Busca inclui pins**

Em `Mapa.jsx`, logo depois do bloco que calcula `resultadosBusca`, adicionar:
```js
  // Anotações entram na busca por título/nota (só neste mapa).
  const resultadosPins =
    termosBusca.length === 0
      ? []
      : pins.pins
          .filter((p) => {
            const alvo = `${p.titulo} ${p.nota}`.toLowerCase();
            return termosBusca.some((t) => alvo.includes(t));
          })
          .slice(0, 8);
```
(Confirmar como `termosBusca` é normalizado na linha ~1689 — se remove acento, aplicar a mesma normalização em `alvo`, reaproveitando a função existente.)

No JSX dos resultados, logo antes de `{resultadosBusca.length > 0 && (`, inserir:
```jsx
                {resultadosPins.length > 0 && (
                  <ul className="resultados-busca resultados-busca-pins">
                    {resultadosPins.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          onClick={() => {
                            setBuscaTexto("");
                            setSelecao(null);
                            setPontoSelecionado(null);
                            pins.voarParaPin(p.id);
                          }}
                        >
                          <img src={urlSvgPin(p.icone, p.cor)} alt="" width="12" height="16" /> {p.titulo}
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
```
e trocar a condição de "Nada encontrado." para:
```jsx
                {termosBusca.length > 0 && resultadosBusca.length === 0 && resultadosPins.length === 0 && (
```

- [ ] **Step 6: CSS**

```css
.status-pins-pendentes {
  font-size: 12px;
  color: #b45309;
  white-space: nowrap;
}
.swatch-pin {
  flex: none;
}
.legenda-pins {
  list-style: none;
  margin: 2px 0 6px 28px;
  padding: 0;
  font-size: 12px;
}
.legenda-pins li {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 1px 0;
}
.resultados-busca-pins img {
  vertical-align: -3px;
}
```

- [ ] **Step 7: Build + lint**

Run (de `frontend/`): `npm run lint && npm run test:unit && npm run build`
Expected: sem erros novos de lint; testes PASS; build ok.

- [ ] **Step 8: Commit**

```bash
git add frontend/src/hooks/usePinsPendentes.js frontend/src/hooks/usePins.js frontend/src/pages/Mapa.jsx frontend/src/pages/Inicio.jsx frontend/src/index.css
git commit -m "Adiciona anotacoes ao painel de camadas, legenda, busca e aviso de pendentes

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 11: Admin — caixa "pode anotar" por grupo em Gerenciar mapas

**Files:**
- Modify: `frontend/src/pages/AdminMapas.jsx`
- Modify: `frontend/src/index.css` (se precisar)

**Interfaces:**
- Consumes: `criarMapaAdmin`/`atualizarMapaAdmin` com `permissoes` (Task 6); `GET /admin/mapas` com `permissoes` (Task 3).

- [ ] **Step 1: Formulário passa a guardar `permissoes`**

Em `AdminMapas.jsx`:
- `const FORM_VAZIO = { nome: "", descricao: "", permissoes: [] };`
- Substituir `alternarGrupo` e `alternarGrupoEdicao` por funções que operam em `permissoes`:
```js
function alternarGrupoEm(permissoes, grupoId) {
  return permissoes.some((p) => p.grupoId === grupoId)
    ? permissoes.filter((p) => p.grupoId !== grupoId)
    : [...permissoes, { grupoId, podeEditar: false }];
}

function alternarAnotarEm(permissoes, grupoId) {
  return permissoes.map((p) => (p.grupoId === grupoId ? { ...p, podeEditar: !p.podeEditar } : p));
}
```
(fora do componente) e, dentro:
```js
  function alternarGrupo(grupoId) {
    setForm((atual) => ({ ...atual, permissoes: alternarGrupoEm(atual.permissoes, grupoId) }));
  }
  function alternarAnotar(grupoId) {
    setForm((atual) => ({ ...atual, permissoes: alternarAnotarEm(atual.permissoes, grupoId) }));
  }
  function alternarGrupoEdicao(grupoId) {
    setFormEdicao((atual) => ({ ...atual, permissoes: alternarGrupoEm(atual.permissoes, grupoId) }));
  }
  function alternarAnotarEdicao(grupoId) {
    setFormEdicao((atual) => ({ ...atual, permissoes: alternarAnotarEm(atual.permissoes, grupoId) }));
  }
```
- `abrirEdicao(mapa)`: `setFormEdicao({ nome: mapa.nome, descricao: mapa.descricao || "", permissoes: mapa.permissoes || [] });`
- Onde `criar`/`salvarEdicao` chamam `criarMapaAdmin`/`atualizarMapaAdmin` com `grupoIds`, passar `permissoes: form.permissoes` / `permissoes: formEdicao.permissoes`.
- Na listagem (linha ~215, que usa `m.grupoIds`), manter `grupoIds` para exibir nomes e acrescentar um sufixo " (anota)" para grupos com `podeEditar`:
```jsx
{(m.permissoes || []).map((p) => `${grupos.find((g) => g.id === p.grupoId)?.nome ?? p.grupoId}${p.podeEditar ? " (anota)" : ""}`).join(", ")}
```
(adaptar ao JSX existente naquele trecho — ler antes de trocar.)

- [ ] **Step 2: Caixa "pode anotar" ao lado de cada grupo marcado**

Nos dois blocos `lista-grupos-checkbox` (criação ~183 e edição ~272), trocar cada item de grupo por:
```jsx
<div key={g.id} className="linha-grupo-permissao">
  <label>
    <input
      type="checkbox"
      checked={form.permissoes.some((p) => p.grupoId === g.id)}
      onChange={() => alternarGrupo(g.id)}
    />
    {g.nome}
  </label>
  {form.permissoes.some((p) => p.grupoId === g.id) && (
    <label className="caixa-pode-anotar">
      <input
        type="checkbox"
        checked={form.permissoes.find((p) => p.grupoId === g.id)?.podeEditar === true}
        onChange={() => alternarAnotar(g.id)}
      />
      pode anotar
    </label>
  )}
</div>
```
(no bloco de edição, `formEdicao`/`alternarGrupoEdicao`/`alternarAnotarEdicao`). Ler o JSX atual do item antes de trocar, preservando classes existentes.

CSS (fim de `index.css`):
```css
.linha-grupo-permissao {
  display: flex;
  align-items: center;
  gap: 12px;
}
.caixa-pode-anotar {
  font-size: 12px;
  opacity: 0.85;
}
```

- [ ] **Step 3: Verificação**

Backend+frontend locais (`verify`), logado como admin local (`admin@geoportal.local`/`senha123` do seed): em Gerenciar mapas, editar o mapa 1, marcar "pode anotar" num grupo, salvar; conferir no banco `SELECT pode_editar FROM permissoes WHERE mapa_id = 1`; recarregar a tela e ver a caixa marcada; desmarcar e salvar de novo (restaurar o estado original anotado antes).

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/AdminMapas.jsx frontend/src/index.css
git commit -m "Permite marcar grupos que podem anotar em Gerenciar mapas

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 12: Verificação ponta a ponta offline e documentação

**Files:**
- Create (temporário, apagar ao fim): `frontend/_e2e_pins.mjs`
- Modify: `docs/SCHEMA_BANCO.md`, `docs/ROADMAP.md`, `CLAUDE.md`

- [ ] **Step 1: Preparar cenário no banco local**

Via `psql -U geoportal -h localhost -p 5432 geoportal_dev` (SQL puro, sem acentos): anotar o estado atual de `usuarios_grupos`/`permissoes` do mapa 1; garantir um usuário editor (grupo com `pode_editar = true` no mapa 1) e um leitor (grupo sem). Se precisar criar usuários, usar e-mails `__e2e_editor@teste.local` / `__e2e_leitor@teste.local` com `senha_hash` gerado por `node -e "import('bcrypt').then(b=>b.default.hash('senha123',10)).then(console.log)"` (de `backend/`).

- [ ] **Step 2: Build de produção + servidor estático**

De `frontend/`: `VITE_API_URL=http://localhost:3099 npm run build`. Servir `dist/` com um servidor estático Node mínimo (não `vite preview` — ele devolve 404 para `Sec-Fetch-Dest: script`, ver CLAUDE.md) na porta 4183, com fallback para `index.html`. Backend local na 3099 (skill `verify`).

- [ ] **Step 3: Script E2E**

`frontend/_e2e_pins.mjs` — dois contextos Playwright (editor e leitor), cada um com seu login:
1. Editor: abrir mapa 1, esperar sync, `context.setOffline(true)`.
2. Editor offline: Anotar → Tocar no mapa → clicar → escolher "Erosão / voçoroca" → título "E2E offline" → Salvar. Conferir `.status-pins-pendentes` com "1 anotação aguardando envio" e a camada `camada-pins-pendentes` com 1 feição (`window` não tem `__map` no build de produção — conferir pelo texto do cabeçalho e por `SELECT count(*) FROM pins WHERE titulo = 'E2E offline'` = 0 no banco).
3. Editor: tentar sair pelo menu → diálogo de confirmação aparece → `dismiss()` (continua logado).
4. Editor: `context.setOffline(false)` → esperar até 20 s o aviso sumir e o banco ter o pin.
5. Leitor: abrir mapa 1 (online), esperar sync; clicar no pin → `.painel-pin.aberto` com "E2E offline" e autor = nome do editor; confirmar que não há botões Editar/Mover/Remover nem controle "Anotar no mapa".
6. Leitor: `setOffline(true)`, recarregar a página → o pin continua visível e clicável (veio do IndexedDB).
7. Editor online: remover o pin; leitor online de novo, recarregar → pin sumiu.
8. Qualquer usuário: clicar em área vazia → "Ponto selecionado" com coordenada; clicar "Copiar" → texto do botão vira "Copiado".
Zero erro de console em todos os passos (coletar `page.on("console")` com `type() === "error"`).

- [ ] **Step 4: Rodar, corrigir o que falhar, rodar de novo**

Run: `node _e2e_pins.mjs` (de `frontend/`). Expected: todos os passos OK. Qualquer falha: diagnosticar com a skill systematic-debugging, corrigir no task de origem (commit separado), rodar de novo.

- [ ] **Step 5: Limpeza**

`DELETE FROM pins WHERE titulo LIKE 'E2E%';` `DELETE FROM logs WHERE acao = 'anotacao' AND detalhe LIKE '%E2E%';` reverter `permissoes`/`usuarios_grupos` ao estado anotado no Step 1; apagar usuários `__e2e_*` se criados; matar backend 3099 e servidor 4183 (confirmar que `:3000`, se existir, continua de pé); `rm frontend/_e2e_pins.mjs` e qualquer servidor estático temporário criado.

- [ ] **Step 6: Documentação**

- `docs/SCHEMA_BANCO.md`: seção nova "pins" (colunas e regras da tabela do Task 1), `permissoes.pode_editar`, `'anotacao'` em `logs.acao`.
- `docs/ROADMAP.md`: marcar "Mapa do Preparo — anotações compartilhadas offline" como feito; listar fora de escopo (foto no pin, exportar pins KML/CSV, linhas/polígonos anotados, histórico de versões, Background Sync, anotações pessoais).
- `CLAUDE.md`: entrada datada "**Mapa do Preparo — anotações (2026-09-24)**" resumindo: permissão por grupo (`pode_editar`), tabela `pins` com UUID do cliente e remoção lógica, outbox no IndexedDB (`lib/syncPins.js`, `pendente`), cursor que recua 1 min, clique vazio mostra coordenada em todos os mapas, 15 ícones em `lib/iconesPreparo.js` (+ lista espelhada no backend), testes (`npm test` no backend com `DATABASE_URL` local; `npm run test:unit` no frontend), e que `usePins.js` pessoal/local foi substituído (anotação pessoal não existe mais).

- [ ] **Step 7: Commit**

```bash
git add docs/SCHEMA_BANCO.md docs/ROADMAP.md CLAUDE.md
git commit -m "Documenta anotacoes do Mapa do Preparo

Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task 13: Publicação e criação do Mapa do Preparo em produção (exige ok do Leo)

**Files:** nenhum.

- [ ] **Step 1: Pedir autorização ao Leo**

Perguntar: pode fazer push agora (confirmar que a automação diária não está rodando)? Qual grupo recebe "pode anotar" no Mapa do Preparo?

- [ ] **Step 2: Push**

`git log origin/master..HEAD --oneline` (conferir a lista), depois `git push`. Acompanhar o deploy do Render (`geomap-docker`) e o workflow do GitHub Pages (`gh run list --workflow=deploy-frontend.yml --limit 1`). A migration 014 roda no deploy (confirmar nos logs do Render que `014_pins_anotacoes.sql` foi aplicada; se o deploy não roda migrations automaticamente, rodar `npm run migrate` com a `DATABASE_URL` de produção **só com autorização explícita**).

- [ ] **Step 3: Criar o mapa (pela UI de admin, logado como admin)**

Gerenciar mapas → "Duplicar" no Temático → editar a cópia: nome "Mapa do Preparo" (digitado na UI, nunca via shell), grupos com acesso, marcar "pode anotar" no grupo do editor → Salvar.

- [ ] **Step 4: Smoke test em produção**

Com o Leo (ou a conta dele, autorizada): abrir o Mapa do Preparo, criar um pin de teste "Teste — apagar", conferir que aparece para outro usuário do grupo, removê-lo. Confirmar que o Temático original continua sem ferramentas de anotação para quem não tem "pode anotar".
