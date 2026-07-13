-- A tabela "mapas" original na verdade sempre representou camadas
-- individuais (Talhões, Limites, etc) — um mapa de verdade (o
-- agrupamento por fazenda/projeto que aparece na tela inicial) passa
-- a existir por cima dela. Permissão por grupo sobe de nível: agora
-- vale pro mapa inteiro, não mais por camada individual.
--
-- Guardado num único DO $$ ... END $$ checando se "camadas" ainda não
-- existe — migrate.js roda todos os .sql sempre (sem tabela de
-- controle de versão), então essa migração precisa ser idempotente
-- sozinha: na primeira vez faz a transformação inteira, nas próximas
-- não faz nada.

DO $$
BEGIN
  IF to_regclass('public.camadas') IS NULL THEN

    ALTER TABLE mapas RENAME TO camadas;

    CREATE TABLE mapas (
        id SERIAL PRIMARY KEY,
        nome TEXT NOT NULL,
        descricao TEXT,
        criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
    );

    ALTER TABLE camadas ADD COLUMN mapa_id INTEGER REFERENCES mapas (id);

    -- Backfill: cria os mapas iniciais e associa as camadas
    -- existentes por nome. "Sem projeto" é rede de segurança — não
    -- deveria sobrar nenhuma camada sem bater com os nomes acima,
    -- mas evita a migração falhar no SET NOT NULL se sobrar.
    INSERT INTO mapas (nome, descricao) VALUES
        ('Usina da Pedra', 'Talhões e limites da Usina da Pedra'),
        ('Projeto restrito (teste)', 'Mapa fake usado pra testar permissão por grupo'),
        ('Sem projeto', 'Camadas antigas não migradas automaticamente');

    UPDATE camadas SET mapa_id = (SELECT id FROM mapas WHERE nome = 'Usina da Pedra')
        WHERE nome IN (
            'Talhões — Pedra',
            'Limites — Pedra',
            'Talhões — Fazenda Fictícia (dado fake)'
        );

    UPDATE camadas SET mapa_id = (SELECT id FROM mapas WHERE nome = 'Projeto restrito (teste)')
        WHERE nome = 'Mapa restrito — Diretoria (dado fake)';

    UPDATE camadas SET mapa_id = (SELECT id FROM mapas WHERE nome = 'Sem projeto')
        WHERE mapa_id IS NULL;

    ALTER TABLE camadas ALTER COLUMN mapa_id SET NOT NULL;

    -- Permissões: hoje (mapa_id -> camada, grupo_id); passa a ser
    -- (mapa_id -> mapa de verdade, grupo_id), preenchida agrupando
    -- as permissões antigas de cada camada pelo mapa dela.
    CREATE TABLE permissoes_novo (
        mapa_id INTEGER NOT NULL REFERENCES mapas (id) ON DELETE CASCADE,
        grupo_id INTEGER NOT NULL REFERENCES grupos (id) ON DELETE CASCADE,
        PRIMARY KEY (mapa_id, grupo_id)
    );
    INSERT INTO permissoes_novo (mapa_id, grupo_id)
        SELECT DISTINCT c.mapa_id, p.grupo_id
        FROM permissoes p
        JOIN camadas c ON c.id = p.mapa_id;
    DROP TABLE permissoes;
    ALTER TABLE permissoes_novo RENAME TO permissoes;

    -- logs.mapa_id sempre foi, na prática, "qual camada foi baixada"
    -- — renomeia pra refletir isso.
    ALTER TABLE logs RENAME COLUMN mapa_id TO camada_id;
    ALTER TABLE logs DROP CONSTRAINT IF EXISTS logs_mapa_id_fkey;
    ALTER TABLE logs ADD CONSTRAINT logs_camada_id_fkey
        FOREIGN KEY (camada_id) REFERENCES camadas (id) ON DELETE SET NULL;

  END IF;
END $$;
