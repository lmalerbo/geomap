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

## Esperas encontradas

Levantamento de 2026-10-27. Sessão = em qual sessão do plano o ponto é
refeito (1 base, 2 login, 3 sincronização e mapa, 4 conversão de camada,
5 ferramentas e admin).

**Atenção:** a fase 5 do redesenho do admin (`LayoutAdmin.jsx`,
`AdminVisaoGeral.jsx`, telas de admin reescritas) está nos branches
`feat/redesenho-fase5` / `feat/indicadores-voo`, ainda fora do `master`. As
linhas marcadas com *(fase 5)* só existem lá. Esses branches também ainda
importam `IconeLordicon.jsx` (Remover/Excluir nas telas de admin): ao
juntá-los com este, trocar esses usos pelo spinner, como foi feito aqui, ou o
build quebra.

| Onde | Espera | Peça | Sessão | Situação |
|---|---|---|---|---|
| `Login.jsx` Entrar | login; 30–60 s com o servidor dormindo | `useOcupado` ("Entrando…") + aviso com `<Campo pequeno>` depois de 8 s (`NotaServidorAcordando`) | 2 | **feito** |
| `PrimeiroAcesso.jsx` Continuar | mesmo login | `useOcupado` + aviso de 8 s (os dois via `useFormularioLogin`) | 2 | **feito** |
| `DefinirSenha.jsx` Salvar e continuar | troca de senha | `useOcupado` ("Salvando…") | 2 | **feito** |
| `App.jsx` `CarregandoRota` (Suspense) | baixar o pedaço da tela (o do mapa tem ~350 KB) | `<Campo tamanho="grande">` + texto respirando | 3 | pendente |
| `Inicio.jsx` "Sincronizando…" | primeira sincronização | status com `<Campo pequeno>` | 3 | pendente |
| `AvisoPrimeiraSincronizacao.jsx` | download de todas as camadas no 1º acesso | `<Progresso>` por camada e MB; `<Esboco>` nos cartões; `<Concluido>` no fim | 3 | pendente |
| `Mapa.jsx` "Carregando mapa…" | ler as camadas do aparelho | `<Campo tamanho="grande">` + texto respirando | 3 | pendente |
| `Mapa.jsx` status de sincronização no cartão do topo | sincronização em segundo plano | `<Campo pequeno>` | 3 | pendente |
| `AdminCamadas.jsx` lista "Processando …" | conversão do shapefile (até 12 min) | `<Campo pequeno>` (provisório desde a sessão 1); `<Voo desde>` sobre a prévia; pouso em `<Concluido>` ou erro | 4 | campo provisório (sessão 1); voo pendente |
| `AdminCamadas.jsx` Enviar / Atualizar arquivo | envio do arquivo | `useOcupado` ("Enviando…", "Convertendo…") | 4 | pendente |
| `JobsContext.jsx` aviso global | fim da conversão em outra tela | toast com ✓/✕ | 4 | pendente |
| `BarraAnotar.jsx` Na minha localização | GPS (até 15 s com sinal fraco) | `useOcupado` ("Buscando o GPS…") | 5 | pendente |
| `FormularioPin.jsx` Salvar | gravar anotação | `useOcupado` | 5 | pendente |
| `Mapa.jsx` Importar KML/SHP | ler arquivo grande | `useOcupado` ("Lendo o arquivo…") | 5 | pendente |
| `PainelVoos.jsx` / `Mapa.jsx` "Carregando pendências…" | pendências do DroneManagement | `<Esboco discreto>` com os números antigos à vista | 5 | pendente |
| `BarraApontamento.jsx` Confirmar | envio do apontamento | `useOcupado` | 5 | pendente |
| `LayoutAdmin.jsx` "Carregando…" *(fase 5)* | resumo da administração | `<Esboco>` | 5 | pendente |
| `AdminVisaoGeral.jsx` "Carregando…" *(fase 5)* | visão geral | `<Esboco>` + cascata | 5 | pendente |
| `AdminMapas.jsx` lista e botões (criar, ordem, acesso, detalhes, duplicar, remover) | admin | `<Esboco>` + `useOcupado` | 5 | pendente |
| `AdminUsuarios.jsx` lista e botões (criar, salvar, piloto, senha, excluir) | admin | `<Esboco>` + `useOcupado` | 5 | pendente |
| `AdminCamadas.jsx` detalhe, prévia, versões, Salvar nome/estilo/atributos, Duplicar, Remover, Gerar categorias/faixas/formas | admin | `<Esboco>` + `useOcupado`; o "✓ Salvo às…" (`useAutoDismiss`) sai, o ✓ do botão substitui | 5 | pendente |
| `AdminCamadas.jsx` Remover camada (ícone Lordicon no hover) | — | ícone sai na sessão 1; botão vira `useOcupado` | 5 | ícone removido; botão pendente |
| `AdminMapas.jsx` Remover, `AdminUsuarios.jsx` Excluir e Remover grupo (ícone Lordicon no hover) | — | ícone sai na sessão 1; botão vira `useOcupado` | 5 | ícone removido; botão pendente |
| `AdminEstatisticas.jsx` "Carregando…" | estatísticas | `<Esboco>` | 5 | pendente |

Erro com ✕ no botão: a mensagem (`AlertaErro semTremida`) aparece junto do
✕ e só entra com fade — o botão já treme, duas tremidas juntas confundem.
A conferência local de "senhas diferentes" (Definir senha) não passa pelo
botão e mantém a tremida da mensagem.
