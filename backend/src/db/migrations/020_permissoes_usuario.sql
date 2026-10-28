-- Acesso individual por mapa, gerenciado pelo Hub (tela Usuários). Soma ao dos
-- grupos e só acrescenta: quem consulta faz bool_or sobre permissoes_efetivas.
-- migrate.js aplica cada arquivo uma vez; IF NOT EXISTS / OR REPLACE deixam
-- rodar de novo sem erro.
CREATE TABLE IF NOT EXISTS permissoes_usuario (
    usuario_id INTEGER NOT NULL REFERENCES usuarios (id) ON DELETE CASCADE,
    mapa_id INTEGER NOT NULL REFERENCES mapas (id) ON DELETE CASCADE,
    pode_editar BOOLEAN NOT NULL DEFAULT false,
    PRIMARY KEY (usuario_id, mapa_id)
);

CREATE OR REPLACE VIEW permissoes_efetivas AS
    SELECT ug.usuario_id, p.mapa_id, p.pode_editar
      FROM permissoes p
      JOIN usuarios_grupos ug ON ug.grupo_id = p.grupo_id
    UNION ALL
    SELECT usuario_id, mapa_id, pode_editar
      FROM permissoes_usuario;
