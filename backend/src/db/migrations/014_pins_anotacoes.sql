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
