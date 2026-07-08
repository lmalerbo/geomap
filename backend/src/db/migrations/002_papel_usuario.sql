-- Papel do usuário (admin/usuario) — base pro painel de administração
-- (gerenciar camadas, atributos, simbologia). Ver docs/SCHEMA_BANCO.md.

ALTER TABLE usuarios
    ADD COLUMN IF NOT EXISTS papel TEXT NOT NULL DEFAULT 'usuario'
    CHECK (papel IN ('admin', 'usuario'));
