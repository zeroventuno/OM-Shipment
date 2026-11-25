/*
 * O que é "novo" para as notificações: itens pendentes que este navegador
 * ainda não viu. Função pura, testável; quem guarda os vistos é o Notifier.
 */

export interface NewsItem {
  key: string;
  title: string;
  body: string;
  to: string;
}

/**
 * Itens a avisar e o novo conjunto de vistos.
 * Na primeira vez (seen = null) nada é avisado: só marca o que já existe,
 * para não chover notificação ao ativar.
 */
export function diffNews(items: NewsItem[], seen: string[] | null): { notify: NewsItem[]; seen: string[] } {
  const keys = items.map((i) => i.key);
  if (seen === null) return { notify: [], seen: keys };
  const old = new Set(seen);
  const notify = items.filter((i) => !old.has(i.key));
  // guarda os atuais e os vistos recentes (limite para não crescer sem fim)
  const merged = [...new Set([...keys, ...seen])].slice(0, 500);
  return { notify, seen: merged };
}
