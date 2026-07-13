-- logs.acao tinha CHECK (acao IN ('login', 'download')) desde o schema
-- original — o painel de admin novo (usuários/grupos/permissões) passa a
-- registrar auditoria de ações sensíveis (criar usuário, mudar papel,
-- redefinir senha, criar/remover grupo) na mesma tabela logs, então
-- 'admin' precisa entrar na lista permitida. O detalhe da ação (qual
-- usuário/grupo, o que mudou) vai numa coluna nova em texto livre —
-- não faz sentido criar uma CHECK por tipo de ação administrativa.
--
-- Busca o nome da constraint dinamicamente em vez de assumir
-- "logs_acao_check" (nome default do Postgres pra CHECK inline) — mais
-- seguro contra qualquer diferença de nome entre ambientes, e reexecutar
-- essa migration não falha (acha e recria a mesma constraint de novo).

DO $$
DECLARE
  nome_constraint TEXT;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'logs' AND column_name = 'detalhe'
  ) THEN
    ALTER TABLE logs ADD COLUMN detalhe TEXT;
  END IF;

  SELECT con.conname INTO nome_constraint
  FROM pg_constraint con
  JOIN pg_class rel ON rel.oid = con.conrelid
  WHERE rel.relname = 'logs' AND con.contype = 'c' AND pg_get_constraintdef(con.oid) LIKE '%acao%';

  IF nome_constraint IS NOT NULL THEN
    EXECUTE format('ALTER TABLE logs DROP CONSTRAINT %I', nome_constraint);
  END IF;

  ALTER TABLE logs ADD CONSTRAINT logs_acao_check CHECK (acao IN ('login', 'download', 'admin'));
END $$;
