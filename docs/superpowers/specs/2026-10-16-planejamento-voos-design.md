# Planejamento de voos no mapa — desenho

Data: 2026-10-16. Pedido do Leo, desenho aprovado na conversa (perguntas e
respostas abaixo, em "Decisões").

## Problema

Toda semana o Leo planeja as regiões a voar. Hoje ele faz isso fora do app:
abre o mapa de voos, desenha retângulos coloridos em volta dos grupos de
talhões pendentes (uma cor por dia), tira prints e manda cada dia no
WhatsApp ("Voos planejados para: Segunda-feira 19/10/2026"). O plano não
fica em lugar nenhum. A equipe não sabe, dentro do GeoMap, o que está
programado para cada dia, nem quanto há em cada região.

## Objetivo

O plano da semana passa a viver no mapa de voos:

- Um administrador desenha um polígono e escolhe a data. O polígono aparece
  com o rótulo do dia (ex.: "Seg 19/10").
- Quem vê o mapa de voos (pilotos e equipe) vê os polígonos de hoje em
  diante, inclusive sem internet.
- Clicar num polígono mostra o resumo do que está pendente dentro dele:
  total de hectares e talhões, hectares por tipo de voo (em sigla) e uma
  linha por fazenda.
- O resumo é sempre atual: talhão apontado sai da conta sozinho.
- No dia seguinte à data, o polígono deixa de aparecer.

Sucesso: o Leo monta a semana no GeoMap, sem prints, e um piloto no campo
abre o mapa de voos e sabe onde voar em cada dia e quanto há em cada região.

## Decisões (da conversa)

| Pergunta | Decisão |
|---|---|
| Onde o plano é usado | Dentro do GeoMap (o WhatsApp vira, no máximo, um aviso) |
| Como marcar a região | Desenhar um polígono; o app pega os talhões pendentes de dentro |
| O que identifica cada grupo | Só o dia (sem turno, piloto ou base) |
| Quem edita | Só administradores; todos que veem o mapa de voos enxergam |
| Título | Uma data, escolhida em calendário; o app escreve o dia da semana |
| Depois do dia | O polígono some sozinho no dia seguinte |
| Como saber os talhões de dentro | Calcular uma vez, ao salvar, e guardar a lista com o polígono |

## Fora do escopo

- Turno, piloto ou base por polígono.
- Editar os cantos de um polígono já salvo (para mudar a forma: apagar e
  desenhar de novo).
- Tela de histórico de planejamentos passados (ficam guardados no banco,
  só não aparecem).
- Gerar imagem ou mensagem para WhatsApp.
- Planejamento em mapas que não são o de voos.
- PostGIS ou qualquer cálculo geométrico no servidor.

## Dados

Tabela nova `planejamentos_voo` (migration 019):

| Coluna | Tipo | Observação |
|---|---|---|
| `id` | uuid, PK | gerado no Node (`crypto.randomUUID()`) |
| `mapa_id` | int, FK `mapas(id)` `ON DELETE CASCADE` | |
| `data` | date | o dia planejado |
| `poligono` | jsonb | GeoJSON `Polygon` (WGS84), anel externo fechado |
| `talhoes` | jsonb | `[{ secao, talhao, fazenda }]`, calculado ao salvar |
| `criado_por` | int, FK `usuarios(id)` | |
| `criado_em`, `atualizado_em` | timestamptz | `default now()` |

Índice em `(mapa_id, data)`.

`talhoes` guarda só a identificação (código da fazenda, número do talhão e
nome da fazenda). Hectares e tipos de voo vêm das pendências no momento de
mostrar, para refletir o que falta de verdade.

## Servidor

Arquivo de rotas novo `backend/src/routes/planejamentos.js`, montado em
`app.js` antes dos routers que aplicam middleware sem prefixo (mesmo
cuidado já registrado para `voosRouter`/`integracaoRouter`).

- `GET /mapas/:mapaId/planejamentos`: exige login e acesso ao mapa
  (`usuarioTemPermissaoMapa`; admin vê qualquer mapa, mesma regra das
  outras rotas de mapa). Devolve os planejamentos com
  `data >= hoje` (hoje no fuso `America/Sao_Paulo`), ordenados por data.
  Mapa sem acesso: 404, como `GET /voos/pendentes`.
- `POST /admin/mapas/:mapaId/planejamentos`: só admin (`exigirAdmin`).
  Corpo `{ data, poligono, talhoes }`. Valida:
  - `data` no formato `AAAA-MM-DD`;
  - `poligono` do tipo `Polygon` com pelo menos 4 posições (3 cantos mais
    o fechamento), coordenadas numéricas dentro de lon -180..180 e
    lat -90..90;
  - `talhoes` como array de `{ secao, talhao, fazenda }`, com no máximo
    2.000 itens.
  Responde 201 com o registro.
- `PUT /admin/planejamentos/:id`: só admin. Altera apenas `data` (mudar a
  forma é apagar e criar de novo). Atualiza `atualizado_em`.
- `DELETE /admin/planejamentos/:id`: só admin. Apaga de verdade.
- Criar, alterar e apagar gravam em `logs` com `acao = 'admin'` e um
  `detalhe` curto (ex.: "planejamento criado: mapa 70, 2026-10-19, 23
  talhões").

A validação fica numa função pura (`backend/src/lib/planejamentoVoo.js`,
`validarPlanejamento(corpo)` devolvendo a mensagem de erro ou `null`), com
teste.

## Frontend

### Módulos puros (com testes)

`frontend/src/lib/planejamentoVoo.js`:

- `pontoNoPoligono([lon, lat], anel)`: ray casting no anel externo.
- `talhoesDentro(pontosRotulo, poligono)`: recebe
  `[{ secao, talhao, lon, lat }]` e devolve os que caem dentro, sem
  repetir a mesma chave `secao-talhao`.
- `resumirPlanejamento(talhoesDoPlano, pendentes)`: cruza as chaves
  `secao-talhao` com as pendências atuais e devolve
  `{ hectares, qtdTalhoes, porTipo: [{ sigla, nome, hectares }],
  porFazenda: [{ fazenda, secao, hectares, siglas }] }`. Hectares somados
  por registro pendente, mesmo critério do painel Voos. Talhão sem
  pendência não conta.
- `SIGLAS_TIPO_VOO`: FP (Falhas Plantio), FS (Falhas Soca), SIS
  (Sistematização), ED (Ervas Daninhas), DA (Drone Aplicação), AMB
  (Ambiental), EA (Experimentação Agrícola), LT (Levantamento
  Topográfico), PP (Projeto Plantio). Tipo desconhecido usa as iniciais.
- `rotuloDia(dataIso)` → "Seg 19/10", e `tituloDia(dataIso)` →
  "Segunda-feira, 19/10".
- `corDoDia(dataIso)`: uma cor fixa por dia da semana (seg..dom), escolhida
  para contrastar com o satélite e com as cores dos tipos de voo.

### Quais talhões estão dentro (ao salvar)

Lido do arquivo `.pmtiles` da camada de voos que já está no IndexedDB,
mesma técnica do índice de busca (`PMTiles.getZxy` + `@mapbox/vector-tile`
+ `pbf`):

- Usa a camada `rotulos` do pipeline, cujos pontos ficam sempre dentro do
  próprio talhão (pole of inaccessibility) e trazem `secao`/`talhao`.
- Lê os tiles que cobrem o retângulo do polígono num zoom fixo
  (`min(header.maxZoom, 13)`). Com `-r1` no pipeline, nenhum rótulo é
  descartado por densidade.
- O nome da fazenda vem da camada principal (`DESC_SECAO`), cruzado por
  `SECAO`/`TALHAO`; sem nome, usa o código da seção.
- Se a camada de voos não tiver a camada `rotulos`, a ferramenta avisa
  ("Esta camada de voos não tem rótulos; publique de novo pelo pipeline")
  e não salva.

### Ferramenta "Planejar" (só admin)

- Item novo na barra de ferramentas (`DockFerramentas`) e na aba
  Ferramentas da gaveta do celular, visível só para `papel === "admin"` e
  só no mapa de voos.
- O desenho reaproveita o jeito da medição de área: clique marca cantos,
  barra de ação no rodapé (`.pilha-acoes`) com "Desfazer ponto",
  "Cancelar" e "Concluir" (a partir de 3 cantos).
- Ao concluir, abre um cartão com a data (calendário, padrão amanhã) e a
  prévia do resumo calculada na hora. Botão "Salvar" (exige internet;
  offline mostra "Precisa de internet para salvar o planejamento").
- Clicar num polígono existente, sendo admin, mostra no cartão do resumo
  as ações "Alterar data" e "Apagar" (com confirmação).

### Exibição (todos)

- Hook novo `usePlanejamentos(mapRef, mapaPronto, voosInfo, mapaId,
  token)`, no estilo de `useApontamentoVoo`: só funciona quando há camada
  de voos.
- Fonte GeoJSON própria com três camadas MapLibre: preenchimento bem leve,
  contorno tracejado (`line-dasharray`) e o rótulo do dia no centro (ponto
  calculado pelo próprio MapLibre a partir do polígono). Cor por dia via
  `corDoDia`. Ficam abaixo das camadas de voos, para não cobrir os
  contornos e os números.
- Clique no polígono abre um cartão no mesmo lugar do painel de atributos
  (`.painel-atributos`/`CartaoPonto`): título "Segunda-feira, 19/10",
  total "86,4 ha · 23 talhões pendentes", linha por tipo
  ("FP 52 ha · FS 30 ha") e uma linha por fazenda ("PEDRA — 40 ha — FP
  FS"). Clique em talhão continua tendo prioridade quando cai sobre um
  talhão pendente (o polígono só abre o resumo fora de talhões
  clicáveis, ou pelo rótulo).
- "Planejamento" entra como item no painel de camadas (liga/desliga), só
  no mapa de voos.

### Sincronização e offline

- Store novo `planejamentos_voo` no IndexedDB (versão 5 → 6), uma entrada
  por mapa: `{ mapaId, itens, salvoEm }`.
- Mesmo padrão das pendências: ao abrir, mostra a cópia do aparelho na
  hora e busca do servidor por trás. Sem sinal, fica com a cópia. Também
  busca de novo na sincronização geral.
- Ao sair da conta, a cópia é apagada junto com as pendências
  (`limparApontamentosLocais`).
- O filtro "de hoje em diante" também roda no aparelho: uma cópia antiga
  não mostra polígono de dia que já passou.

## Erros

- Servidor fora ou sem sinal: o piloto vê a cópia do aparelho; o admin não
  consegue salvar e vê a mensagem.
- Polígono com menos de 3 cantos: "Concluir" fica desativado.
- Polígono sem nenhum talhão dentro: pode salvar (região planejada mesmo
  sem pendência hoje); o resumo mostra "Nenhum talhão pendente nesta área".
- Recusa do servidor (validação): mensagem no cartão, polígono não some do
  desenho.

## Testes

- Backend: `validarPlanejamento` (casos válidos e inválidos); rotas com o
  Postgres local:
  - não admin recebe 403 em POST/PUT/DELETE;
  - GET sem acesso ao mapa recebe 404;
  - GET traz só de hoje em diante;
  - criar/alterar/apagar gravam em `logs`.
- Frontend (vitest): `pontoNoPoligono` (convexo, côncavo, ponto fora),
  `talhoesDentro` (sem repetição), `resumirPlanejamento` (soma, siglas,
  talhão sem pendência fora da conta), `rotuloDia`/`tituloDia`, `corDoDia`.
- Playwright no dev local (banco local preparado e restaurado, pendências
  simuladas):
  - admin desenha, vê a prévia, salva;
  - outro usuário vê o polígono e o resumo;
  - offline, o polígono continua;
  - polígono de data passada não aparece;
  - não admin não vê a ferramenta.

## Execução

Seguindo a regra de delegação do Leo: módulos puros e testes vão para o
executor gratuito; ligação no mapa/admin para o Haiku; revisão, migration
em produção e publicação ficam com o Claude. A migration 019 precisa rodar
no banco de produção (`npm run migrate` com o `.env` de produção) antes de
publicar.
