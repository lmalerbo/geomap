-- Redesenho do admin, fase 5.
--
-- 1) Quem criou cada job de conversão: a Visão geral separa o que a
--    automação diária enviou do que um admin enviou à mão (ver
--    lib/saudeAutomacao.js). Jobs antigos ficam NULL e são atribuídos pela
--    janela logo depois de um login da automação.
ALTER TABLE jobs_conversao
  ADD COLUMN IF NOT EXISTS usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL;

-- 2) Versões anteriores de cada camada. O backup ".bak-<timestamp>" no R2
--    já existia, mas leva o nome da chave ANTIGA (cada envio gera uma
--    chave nova), então não dava pra saber de qual camada era — por isso
--    nunca houve tela de restaurar. Daqui pra frente cada substituição
--    grava a linha aqui; backups anteriores a esta migration continuam no
--    bucket, sem vínculo.
CREATE TABLE IF NOT EXISTS versoes_camada (
  id SERIAL PRIMARY KEY,
  camada_id INTEGER NOT NULL REFERENCES camadas(id) ON DELETE CASCADE,
  chave TEXT NOT NULL,
  versao TEXT,
  substituida_em TIMESTAMPTZ NOT NULL DEFAULT now(),
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS versoes_camada_por_camada ON versoes_camada (camada_id, substituida_em DESC);
