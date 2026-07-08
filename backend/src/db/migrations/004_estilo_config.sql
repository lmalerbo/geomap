-- Config de simbologia/rótulo por mapa (cor, opacidade de preenchimento,
-- mostrar rótulo, zoom mínimo do rótulo) — editável pelo painel de
-- administração. NULL = comportamento atual (heurística por presença do
-- campo TALHAO no metadata do .pmtiles). Ver docs/SCHEMA_BANCO.md.

ALTER TABLE mapas
    ADD COLUMN IF NOT EXISTS estilo_config JSONB;
