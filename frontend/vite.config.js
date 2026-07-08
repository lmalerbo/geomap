import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg'],
      manifest: {
        name: 'GeoMap',
        short_name: 'GeoMap',
        description: 'Mapas de talhão offline — GeoMap',
        theme_color: '#2c6b47',
        background_color: '#f7f9fa',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'favicon.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
        ],
      },
      workbox: {
        // O app shell (HTML/JS/CSS) é cacheado pelo Workbox. Os .pmtiles
        // baixados ficam no IndexedDB (lib/db.js), não passam pelo SW.
        // .pbf são os glyphs de fonte (public/fonts/) — sem cachear isso,
        // os rótulos do mapa não apareceriam offline.
        globPatterns: ['**/*.{js,css,html,svg,pbf}'],
      },
    }),
  ],
})
