# Plantio Excedente — desenho

Data: 2026-10-30. Subprojeto 1 de 2 (o 2º, Áreas Compromissadas, terá spec
próprio).

## Objetivo

Controlar os talhões em que o plantio pode ter passado do limite permitido.
Todo talhão voado de Falhas Plantio (FLP) na safra entra num mapa próprio
para análise:

- **amarelo** — aguardando análise;
- **vermelho** — o analista apontou que precisa de ajuste;
- **verde** — o analista apontou que não precisa de ajuste, ou o gestor
  apontou que o ajuste foi feito em campo.

Sucesso: o analista percorre os amarelos e classifica cada um; o gestor vê
os vermelhos, vai a campo (muitas vezes sem sinal) e conclui; qualquer
pessoa com acesso ao mapa vê a situação de cada talhão e o histórico de
quem fez o quê.

## Decisões (com o Leo)

- Entram os voos FLP **da safra atual em diante** (a partir de
  01/04/2026). Histórico anterior fica de fora.
- "Voado" = mesma regra dos Indicadores: Verificar porte 9 no
  DroneManagement, data do voo no fuso de Brasília. Voos de fornecedor
  também entram (o cartão mostra "fornecedor").
- Cada **voo** é um caso de análise, identificado pelo id do voo no
  DroneManagement. O mesmo talhão voado em duas safras gera dois casos.
- **Sem separação de papéis**: quem tem `pode_editar` no mapa (admin
  sempre) pode analisar e concluir. Quem não tem vê tudo só para leitura.
- **Todos os apontamentos funcionam offline** (fila no aparelho).
- Ao apontar, além de status/quem/quando, registra-se: área excedente
  estimada (ha), observação, desenho do trecho excedente e, ao concluir, a
  data real do ajuste. Nenhum desses campos é obrigatório.
- "Sem ajuste" e "ajustado" são os dois verdes, mas "ajustado" leva um ✓
  no rótulo do talhão para não perder a diferença.
- Abordagem escolhida: **tabela própria no banco, alimentada pelo
  DroneManagement via ponte** (não consultar o DroneManagement a cada
  abertura, nem uma automação nova no servidor geo).

## Fora do escopo (etapa 2)

Janela de ajuste: data prevista de corte ou de retirada de muda de cada
talhão, vinda de planilhas na rede (formato ainda em estudo). O caso já
reserva o campo `janela_ajuste` (jsonb, nulo por enquanto) e o cartão terá
o espaço para mostrá-la. Lista/exportação dos vermelhos também fica fora
por ora.

## Modelo de dados

Migration nova (próximo número livre em `backend/migrations/`).

**`mapas.tipo`** (texto, nulo = mapa comum). `'excedente'` marca o mapa de
Plantio Excedente — sem id fixo no código.

**`analises_excedente`** — uma linha por voo FLP:

| coluna | tipo | nota |
|---|---|---|
| `id` | uuid | gerado no Node |
| `mapa_id` | int FK `mapas` | |
| `voo_id` | texto | id do voo no DroneManagement, `UNIQUE (mapa_id, voo_id)` |
| `secao`, `talhao`, `fazenda` | texto | do voo |
| `fornecedor` | bool | propriedade com "FORNEC" |
| `data_voo` | date | fuso de Brasília |
| `status` | texto | `aguardando` \| `precisa_ajuste` \| `sem_ajuste` \| `ajustado` |
| `area_excedente_ha` | numeric | nulo |
| `observacao` | texto | nulo |
| `poligono_excedente` | jsonb | GeoJSON, nulo |
| `data_ajuste` | date | nulo |
| `voo_cancelado` | bool | default false |
| `janela_ajuste` | jsonb | etapa 2, nulo |
| `atualizado_em` | timestamptz | `feito_em` do último apontamento aplicado |
| `atualizado_por` | int FK `usuarios` | |
| `criado_em` | timestamptz | |

**`historico_excedente`** — uma linha por apontamento recebido:
`id`, `analise_id`, `usuario_id`, `feito_em` (hora no aparelho),
`recebido_em`, `status_anterior`, `status_novo`, `campos` (jsonb com o que
mudou), `substituido` (bool — apontamento mais antigo que o já aplicado).

## Backend

- **Regra de seleção** numa função pura (`lib/casosExcedente.js`, com
  teste): dado o retorno do DroneManagement, devolve os voos FLP com porte
  9 e data do voo ≥ início da safra atual, marcando fornecedor. Reaproveita
  a busca paginada de `lib/consultaDroneMgmt.js` e o critério de "voado"
  de `lib/indicadoresVoo.js`.
- **`GET /mapas/:id/excedente`** (quem vê o mapa): devolve os casos e o
  histórico. Antes de responder, se a última conferência tem mais de
  2 minutos, busca os voos FLP pela ponte e insere os casos novos como
  `aguardando` (`INSERT ... ON CONFLICT DO NOTHING` — caso existente nunca
  é sobrescrito). Voo que sumiu da lista por ter sido cancelado marca
  `voo_cancelado = true`; o caso não é apagado. Falha da ponte não impede
  a resposta: devolve os casos conhecidos com `atualizacao: 'falhou'`.
- **`POST /mapas/:id/excedente/apontamentos`** (exige `pode_editar` ou
  admin): lote de `{caso_id, status, campos, feito_em, id_apontamento}`.
  Para cada item grava o histórico; aplica no caso só se `feito_em` for
  mais recente que `atualizado_em` (senão o histórico fica com
  `substituido = true`). `id_apontamento` (uuid do aparelho) torna o
  reenvio idempotente. Responde por item: aplicado, substituído ou recusado
  com motivo.
- Transições permitidas: `aguardando → precisa_ajuste | sem_ajuste`;
  `precisa_ajuste → ajustado`; qualquer status → `aguardando`
  ("Reabrir"). Outra transição é recusada com motivo.
- A auditoria é o próprio `historico_excedente`; os apontamentos não
  gravam em `logs`.

## Frontend

- **Mapa**: mapa comum com Talhões e Limites, criado pelo admin;
  `tipo = 'excedente'` ativa a camada de casos sobre Talhões, pintada por
  status pela chave SECAO+TALHAO (mesma técnica de coloração da camada de
  voos). Talhão sem caso fica normal. "Ajustado" ganha ✓ no rótulo.
  Trecho desenhado: hachura vermelha enquanto o caso está vermelho, só
  contorno depois de concluído.
- **Painel "Excedente"** (barra de ferramentas no desktop, 1ª aba da
  gaveta no celular), no padrão do `PainelVoos`: contadores por status,
  chips de filtro e a fila do aparelho. Aviso discreto quando
  `atualizacao: 'falhou'` ("não foi possível buscar voos novos agora").
- **Cartão do talhão** ao clicar num talhão com caso: talhão, fazenda,
  data do voo, fornecedor, aviso de voo cancelado, status; botões conforme
  o status (Precisa de ajuste / Sem ajuste; Ajuste concluído; Reabrir);
  "Precisa de ajuste" abre área (ha), observação e "Desenhar trecho" (entra
  na medição de área, como o planejamento de voos); "Ajuste concluído" pede
  a data (Hoje / Ontem / Outro dia, data local) e observação; histórico no
  rodapé. Sem `pode_editar`: cartão só leitura.
- **Offline**: cópia dos casos no IndexedDB (store novo, versão do banco
  sobe). Apontamento vai para uma fila (mesma lógica de
  `lib/filaApontamentos.js`) e aplica o status na cópia local na hora,
  marcado como pendente. Envia ao reconectar (evento `online`, sync geral e
  a cada 3 min com fila). Recusa vira lote "recusado" com Tentar de novo /
  Descartar. Sair da conta com fila pendente pede confirmação.

## Falhas

- Ponte/DroneManagement fora: casos conhecidos continuam visíveis e
  apontáveis; só não aparecem voos novos.
- Sem sinal: tudo pela cópia e pela fila do aparelho.
- Dois aparelhos no mesmo caso: vale o `feito_em` mais recente; o outro
  fica no histórico como substituído.

## Testes

- Backend: seleção de voos (safra, porte 9, fornecedor); criação de casos
  sem duplicar; voo cancelado; "o mais recente vence"; idempotência por
  `id_apontamento`; transições; permissão.
- Frontend (unitário): fila e cor por status.
- Playwright (dev local, DroneManagement sempre simulado com
  `page.route`): analista marca vermelho com área e desenho; gestor conclui
  sem sinal e a fila envia ao reconectar; leitor vê só leitura; ponte fora
  mostra o aviso e ainda permite apontar.
