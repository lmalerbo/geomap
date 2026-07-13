/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serve como "<usuário>.github.io/geomap/" (project page, sem
// domínio próprio) — precisa do base certo, senão os assets do build
// resolvem pra "/assets/..." (raiz) em vez de "/geomap/assets/...".
// GITHUB_PAGES só é setado no workflow de deploy (.github/workflows/
// deploy-frontend.yml); dev/build/preview local continuam em "/", sem
// mudar nada do fluxo já testado o resto da sessão.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { storybookTest } from '@storybook/addon-vitest/vitest-plugin';
import { playwright } from '@vitest/browser-playwright';
const dirname = typeof __dirname !== 'undefined' ? __dirname : path.dirname(fileURLToPath(import.meta.url));

// More info at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon
const base = process.env.GITHUB_PAGES ? '/geomap/' : '/';

// GitHub Pages não permite configurar cabeçalhos HTTP customizados
// (CSP/COOP/X-Frame-Options/HSTS via header exigem servidor próprio ou um
// CDN na frente, fora do escopo atual) — um <meta http-equiv> é o único CSP
// possível nesse hosting; cobre a maior parte do valor (bloqueia
// script/estilo/conexão de origem não autorizada) mas não pode usar
// frame-ancestors/report-uri/sandbox (só válidos via header). Gerado aqui
// (não hardcoded em index.html) por dois motivos, os dois já encontrados na
// prática ao implementar isso:
// 1. connect-src precisa bater com o backend de verdade sendo usado —
//    localhost:3000 em dev, o backend real em produção — travado num só
//    desses quebra o login no outro ambiente.
// 2. script-src 'self' (sem unsafe-inline) quebra o próprio dev server do
//    Vite — o Fast Refresh injeta um <script type="module"> inline no
//    index.html só em modo dev (`vite`/`command === "serve"`), nunca no
//    build de produção (que só gera <script src> externos). Por isso
//    'unsafe-inline' em script-src é liberado só em dev.
function cspContent(command) {
  const apiUrl = process.env.VITE_API_URL || 'http://localhost:3000';
  const conectaCom = ["'self'", apiUrl, 'https://server.arcgisonline.com'].join(' ');
  const scriptSrc = command === 'serve' ? "script-src 'self' 'unsafe-inline'" : "script-src 'self'";
  return [
    "default-src 'self'",
    scriptSrc,
    // 'unsafe-inline' necessário porque o app usa muito style={{...}}
    // inline do React (swatches de cor de camada, posicionamento de
    // painéis) — CSP restringe atributo style inline, não só <style>/<link>.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://server.arcgisonline.com",
    "font-src 'self'",
    `connect-src ${conectaCom}`,
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

function injetarCsp(command) {
  return {
    name: 'injetar-csp',
    transformIndexHtml() {
      return [
        {
          tag: 'meta',
          attrs: { 'http-equiv': 'Content-Security-Policy', content: cspContent(command) },
          injectTo: 'head-prepend',
        },
      ];
    },
  };
}

// https://vite.dev/config/
export default defineConfig(({ command }) => ({
  base,
  // Lighthouse apontou "Missing source maps for large first-party
  // JavaScript" — não custam nada em produção (só carregam se o devtools
  // estiver aberto de propósito) e ajudam a debugar um bug real relatado
  // em produção sem precisar reproduzir localmente.
  build: {
    sourcemap: true,
  },
  plugins: [react(), injetarCsp(command), VitePWA({
    registerType: 'autoUpdate',
    includeAssets: ['favicon.svg'],
    manifest: {
      name: 'GeoMap',
      short_name: 'GeoMap',
      description: 'Mapas de talhão offline — GeoMap',
      theme_color: '#2c6b47',
      background_color: '#f7f9fa',
      display: 'standalone',
      start_url: base,
      scope: base,
      icons: [{
        src: 'favicon.svg',
        sizes: 'any',
        type: 'image/svg+xml',
        purpose: 'any'
      }, {
        src: 'icon-192.png',
        sizes: '192x192',
        type: 'image/png',
        purpose: 'any'
      }, {
        src: 'icon-512.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'any'
      }, {
        src: 'icon-512-maskable.png',
        sizes: '512x512',
        type: 'image/png',
        purpose: 'maskable'
      }]
    },
    workbox: {
      // O app shell (HTML/JS/CSS) é cacheado pelo Workbox. Os .pmtiles
      // baixados ficam no IndexedDB (lib/db.js), não passam pelo SW.
      // .pbf são os glyphs de fonte (public/fonts/) — sem cachear isso,
      // os rótulos do mapa não apareceriam offline.
      globPatterns: ['**/*.{js,css,html,svg,png,pbf}']
    }
  })],
  test: {
    projects: [{
      extends: true,
      plugins: [
      // The plugin will run tests for the stories defined in your Storybook config
      // See options at: https://storybook.js.org/docs/next/writing-tests/integrations/vitest-addon#storybooktest
      storybookTest({
        configDir: path.join(dirname, '.storybook')
      })],
      test: {
        name: 'storybook',
        browser: {
          enabled: true,
          headless: true,
          provider: playwright({}),
          instances: [{
            browser: 'chromium'
          }]
        }
      }
    }]
  }
}));