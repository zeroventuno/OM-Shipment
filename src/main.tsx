import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import App from './App'
import './index.css'
import './i18n'
import { AuthProvider } from '@/contexts/AuthContext'
import { Toaster } from '@/components/ui/toaster'
import { TooltipProvider } from '@/components/ui/tooltip'
import { AppErrorBoundary, reloadForNewVersion } from '@/components/AppErrorBoundary'

// Depois de uma publicação os arquivos da versão anterior somem: quem estava
// com a página aberta recarrega e pega a versão nova, em vez de tela branca.
window.addEventListener('vite:preloadError', (event) => {
    if (reloadForNewVersion()) event.preventDefault()
})

const queryClient = new QueryClient({
    defaultOptions: {
        queries: { refetchOnWindowFocus: false, retry: 1, staleTime: 30_000 },
        mutations: { retry: false },
    },
})

ReactDOM.createRoot(document.getElementById('root')!).render(
    <React.StrictMode>
        <BrowserRouter>
            <QueryClientProvider client={queryClient}>
                <AuthProvider>
                    <TooltipProvider>
                        <AppErrorBoundary>
                            <App />
                        </AppErrorBoundary>
                        <Toaster />
                    </TooltipProvider>
                </AuthProvider>
            </QueryClientProvider>
        </BrowserRouter>
    </React.StrictMode>,
)
