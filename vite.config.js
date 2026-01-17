import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'
import process from 'node:process'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['pwa.svg'],
      manifest: {
        name: 'SorinB',
        short_name: 'SorinB',
        description: 'SorinB web app',
        theme_color: '#0b1220',
        background_color: '#0b1220',
        display: 'standalone',
        scope: '/',
        start_url: '/',
        icons: [
          {
            src: '/pwa.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'any',
          },
          {
            src: '/pwa.svg',
            sizes: 'any',
            type: 'image/svg+xml',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        navigateFallback: '/index.html',
        runtimeCaching: [
          // Queue writes when offline and replay later (Background Sync).
          // Note: Supported mainly on Android/Chrome when installed as a PWA.
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/locations'),
            method: 'POST',
            handler: 'NetworkOnly',
            options: {
              backgroundSync: {
                name: 'locations-queue',
                options: {
                  maxRetentionTime: 24 * 60, // minutes
                },
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/gps'),
            method: 'POST',
            handler: 'NetworkOnly',
            options: {
              backgroundSync: {
                name: 'gps-queue',
                options: {
                  maxRetentionTime: 24 * 60, // minutes
                },
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/gps'),
            handler: 'NetworkFirst',
            options: {
              cacheName: 'gps-cache',
              networkTimeoutSeconds: 3,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
        ],
      },
      devOptions: {
        // Dev SW can be noisy and may fail if dev output folder is missing.
        // Keep it off by default; enable with SW_DEV=true when needed.
        enabled: process.env.SW_DEV === 'true',
      },
    }),
  ],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/gps': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
      '/healthz': {
        target: 'http://localhost:3000',
        changeOrigin: true,
      },
    },
  },
})


