import { Component, type ErrorInfo, type ReactNode } from 'react'

const RELOAD_KEY = 'om-chunk-reload-at'

/** Erro de "arquivo da versão anterior não existe mais" (depois de uma publicação). */
export function isChunkError(error: unknown): boolean {
    const msg = error instanceof Error ? `${error.name} ${error.message}` : String(error)
    return /dynamically imported module|Importing a module script failed|error loading dynamically|Failed to fetch|ChunkLoadError|Unable to preload/i.test(msg)
}

/**
 * Recarrega a página uma vez para pegar a versão nova. Se já recarregou nos
 * últimos 30 s, não insiste (evita loop) e devolve false.
 */
export function reloadForNewVersion(): boolean {
    try {
        const last = Number(sessionStorage.getItem(RELOAD_KEY) || 0)
        if (Date.now() - last < 30_000) return false
        sessionStorage.setItem(RELOAD_KEY, String(Date.now()))
    } catch {
        /* sem sessionStorage: recarrega mesmo assim */
    }
    window.location.reload()
    return true
}

/**
 * Sem isto, qualquer erro numa tela deixa a página toda em branco. Aqui o
 * erro de versão antiga recarrega sozinho; os outros mostram a mensagem e um
 * botão para recarregar, sem perder o resto do sistema.
 */
export class AppErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
    state = { error: null as Error | null }

    static getDerivedStateFromError(error: Error) {
        return { error }
    }

    componentDidCatch(error: Error, info: ErrorInfo) {
        console.error('Erro na tela:', error, info.componentStack)
        if (isChunkError(error)) reloadForNewVersion()
    }

    render() {
        const { error } = this.state
        if (!error) return this.props.children
        return (
            <div role="alert" className="min-h-[50vh] flex flex-col items-start justify-center gap-4 max-w-xl mx-auto p-6">
                <h1 className="text-xl font-semibold">Qualcosa è andato storto</h1>
                <p className="text-sm text-muted-foreground">
                    {isChunkError(error)
                        ? "È uscita una nuova versione del sistema. Ricarica la pagina per continuare."
                        : "La pagina ha avuto un errore. Ricaricala; se succede di nuovo, manda uno screenshot di questo messaggio."}
                </p>
                <pre className="text-xs text-muted-foreground whitespace-pre-wrap break-all bg-secondary/50 rounded-md p-3 w-full">{error.message}</pre>
                <button
                    type="button"
                    onClick={() => window.location.reload()}
                    className="h-10 px-4 rounded-md bg-primary text-primary-foreground text-sm font-semibold"
                >
                    Ricarica la pagina
                </button>
            </div>
        )
    }
}
