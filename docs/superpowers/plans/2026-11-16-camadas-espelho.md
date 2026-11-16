# Camadas Espelho — Plano de Implementação

> **Meta:** Implementar a funcionalidade de Camadas Espelho (Camadas Vinculadas) no GeoMap, permitindo que cópias de camadas em diferentes mapas acompanhem automaticamente as atualizações da camada original.

**Spec:** `docs/superpowers/specs/2026-11-16-camadas-espelho-design.md`

---

## Tarefas

### Task 1: Migration 022 (Banco de Dados)
- [ ] Criar `backend/src/db/migrations/022_camadas_espelho.sql` com:
  - Adição da coluna `origem_id INT REFERENCES camadas(id) ON DELETE SET NULL`
  - Índice `idx_camadas_origem_id`
  - Constraint `chk_camadas_origem_nao_recursiva`
- [ ] Atualizar `docs/SCHEMA_BANCO.md` com a nova coluna e documentação.

### Task 2: Backend — Propagação e Rotas Administrativas
- [ ] Atualizar `GET /admin/camadas` para retornar `origem_id`.
- [ ] Implementar função auxiliar `propagarAtualizacaoParaEspelhos(origemId, novoArquivoPath, novaVersao, usuarioId)`:
  - Busca todos os registros com `WHERE origem_id = $1`.
  - Para cada espelho:
    - Salva versão anterior em `versoes_camada`.
    - Duplica arquivo no R2 via `duplicarArquivo`.
    - Atualiza `arquivo_path` e `versao` no banco.
    - Remove o arquivo antigo do espelho no R2.
    - Registra log de auditoria.
- [ ] Integrar `propagarAtualizacaoParaEspelhos` em `processarAtualizacaoEmSegundoPlano` (após atualizar a camada-mãe).
- [ ] Integrar propagação opcional/sincronizada na restauração de versão (`POST /admin/camadas/:id/versoes/:versaoId/restaurar`).
- [ ] Atualizar `PUT /admin/camadas/:id/arquivo`:
  - Se a camada possui `origem_id != null`, recusar com status 400 e mensagem explicativa.
- [ ] Atualizar `PUT /admin/camadas/:id`:
  - Permitir atualizar `origemId`:
    - Se informado um id válido: validar se não cria ciclo, gravar `origem_id`, copiar imediatamente o arquivo e versão atuais da origem para o espelho.
    - Se informado `null`: desvincular a camada (`origem_id = NULL`).
- [ ] Atualizar `POST /admin/camadas/:id/duplicar`:
  - Aceitar `manterEspelho: boolean`. Se `true`, a camada criada recebe `origem_id = camadaId`.

### Task 3: Backend — Saúde da Automação e Visão Geral
- [ ] Atualizar `backend/src/routes/admin.js` na rota `GET /admin/visao-geral` para incluir `c.origem_id AS "origemId"`.
- [ ] Atualizar `backend/src/lib/saudeAutomacao.js` para que camadas com `origemId` apontando para camadas da automação sejam reconhecidas como espelhos sincronizados.

### Task 4: Frontend — Chamadas de API
- [ ] Atualizar `frontend/src/lib/api.js`:
  - `vincularCamadaEspelhoAdmin(token, camadaId, origemId)`
  - `desvincularCamadaEspelhoAdmin(token, camadaId)`
  - Suporte a `manterEspelho` em `duplicarCamadaAdmin`.

### Task 5: Frontend — UI em AdminCamadas.jsx
- [ ] Na lista lateral de camadas:
  - Exibir ícone ou selo sutil indicando quando a camada é um espelho.
- [ ] Na aba "Arquivo e nome":
  - Se a camada for espelho (`origem_id != null`):
    - Exibir banner explicativo: camada vinculada à origem X (Mapa Y), versão sincronizada.
    - Ocultar/bloquear upload manual com aviso explicativo.
    - Botão "Desvincular espelho" (com confirmação e retorno animado via `useOcupado`).
  - Se a camada não for espelho:
    - Seletor "Acompanhar camada de outro mapa" permitindo selecionar outra camada compatível e botão "Vincular como espelho".
- [ ] Na linha "Duplicar camada":
  - Adicionar checkbox: "Manter sincronizada como espelho desta camada" (marcado por padrão).

### Task 6: Testes e Validação
- [ ] Escrever testes unitários em `backend/test/camadas-espelho.test.js`.
- [ ] Validar comportamento de propagação, validação de ciclo e bloqueio de upload em camadas espelho.
- [ ] Registrar atualização no `CLAUDE.md`.
