-- Cache persistente do resultado de GET /voos/pendentes/:mapaId — buscar e
-- processar os milhares de registros pendentes do DroneManagement custa
-- ~18s toda vez (medido em produção, 2026-09-21), mesmo com a sessão de
-- login já em cache. Guardar aqui (não só em memória do processo) permite
-- pular esse custo quando nada mudou desde a última vez, mesmo que o
-- processo do Render tenha dormido/reiniciado no meio (free tier dorme
-- depois de ~15min sem uso) — ver voos.js pra lógica de invalidação (um
-- request barato com pageSize:1 confere o `count` atual antes de decidir
-- se reusa o cache ou refaz a busca completa).
CREATE TABLE voos_pendentes_cache (
  mapa_id INTEGER PRIMARY KEY REFERENCES mapas(id) ON DELETE CASCADE,
  count_dronemgmt INTEGER NOT NULL,
  registros JSONB NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
