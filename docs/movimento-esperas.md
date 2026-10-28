# Esperas do GeoMap e movimento

Toda espera do app ganha animação, na mesma linguagem do hub-geotech
("nenhum milissegundo de espera vazio", spec D6 do Hub). Prévia aprovada
pelo Leo em 2026-10-27: https://claude.ai/artifact/Py4PqwrK5LQj4zMhuvpeeS.
Plano de implementação:
`docs/superpowers/plans/2026-10-27-movimento-esperas.md`.

## Decisões

- **Linguagem do Hub.** As peças, os nomes e os tempos vêm de
  `hub-geotech/app/motion.js` e `app/motion.css` (fora da pasta GitHub, em
  `C:\Users\lmalerbo\Documents\hub-geotech`, referência em
  `docs/movimento-esperas.md` de lá): o **campo** (4 barrinhas que crescem
  como linhas de plantio, no lugar do spinner), o **botão ocupado**, o
  **progresso**, o **esboço** (carregando/pronto), o selo de **concluído** e o
  **voo** do drone. Só `transform`/`opacity`, mesmas curvas
  (`--mo-sai`, `--mo-mola`).
- **Verde do GeoMap.** O Hub pinta o campo com as 4 cores dos módulos; aqui
  são 4 tons do verde do app: `#1f5a3a`, `#2c6b47`, `#4f9a6c`, `#8cc5a1`
  (`--mo-c1` a `--mo-c4`). Sucesso `#2f8a56`, erro `#b3261e` (o `--erro` do
  app).
- **Sem Lordicon.** Saem `@lordicon/element`, `lottie-web`,
  `public/lordicon/` e `IconeLordicon.jsx`. Tudo é CSS e um pouco de JS, sem
  arquivo de animação para baixar: abre igual em campo, sem sinal.
- **Porte em React.** Não usamos o `motion.js` imperativo (ele mexe no DOM
  de botões que o React controla). A biblioteca expõe componentes e hooks
  com os nomes da API do Hub:

  | Hub | GeoMap (`frontend/src/components/movimento/`) |
  |---|---|
  | `Mo.campo(grande?)` | `<Campo tamanho="grande" / "pequeno" herdaCor />` |
  | `Mo.ocupado(botao,{texto})` → `fim(ok,{travado})` | `useOcupado()` → `iniciar({texto})` → `fim(ok,{travado})`; `executar(fn)`; `propsBotao()`, `conteudo()` |
  | `Mo.progresso(el,{total,mb})` | `<Progresso valor total mb texto estado />` |
  | `Mo.carregando(c,{discreto})` / `Mo.pronto(c,{cascata})` | `<Esboco carregando discreto cascata>` |
  | `Mo.concluido(el,{texto})` | `<Concluido texto onFim />` |
  | `Mo.voo(el,{texto,desde})` → `pousar(ok,texto)` | `<Voo texto desde pouso onFim />` |

  `Mo.etapa` não tem uso no GeoMap e fica de fora.
- **Menos movimento.** Com `prefers-reduced-motion`, como no Hub: estados
  parados (barras em degraus, drone parado no centro, sem confete, sem
  cascata); cor, texto, %, ✓ e ✕ continuam. O spinner antigo também para de
  girar (antes uma regra do `index.css` forçava o giro).

## Biblioteca (sessão 1)

Feita em 2026-10-27: `frontend/src/lib/movimento.css`,
`frontend/src/lib/movimento.js` (cálculos, com testes) e
`frontend/src/components/movimento/`. Cada peça tem story no Storybook
(`Movimento/*`, com play function: `npx vitest run --project storybook
src/components/movimento`, Node 22.12 via `fnm use`).

Diferença do Hub: no `useOcupado` o botão cresce para caber o texto de espera
("Salvando…") em vez de cortar; continua sem encolher.

## Sincronização e abertura do mapa (sessão 3)

Feita em 2026-10-27.

- **Progresso do download.** `sincronizarMapas(token, { aoProgredir })`
  (`lib/sync.js`) avisa o andamento das camadas que precisam ser baixadas.
  O agregador fica em `lib/progressoSync.js` (sem React, com testes): cada
  camada passa por baixando → guardando (gravando no IndexedDB) → feita ou
  falhou. `baixarCamada` lê o download aos pedaços (`body.getReader()`) e
  informa os bytes; o tamanho vem do `Content-Length`. As camadas descem em
  paralelo, então o total em MB só aparece quando todas informaram o
  tamanho; antes disso a barra conta camadas. A troca para MB só acontece
  quando não faz a barra voltar atrás, e não se desfaz. Sem
  `Content-Length`, fica por camada até o fim.
- **Fim da primeira sincronização.** Se tudo baixou sem falha, o
  `<Concluido>` cobre a tela inicial (ou o mapa) e o aviso sai junto. Com
  alguma camada falhando, o aviso só some, sem comemoração.
- **`<Progresso detalhe>`.** Prop nova: substitui a linha de MB por um
  texto livre ("2 de 6 camadas · 24,1 MB de 39,7 MB").
- **Camadas entram em sequência** (`lib/entradaCamadas.js`, efeito 5b do
  `Mapa.jsx`). Roda depois que o `aplicar()` adicionou as camadas, **sem
  mexer nele**: lê a opacidade que cada layer já tem, zera e devolve essa
  mesma opacidade com fade de 550 ms, uma camada a cada 220 ms. Só anima
  camada que ainda não apareceu nesta tela (reconstruir por troca de
  estilo não repete a entrada). Camada desligada no painel durante a
  entrada continua desligada. No fim a transição volta aos 300 ms do
  liga/desliga. Uma entrada em andamento só é cortada pela saída da tela.
  Com menos movimento, não roda.

Verificação (Playwright, backend e Postgres locais, downloads servidos de
`backend/storage` por um servidor lento simulado, sem tocar o R2): IndexedDB
vazio pela tela inicial e direto no mapa, progresso com MB e sempre
crescente, selo de concluído, esboço dos cartões, entrada das camadas com a
opacidade final igual à de menos movimento, e offline no build de produção
(tela inicial e mapa com o que estava salvo, sem aviso nem selo).

## Conversão de camada (sessão 4)

Feita em 2026-10-28, em `AdminCamadas.jsx` e `JobsContext.jsx`; textos e
escolhas em `lib/jobsConversao.js` (sem React, com testes).

- **Voo sobre o palco.** Enquanto o servidor converte, o `<Voo>` sobrevoa
  um palco no topo do detalhe da camada (`.palco-conversao`, uma lavoura em
  faixas), com o tempo decorrido na pílula ("Convertendo Talhões · 3:12").
  O palco mostra o job da camada aberta; sem camada aberta, a camada nova
  que está sendo criada. Quando ela termina, a tela abre a camada nova e o
  mesmo drone continua o pouso (a `key` é o `jobId`).
- **O voo continua de onde estava.** O `JobsContext` guarda em cada job
  (`localStorage`, `geomap_jobs_pendentes`) o início (`inicio`, `Date.now()`),
  o tipo (`criar`/`atualizar`), a camada e a versão. O `inicio` vira o
  `desde` do `<Voo>`: sair, recarregar ou voltar à tela retoma a fase do
  laço e o relógio. Job salvo antes disso (sem `inicio`) voa sem relógio.
- **Pouso.** Concluído: `<Concluido>` "Talhões publicada · versão 2.6"
  (no lugar do "✓ Salvo às…" que o Atualizar arquivo mostrava). Erro: o
  drone balança e mostra "✕ <erro do servidor>". O palco é calculado no
  render, não num efeito: o job sai dos pendentes e entra nos resultados no
  mesmo render, então o drone não reinicia no meio. Resultados que já
  existiam ao abrir a tela não pousam de novo.
- **Lista de jobs** com `<Campo pequeno>` e o mesmo texto com relógio.
- **Toast global** ganhou o ✓/✕ (com o pop do Hub); o de sucesso diz
  "Talhões publicada · versão 2.6."
- **Enviar / Atualizar arquivo** com `useOcupado` ("Enviando…"). O texto
  antigo "Convertendo shapefile… isso pode levar alguns minutos" saiu: o
  envio responde logo (202) e a conversão é o voo.

**Prévia da camada:** quando esta sessão foi feita, a prévia ao vivo
(`PreviaCamada.jsx`, admin fase 5) ainda não estava no branch, por isso o voo
ganhou um palco próprio. Com a fase 5 já junta, o palco fica no topo da coluna
central (`.adm-camadas-centro`), sempre no mesmo lugar da árvore para o drone
não remontar. Ele poderia dar lugar à prévia (o `<Voo>` cobre qualquer pai).

Verificação (Playwright, backend e Postgres locais; envio, consulta do job
e download do `.pmtiles` simulados com `page.route`, sem nada chegar ao
backend nem ao R2): 24 checagens — botão ocupado e ✓, voo com relógio,
job guardado com início/tipo/camada/versão, sair e voltar retomando a fase
(atraso ≈ tempo decorrido), pouso em selo com a versão, toast ✓ e ✕, erro
com balanço, reabrir sem repetir o pouso, camada nova sem o drone
reiniciar ao ser selecionada, menos movimento (drone parado, texto com o
tempo de um job reaberto do `localStorage`) e zero erro de console.

## Ferramentas do mapa e administração (sessão 5)

Feita em 2026-10-28, depois de juntar o `master` (fase 5 do admin e login
pelo Hub) neste branch.

- **Regra dos botões.** Toda ação que grava usa `useOcupado` e termina em ✓
  ou ✕ no próprio botão. O que muda a tela depois (fechar a barra, recarregar
  a lista, trocar de mapa ou de camada) só roda **depois** de `await fim(true)`;
  senão o botão some antes e o ✓ nem aparece. Em `AdminMapas.jsx` e
  `AdminUsuarios.jsx` isso é o `executar(botao, acao, mensagem, texto)`: a
  `acao` faz a chamada e devolve o "depois". Só o botão clicado anima
  (um `useOcupado` por botão; nos cartões de grupo, o componente `AcoesGrupo`
  tem os seus; em versões, `BotaoRestaurar`).
- **"✓ Salvo às…" saiu.** O `useAutoDismiss` e os estados `salvo*Em`,
  `salvando*`, `removendo`, `duplicando`, `gerando*` de `AdminCamadas.jsx`
  foram removidos: o ✓ do botão substitui.
- **Textos de espera:** "Procurando sinal…" (GPS em Anotar), "Lendo
  arquivo…" (importar KML/SHP, no painel de camadas e na gaveta do celular,
  sem mudar o tamanho do bloco), "Enviando…" / "Guardando…" (confirmar
  apontamento com e sem sinal), "Criando…", "Duplicando…", "Procurando no
  DroneManagement…" (vincular piloto), "Lendo valores…" (gerar categorias,
  faixas, formas e gradiente: um aviso de campo errado termina em ✕).
- **Ganchos que passaram a devolver o resultado** pro botão saber o fim:
  `adicionarNaMinhaLocalizacao` (`usePins.js`, sem o estado `obtendoGps`),
  `aoImportarArquivo` (`useImportacaoTemporaria.js`, sem `importandoArquivo`)
  e `confirmarLote({ aoConcluir })` (`useApontamentoVoo.js`: ✕ só quando
  nenhum talhão foi apontado nem guardado).
- **Esboço e cascata.** Visão geral, lista de mapas, tabela de usuários,
  grupos, lista e editor de camadas, Estatísticas e o carregamento entre
  telas (`LayoutAdmin`, fallback do `Suspense`) usam `<Esboco>`; a prévia da
  camada mostra o campo grande com "Baixando a camada…". O painel de voos usa
  `<Esboco discreto>`: os números antigos ficam à vista e a linha "Atualizando
  com o DroneManagement…" saiu.
- **Spinner aposentado.** Nenhum `.spinner` em uso (o de `Indicadores.jsx`,
  fora da lista, virou `<Campo pequeno>`). O CSS antigo saiu: `@keyframes
  girar`, `.spinner*`, `.status-voos--atualizando`, `.status-carregando-admin`,
  `.confirmacao-salvo`, `.marca-check-salvo`, `@keyframes pop-check`.

Verificação (Playwright, backend na 3099 e Postgres locais; tudo que grava,
o download dos `.pmtiles`, `/voos/pendentes` e `/pins` simulados com
`page.route`, sem tocar banco de produção, R2, Hub ou DroneManagement):
43 checagens em desktop, celular (390 px) e menos movimento — esboço e
cascata de cada tela, ✓ e ✕ com a mensagem, texto de espera de cada botão,
só o botão clicado animando, bloco da gaveta sem mudar de tamanho, campo
parado e sem cascata com menos movimento, e zero erro de console fora dos
400/500 simulados de propósito.

Não exercitado: o esboço discreto do painel de voos. Neste ambiente o mapa
de voos não chega a pedir `/voos/pendentes` (o efeito que busca depende de
`voosInfo?.id` e não roda de novo quando a camada de voos aparece), e isso
acontece igual sem as mudanças desta sessão. Vale investigar à parte: se
também acontecer em produção, o mapa de voos só busca as pendências quando
outra coisa força a busca.

## Esperas encontradas

Levantamento de 2026-10-27. Sessão = em qual sessão do plano o ponto é
refeito (1 base, 2 login, 3 sincronização e mapa, 4 conversão de camada,
5 ferramentas e admin). Todas feitas em 2026-10-28.

| Onde | Espera | Peça | Sessão | Situação |
|---|---|---|---|---|
| `Login.jsx` Entrar | login; 30–60 s com o servidor dormindo | `useOcupado` ("Entrando…") + aviso com `<Campo pequeno>` depois de 8 s (`NotaServidorAcordando`) | 2 | **feito** |
| `PrimeiroAcesso.jsx` Continuar | mesmo login | `useOcupado` + aviso de 8 s (os dois via `useFormularioLogin`) | 2 | **feito** |
| `DefinirSenha.jsx` Salvar e continuar | troca de senha | `useOcupado` ("Salvando…") | 2 | **feito** |
| `App.jsx` `CarregandoRota` (Suspense) | baixar o pedaço da tela (o do mapa tem ~350 KB) | `<Campo tamanho="grande">` + "Abrindo…" respirando | 3 | **feito** |
| `Inicio.jsx` "Sincronizando…" | primeira sincronização | status com `<Campo pequeno>`; cartões dos mapas em `<Esboco>` + cascata | 3 | **feito** |
| `AvisoPrimeiraSincronizacao.jsx` (Início e Mapa) | download de todas as camadas no 1º acesso | `<Progresso>` ("Baixando Talhões", "2 de 6 camadas · 24,1 MB de 39,7 MB", "Guardando no aparelho…"); `<Concluido>` "Mapas prontos para usar sem internet" no fim | 3 | **feito** |
| `Mapa.jsx` "Carregando mapa…" | ler as camadas do aparelho | `<Campo tamanho="grande">` + texto respirando, sai com fade; camadas entram uma por vez | 3 | **feito** |
| `Mapa.jsx` status de sincronização no cartão do topo | sincronização em segundo plano | `<Campo pequeno>` | 3 | **feito** |
| `AdminCamadas.jsx` lista "Processando …" | conversão do shapefile (até 12 min) | `<Campo pequeno>` com o tempo; `<Voo desde>` sobre o palco do detalhe; pouso em `<Concluido>` ou erro | 4 | **feito** |
| `AdminCamadas.jsx` Enviar / Atualizar arquivo | envio do arquivo | `useOcupado` ("Enviando…") | 4 | **feito** |
| `JobsContext.jsx` aviso global | fim da conversão em outra tela | toast com ✓/✕ | 4 | **feito** |
| `BarraAnotar.jsx` Na minha localização | GPS (até 15 s com sinal fraco) | `useOcupado` ("Procurando sinal…") | 5 | **feito** |
| `FormularioPin.jsx` Salvar | gravar anotação | `useOcupado` | 5 | **feito** |
| `Mapa.jsx` Importar KML/SHP | ler arquivo grande | `useOcupado` ("Lendo arquivo…") | 5 | **feito** |
| `PainelVoos.jsx` / `Mapa.jsx` "Carregando pendências…" | pendências do DroneManagement | `<Esboco discreto>` com os números antigos à vista | 5 | **feito** |
| `BarraApontamento.jsx` Confirmar | envio do apontamento | `useOcupado` | 5 | **feito** |
| `LayoutAdmin.jsx` "Carregando…" | resumo da administração | `<Esboco>` | 5 | **feito** |
| `AdminVisaoGeral.jsx` "Carregando…" | visão geral | `<Esboco>` + cascata | 5 | **feito** |
| `AdminMapas.jsx` lista e botões (criar, ordem, acesso, detalhes, duplicar, remover) | admin | `<Esboco>` + `useOcupado` | 5 | **feito** |
| `AdminUsuarios.jsx` lista e botões (criar, salvar, piloto, senha, excluir) | admin | `<Esboco>` + `useOcupado` | 5 | **feito** |
| `AdminCamadas.jsx` detalhe, prévia, versões, Salvar nome/estilo/atributos, Duplicar, Remover, Gerar categorias/faixas/formas | admin | `<Esboco>` + `useOcupado`; o "✓ Salvo às…" (`useAutoDismiss`) sai, o ✓ do botão substitui | 5 | **feito** |
| `AdminCamadas.jsx` Remover camada (ícone Lordicon no hover) | — | ícone sai na sessão 1; botão vira `useOcupado` | 5 | **feito** |
| `AdminMapas.jsx` Remover, `AdminUsuarios.jsx` Excluir e Remover grupo (ícone Lordicon no hover) | — | ícone sai na sessão 1; botão vira `useOcupado` | 5 | **feito** |
| `AdminEstatisticas.jsx` "Carregando…" | estatísticas | `<Esboco>` | 5 | **feito** |

Erro com ✕ no botão: a mensagem (`AlertaErro semTremida`) aparece junto do
✕ e só entra com fade — o botão já treme, duas tremidas juntas confundem.
A conferência local de "senhas diferentes" (Definir senha) não passa pelo
botão e mantém a tremida da mensagem.
