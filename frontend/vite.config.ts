import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig(({ mode }) => ({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      manifest: {
        name: 'FlowOps Platform',
        short_name: 'FlowOps',
        theme_color: '#020817',
        background_color: '#020817',
        display: 'standalone',
        icons: [
          {
            src: '/icon-192.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any'
          },
          {
            src: '/icon-192-maskable.png',
            sizes: '192x192',
            type: 'image/png',
            purpose: 'maskable'
          },
          {
            src: '/icon-512-maskable.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable'
          }
        ]
      }
    })
  ],
  resolve: {
    alias: {
      '@': '/src',
    },
  },
  build: {
    // Never ship source maps to production — they would expose readable source.
    sourcemap: false,
    // Strip console.* and debugger from the production bundle (esbuild minifier).
    // Keeps console.error/console.warn so genuine runtime issues still surface.
    minify: 'esbuild',
    rollupOptions: {
      output: {
        manualChunks: {
          'vendor-react': ['react', 'react-dom', 'react-router-dom'],
          'vendor-axios': ['axios'],
          'vendor-socket': ['socket.io-client'],
          'vendor-lucide': ['lucide-react'],
          'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-dropdown-menu', '@radix-ui/react-slot'],
        },
      },
    },
  },
  // Production-only source hardening: drop debugger statements and mark the
  // chatty console methods as pure so the minifier removes them, while keeping
  // console.error / console.warn for genuine runtime diagnostics.
  esbuild:
    mode === 'production'
      ? {
          drop: ['debugger'],
          pure: ['console.log', 'console.info', 'console.debug', 'console.trace'],
          legalComments: 'none',
        }
      : {},
  server: {
    port: 5173,
    strictPort: true,
    hmr: {
      protocol: 'ws',
      host: 'localhost',
      port: 5173,
    },
    proxy: {
      // Backend (NestJS) listens on PORT=3000 by default (see backend/.env.example).
      // Override for local dev with VITE_DEV_API_PROXY if your backend runs elsewhere.
      '/api': {
        target: process.env.VITE_DEV_API_PROXY || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
      },
      // Proxy Socket.IO too, so the live map / dashboards work through the dev server.
      '/socket.io': {
        target: process.env.VITE_DEV_API_PROXY || 'http://localhost:3000',
        changeOrigin: true,
        secure: false,
        ws: true,
      },
    },
  },
}));
