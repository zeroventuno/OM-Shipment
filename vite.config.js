import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      output: {
        // Separa as bibliotecas pesadas do código da aplicação: elas mudam
        // pouco e ficam em cache do navegador entre deploys.
        // O Rolldown (Vite 8) só aceita manualChunks como função.
        manualChunks(id) {
          if (!id.includes('node_modules')) return
          if (id.includes('recharts') || id.includes('d3-')) return 'charts'
          if (id.includes('xlsx')) return 'xlsx'
          if (id.includes('pdf-lib')) return 'pdf'
          if (id.includes('@supabase')) return 'supabase'
          if (id.includes('react-router') || id.includes('react-dom') || id.includes('/react/')) return 'react'
          if (id.includes('i18next')) return 'i18n'
        },
      },
    },
  },
})
