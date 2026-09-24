# Mapa do Preparo — anotações (pins) compartilhadas com edição offline

Data: 2026-09-24 · Status: design aprovado em conversa, aguardando revisão do spec

## Objetivo

Criar o "Mapa do Preparo": uma cópia do mapa **Temático** em que usuários de
grupos autorizados podem **adicionar pins anotados** (ícone, cor, título,
nota) no campo, **inclusive sem internet**, e todos os outros usuários com
acesso ao mapa veem essas anotações (só leitura), também offline depois do
sync.

De carona, uma melhoria geral para **todos os mapas**: clicar fora de
qualquer feição (hoje não faz nada) passa a mostrar a coordenada do ponto
clicado.

## Decisões tomadas (com o Leo)

| Tema | Decisão |
|---|---|
| O que se edita | Só criar/editar/remover **pontos anotados** (não atributos nem geometria de camadas existentes) |
| Visibilidade | Pins são **compartilhados**: todos com acesso ao mapa veem; só editores escrevem. Substitui o `usePins.js` pessoal/local não publicado — não existirão anotações pessoais por aparelho |
| Offline | **Offline completo** para o editor (ele anda no talhão sem sinal) |
| Símbolo | **Catálogo fixo de 15 ícones** da operação de preparo; o editor escolhe ícone + cor + título, e escreve uma nota |
| Metadados | Data/hora e autor gravados automaticamente (criação e última edição) |
| Quem edita | **Por grupo**: permissão mapa×grupo ganha nível "pode anotar". Admin sempre pode |
| Formato da coordenada | **Só graus decimais** (`-21.123456, -47.654321`), com botão copiar |
| Sync | Fila local (outbox) no IndexedDB + API REST idempotente por UUID; a última edição vence |

## Fora de escopo (registrar no ROADMAP)

Foto no pin; exportar pins (KML/CSV); linhas/polígonos anotados; histórico
de versões de um pin; envio com o app fechado (Background Sync API);
anotações pessoais privadas.

## 1. Dados e backend

### Migration 014 (`backend/src/db/migrations/014_pins_anotacoes.sql`)

1. `ALTER TABLE permissoes ADD COLUMN pode_editar BOOLEAN NOT NULL DEFAULT false`
   — todas as permissões existentes ficam só-leitura.
2. Tabela `pins`:

| coluna | tipo | observação |
|---|---|---|
| `id` | `UUID PRIMARY KEY` | gerado no aparelho (`crypto.randomUUID()`) |
| `mapa_id` | `INTEGER NOT NULL REFERENCES mapas(id) ON DELETE CASCADE` | |
| `icone` | `TEXT NOT NULL` | chave do catálogo; backend valida contra a lista fixa |
| `cor` | `TEXT NOT NULL` | `#rrggbb`, validado por regex |
| `titulo` | `TEXT NOT NULL` | até 120 caracteres |
| `nota` | `TEXT NOT NULL DEFAULT ''` | até 2000 caracteres |
| `lng`, `lat` | `DOUBLE PRECISION NOT NULL` | validados (-180..180, -90..90) |
| `criado_por`, `atualizado_por` | `INTEGER REFERENCES usuarios(id) ON DELETE SET NULL` | |
| `criado_em`, `atualizado_em` | `TIMESTAMPTZ NOT NULL` | hora **do aparelho** no momento da ação |
| `removido_em` | `TIMESTAMPTZ NULL` | remoção lógica (hora do aparelho) |
| `recebido_em` | `TIMESTAMPTZ NOT NULL DEFAULT now()` | hora do servidor da última escrita aceita; base do sync incremental |

   Índice em `(mapa_id, recebido_em)`.
3. `logs.acao`: acrescentar `'anotacao'` ao `CHECK` (mesmo padrão da
   migration 007), com `detalhe` descrevendo a operação
   (`criar|editar|remover pin <uuid> "<titulo>"`).

Documentar em `docs/SCHEMA_BANCO.md`.

### Regra de permissão

- **Ler pins de um mapa**: mesma regra de hoje para ver o mapa (algum grupo
  do usuário em `permissoes` do mapa), ou admin.
- **Editar pins de um mapa**: algum grupo do usuário com
  `permissoes.pode_editar = true` naquele mapa, ou `papel = 'admin'`.
- Helper `usuarioPodeEditarMapa(usuarioId, mapaId, papel)` em módulo
  compartilhado (hoje `usuarioTemPermissaoMapa` vive duplicado em `voos.js`;
  mover ambos para `backend/src/lib/permissoes.js`).

### Rotas novas (`backend/src/routes/pins.js`, montadas com `exigirAutenticacao`)

- `GET /mapas/:id/pins?desde=<ISO>` — exige leitura. Retorna
  `{ pins: [...], agora: <ISO do servidor> }` com todos os pins do mapa cujo
  `recebido_em > desde` (sem `desde`: todos), **incluindo removidos**
  (`removidoEm` preenchido) para o cliente apagar a cópia local. O cliente
  guarda `agora` como próximo `desde`.
- `PUT /mapas/:id/pins/:uuid` — exige edição. Corpo:
  `{icone, cor, titulo, nota, lng, lat, criadoEm, atualizadoEm}`. Upsert:
  - não existe → insere (`criado_por = atualizado_por = usuário`).
  - existe e `removido_em` preenchido → não altera; responde `200` com a
    versão do servidor (pin removido não ressuscita).
  - existe e `atualizadoEm` recebido **<=** `atualizado_em` do servidor →
    não altera; responde `200` com a versão do servidor.
  - senão → atualiza campos, `atualizado_por`, `atualizado_em`,
    `recebido_em = now()`.
  - pin existente pertencente a **outro** `mapa_id` → `409`.
  Resposta sempre `200 { pin }` com o estado final no servidor.
- `DELETE /mapas/:id/pins/:uuid` — exige edição. Corpo/query
  `removidoEm`. Se já removido ou inexistente → `200` (idempotente). Senão
  preenche `removido_em`, `atualizado_por`, `recebido_em = now()`.
- Logs `'anotacao'` gravados só quando a escrita foi de fato aplicada.

### Mudanças em rotas existentes

- `GET /mapas`: cada mapa ganha `podeEditar: boolean`.
- `GET /admin/mapas`, `POST /admin/mapas`, `PUT /admin/mapas/:id`: além de
  `grupoIds`, aceitam/retornam `permissoes: [{grupoId, podeEditar}]`.
  `grupoIds` puro continua aceito (equivale a `podeEditar: false`).
- `POST /admin/mapas/:id/duplicar`: copia `pode_editar` das permissões;
  **não** copia pins.
- JWT/login inalterados (permissão de edição é por mapa, vem em `GET /mapas`).

## 2. Sincronização offline (frontend)

### IndexedDB (`frontend/src/lib/db.js`)

Store `pins` (versão 4 do banco, ainda não publicada — pode ser redefinida
sem migração de dados) com `keyPath: "id"`, índice `porMapa`. Registro:

```
{ id, mapaId, icone, cor, titulo, nota, lng, lat,
  criadoPor, criadoPorNome, atualizadoPor, atualizadoPorNome,
  criadoEm, atualizadoEm, removidoEm,
  pendente: null | "salvar" | "remover" }
```

Store novo `pins_cursor` (`keyPath: "mapaId"`, `{mapaId, desde}`), criado
na mesma versão 4 — separado do registro de mapa para não misturar com o
sync de camadas. Nomes de autor
vêm do backend (JOIN com `usuarios`) para exibição offline.

### Escrita local (editor)

Criar/editar/remover grava imediatamente no IndexedDB com `pendente`
marcado e atualiza o mapa na hora (remoção pendente = some do mapa e da
lista, mas o registro fica até o envio). Depois dispara o envio.

### Envio (`frontend/src/lib/syncPins.js`, novo)

`enviarPendentes()` percorre registros com `pendente`, em ordem de
`atualizadoEm`, chamando `PUT`/`DELETE`:
- sucesso → grava a versão retornada pelo servidor, `pendente = null`
  (se o servidor recusou por ser mais antigo, a versão do servidor
  prevalece localmente).
- erro de rede / 5xx → mantém, tenta depois.
- `403` → descarta a alteração local (restaura com o próximo recebimento) e
  mostra toast "Você não tem mais permissão para anotar neste mapa".
- `409`/`400` → descarta e mostra toast com o motivo.
Proteção contra execução concorrente (uma execução por vez).

Gatilhos: após cada escrita local; evento `online`; junto ao sync de
camadas existente (`sync.js`, na abertura do app e ao reconectar).

### Recebimento (todos os usuários)

No mesmo ciclo do sync de camadas, para cada mapa permitido:
`GET /mapas/:id/pins?desde=<cursor>`, aplicado no IndexedDB (upsert; se
`removidoEm`, apaga o registro local). **Registro local com `pendente` não
é sobrescrito.** Sempre envia pendentes **antes** de receber.

### Estado visível

- Pin pendente desenhado com indicador (anel tracejado / ponto).
- Cabeçalho, junto ao status de sync: "N anotações aguardando envio".
- Logout com pendentes: confirmação explícita avisando que serão descartadas.

### Limitações aceitas

- "Última edição vence" usa relógio do aparelho; relógio errado pode fazer
  uma edição perder. Risco baixo (poucos editores por mapa).
- Sem merge campo a campo entre duas edições concorrentes.

## 3. Interface

### A. Coordenada em qualquer clique (todos os mapas)

- Clique fora de qualquer feição consultável → cartão "Ponto selecionado"
  (marcador no local + `lat, lng` em graus decimais com 6 casas + botão
  copiar, copia `"-21.123456, -47.654321"`).
- Clique numa feição → painel de atributos atual ganha, no rodapé, a
  coordenada do ponto clicado com o mesmo botão copiar.
- Respeita a regra existente de no máximo 1 cartão aberto por vez.
- Não interfere em medição, track ou apontamento de voo (esses modos
  continuam capturando o clique como hoje).

### B. Ferramentas do editor (mapa com `podeEditar`)

- Botão "Anotar" no grupo de controles da direita (mesmo padrão
  `MedicaoControl`/track). Ativa uma barra com:
  - "Tocar no mapa": cursor mira, próximo toque (sobre feição ou não) cria o pin.
  - "Na minha localização": `getCurrentPosition` de alta precisão, mostra
    `±N m`; se precisão > 30 m, pede confirmação antes de gravar.
- Cartão "Ponto selecionado" ganha "Adicionar pin aqui" para editores.
- Formulário do pin: grade dos 15 ícones com nome; cor (paleta de 8 +
  seletor livre); título (pré-preenchido com o nome do ícone); nota
  (textarea). Salvar / Cancelar.
- Modo anotar e modo medição são mutuamente exclusivos (idem track-apontamento).

### C. Cartão do pin (todos)

Ícone, título, nota, coordenada + copiar, "Criado por X em dd/mm hh:mm"
(+ "editado por Y em …" se diferente). Editor vê: Editar, Mover (arrastar
o pin até o novo local e confirmar/cancelar), Remover (com confirmação).

### D. Painel de camadas, legenda, busca

- "Anotações (N)" como entrada do painel de camadas, com liga/desliga;
  só aparece se o mapa tiver pins ou o usuário puder editar.
- Legenda lista os ícones em uso no mapa.
- Busca do mapa inclui título e nota dos pins (resultado leva ao pin).

### E. Admin — Gerenciar mapas

Ao lado de cada grupo marcado, caixa "pode anotar".

## 4. Catálogo de ícones

`frontend/src/lib/iconesPreparo.js` exporta a lista ordenada
`[{chave, nome, svg}]` (fonte única; backend mantém só a lista de chaves
válidas em `backend/src/lib/iconesPreparo.js`).

| chave | nome |
|---|---|
| `pedra` | Pedra |
| `toco` | Toco / raiz |
| `erosao` | Erosão / voçoroca |
| `alagamento` | Área alagada |
| `formigueiro` | Formigueiro |
| `cupinzeiro` | Cupinzeiro |
| `curva_nivel` | Curva de nível danificada |
| `carreador` | Carreador / estrada |
| `cerca` | Cerca |
| `rede_eletrica` | Rede elétrica / poste |
| `tubulacao` | Tubulação / irrigação |
| `compactacao` | Compactação do solo |
| `mato` | Mato / planta daninha |
| `maquina` | Máquina / implemento |
| `observacao` | Observação geral |

Desenho: pictograma de traço uniforme em branco, dentro de um pin em gota
preenchido com a cor escolhida (contorno escuro fino para contraste em
fundo satélite). Renderização no mapa: para cada combinação `icone+cor`
em uso, desenhar o SVG num canvas (tamanho em `devicePixelRatio`) e
registrar com `map.addImage("pin-<chave>-<hex>")` sob demanda (evento
`styleimagemissing`). Não usa SDF (ícone bicolor). Uma prancha com os 15
ícones será aprovada pelo Leo antes da integração no mapa.

## 5. Reaproveitamento

`frontend/src/hooks/usePins.js` (não commitado) vira a base do hook final:
`forma→icone`, `nome/legenda→titulo/nota`, escrita via fila + `pendente`,
gating por `podeEditar`, camada renderizada com os ícones do catálogo.
`CORES_FERRAMENTAS.pinPadrao` mantido como cor inicial.

## 6. Testes

- **Backend** (Postgres local isolado, skill `verify` — nunca produção):
  leitura permitida/negada; edição permitida (grupo com `pode_editar`,
  admin) e negada (grupo só leitura, sem grupo); `PUT` idempotente;
  edição mais antiga ignorada; pin removido não ressuscita; `DELETE`
  idempotente; `?desde=` devolve só alterados e inclui removidos; `409`
  com mapa trocado; duplicar mapa copia `pode_editar` e não copia pins;
  log `'anotacao'` gravado.
- **Frontend** (Playwright, build de produção + servidor estático):
  editor cria pin online e offline (`setOffline`), indicador de pendente,
  reconecta e envia; leitor vê o pin após sync, inclusive offline; leitor
  não vê ferramentas; editar/mover/remover; clique fora de feição mostra
  coordenada e copiar funciona; logout com pendentes pede confirmação.
- Limpeza obrigatória de todo dado criado pelos testes.

## 7. Implantação

1. Publicar backend (migration 014) e frontend. **Não fazer push enquanto a
   automação diária estiver rodando** (lição de 2026-08-18).
2. Com o ok do Leo, em produção: Duplicar "Temático" → renomear
   "Mapa do Preparo" → marcar "pode anotar" no grupo do editor.
3. Atualizar `CLAUDE.md`, `docs/ROADMAP.md`, `docs/SCHEMA_BANCO.md`.
