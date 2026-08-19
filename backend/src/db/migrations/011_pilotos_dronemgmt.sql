-- Mapeamento entre usuário do GeoMap e a identidade dele no DroneManagement
-- (integração de apontamento de voo pelo mapa, ver
-- docs/INTEGRACAO_DRONEMANAGEMENT.md). A chamada HTTP em si é sempre
-- autenticada por uma conta de serviço única (backend/src/lib/dronemgmt.js),
-- mas o campo `pilotUserADId` do registro no DroneManagement é
-- independente de quem autenticou a chamada -- essa tabela deixa gravar o
-- piloto de verdade, não a conta de serviço.
--
-- Só usuários que também são piloto lá dentro ganham uma linha; sem linha,
-- o endpoint de apontamento recusa com 400 (ver POST /voos/apontamentos)
-- em vez de gravar um pilotUserADId errado ou nulo. Sem UI de admin na v1
-- (poucos pilotos) -- cadastro manual via SQL é uma decisão consciente,
-- não um esquecimento.
CREATE TABLE pilotos_dronemgmt (
  usuario_id INTEGER PRIMARY KEY REFERENCES usuarios(id) ON DELETE CASCADE,
  pilot_user_ad_id UUID NOT NULL
);
