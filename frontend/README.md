# Frontend — GeoPortal

React + Vite + MapLibre GL JS + `pmtiles`, PWA via `vite-plugin-pwa`
(Workbox). Três telas: login, catálogo, visualizador de mapa offline.

## Setup local

1. `cp .env.example .env` — ajustar `VITE_API_URL` se o backend não estiver
   em `http://localhost:3000`.
2. `npm install`
3. `npm run dev` (porta 5173). Precisa do backend rodando (ver
   `../backend/README.md`) pra login e catálogo funcionarem.

## Como o offline funciona de verdade

- **App shell**: `vite-plugin-pwa` gera um service worker (Workbox) que
  cacheia HTML/JS/CSS no build de produção. Só existe em `npm run build`
  seguido de `npm run preview` (ou deploy) — o `npm run dev` não registra
  service worker.
- **Mapas**: ao clicar "Baixar" no catálogo, o `.pmtiles` retornado por
  `GET /mapas/:id/download` é salvo como `Blob` no IndexedDB
  (`src/lib/db.js`). O visualizador (`src/pages/Mapa.jsx`) lê esse Blob
  via `src/lib/pmtilesBlobSource.js`, uma implementação da interface
  `Source` da lib `pmtiles` que fatia o Blob em memória em vez de fazer
  range request HTTP — por isso o MapLibre renderiza os talhões sem
  nenhuma chamada de rede depois do download inicial.
- **Catálogo offline**: se `GET /mapas` falhar (sem rede), a tela mostra
  os mapas já baixados localmente (lidos do IndexedDB) em vez de uma
  tela de erro.

## Testar offline de verdade

```bash
npm run build
npm run preview -- --port 4173
```

Abra `http://localhost:4173`, faça login, baixe um mapa, recarregue a
página (pra garantir que o service worker assumiu controle), depois
desligue a rede (DevTools → Network → Offline, ou desconecte o
Wi-Fi/dados) e confirme que o catálogo, o mapa e o clique nos talhões
continuam funcionando.

## Debug

Em `npm run dev` (modo DEV), a instância do MapLibre fica exposta em
`window.__map` (só em dev — eliminado do bundle de produção) pra
inspeção manual no console do navegador.
