# Redesenho do frontend (2026-09-30)

Proposta visual aprovada pelo Leo em 2026-09-30, a partir de um protótipo
clicável: https://claude.ai/artifact/28Ns1ZLV9MXGDfGLVut4Yt (tela do mapa
desktop/celular, administração e apontamento de voo). Este documento
registra as decisões e a ordem de implementação — o protótipo é a
referência visual, este arquivo é a referência do "por quê".

## Problemas que o redesenho resolve

- **Tela do mapa desperdiça espaço**: cabeçalho em faixa inteira no topo, e
  ~7 grupos de botões empilhados no canto direito (zoom, bússola,
  localização, home, medir, percurso, satélite, anotar) — ~420px de altura
  que obrigavam o painel de atributos a se encolher pra não cobrir.
- **Painéis disputando os mesmos cantos**: camadas, tipo de voo, talhões
  da fazenda, atributos, medição, percurso e apontamento tinham regras de
  exclusão mútua criadas caso a caso (`setPainelCamadasAberto(false)` ao
  abrir outro etc.) e remendos de sobreposição via `:has()`.
- **Ferramentas sem nome**: ícones sem rótulo no meio dos controles de
  navegação — difícil de achar para quem não usa todo dia.
- **Admin sem visão de saúde**: a automação diária ficou 3 dias parada
  (27–30/09) sem nenhum aviso no app — só percebido olhando o mapa.

## Decisões

1. **Mapa ocupa a tela inteira.** O cabeçalho vira cartões flutuantes sobre
   o mapa: identidade + nome do mapa (troca de mapa) + status de
   sincronização à esquerda, busca no topo, conta/menu à direita.
2. **Uma barra de ferramentas à esquerda (dock), com rótulo embaixo de cada
   ícone**: Camadas, Tipo de voo (só no mapa com camada de voos), Medir,
   Percurso, Anotar (só quem pode anotar). Painéis de consulta abrem ao
   lado da barra; ferramentas mostram estado ativo nela.
3. **Controles de navegação à direita, enxutos**: zoom, norte,
   localização, "ver tudo" e satélite. Nada de ferramenta misturada com
   navegação.
4. **Cada tipo de conteúdo tem lugar fixo**: consulta à esquerda (ao lado
   da barra), atributos à direita (os controles de navegação deslizam pro
   lado quando o painel abre), ações em andamento (medir, percurso,
   anotar) numa barra de ação no rodapé central (fase 2).
5. **Celular**: busca em pílula no topo, botões flutuantes à direita,
   gaveta inferior com abas Camadas / Legenda / Ferramentas (fase 3). O
   painel de um talhão selecionado abre **compacto (~35% da tela)** e só
   mostra todos os atributos quando o usuário pede — pedido explícito do
   Leo no protótipo ("não pode cobrir mais de 50% do mapa").
6. **Identidade**: mantém o verde da marca (`#2c6b47`); fonte Figtree
   **empacotada no app** (`@fontsource-variable/figtree`), nunca carregada
   do Google Fonts — o app precisa funcionar 100% offline, e uma fonte de
   CDN não entra no precache do service worker.
7. **Movimento**: continua a escala de duração/curva já existente
   (`--dur-*`, `--ease-*`, ver `PROPOSTA_ANIMACOES.md`) e o
   `prefers-reduced-motion` global.

## Fases (cada uma publicável sozinha)

- **Fase 1 — estrutura da tela do mapa** *(pronta no branch, 2026-09-30)*: fonte e tokens; cabeçalho vira
  barra flutuante; dock de ferramentas substitui os controles Medir /
  Percurso / Anotar do MapLibre e os botões circulares de Camadas / Tipo de
  voo; controles de navegação reestilizados; painel de atributos à direita
  com os controles deslizando ao abrir.
- **Fase 2 — barras de ação** *(pronta no branch, 2026-10-01)*: medir,
  percurso e anotar viram barra de ação no rodapé central, com o valor ao
  vivo; se mais de uma estiver ativa, empilham. Painel de atributos com
  cabeçalho ("Talhão N", fazenda · código, paginação entre feições
  sobrepostas) e atalhos (Centralizar, Como chegar, Compartilhar — sem
  Web Share API, copia o link do Google Maps). As fases 1 e 2 vão juntas
  pra produção, pra os pilotos se adaptarem a uma mudança só.
- **Fase 3 — celular** *(pronta no branch, 2026-10-01)*: gaveta inferior
  com abas Camadas / Legenda / Ferramentas no lugar da barra de
  ferramentas e dos painéis laterais (recolhida ~150px com resumo; aberta
  até 60% da tela; some enquanto um cartão ou ferramenta usa o rodapé;
  arrastar o mapa recolhe). Painel de talhão compacto (título, atalhos, 2
  atributos — ~36% da tela) com "Ver todos os N atributos". Desktop sem
  mudança.
- **Fase 4 — apontamento de voo** *(pronta no branch, 2026-10-01)*: fluxo redesenhado (total em hectares,
  filtro por tipo junto da legenda, começar pelo talhão, escolha grande
  quando há 2+ pendências, data em 1 toque) **e fila offline**: sem sinal,
  o apontamento fica guardado no aparelho e é enviado sozinho quando a
  conexão volta. Regras: vale a data do voo escolhida (não a hora do
  envio); falha por conflito (talhão já apontado/cancelado no
  DroneManagement nesse meio-tempo) aparece com o motivo, nunca some em
  silêncio; a fila é apagada ao sair da conta (mesmo motivo dos pins).
- **Fase 5 — administração**: menu lateral fixo; Visão geral com saúde da
  automação (resultado por dia, camadas atrasadas, passo a passo quando
  falha); Mapas em cards com painel de camadas/acesso/detalhes; Camadas
  em 3 colunas com prévia ao vivo do estilo; Usuários e grupos em tabela
  com filtros. Itens que exigem backend novo: saúde da automação (hoje só
  existe no `log.txt` do servidor geo), restaurar versão anterior de
  camada (os backups `.bak-` já existem no R2, falta rota/tela) e vínculo
  de piloto do DroneManagement pela tela (hoje só direto no banco).

Tudo é desenvolvido no branch `feat/redesenho-mapa` e só vai para
`master` (e portanto para produção) depois de validado — os pilotos usam
a tela do mapa todo dia.
