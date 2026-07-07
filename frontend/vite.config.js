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
        name: 'GeoPortal',
        short_name: 'GeoPortal',
        description: 'Mapas de talhão offline — GeoPortal',
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
        globPatterns: ['**/*.{js,css,html,svg}'],
      },
    }),
  ],
})
