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

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), VitePWA({
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
});