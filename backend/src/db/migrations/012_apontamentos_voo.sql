-- Auditoria de cada apontamento de voo feito pelo mapa do GeoMap (ver
-- docs/INTEGRACAO_DRONEMANAGEMENT.md) -- registro próprio, não reaproveita
-- `logs` (que tem CHECK restrito em `acao` e é só texto livre em
-- `detalhe`; decisão consciente de manter isso separado e estruturado,
-- ver histórico da sessão que criou esta migration).
--
-- `dronemgmt_id` é o id do registro correspondente lá no DroneManagement
-- (não tem FK, é um sistema externo) -- section/talhao ficam duplicados
-- aqui de propósito, pra não depender de uma segunda consulta só pra
-- exibir o que foi apontado.
CREATE TABLE apontamentos_voo (
  id SERIAL PRIMARY KEY,
  usuario_id INTEGER REFERENCES usuarios(id) ON DELETE SET NULL,
  mapa_id INTEGER REFERENCES mapas(id) ON DELETE SET NULL,
  dronemgmt_id UUID NOT NULL,
  secao TEXT NOT NULL,
  talhao TEXT NOT NULL,
  criado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
