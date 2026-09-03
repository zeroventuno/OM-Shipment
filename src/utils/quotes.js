/**
 * Compara as cotações de um envio e devolve a análise de economia.
 *
 * `savings` é a diferença entre a cotação MAIS CARA e a escolhida — quanto se
 * deixou de gastar por não pegar a pior opção. Escolher a mais cara dá zero.
 *
 * @param {Array<{id:number, portal:string, carrier:string, price:string|number}>} quotes
 * @param {number|null} selectedQuoteId  cotação escolhida; sem ela, assume a mais barata
 * @returns {{best:object, worst:object, selected:object, savings:number}|null}
 *          null quando nenhuma cotação tem preço válido
 */
export function analyzeQuotes(quotes, selectedQuoteId = null) {
    const validQuotes = (quotes || []).filter(
        q => q.price !== '' && q.price !== null && q.price !== undefined && !isNaN(parseFloat(q.price))
    );
    if (validQuotes.length === 0) return null;

    const sorted = [...validQuotes].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
    const best = sorted[0];
    const worst = sorted[sorted.length - 1];

    const selected = selectedQuoteId
        ? validQuotes.find(q => q.id === selectedQuoteId) || best
        : best;

    return {
        best,
        worst,
        selected,
        savings: parseFloat(worst.price) - parseFloat(selected.price)
    };
}

/**
 * Lucro do envio: o que o cliente pagou menos o custo da cotação escolhida.
 * Pode ser negativo — é justamente o que os relatórios usam para achar os
 * clientes que dão prejuízo.
 */
export function calculateProfit(customerPayment, selectedQuote) {
    const paid = parseFloat(customerPayment) || 0;
    const cost = parseFloat(selectedQuote?.price) || 0;
    return paid - cost;
}
