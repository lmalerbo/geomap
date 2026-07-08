-- Configuração de exibição de atributos por mapa (quais campos aparecem
-- no painel de atributos do clique e em que ordem) — editável pelo painel
-- de administração. NULL = comportamento atual (mostra tudo, ordem bruta
-- do vector tile). Ver docs/SCHEMA_BANCO.md.

ALTER TABLE mapas
    ADD COLUMN IF NOT EXISTS atributos_config JSONB;
