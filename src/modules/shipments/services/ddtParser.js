/**
 * Lê o DDT (bolla di scarico / documento di trasporto) emitido no gestionale
 * da Officine Mattio. Função pura: recebe as linhas de texto do PDF, uma por
 * altura na página (ver pdfText.js).
 *
 * No modelo da OM o número e a data ficam juntos, logo abaixo de "NUMERO DATA":
 *   2/380 20/11/2026 DESTINAZIONE      → nº "2/380" (série/número), data 2026-11-20
 * A causale vem na linha de baixo de "CAUSALE DI TRASPORTO":
 *   Reso garanzia 0 1                  → "Reso garanzia"
 * O destinatário é a linha logo depois de "DESTINATARIO".
 */
export function parseDdtText(lines) {
    const out = { number: '', date: '', reason: '', consignee: '' };
    let next = null; // o que a próxima linha traz
    let reasonTries = 0;
    for (const raw of lines) {
        const line = String(raw).replace(/\s+/g, ' ').trim();
        if (!line) continue;

        if (next === 'consignee') { out.consignee = line; next = null; continue; }
        if (next === 'reason') {
            // O endereço de destino sai na mesma altura e se mistura com estas
            // linhas: a causale é a que termina com os códigos de zona/agente/
            // página ("Reso garanzia 0 1") e não começa com número (CAP).
            const m = /^(\D.*?)(?:\s+\d+){1,3}$/.exec(line);
            if (m) { out.reason = m[1].trim(); next = null; continue; }
            if (++reasonTries >= 4) next = null;
        }
        if (/^DESTINATARIO$/i.test(line) && !out.consignee) { next = 'consignee'; continue; }
        if (/^CAUSALE DI TRASPORTO\b/i.test(line) && !out.reason) { next = 'reason'; reasonTries = 0; continue; }

        if (!out.number) {
            // a série fica no número: o packing list cita "DDT 2/380"
            const m = /\b(\d{1,3}\/\d{1,6})\s+(\d{2})\/(\d{2})\/(\d{4})\b/.exec(line);
            if (m) {
                out.number = m[1];
                out.date = `${m[4]}-${m[3]}-${m[2]}`;
            }
        }
    }
    return out;
}

/** "DDT_380_ALCHEMIST.pdf" / "Bolla 380.pdf" → "380" */
export function ddtNumberFromName(name) {
    const m = /(?:DDT|bolla|d\.d\.t\.?)[\s_.-]*(?:n\.?\s*)?(\d{1,6})/i.exec(String(name || ''));
    return m ? m[1] : '';
}
