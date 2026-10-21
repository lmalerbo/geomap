-- Planejamento de voos no mapa (2026-10-16): polígono datado desenhado pelo
-- admin, com a lista de talhões de dentro calculada no aparelho ao salvar.
CREATE TABLE IF NOT EXISTS planejamentos_voo (
  id UUID PRIMARY KEY,
  mapa_id INTEGER NOT NULL REFERENCES mapas(id) ON DELETE CASCADE,
  data DATE NOT NULL,
  poligono JSONB NOT NULL,
  talhoes JSONB NOT NULL DEFAULT '[]'::jsonb,
  criado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS planejamentos_voo_mapa_data ON planejamentos_voo (mapa_id, data);
