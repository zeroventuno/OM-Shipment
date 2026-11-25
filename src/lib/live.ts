/*
 * Listas que se atualizam sozinhas: a cada minuto enquanto a aba está
 * visível e na hora em que se volta para ela. Só para listas: formulários
 * e fichas abertas não recarregam sozinhos, para não apagar o que está
 * sendo digitado.
 */
export const LIVE = { refetchInterval: 60_000, refetchOnWindowFocus: true } as const;
