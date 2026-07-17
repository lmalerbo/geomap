-- Conversão de shapefile grande (ogr2ogr + tippecanoe + rótulos +
-- tile-join) pode levar minutos — POST/PUT de camada deixam de fazer
-- isso de forma síncrona (segurando a conexão HTTP o tempo todo) e
-- passam a responder na hora com um jobId, rodando a conversão em
-- segundo plano. Essa tabela guarda o status pra quem chamou (tela de
-- admin ou uma futura automação) consultar via GET /admin/jobs/:id.
--
-- id gerado no Node (crypto.randomUUID(), mesmo padrão já usado pras
-- chaves de arquivo no R2) — evita depender da extensão pgcrypto só
-- pra isso.

CREATE TABLE jobs_conversao (
  id UUID PRIMARY KEY,
  tipo TEXT NOT NULL CHECK (tipo IN ('criar_camada', 'atualizar_arquivo')),
  status TEXT NOT NULL DEFAULT 'processando' CHECK (status IN ('processando', 'concluido', 'erro')),
  erro TEXT,
  camada_id INTEGER REFERENCES camadas(id) ON DELETE SET NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
