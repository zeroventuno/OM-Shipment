/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import type { Plugin } from 'vite'

// Em desenvolvimento, /t/<code> abre a página do chip (em produção quem faz isso é o vercel.json).
function nfcTagPage(): Plugin {
  return {
    name: 'nfc-tag-page',
    configureServer(server) {
      server.middlewares.use((req, _res, next) => {
        if (req.url && /^\/t\/[^/?#]+\/?(\?.*)?$/.test(req.url)) req.url = '/tag.html'
        next()
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), nfcTagPage()],
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
        // ritiro.html: a mesma aplicação, com a prévia do pedido de retirada.
        ritiro: path.resolve(import.meta.dirname, 'ritiro.html'),
        // ferie.html: a mesma aplicação, com a prévia do pedido de férias.
        ferie: path.resolve(import.meta.dirname, 'ferie.html'),
        // tag.html: página leve do chip NFC (/t/<code>), sem a aplicação inteira.
        tag: path.resolve(import.meta.dirname, 'tag.html'),
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
