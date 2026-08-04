-- Permite remover um usuário mesmo que já tenha logs associados (login/
-- download/admin) -- mesmo princípio da migration 005 pra mapa_id: o log
-- é mantido pra auditoria, só perde a referência ao usuário apagado.
-- Precisa soltar o NOT NULL antes (era obrigatório desde o schema
-- original), senão o SET NULL do ON DELETE violaria a própria coluna.
ALTER TABLE logs ALTER COLUMN usuario_id DROP NOT NULL;
ALTER TABLE logs DROP CONSTRAINT IF EXISTS logs_usuario_id_fkey;
ALTER TABLE logs
    ADD CONSTRAINT logs_usuario_id_fkey FOREIGN KEY (usuario_id) REFERENCES usuarios (id) ON DELETE SET NULL;
