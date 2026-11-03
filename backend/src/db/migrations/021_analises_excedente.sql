-- Plantio Excedente (2026-10-30): um caso de análise por voo de Falhas
-- Plantio — ver docs/superpowers/specs/2026-10-30-plantio-excedente-design.md.
CREATE TABLE IF NOT EXISTS analises_excedente (
  id UUID PRIMARY KEY,
  mapa_id INTEGER NOT NULL REFERENCES mapas(id) ON DELETE CASCADE,
  voo_id TEXT NOT NULL,
  secao TEXT NOT NULL,
  talhao TEXT NOT NULL,
  fazenda TEXT,
  fornecedor BOOLEAN NOT NULL DEFAULT false,
  data_voo DATE NOT NULL,
  status TEXT NOT NULL DEFAULT 'aguardando'
    CHECK (status IN ('aguardando', 'precisa_ajuste', 'sem_ajuste', 'ajustado')),
  area_excedente_ha NUMERIC,
  observacao TEXT,
  poligono_excedente JSONB,
  data_ajuste DATE,
  voo_cancelado BOOLEAN NOT NULL DEFAULT false,
  janela_ajuste JSONB,
  atualizado_em TIMESTAMPTZ,
  atualizado_por INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (mapa_id, voo_id)
);
CREATE INDEX IF NOT EXISTS analises_excedente_mapa ON analises_excedente (mapa_id);

-- id = id do apontamento gerado no aparelho: reenvio idempotente.
CREATE TABLE IF NOT EXISTS historico_excedente (
  id UUID PRIMARY KEY,
  analise_id UUID NOT NULL REFERENCES analises_excedente(id) ON DELETE CASCADE,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  feito_em TIMESTAMPTZ NOT NULL,
  recebido_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  status_anterior TEXT,
  status_novo TEXT NOT NULL,
  campos JSONB NOT NULL DEFAULT '{}'::jsonb,
  substituido BOOLEAN NOT NULL DEFAULT false
);
CREATE INDEX IF NOT EXISTS historico_excedente_analise ON historico_excedente (analise_id, feito_em);