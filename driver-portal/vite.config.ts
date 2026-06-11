import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 8083,
    host: '0.0.0.0',
  },
  preview: {
    port: 8083,
    host: '0.0.0.0',
  },
  build: {
    chunkSizeWarningLimit: 500,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          if (id.includes('node_modules')) {
            if (id.includes('react-dom') || id.includes('react/')) {
              return 'vendor-react'
            }
            if (id.includes('leaflet') || id.includes('react-leaflet')) {
              return 'vendor-maps'
            }
            if (id.includes('recharts') || id.includes('d3')) {
              return 'vendor-charts'
            }
            if (id.includes('html5-qrcode')) {
              return 'vendor-qr'
            }
            if (id.includes('lucide-react')) {
              return 'vendor-ui'
            }
            return 'vendor-misc'
          }
        },
      },
    },
  },
})
