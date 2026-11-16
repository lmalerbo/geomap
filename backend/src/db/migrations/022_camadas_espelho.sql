-- Camadas espelho: uma camada pode acompanhar outra (origem_id), recebendo
-- automaticamente o arquivo e a versão quando a origem for atualizada.
-- migrate.js aplica cada arquivo uma vez; IF NOT EXISTS deixa rodar de novo sem erro.
ALTER TABLE camadas
    ADD COLUMN IF NOT EXISTS origem_id INTEGER REFERENCES camadas (id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_camadas_origem_id ON camadas (origem_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_camadas_origem_nao_recursiva'
    ) THEN
        ALTER TABLE camadas
            ADD CONSTRAINT chk_camadas_origem_nao_recursiva
            CHECK (origem_id IS NULL OR origem_id <> id);
    END IF;
END $$;