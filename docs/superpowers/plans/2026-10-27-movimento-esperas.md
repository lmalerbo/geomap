# Movimento das esperas — plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** trocar todo spinner/texto parado do GeoMap pela linguagem de movimento do hub-geotech, no verde do GeoMap, sem Lordicon.

**Architecture:** uma biblioteca React em `frontend/src/components/movimento/` (componentes e hooks com os nomes da API `Mo.*` do Hub) + `frontend/src/lib/movimento.css` (porte do `motion.css`) + `frontend/src/lib/movimento.js` (cálculos puros, testados em Node). As telas passam a usar a biblioteca em 4 sessões seguintes, uma por grupo de espera.

**Tech Stack:** React 19, CSS puro (sem lib de animação), Web Animations API só no pouso do drone, Vitest (projeto `unit`, Node) e Storybook 10 (projeto `storybook`, Chromium via Playwright).

**Spec:** `docs/movimento-esperas.md` (decisões + tabela "Esperas encontradas"); referência visual: prévia aprovada https://claude.ai/artifact/Py4PqwrK5LQj4zMhuvpeeS; referência de código: `C:\Users\lmalerbo\Documents\hub-geotech\app\motion.js` e `app\motion.css`.

## Global Constraints

- Só `transform`/`opacity` nas animações (exceto a cor de fundo do botão no ✓/✕, como no Hub).
- Tokens: `--mo-ok:#2f8a56; --mo-erro:#b3261e; --mo-c1:#1f5a3a; --mo-c2:#2c6b47; --mo-c3:#4f9a6c; --mo-c4:#8cc5a1; --mo-sai:cubic-bezier(.16,1,.3,1); --mo-mola:cubic-bezier(.34,1.56,.64,1)`.
- Tempos do Hub: ✓ volta ao normal em 900 ms, ✕ em 1200 ms; concluído dura 1900 ms; laço do voo 12000 ms; cascata 28 ms por item, só os 10 primeiros; esboço sai em 180 ms.
- `prefers-reduced-motion: reduce` → estados parados, mesma informação (texto, %, ✓, ✕). Nada gira, nada voa, sem confete, sem cascata.
- Nada baixado de fora: sem fonte, ícone ou JSON de animação (o app abre offline).
- Textos em português do Brasil, sem travessão como pontuação na interface.
- Node: `fnm use` em `frontend/` (Node 22.12, `.nvmrc`) antes de rodar Storybook/Vitest do projeto storybook.

## Review Focus

- Componente desmontado no meio da espera (trocar de tela com o botão ocupado ou o drone voando) → nenhum `setState` depois do desmonte, nenhum timer pendurado. Teste: story `useOcupado` / `Voo` desmontando antes do fim (play function) sem erro de console.
- `fim()` chamado duas vezes, ou chamado sem `iniciar()` → não faz nada na segunda vez. Teste unitário de `criarFimUnico`.
- `<Progresso>` com `total` 0 ou ausente → 0 %, sem `NaN`, sem "0 KB de 0 KB". Teste unitário de `fracao` e `textoMb`.
- `<Voo desde>` com `desde` no futuro ou muito antigo → atraso sempre entre `-12000` e `0` ms. Teste unitário de `atrasoVoo`.
- Botão ocupado dentro de `button:disabled { opacity:.6 }` global do app → o botão vivo não pode aparecer desbotado. Teste: story do `useOcupado` confere `getComputedStyle(botao).opacity === "1"` durante a espera.

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
|---|---|
| `frontend/src/lib/movimento.js` | cálculos puros (bytes, fração, atraso do voo, confete, linhas do esboço, fim único) |
| `frontend/src/lib/movimento.test.js` | testes Node dos cálculos |
| `frontend/src/lib/movimento.css` | porte do `motion.css` (classes `mo-*`), importado no topo do `index.css` |
| `frontend/src/components/movimento/Campo.jsx` | indicador de espera |
| `frontend/src/components/movimento/useOcupado.js` | botão ocupado |
| `frontend/src/components/movimento/Progresso.jsx` | barra de progresso |
| `frontend/src/components/movimento/Esboco.jsx` | carregando/pronto |
| `frontend/src/components/movimento/Concluido.jsx` | selo de concluído |
| `frontend/src/components/movimento/Voo.jsx` | drone sobrevoando |
| `frontend/src/components/movimento/usePrefereMenosMovimento.js` | `matchMedia('(prefers-reduced-motion: reduce)')` |
| `frontend/src/components/movimento/index.js` | reexporta tudo |
| `frontend/src/components/movimento/*.stories.jsx` | uma story por peça, com play function |

---

# Sessão 1 — biblioteca (esta sessão)

### Task 1: cálculos puros

**Files:** Create `frontend/src/lib/movimento.js`, `frontend/src/lib/movimento.test.js`

**Interfaces — Produces:**
- `formatarBytes(b: number) → string` — `"1,5 MB"` (≥ 1 MiB, 1 casa) ou `"12 KB"` (mínimo 1 KB), como `fmtB` do Hub.
- `fracao(valor: number, total: number) → number` em [0, 1]; total ≤ 0 ou inválido → 0.
- `textoMb(valor, total) → string` — `"3 MB de 20 MB"`; `""` se total ≤ 0.
- `atrasoVoo(desde: number, agora: number, laco = 12000) → number` em (-laco, 0].
- `gerarConfete(n = 18, aleatorio = Math.random) → Array<{cor, dx, dy, r, atraso}>` (cores `var(--mo-c1..c4)` em rodízio).
- `linhasEsboco(altura: number) → number` — `clamp(4, 12, floor((altura || 160) / 26))`.
- `criarFimUnico(fn) → (...args) => resultado | undefined` — só executa na primeira chamada.
- Constantes `DURACAO_OK = 900`, `DURACAO_ERRO = 1200`, `DURACAO_CONCLUIDO = 1900`, `LACO_VOO = 12000`, `SAIDA_ESBOCO = 180`, `PASSO_CASCATA = 28`, `MAX_CASCATA = 10`.

- [ ] Step 1: escrever `movimento.test.js` com um `describe` por função, cobrindo: 1,5 MiB → `"1,5 MB"`; 300 bytes → `"1 KB"`; `fracao(5,0)===0`, `fracao(30,20)===1`, `fracao(NaN,10)===0`; `textoMb(0,0)===""`; `atrasoVoo(agora-13000, agora)===-1000`, `atrasoVoo(agora+500, agora)===0`; confete com aleatório fixo devolve 18 peças e cores em rodízio; `linhasEsboco(0)===6`, `(1000)===12`, `(50)===4`; fim único chamado 2× executa 1×.
- [ ] Step 2: `npm run test:unit -- movimento` → FAIL (módulo não existe).
- [ ] Step 3: implementar `movimento.js`.
- [ ] Step 4: `npm run test:unit` → PASS (todos os testes do projeto).
- [ ] Step 5: commit `Movimento: cálculos puros da biblioteca de esperas`.

### Task 2: `movimento.css` + reduced motion do `index.css`

**Files:** Create `frontend/src/lib/movimento.css`; Modify `frontend/src/index.css` (topo: `@import "./lib/movimento.css";`; bloco `@media (prefers-reduced-motion: reduce)`).

Porte do `motion.css` do Hub com estas diferenças (todas vindas da prévia aprovada):
- tokens do verde (Global Constraints); `.mo-campo.p` (pequeno: 12 px, barra de 3 px); `.mo-respira` (texto respirando, era `.carregando #carregando-msg`);
- `.mo-btn.mo-ok`/`.mo-erro` também trocam `border-color`; `.mo-btn .mo-sobre .ico` com `✓`/`✕` em texto (o Hub usa a fonte Material);
- `.mo-btn.mo-ocupado:disabled, .mo-btn.mo-fim:disabled { opacity: 1; cursor: progress }` (o app deixa botão desabilitado com 0,6);
- `.botao-secundario.mo-btn`: faixa de luz verde-clara e `.mo-sobre` em `--accent-escuro`;
- barra do progresso em gradiente `--mo-c2 → --mo-c3`; trilho `rgb(44 107 71/.14)`; linha do discreto `--mo-c2 → --mo-c4`; esboço `#e9eeeb`;
- drone: corpo `--mo-c2`, braços `--mo-c1`, discos verdes translúcidos, luz `#e8c35a`; `.mo-voo-txt .mo-campo` em `--mo-c2`;
- sem `.mo-etapa-*` e sem `.mo-saindo` (sem uso no GeoMap).
- No bloco de reduced motion do `movimento.css`: as animações do concluído recebem `animation-duration: 1.9s !important; animation-iteration-count: 1 !important` (senão a regra global do `index.css`, que zera tudo com `!important`, faz o selo sumir na hora).
- No `index.css`: tirar `.spinner` e `.spinner--grande` da exceção que força o giro (fica só `.botao-track-gravando`, que indica gravação ao vivo, não espera).

- [ ] Step 1: criar o arquivo e o `@import`.
- [ ] Step 2: `npm run build` → sem erro, CSS gerado contém `.mo-campo`.
- [ ] Step 3: commit junto com a Task 3 (o CSS sem componente não tem como ser visto).

### Task 3: `<Campo>` e `usePrefereMenosMovimento`

**Files:** Create `Campo.jsx`, `usePrefereMenosMovimento.js`, `index.js`, `Campo.stories.jsx`

**Interfaces — Produces:**
- `<Campo tamanho?: "normal"|"grande"|"pequeno" herdaCor?: boolean className? />` → `<span class="mo-campo [g|p] [b]" aria-hidden="true"><i/><i/><i/><i/></span>`.
- `usePrefereMenosMovimento() → boolean` (escuta `change` do `matchMedia`).

- [ ] Step 1: story com os 3 tamanhos, dentro de botão (`herdaCor`) e com texto `.mo-respira`; play function confere 4 `<i>` e `aria-hidden`.
- [ ] Step 2: rodar a story (`npx vitest run --project storybook Campo`) → FAIL sem o componente.
- [ ] Step 3: implementar; Step 4: PASS; Step 5: commit `Movimento: campo e CSS da biblioteca`.

### Task 4: `useOcupado`

**Files:** Create `useOcupado.js`, `useOcupado.stories.jsx`

**Interfaces — Produces:** `useOcupado() → { estado: "parado"|"ocupado"|"ok"|"erro", ocupado: boolean, iniciar({texto}?) → fim(ok, {travado}?) → Promise<void>, executar(fn, {texto, travado}?) → Promise<resultado> (relança o erro depois do ✕), liberar(), propsBotao({className, disabled, style, ...resto}?) → props, conteudo(children) → ReactNode }`.

Comportamento (igual ao Hub): `iniciar` mede a largura do botão (ref) e trava `minWidth`, troca o rótulo pelo campo (+ texto), desabilita e põe `aria-busy`; `fim(true)` → ✓ verde por 900 ms; `fim(false)` → ✕ vermelho com tremida por 1200 ms; depois volta ao normal (ou fica desabilitado com `travado` até `liberar()`). Nada acontece depois do desmonte.

- [ ] Step 1: stories `Sucesso`, `Erro`, `Travado`, `Secundario`, `DesmontaNoMeio`; play functions: clicar, conferir `aria-busy="true"` e opacidade 1, esperar o ✓/✕, conferir volta a `disabled=false` (ou `true` em `Travado`).
- [ ] Step 2–4: FAIL → implementar → PASS. Step 5: commit `Movimento: botão ocupado (useOcupado)`.

### Task 5: `<Progresso>`

**Files:** Create `Progresso.jsx`, `Progresso.stories.jsx`

**Interfaces — Produces:** `<Progresso valor total mb=true texto estado="enviando"|"processando"|"ok"|"erro" />`; `role="progressbar"` com `aria-valuenow`; chegou em 100 % ainda em `"enviando"` → respira (`mo-proc`); `ok` mostra `✓` no lugar do %. Textos padrão: `"Preparando…"`, `"Gravando no servidor…"`, `"Enviado"`, `"Envio interrompido"`.

- [ ] Steps: stories `Enviando` (controles), `Simulado` (barra avançando até processando e ok), `Erro`, `PorPassos` (`mb={false}`); play confere `aria-valuenow` e o texto de MB. Commit `Movimento: progresso`.

### Task 6: `<Esboco>`

**Files:** Create `Esboco.jsx`, `Esboco.stories.jsx`

**Interfaces — Produces:** `<Esboco carregando discreto=false cascata=true linhas? as="div" className ...resto>{children}</Esboco>`. Carregando → classe `mo-carregando` (+ `mo-discreto`), `aria-busy`, camada `.mo-esboco` com `linhasEsboco(altura)` linhas (ou `linhas`) e um `<Campo>`. Ao passar a `false`: esboço ganha `mo-sai` e some em 180 ms; os 10 primeiros filhos entram em cascata (`mo-surge`, atraso 28 ms × i), a não ser com `cascata={false}` ou menos movimento.

- [ ] Steps: stories `Lista` (alterna carregando), `Discreto` (números antigos à vista), `SemCascata`; play confere `aria-busy` e que o esboço sai. Commit `Movimento: esboço (carregando/pronto)`.

### Task 7: `<Concluido>`

**Files:** Create `Concluido.jsx`, `Concluido.stories.jsx`

**Interfaces — Produces:** `<Concluido texto="Concluído" onFim? />` — cobre o pai posicionado (põe `position:relative` se ele for `static` e desfaz no desmonte), selo que se desenha, onda, 18 confetes (sem confete com menos movimento), chama `onFim` depois de 1900 ms. `role="status"`.

- [ ] Steps: story `NoCartao` com botão "Tocar de novo"; play confere `role=status` com o texto e que `onFim` é chamado. Commit `Movimento: concluído`.

### Task 8: `<Voo>`

**Files:** Create `Voo.jsx`, `Voo.stories.jsx`

**Interfaces — Produces:** `<Voo texto desde=Date.now() pouso?: {ok: boolean, texto?: string} onFim? />`. Sobrevoa o pai (mesma regra de posição do `<Concluido>`), `--mo-voo-atraso = atrasoVoo(desde)` para continuar de onde estava. Quando `pouso` passa a existir: congela onde está, vai ao centro em 650 ms (WAAPI; 0 ms com menos movimento); `ok` → desce (420 ms) e mostra `<Concluido texto={pouso.texto ?? "Concluído"}>`, e chama `onFim` quando ele termina; erro → balança, mostra "✕ texto" na pílula por 1400 ms e chama `onFim`.

- [ ] Steps: stories `Voando` (controle de texto), `ContinuaDeOndeEstava` (`desde` de 5 s atrás), `PousoOk`, `PousoErro`; play confere a pílula com o texto e o `onFim`. Commit `Movimento: voo do drone`.

### Task 9: remover o Lordicon

**Files:** Delete `frontend/src/components/IconeLordicon.jsx`, `frontend/public/lordicon/`; Modify `frontend/package.json` + lock (`npm uninstall @lordicon/element lottie-web`), `frontend/src/pages/AdminCamadas.jsx` (os 2 usos), comentário em `IconeEstadoVazio.jsx` e `index.css:1127`.

- Lista de jobs: `<IconeLordicon nome="upload-file" …/>` → `<Campo tamanho="pequeno" />` (provisório; a sessão 4 põe o voo).
- Remover camada: tira o ícone do hover (o botão fica com o spinner atual até a sessão 5).

- [ ] Step 1: `grep -ri lordicon frontend/src frontend/public frontend/package.json` → só zero resultados no fim.
- [ ] Step 2: `npm run build` e `npm run lint` sem erro. Commit `Remove o Lordicon`.

### Task 10: verificação

- [ ] `npm run test:unit`, `npx vitest run --project storybook`, `npm run build`, `npm run lint`.
- [ ] Storybook aberto (`npm run storybook`) e cada story vista no navegador, também com menos movimento emulado (Playwright `reducedMotion: 'reduce'`): campo parado em degraus, drone parado no centro, concluído aparece e some.
- [ ] Atualizar a tabela de `docs/movimento-esperas.md` (Lordicon removido; a lista de jobs com campo provisório).

---

# Sessões seguintes

Cada sessão começa relendo `docs/movimento-esperas.md`, detalha os passos
desta seção contra o código do momento (as telas mudam entre sessões), troca
a "Situação" da tabela para **feito** e verifica com Playwright no dev local
(skill `verify`).

### Sessão 2 — login

**Files:** `pages/Login.jsx`, `pages/PrimeiroAcesso.jsx`, `pages/DefinirSenha.jsx`, `hooks/useFormularioLogin.js`.

- [ ] `useFormularioLogin` passa a usar `useOcupado().executar` no envio; botões com `propsBotao`/`conteudo`.
- [ ] Aviso "O servidor estava em repouso e está acordando. A primeira entrada do dia leva até 1 minuto." com `<Campo tamanho="pequeno">`, aparece só se a resposta passar de 8 s (timer limpo ao terminar/desmontar).
- [ ] Erro de credencial: ✕ no botão + a mensagem de erro de sempre (já tem tremida — não somar duas tremidas).
- [ ] Teste: Playwright com `page.route('**/login')` atrasando 10 s (aviso aparece) e respondendo 401 (✕ e mensagem).

### Sessão 3 — primeira sincronização e abertura do mapa

**Files:** `lib/sync.js`, `components/AvisoPrimeiraSincronizacao.jsx`, `pages/Inicio.jsx`, `App.jsx` (`CarregandoRota`), `pages/Mapa.jsx` (carregamento inicial, status do cartão do topo).

- [ ] `sync.js` passa a informar progresso: `aoProgredir({camadaAtual, camadasFeitas, camadasTotal, bytes, bytesTotal})` (bytes do `fetch` lidos com `response.body.getReader()`; sem `Content-Length` → progresso por camada, `mb={false}`). Teste unitário do agregador de progresso.
- [ ] Aviso da primeira sincronização com `<Progresso>` ("Talhões · 2 de 6 camadas", "8 MB de 31 MB"), cartões de mapa em `<Esboco>`, `<Concluido texto="Pronto para usar sem internet">` no fim.
- [ ] `CarregandoRota` e "Carregando mapa…" → `<Campo tamanho="grande">` + texto `.mo-respira`; camadas entram em sequência (fade de opacidade da camada no MapLibre, `fill-opacity-transition`), sem cascata no canvas.
- [ ] Status no cartão do topo: `<Campo tamanho="pequeno">` no lugar do spinner.
- [ ] Teste: Playwright com IndexedDB vazio e downloads atrasados via `page.route`; também offline.

### Sessão 4 — conversão de camada

**Files:** `pages/AdminCamadas.jsx`, `context/JobsContext.jsx`, `components/PreviaCamada.jsx`.

- [ ] `JobsContext` guarda `iniciadoEm` por job (persistido junto, no `localStorage`) para o `<Voo desde>`.
- [ ] Prévia da camada em conversão recebe `<Voo texto="Convertendo Talhões · 3 min" desde>`; tempo decorrido atualizado a cada 1 s; ao concluir, `pouso={{ok:true, texto:"Camada pronta"}}`; erro → `pouso={{ok:false, texto: job.erro}}`.
- [ ] Lista de jobs: `<Campo pequeno>` (já vem da sessão 1) + tempo decorrido.
- [ ] Enviar/Atualizar arquivo com `useOcupado` ("Enviando…" / "Convertendo…").
- [ ] Toast global com ✓/✕ e entrada `--mo-sai`.
- [ ] Teste: Playwright simulando `GET /admin/jobs/:id` (processando → concluído / erro) e saindo/voltando da tela no meio (o drone continua de onde estava).

### Sessão 5 — ferramentas e admin

**Files:** `components/pins/BarraAnotar.jsx`, `components/pins/FormularioPin.jsx`, `components/BarraApontamento.jsx`, `components/PainelVoos.jsx`, `pages/Mapa.jsx` (importar), `components/LayoutAdmin.jsx`, `pages/AdminVisaoGeral.jsx`, `pages/AdminMapas.jsx`, `pages/AdminUsuarios.jsx`, `pages/AdminCamadas.jsx`, `pages/AdminEstatisticas.jsx`.

- [ ] Todo botão de ação com spinner → `useOcupado` (lista completa na tabela do doc).
- [ ] GPS e importação com texto do que está acontecendo ("Buscando o GPS…", "Lendo o arquivo…").
- [ ] Painel de voos: `<Esboco discreto>` mantendo os números antigos à vista.
- [ ] Listas do admin: `<Esboco>` + cascata; o "✓ Salvo às…" (`useAutoDismiss`) sai.
- [ ] Sem nenhum `.spinner` sobrando: `grep -rn 'className="spinner' frontend/src` vazio; aí remover `.spinner`/`@keyframes girar` do `index.css`.
- [ ] Teste: Playwright nas telas de admin (dev local, banco local preparado e desfeito) e no mapa com GPS simulado.
