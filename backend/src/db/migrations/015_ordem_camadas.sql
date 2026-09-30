-- Ordem de exibição das camadas dentro de um mapa (o que fica em cima, o
-- que fica embaixo) — pedido do Leo (2026-09-30). Antes disso não existia
-- nenhum controle: Mapa.jsx aplicava as camadas em ORDER BY nome
-- (alfabética), e a última adicionada acabava por cima (mesma técnica de
-- beforeId que garante rótulo sempre acima de tudo — ver Mapa.jsx).
--
-- Convenção: menor `ordem` = mais acima no mapa (0 = topo), igual a uma
-- lista de camadas de cima pra baixo no admin. Novo default 0 sozinho
-- deixaria toda camada nova empatada no topo — o backfill abaixo dá a
-- cada camada já existente um valor que reproduz EXATAMENTE a ordem visual
-- de hoje (alfabética invertida, já que a última em ORDER BY nome era a
-- que ficava por cima), pra essa migration não mudar nada visualmente até
-- algum admin reordenar de propósito.
ALTER TABLE camadas ADD COLUMN IF NOT EXISTS ordem INTEGER NOT NULL DEFAULT 0;

UPDATE camadas c
SET ordem = ranked.ordem
FROM (
    SELECT id, ROW_NUMBER() OVER (PARTITION BY mapa_id ORDER BY nome DESC) - 1 AS ordem
    FROM camadas
) ranked
WHERE ranked.id = c.id;
