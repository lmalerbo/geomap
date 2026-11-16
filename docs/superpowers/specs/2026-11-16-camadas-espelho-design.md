# Camadas Espelho (Sincronização Automática entre Mapas) — Desenho

Data: 2026-11-16.

## Objetivo

Permitir que camadas duplicadas ou copiadas entre mapas (ex.: **Talhões** e **Limites** presentes em *Geral*, *Temático*, *Irrigação*, *ICOL*, *Plantio Excedente*, etc.) acompanhem automaticamente as atualizações da camada de referência, sem precisar registrar manualmente novos IDs no arquivo `mapeamento-camadas.json` da automação no servidor geo nem dar `git push` a cada novo mapa criado.

Sucesso:
1. O admin duplica uma camada ou vincula uma camada existente a uma camada de origem.
2. Quando a camada de origem for atualizada (seja pela automação FME das 08:05 ou por envio manual no admin), todas as camadas espelho recebem o novo arquivo e versão automaticamente.
3. Cada camada espelho mantém seu próprio estilo, simbologia e visibilidade de atributos de forma independente.

---

## Decisões Técnicas

1. **Vínculo via coluna no banco (`origem_id`)**:
   - Tabela `camadas` ganha `origem_id INT REFERENCES camadas(id) ON DELETE SET NULL`.
   - `origem_id IS NULL` = camada independente.
   - `origem_id IS NOT NULL` = camada espelho.
   - Não permite auto-referência (`CHECK (origem_id <> id)`) nem encadeamento de múltiplos níveis (um espelho não pode ser espelho de outro espelho; aponta sempre para a origem raiz).

2. **Isolamento de arquivos no Storage (Cloudflare R2)**:
   - Cada camada espelho continua tendo sua própria chave no bucket (`arquivo_path`), copiada server-side no R2 via `duplicarArquivo(origem, novoDestino)`.
   - **Por que não apontar para a mesma chave?** Porque restaurar versão, excluir uma camada ou fazer rollback em uma camada não pode afetar ou corromper os arquivos das outras. Cópia server-side no R2 é instantânea e sem tráfego de rede.

3. **Propagação automática em background**:
   - Ao concluir a conversão de um novo arquivo em `processarAtualizacaoEmSegundoPlano` (ou ao restaurar versão), o backend busca todas as camadas com `WHERE origem_id = $camadaId`.
   - Para cada espelho:
     - Cria backup da versão atual em `versoes_camada`.
     - Duplica o novo `.pmtiles` no R2 para uma nova chave.
     - Apaga o `.pmtiles` antigo do espelho.
     - Atualiza `arquivo_path` e `versao` no banco.
     - Grava log de auditoria administrativa.

4. **Herança de arquivo vs. Independência de estilo**:
   - Apenas o **arquivo vetorial (`.pmtiles`) e a versão** são propagados.
   - `estilo_config` (cores, modo categorizado/graduado, contornos) e `atributos_config` (visibilidade/ordem de campos) permanecem próprios de cada mapa, permitindo que mapas temáticos customizem sua visualização sobre a mesma base geográfica.

5. **Proteção contra upload acidental em espelho**:
   - Uma camada com `origem_id != null` rejeita uploads manuais diretos (`PUT /admin/camadas/:id/arquivo` retorna 400).
   - O admin deve clicar explicitamente em "Desvincular espelho" se desejar transformá-la em uma camada manual independente.

6. **Facilidade na Duplicação**:
   - Ao duplicar uma camada via `POST /admin/camadas/:id/duplicar`, o corpo aceita `{ manterEspelho: true }`. O padrão na UI passa a ser um checkbox marcado para manter a cópia sincronizada.

7. **Visão Geral e Saúde da Automação**:
   - Camadas com `origem_id` apontando para camadas da automação são reconhecidas no resumo de saúde (`saudeAutomacao.js`) como espelhos sincronizados.

---

## Modelo de Dados (Migration 022)

```sql
-- Migration 022: Camadas espelho (sincronização automática entre mapas)
ALTER TABLE camadas
  ADD COLUMN IF NOT EXISTS origem_id INT REFERENCES camadas(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_camadas_origem_id ON camadas(origem_id);

ALTER TABLE camadas
  ADD CONSTRAINT chk_camadas_origem_nao_recursiva
  CHECK (origem_id IS NULL OR origem_id <> id);
```

---

## Endpoints e Rotas

1. `GET /admin/camadas`:
   - Retorna também `origem_id`, e opcionalmente o nome e mapa da origem para conveniência da UI.
2. `PUT /admin/camadas/:id`:
   - Aceita `origemId: number | null`.
   - Se vincular (`origemId` válido): copia imediatamente o arquivo atual e versão da origem para a camada espelho.
   - Se desvincular (`origemId: null`): remove a referência e mantém o último arquivo baixado.
3. `POST /admin/camadas/:id/duplicar`:
   - Aceita `manterEspelho: boolean`. Se verdadeiro, grava `origem_id = camadaId`.
4. `PUT /admin/camadas/:id/arquivo`:
   - Bloqueia envio com 400 se `origem_id != null`.
