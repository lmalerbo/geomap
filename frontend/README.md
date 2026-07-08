# Frontend — GeoPortal

React + Vite + MapLibre GL JS + `pmtiles`, PWA via `vite-plugin-pwa`
(Workbox). Duas telas: login e mapa. Não existe tela de catálogo — o
login já leva direto pro visualizador, que mostra todos os mapas
permitidos como **camadas do mesmo mapa** (liga/desliga cada uma), não
como uma lista de arquivos pra escolher/baixar.

## Setup local

1. `cp .env.example .env` — ajustar `VITE_API_URL` se o backend não estiver
   em `http://localhost:3000`.
2. `npm install`
3. `npm run dev` (porta 5173). Precisa do backend rodando (ver
   `../backend/README.md`) pra login e sincronização funcionarem.

## Como funciona (sem "portal de download")

- **Login → mapa direto**: não tem tela intermediária de catálogo.
- **Sincronização automática e silenciosa** (`src/lib/sync.js`): ao abrir
  o mapa, se houver internet, o app busca `GET /mapas` e baixa/atualiza
  em segundo plano qualquer mapa novo ou com `versao` diferente da que já
  está salva localmente. Não existe botão "Baixar" — só um indicador
  discreto no topo ("Atualizado às HH:MM" ou "Offline — usando último
  mapa salvo").
- **Camadas, não arquivos**: cada mapa permitido vira uma camada vetorial
  no mesmo `MapLibre.Map`, com um controle de liga/desliga
  (`.painel-camadas`). O nome da camada vetorial dentro do `.pmtiles` é
  lido do próprio metadata (`vector_layers[0].id`), não é hardcoded.
- **Clique**: consulta todas as camadas visíveis ao mesmo tempo
  (`queryRenderedFeatures`) e mostra os atributos da camada
  correspondente à feição clicada.
- **App shell offline**: `vite-plugin-pwa` gera o service worker (Workbox)
  só no build de produção — `npm run dev` não registra service worker.
- **Mapas offline**: os `.pmtiles` baixados ficam como `Blob` no IndexedDB
  (`src/lib/db.js`), lidos via `src/lib/pmtilesBlobSource.js` (implementação
  de `Source` da lib `pmtiles` que fatia o Blob em memória, sem range
  request HTTP) — por isso o MapLibre renderiza tudo sem nenhuma chamada
  de rede depois da primeira sincronização.

## Testar offline de verdade

```bash
npm run build
npm run preview -- --port 4173
```

Abra `http://localhost:4173`, faça login (o mapa já sincroniza sozinho),
recarregue a página uma vez (pra garantir que o service worker assumiu
controle), depois desligue a rede (DevTools → Network → Offline, ou
desconecte o Wi-Fi/dados) e confirme que o mapa, as camadas e o clique
nos talhões continuam funcionando sem internet.

## Debug

Em `npm run dev` (modo DEV), a instância do MapLibre fica exposta em
`window.__map` (só em dev — eliminado do bundle de produção) pra
inspeção manual no console do navegador.
