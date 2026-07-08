-- Permite remover um mapa mesmo que já tenha logs de download associados
-- (o registro de log é mantido pra auditoria, só perde a referência ao
-- mapa apagado) — necessário pro "remover camada" do painel de admin.

ALTER TABLE logs DROP CONSTRAINT IF EXISTS logs_mapa_id_fkey;
ALTER TABLE logs
    ADD CONSTRAINT logs_mapa_id_fkey FOREIGN KEY (mapa_id) REFERENCES mapas (id) ON DELETE SET NULL;
