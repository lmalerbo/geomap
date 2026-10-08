# Ponte do DroneManagement pelo servidor geo (2026-10-08)

## Por que existe

Desde 07/10/2026 ~08:30 o DroneManagement
(`prd-dronemgmt.pedraagroindustrial.com.br`) não responde mais pela internet
pública: o nome resolve pra `200.232.118.19` fora da empresa e esse endereço
não responde (timeout), enquanto dentro da rede ele resolve pra
`10.120.243.29` e responde na hora. O backend do GeoMap roda no Render (nuvem)
e ficou sem caminho até a plataforma — os logs mostravam `page.goto: Timeout`
já na primeira página de login. Resultado: pendências de voo congeladas e
nenhum apontamento possível.

Decisão do Leo: em vez de pedir ao TI pra reabrir o acesso externo, usar o
**servidor geo** (PC dentro da rede, sempre ligado, que já roda a automação
diária de Talhões/Limites) como ponte.

## Como funciona

O Render não consegue chamar o servidor geo (rede interna, sem porta aberta),
então quem inicia a conexão é o servidor geo:

```
pilotos/admin ── GeoMap (Render) ──► fila de pedidos em memória
                         ▲    │
       long-poll (25 s)  │    │ tarefa {método, caminho, params, corpo}
                         │    ▼
                 servidor geo (ponte.mjs) ──► DroneManagement (rede interna)
                         │
                         └── devolve {status, contentType, corpo}
```

- `backend/src/lib/ponteDroneMgmt.js`: fila em memória (o Render roda uma
  instância só). `chamar()` enfileira e espera a resposta; `pegarTarefas()`
  entrega o que estiver pendente (ou espera até chegar algo); `responder()`
  resolve o pedido. Sem ponte conectada (nenhuma consulta do servidor geo nos
  últimos 45 s) o pedido falha **na hora** com uma mensagem clara, em vez de
  esperar.
- `backend/src/lib/dronemgmt.js`: com `DM_VIA_PONTE=1`, `chamarApi()` vai pela
  ponte e devolve um `Response` normal — nenhuma rota que usa o
  DroneManagement (pendências, apontamento, indicadores, vínculo de piloto)
  precisou mudar. Sem a variável, o comportamento é o de antes (chamada
  direta), o que permite voltar atrás só tirando a variável no Render.
- Rotas `GET /ponte-dm/tarefas` e `POST /ponte-dm/tarefas/:id`
  (`routes/ponteDm.js`), autenticadas por `PONTE_DM_TOKEN` (cabeçalho
  `x-ponte-token`, comparação em tempo constante). Montadas antes do
  `express.json()` global, com limite de corpo próprio (uma página de
  pendências passa dos 100 KB padrão).
- `automacao/ponte-dronemgmt/ponte.mjs` (servidor geo): laço que busca
  tarefas, executa com o `chamarApi()` do próprio backend (login via
  Playwright dentro da rede, sessão compartilhada) e devolve o resultado.
  Tarefas do mesmo lote rodam em paralelo.
- A Visão geral do admin mostra se a ponte está conectada e quando falou
  pela última vez.

## Limites conhecidos

- Depende do servidor geo ligado e com internet. O portal cativo do
  FortiGate da rede expira de tempos em tempos (já derrubou a automação
  diária em 27–30/09) — quando expira, a ponte cai junto. O passo a passo de
  reautenticar está no README da automação.
- O long-poll mantém o serviço do Render acordado 24 h. As horas grátis do
  Render (750 h/mês) são da conta inteira: o serviço antigo (`geomap`,
  `geomap-vr68.onrender.com`) deve ser desligado pra não dividir a cota.
- Fila em memória: um deploy/reinício do Render perde os pedidos em
  andamento (o usuário vê erro e tenta de novo). Aceitável — mesmo
  comportamento de qualquer requisição interrompida.

## Como desfazer

Se o TI reabrir o acesso externo, basta remover `DM_VIA_PONTE` no Render: o
backend volta a chamar o DroneManagement direto e a ponte pode ser desligada.
