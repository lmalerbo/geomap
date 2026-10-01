-- Cache dos registros do DroneManagement usados pelos indicadores de voo
-- (página /indicadores e API do agente de apresentação — ver
-- docs/superpowers/specs/2026-10-01-indicadores-voo-design.md). Uma linha
-- por conjunto: 'realizados' (Verificar porte = Voado) e 'pendentes'
-- (mesma regra do mapa de Voos). Tabela própria em vez de reusar
-- voos_pendentes_cache, que é por mapa_id (com FK).
--
-- registros = { versao, itens } — versao muda quando o formato enxuto ou a
-- regra de pendentes muda, e aí o cache conta como vencido.
CREATE TABLE IF NOT EXISTS indicadores_voo_cache (
  chave TEXT PRIMARY KEY,
  count_dronemgmt INTEGER NOT NULL,
  registros JSONB NOT NULL,
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT now()
);
