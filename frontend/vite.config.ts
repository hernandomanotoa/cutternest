import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    exclude: ['public/assembly-planner/**', 'e2e/**', 'node_modules', 'dist', '.idea', '.git'],
  },
  server: {
    port: 3000,
    proxy: {
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
      }
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks(id: string) {
          // El helper de preload de Vite debe vivir en el grafo estático; si
          // Rollup lo hoistea a un chunk diferido, ese chunk carga al arranque.
          if (id.includes('vite/preload-helper')) return 'vendor'
          if (!id.includes('node_modules')) return
          // Dependencias compartidas con react-three/recharts: se fijan en un
          // chunk propio para que Rollup no las hoistee dentro de los chunks
          // diferidos 'three'/'charts' (eso forzaba su carga en el arranque).
          if (/[\\/]node_modules[\\/](react|react-dom|scheduler|zustand)[\\/]/.test(id)) return 'vendor'
          if (/[\\/]node_modules[\\/](three|@react-three)[\\/]/.test(id)) return 'three'
          if (/[\\/]node_modules[\\/](recharts|victory-vendor|d3-|d3[\\/])/.test(id)) return 'charts'
          if (/[\\/]node_modules[\\/](jspdf|html2canvas|fflate|atob|btoa)[\\/]/.test(id)) return 'pdf'
        },
      },
    },
  }
})
