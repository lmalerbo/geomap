# Proposta de Animações e CSS — GeoMap

**Data**: 2026-07-13
**Escopo**: Etapas 1 (levantamento) e 2 (proposta) apenas — **nenhum código foi alterado**, conforme pedido. Aguardando aprovação antes da Etapa 3.

## Nota sobre as ferramentas pedidas

- **MCP do Lordicon**: não está disponível neste ambiente (não aparece entre as ferramentas carregadas). Pesquisei o catálogo público via web, mas a página de ícones do Lordicon é renderizada via JS — não consegui extrair IDs exatos de ícones (`wired/outline/xxx` etc.) de forma confiável. Por isso, as sugestões de ícone abaixo são por **categoria/termo de busca** (o que buscar em lordicon.com/icons), não por ID exato — evita eu inventar um ID que não existe de verdade e quebrar quando você for implementar. Se você tiver o MCP configurado em outro client, me diga e eu refaço essa seção com IDs reais.
- **Front-End Checklist**: clonado em `scratchpad` (fora do repositório do projeto, só consulta), commit atual do `thedaviddias/Front-End-Checklist`. O projeto foi reestruturado desde a versão clássica (é um monorepo com app + MCP próprio agora); o conteúdo relevante fica em `packages/content/rules/en/{css,performance,accessibility}/*.mdx`.

## Checklist de referência — itens aplicáveis

| Item | Categoria | Como o GeoMap se sai hoje |
|---|---|---|
| [Use transform/opacity para animar](https://developer.mozilla.org/en-US/docs/Web/CSS/will-change) (compositor-only, evita `width`/`height`/`top`/`left`) | CSS/Performance | Maioria já segue isso (`.menu-lateral` usa `transform`, `.painel-flutuante` usa `transform`+`opacity`). Uma exceção: `.conteudo-painel-camadas` anima `max-height` (layout-triggering) — ver oportunidade #7. |
| **`prefers-reduced-motion`** — desabilitar/reduzir animação pra quem pede no SO | Acessibilidade | **Não existe nenhuma regra disso no projeto hoje.** Zero ocorrências de `prefers-reduced-motion` no `index.css`. É o gap mais concreto encontrado — ver oportunidade #1. |
| `:focus-visible` com indicador visível e com contraste 3:1 (WCAG 2.4.11) | CSS/Acessibilidade | Nenhum estilo de foco customizado — depende do outline padrão do navegador (funciona, mas não combina com a identidade visual verde do app, e no Chrome/Windows é fino e pouco visível sobre fundo escuro dos botões). |
| Indicador de loading: spinner pra ações, skeleton pra conteúdo, `aria-busy` | Performance/Acessibilidade | Spinner já é usado de forma consistente (Login, Mapa, Inicio, e as 3 telas de admin desde a leva de auditoria). **Sem skeleton em lugar nenhum** — não é obrigatório aqui (as listas carregam rápido, offline-first), mas os botões "Salvar" trocam só o texto pra "Salvando…" sem ícone, mais fraco que o padrão do resto do app. |
| Não piscar mais de 3x/segundo (risco de convulsão) | Acessibilidade | Nenhuma animação do projeto pisca — a pulsação do botão de gravação (adicionada nesta sessão) é 1 ciclo a cada 1.6s, bem abaixo do limite. |
| View Transitions API pra navegação entre rotas | CSS/Design (prioridade **baixa** no próprio checklist) | Não usado. Menção rápida na proposta como item de exploração futura, não prioritário. |

## Levantamento por componente

MenuLateral é hoje a única referência — a única story existente no Storybook (`MenuLateral.stories.jsx`). Os demais componentes abaixo foram avaliados lendo o código-fonte + `index.css` diretamente (não têm story própria ainda).

| Componente | Hover | Abrir/fechar | Loading→sucesso/erro | Entrada/saída (mount) | Feedback de clique |
|---|---|---|---|---|---|
| **MenuLateral** (referência) | ✅ item de menu | ✅ slide+fade 220ms, os dois sentidos | — | ✅ sempre montado, transição nos dois sentidos | — |
| Painel de atributos/medição/track (`Mapa.jsx`) | parcial (`.linha-camada` só) | ✅ (unificado nesta sessão, mesmo padrão do MenuLateral) | — | ✅ (idem) | — |
| Painel de camadas (accordion) | ✅ | ✅ (`max-height`, ver ressalva acima) | — | sempre montado | seta gira 200ms |
| Busca (resultados) | ✅ item destacado | ❌ sem transição, aparece/some instantâneo | — | ❌ | — |
| Botões (`.botao`/`button` genérico) | ✅ background-color 150ms | — | texto muda ("Salvando…"), sem ícone | — | ❌ sem feedback de `:active` (nem scale, nem opacidade) |
| Cards da tela inicial (`.cartao-admin`) | ✅ translateY+shadow | — | — | ✅ entrada com stagger por card | — |
| Formulários admin (upload/estilo/atributos) | — | — | texto ("Salvando…"/"Convertendo…"), sem ícone | — | ❌ |
| Confirmação de salvo (`.confirmacao-salvo`) | — | — | ✅ entra com fade, mas **nunca sai** (fica até a próxima ação trocar o texto) | entrada só | — |
| Remover mapa/camada/usuário/grupo | — | `window.confirm()` nativo do navegador | — | — | sem nenhum estilo custom (diálogo do SO) |
| Track log (gravando) | — | — | ✅ pulso adicionado nesta sessão | — | — |
| Empty states (sem mapas/camadas/downloads/resultado de busca) | — | — | — | — | texto puro, sem ícone |

## Oportunidades de animação (ordenadas por impacto)

| # | Componente | Estado/Interação | Tipo de animação | Ferramenta | Prioridade |
|---|---|---|---|---|---|
| 1 | **Global** (`index.css`, `:root`) | Qualquer animação/transição do app | `@media (prefers-reduced-motion: reduce)` — regra global reduzindo todas as `animation-duration`/`transition-duration` | CSS | **Alta** |
| 2 | **Global** (`index.css`) | Foco por teclado em botões/inputs/links | `:focus-visible` com anel na cor da marca (`--accent`), substituindo o outline padrão do navegador | CSS | **Alta** |
| 3 | Botões (`.botao`/`button`) | Clique (`:active`) | `transform: scale(0.97)` no `:active`, com `transition: transform 100ms` | CSS | **Alta** |
| 4 | Formulários admin — botões "Salvar"/"Enviar" | Loading (aguardando resposta) | Ícone de loading dentro do botão (girando), substituindo o texto "Salvando…" isolado | Lordicon (buscar: *"loading"*, *"spinner"*, *"loading circle"*) ou CSS (reusar `.spinner` já existente, mais barato) | **Alta** |
| 5 | Formulários admin — confirmação de salvo | Sucesso | Ícone de check animado (morph, toca uma vez) no lugar do "✓" estático — e a mensagem passa a sumir sozinha depois de ~2s (fade-out), em vez de ficar presa até a próxima ação | Lordicon (buscar: *"checkmark"*, *"success"*, *"check circle"*) + CSS pra fade-out | Média |
| 6 | Busca (`.resultados-busca`) | Aparecer/atualizar lista | Reusar o `@keyframes entrada` já existente no projeto (fade+translateY 200ms) | CSS | Média |
| 7 | Painel de camadas (accordion) | Abrir/fechar conteúdo | Trocar a transição de `max-height` (layout-triggering, motivo do checklist) por `grid-template-rows: 0fr → 1fr` (técnica atual pra accordion sem JS, compositor-friendly) — resultado visual idêntico, mais barato pro navegador | CSS | Média |
| 8 | Upload/conversão de shapefile (`AdminCamadas`) | Loading longo ("Convertendo shapefile… isso pode levar alguns minutos") | Ícone de processamento mais expressivo que um spinner genérico (é uma espera potencialmente longa, vale um ícone que comunique "trabalhando nisso", não só "carregando") | Lordicon (buscar: *"processing"*, *"file upload"*, *"gear loading"*) | Média |
| 9 | Empty states (sem mapas, sem camadas, sem downloads, busca sem resultado) | Estado vazio | Ícone ilustrativo simples acompanhando o texto — hoje é só texto puro em todos os 5+ lugares que têm esse estado | Lordicon (buscar: *"empty box"*, *"no data"*, *"empty state"*, *"search not found"* pro caso específico de busca) | Baixa-Média |
| 10 | Botões "Remover" (camada/mapa/usuário/grupo) | Hover | Ícone de lixeira com hover animado (Lordicon tem um padrão consagrado de "trigger: hover" pra isso), substituindo o texto puro "Remover" | Lordicon (buscar: *"trash"*, *"delete"*, *"bin"*) — opcional, `.botao-remover-mapa:hover` já muda de cor, é reforço, não correção de gap | Baixa |
| 11 | Attribute panel — troca de feição na paginação (`irParaItem`) | Conteúdo troca de talhão pro próximo | Cross-fade rápido (120-150ms) no conteúdo do `<dl>` ao trocar de página, em vez de troca instantânea | CSS | Baixa |
| 12 | Login — mensagem de erro (`.alerta-erro`) | Erro de credencial/conexão | Já tem `entrada` (fade+translateY) — trocar o ícone SVG estático de alerta por uma versão animada (aparece com um leve "shake" ou morph) | Lordicon (buscar: *"error"*, *"warning"*, *"alert triangle"*) — opcional, o atual já funciona bem | Baixa |
| 13 | Navegação entre rotas (`/login` → `/inicio` → `/mapa/:id`) | Troca de página inteira | View Transitions API (`document.startViewTransition`) pra cross-fade nativo entre rotas | CSS + pouco JS | Baixa (o próprio checklist marca como prioridade baixa; exige teste de suporte de navegador e cuidado extra com o Suspense de code-splitting já existente) |

## Escala de durations/easings proposta

O `MenuLateral` já usa 200-220ms com `ease` simples — vale de referência, mas hoje o resto do projeto usa valores espalhados (150/200/220/250/300ms, todos com `ease` genérico, sem um "assinatura" visual). Proposta de escala única, com nomes que já batem com o vocabulário do projeto (`--sans`, `--accent` etc. já são custom properties em `:root`):

```css
:root {
  /* Duração */
  --dur-micro: 120ms;   /* clique/:active, checkbox, pequenas trocas de cor */
  --dur-hover: 150ms;   /* hover de botão/item de lista (já é o valor mais usado hoje) */
  --dur-painel: 220ms;  /* abrir/fechar painel flutuante, menu lateral (já é o valor do MenuLateral) */
  --dur-entrada: 250ms; /* fade+translateY de conteúdo novo na tela (cards, listas) */
  --dur-pulso: 1.6s;    /* loops ambientes (gravação ativa) — já o valor usado */

  /* Easing */
  --ease-padrao: ease;                          /* micro-interações — já é o que o projeto usa */
  --ease-saida: cubic-bezier(0.22, 1, 0.36, 1);  /* "ease-out-quint" — entrada de painéis/cards, sensação mais "premium" que ease simples */
}
```

Por que só duas curvas de easing (não uma pra cada duração): variar duração já dá a hierarquia visual necessária (micro vs. painel vs. entrada); variar *também* a curva pra cada caso tende a parecer inconsistente em vez de "premium" — dois padrões bem aplicados > cinco padrões meio aplicados.

## Ícones Lordicon sugeridos (por categoria — ver nota sobre IDs no topo)

| Caso de uso | Termo de busca sugerido | Comportamento (trigger) |
|---|---|---|
| Sucesso ao salvar (estilo/atributos/arquivo/mapa/usuário) | `checkmark`, `check circle`, `success` | `trigger: once` (toca 1x ao aparecer) |
| Loading em botão de ação | `loading`, `spinner`, `loading circle` | `trigger: loop` enquanto a ação estiver pendente |
| Processamento longo (upload de shapefile) | `processing`, `gear loading`, `file upload` | `trigger: loop` |
| Empty state genérico | `empty box`, `no data`, `empty state` | `trigger: once` ou estático (primeiro frame) |
| Empty state de busca | `search not found`, `no results` | `trigger: once` |
| Erro/alerta (login, validação de formulário) | `error`, `warning`, `alert triangle` | `trigger: once` |
| Remover (hover) | `trash`, `delete`, `bin` | `trigger: hover` |

## Próximos passos

**Nada foi implementado.** Aguardando você revisar esta lista e apontar:
1. Quais das 13 oportunidades aprovar (pode ser todas, um subconjunto, ou nenhuma ainda).
2. Por qual componente começar.

Quando aprovado, a Etapa 3 segue componente por componente, validando cada mudança no Storybook antes de avançar pra próxima, com commits pequenos separados por animação/componente — mesmo padrão já usado nas levas anteriores desta sessão.
