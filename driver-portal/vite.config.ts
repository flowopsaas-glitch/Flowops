import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// The portal is served by nginx which proxies /api and /socket.io to the API
// container. The SPA talks to the backend via the /api/v1 prefix.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'logos/flowops-logo-192.png', 'logos/flowops-logo-512.png'],
      manifest: {
        name: 'FlowOps Driver',
        short_name: 'FlowOps',
        description: 'FlowOps Driver Portal — deliveries, chat with dispatch, and POD',
        start_url: '/',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#0f172a',
        theme_color: '#1e40af',
        icons: [
          { src: '/logos/flowops-logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/logos/flowops-logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/logos/flowops-logo-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: '/logos/flowops-logo-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        clientsClaim: true,
        skipWaiting: true,
        cleanupOutdatedCaches: true,
        // Never cache API calls — the app handles its own offline cache (Dexie).
        navigateFallbackDenylist: [/^\/api/, /^\/socket\.io/],
      },
    }),
  ],
  build: { sourcemap: false },
  server: {
    port: 5174,
    proxy: {
      '/api': { target: process.env.VITE_DEV_API_PROXY || 'http://localhost:3000', changeOrigin: true },
      '/socket.io': { target: process.env.VITE_DEV_API_PROXY || 'http://localhost:3000', changeOrigin: true, ws: true },
    },
  },
});
