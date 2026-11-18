/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(import.meta.dirname, 'src'),
    },
  },
  build: {
    rollupOptions: {
      // assistenza.html: a mesma aplicação, com a prévia de link do formulário público.
      input: {
        main: path.resolve(import.meta.dirname, 'index.html'),
        assistenza: path.resolve(import.meta.dirname, 'assistenza.html'),
      },
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
          if (id.includes('@radix-ui')) return 'radix'
        },
      },
    },
  },
  test: {
    environment: 'node',
  },
})
