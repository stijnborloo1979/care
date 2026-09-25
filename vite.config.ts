import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'icon-192.png', 'icon-512.png'],
      manifest: {
        name: 'Thuis — digitaal geheugen',
        short_name: 'Thuis',
        description: 'Weten wat er nu moet gebeuren, wie er komt en waar dingen liggen.',
        lang: 'nl-BE',
        start_url: '/',
        scope: '/',
        display: 'standalone',
        orientation: 'any',
        background_color: '#F1EFE9',
        theme_color: '#F1EFE9',
        icons: [
          { src: '/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: '/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // De afhandeling van pushberichten; de rest van de service worker
        // wordt gegenereerd. Het bestand staat in public/ en wordt dus
        // niet gebundeld.
        importScripts: ['push-sw.js'],
        // Een nieuwe versie neemt meteen over in plaats van te wachten tot
        // elk tabblad gesloten is. Op een tablet die maandenlang aan staat
        // gebeurt dat laatste nooit, en dan blijft de oude index.html naar
        // bestanden wijzen die na een deploy niet meer bestaan.
        skipWaiting: true,
        clientsClaim: true,
        cleanupOutdatedCaches: true,
        globPatterns: ['**/*.{js,css,html,svg,png,woff2}'],
        navigateFallback: '/index.html',
        runtimeCaching: [
          {
            // Foto's uit Supabase Storage: eerst uit de cache, zodat het
            // scherm van de persoon ook op een hikkende wifi blijft werken.
            urlPattern: /^https:\/\/.*\.supabase\.co\/storage\/v1\/object\/sign\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'thuis-media',
              expiration: { maxEntries: 200, maxAgeSeconds: 60 * 60 * 24 * 30 },
              cacheableResponse: { statuses: [0, 200] },
            },
          },
          {
            // API-antwoorden nooit cache-first: verouderde medicatie is
            // erger dan geen medicatie tonen.
            urlPattern: /^https:\/\/.*\.supabase\.co\/rest\/v1\/.*/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'thuis-api',
              networkTimeoutSeconds: 4,
              expiration: { maxEntries: 60, maxAgeSeconds: 60 * 60 * 24 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) },
  },
  // Een eigen bouwnummer per build. De bewaarde query-cache gebruikt dit
  // als buster: zonder dit blijft een cache van een oudere versie staan en
  // krijgt de nieuwe app objecten van de oude vorm terug. Dat legde ooit
  // het hele scherm van de persoon plat.
  //
  // Bewust hier en niet als omgevingsvariabele: die moet op elke omgeving
  // apart gezet worden, en gebeurt dat niet, dan is de buster overal
  // hetzelfde en gooit hij nooit iets weg.
  define: {
    __BUILD_ID__: JSON.stringify(
      process.env.VITE_BUILD_ID ?? process.env.CF_PAGES_COMMIT_SHA ?? String(Date.now()),
    ),
  },
  build: { sourcemap: false },
})
