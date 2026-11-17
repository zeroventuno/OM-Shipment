import { countryCode } from '../data/countries';

/**
 * Documentos de alfândega para envios fora da UE, num PDF único:
 *   1. a fatura emitida no gestionale (o PDF enviado pela equipe, sem mudanças);
 *   2. a declaração de livre exportação + procuração (inglês, modelo da OM);
 *   3. o mandato para o EUR.1 (italiano), quando o valor passa de €6.000.
 *
 * Os textos reproduzem os modelos que a OM já usa (fatura FT 1255). Só mudam
 * número e data da fatura e a data de hoje. O tracking não entra: os
 * documentos são anexados no portal antes de o envio gerar o tracking. pdf-lib entra por
 * import dinâmico, como no export dos PODs.
 */

// Estados-membros da UE (para os outros países os documentos são necessários).
export const EU_CODES = new Set([
    'AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE',
    'IT', 'LV', 'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE',
]);

/** Acima deste valor de fatura (€) vai também o mandato EUR.1. */
export const EUR1_THRESHOLD = 6000;

/** true quando o país é conhecido e está fora da UE. */
export function isExtraEu(country) {
    const code = country?.length === 2 ? country.toUpperCase() : countryCode(country);
    return !!code && !EU_CODES.has(code);
}

const COMPANY = {
    name: 'OFFICINE MATTIO SRL',
    lines: [
        'Via Renzo Gandolfo 6/A',
        'Fraz. Madonna dell’Olmo',
        '12100 CUNEO (CN) ITALY',
        'TAX CODE  03860450042',
        'EORI NUMBER IT03860450042',
        'Phone +39 0171 322329',
        'Email amministrazione@officinemattio.com',
    ],
    legalRep: 'Giovanni Monge Roffarello',
    legalRepIt: 'Monge Roffarello Giovanni',
    place: 'Cuneo',
};

const MONTHS_EN = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** '2026-10-26' → '26/10/2026' */
export function itDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${m[3]}/${m[2]}/${m[1]}` : '';
}

/** '2026-11-10' → '10 Nov 2026' */
export function enDate(iso) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '');
    return m ? `${Number(m[3])} ${MONTHS_EN[Number(m[2]) - 1]} ${m[1]}` : '';
}

/** Data de hoje em Roma, como AAAA-MM-DD. */
export function todayRome(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Rome', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// ---------------------------------------------------------------------------
// Textos dos modelos
// ---------------------------------------------------------------------------

const FREE_EXPORT_BULLETS = [
    'They do not fall under those protected by the Washington Convention (CITES), in accordance with Council Regulation (EC) No. 338/97 of 9 December 1996 and subsequent amendments, concerning the protection of species of wild fauna and flora by regulating trade therein.',
    'They are not included in the list of goods under Council Regulation (EC) No. 116/2009 of 18 December 2008 on the export of cultural goods.',
    'They are not included in the list of goods under Regulation (EU) No. 821/2021 of the European Parliament and of the Council of 20 May 2021 and subsequent amendments, establishing a Union regime for the control of exports, brokering, technical assistance, transit and transfer of dual-use items, and under Ministerial Decree No. 1325/BIS/371 of 1 July 2024.',
    'They are not included in the list of goods under Regulation (EU) No. 125/2019 of the European Parliament and of the Council of 16 January 2019 and subsequent amendments concerning trade in certain goods which could be used for capital punishment, torture or other cruel, inhuman or degrading treatment or punishment.',
    'They do not contain dog or cat fur, in accordance with Regulation (EC) No. 1523/2007 of the European Parliament and of the Council of 11 December 2007.',
    'They are not subject to the provisions of Regulation (EU) No. 649/2012 of the European Parliament and of the Council of 4 July 2012 and subsequent amendments concerning the export and import of hazardous chemicals.',
    'They are not included in the list of goods under Regulation (EU) No. 590/2024 of the European Parliament and of the Council of 7 February 2024 and subsequent amendments on substances that deplete the ozone layer.',
    'They are not subject to the provisions of Regulation (EC) No. 1013/2006 of the European Parliament and of the Council of 14 June 2006 and subsequent amendments concerning shipments of waste, and Regulation (EU) No. 1157/2024 of the European Parliament and of the Council of 11 April 2024 and subsequent amendments concerning waste shipments.',
    'They are not subject to the provisions of Regulation (EU) No. 573/2024 of the European Parliament and of the Council of 7 February 2024 and subsequent amendments on fluorinated greenhouse gases.',
    'They are not subject to the provisions of Regulation (EU) No. 852/2017 of the European Parliament and of the Council of 17 May 2017 and subsequent amendments on mercury.',
    'They are not subject to the provisions of Regulation (EU) No. 1115/2023 of the European Parliament and of the Council of 31 May 2023 and subsequent amendments concerning the placing on the Union market and the export from the Union of certain raw materials and products associated with deforestation and forest degradation.',
    'They are not included in the list of goods under Council Regulation (EC) No. 1210/2003 of 7 July 2003 and subsequent amendments concerning specific restrictions on economic and financial relations with Iraq.',
    'They are not included in the list of goods under Council Regulation (EU) No. 2016/44 of 18 January 2016 and subsequent amendments concerning restrictive measures in view of the situation in Libya.',
    'They are not included in the list of goods under Council Regulation (EU) No. 36/2012 of 18 January 2012 and subsequent amendments concerning restrictive measures in view of the situation in Syria.',
    'They are not subject to the provisions of Council Regulation (EC) No. 765/2006 of 18 May 2006 and subsequent amendments concerning restrictive measures against Belarus.',
    'They are not subject to the provisions of Council Regulation (EU) No. 833/2014 of 31 July 2014 and subsequent amendments concerning restrictive measures in view of Russia’s actions destabilizing the situation in Ukraine.',
    'They are not subject to the provisions of Council Decision 2014/512/CFSP of 31 July 2014 and subsequent amendments concerning restrictive measures in view of Russia’s actions destabilizing the situation in Ukraine.',
    'They are not subject to the provisions of Council Regulation (EU) No. 692/2014 of 23 June 2014 and subsequent amendments concerning restrictions on imports of goods from Crimea or Sevastopol into the Union, in response to the illegal annexation of Crimea and Sevastopol.',
    'They are not subject to the provisions of Council Regulation (EU) No. 2022/263 of 23 February 2022 and subsequent amendments concerning restrictive measures in response to the recognition, occupation or illegal annexation by the Russian Federation of certain non-government-controlled areas of Ukraine.',
    'They are covered by a contractual clause prohibiting their re-export to Belarus and their re-export for use in Belarus pursuant to Article 8 octies(1) of Council Regulation (EC) No. 765/2006 of 18 May 2006.',
    'They are covered by a contractual clause prohibiting their re-export to Russia and their re-export for use in Russia pursuant to Article 12 octies(1) of Council Regulation (EU) No. 833/2014 of 31 July 2014.',
];

/** Blocos da declaração de livre exportação (inglês). */
export function freeExportBlocks({ invoiceNumber, invoiceDate, today }) {
    const ref = `invoice no. ${invoiceNumber} dated ${itDate(invoiceDate)}`;
    const signature = [
        { type: 'gap', h: 6 },
        { type: 'keep', h: 66 },
        { type: 'p', text: `Place: ${COMPANY.place}, IT` },
        { type: 'p', text: `Date: ${enDate(today)}` },
        { type: 'signature', label: 'Signature:' },
    ];
    return [
        { type: 'title', text: 'Declaration of Free Export and Power of Attorney for Single Shipment' },
        { type: 'columns', left: 'Subject: Declaration of free export and special authorization', right: 'For UPS/DHL/FEDEX for customs procedures – For the competent Customs Office.' },
        { type: 'p', text: `I, ${COMPANY.legalRep}, in my capacity as legal representative of the company Officine Mattio SRL, hereby declare, under my personal responsibility and aware of the criminal penalties in case of false declarations pursuant to Art. 76 of Presidential Decree 445 of December 28, 2000, that the goods referred to in ${ref}:` },
        ...FREE_EXPORT_BULLETS.map((text) => ({ type: 'bullet', text })),
        { type: 'gap', h: 6 },
        { type: 'p', text: 'This document also grants the company UPS ITALIA SRL the authority to act as indirect representative, pursuant to and for the purposes of Article 18 of Regulation (EU) No. 952/2013 of the European Parliament and of the Council of 9 October 2013 and Article 31 of Legislative Decree No. 141 of 26 September 2024, for the execution of customs formalities and any related operations.' },
        ...signature,
        { type: 'gap', h: 14 },
        { type: 'h', text: 'Authorization for the issuance of certificates EUR.1, A.TR, and documents T2L/T2LF' },
        { type: 'p', text: `I, ${COMPANY.legalRep}, in my capacity as legal representative of Officine Mattio SRL, in reference to ${ref}, and aware of the criminal penalties in case of false declarations under Art. 76 of Presidential Decree 445 of December 28, 2000,` },
        { type: 'h', text: 'DECLARE THAT:' },
        { type: 'p', bold: true, text: 'For EUR.1 / EUR-MED:' },
        { type: 'p', text: 'The goods are produced in Italy and/or in the European Union and meet the preferential origin criteria. I authorize UPS Italia SRL, through its representatives, to issue the EUR.1 (or EUR-MED) certificate on behalf of the undersigned, releasing UPS from any responsibility. I commit to providing any required additional documentation to customs authorities if needed.' },
        { type: 'p', bold: true, text: 'For A.TR. or T2/T2LF documents:' },
        { type: 'p', text: 'The goods meet the conditions for obtaining the A.TR. certificate or T2L/T2LF document. They qualify as Union goods as defined by Art. 5(23) of Regulation (EU) No. 952/2013. I authorize UPS Italia SRL, through its representatives, to issue the above certificates or documents on behalf of the undersigned, releasing UPS from any responsibility.' },
        { type: 'p', text: 'The undersigned agrees to provide all required documentation and information as needed by customs authorities.' },
        ...signature,
    ];
}

/**
 * Blocos do mandato EUR.1 (italiano).
 * origin: 'wholly' (interamente ottenuti) | 'worked' (sufficientemente lavorati)
 * producer: 'own' (propri stabilimenti) | 'eu' (fabbricante comunitario)
 */
export function eur1Blocks({ invoiceNumber, invoiceDate, today, origin = 'wholly', producer = 'eu' }) {
    return [
        { type: 'p', bold: true, text: 'Spett.le DOGANA' },
        { type: 'p', text: `Il sottoscritto ${COMPANY.legalRepIt} Legale Rappresentante della società Officine Mattio srl codice fiscale/P. IVA n. IT03860450042, consapevole delle sanzioni previste dall’art. 76 del D.P.R. n. 445/2000 per false attestazioni e dichiarazioni mendaci,` },
        { type: 'h', center: true, text: 'DICHIARA' },
        { type: 'p', text: 'sotto la propria personale responsabilità ed essendo a conoscenza delle regole in materia di origine preferenziale, che:' },
        { type: 'check', checked: true, text: 'tutti i prodotti' },
        { type: 'check', checked: false, text: 'i seguenti prodotti (codice identificativo dei prodotti, valore) ______________________________' },
        { type: 'p', text: `indicati nella fattura n. ${invoiceNumber} del ${itDate(invoiceDate)} sono di origine/produzione della Comunità Europea e rispondono alle norme di origine preferenziale nell’ambito degli scambi tra la UE ed il paese terzo di destinazione, in quanto:` },
        { type: 'check', checked: origin === 'wholly', text: 'prodotti interamente ottenuti nella UE' },
        { type: 'check', checked: origin === 'worked', text: 'prodotti ottenuti nella UE in tutto o in parte con materiali non originari della comunità europea sufficientemente lavorati o trasformati' },
        { type: 'h', center: true, text: 'ATTESTA' },
        { type: 'p', text: 'che il prezzo indicato in fattura corrisponde a quello di transazione ai sensi dell’art. 70 e seguenti del Regolamento UE n. 952/2013 e che i prodotti' },
        { type: 'check', checked: producer === 'own', text: 'sono stati realizzati presso i propri stabilimenti' },
        { type: 'check', checked: producer === 'eu', text: 'sono stati realizzati da un fabbricante comunitario che ha rilasciato dichiarazione di produzione ed origine preferenziale comunitaria' },
        { type: 'h', center: true, text: 'CONFERISCE MANDATO' },
        { type: 'p', text: 'alla Società UPS ITALIA srl/fedex/DHL/CARGO COMPASS – P.IVA 09399880153 con sede legale in Strada Padana Superiore 2/B - 20063 - Cernusco sul Naviglio (MI) Operatore Economico Autorizzato IT AEOF 18 1443 a richiedere, sottoscrivere e presentare alla Dogana il certificato di circolazione EUR1, manlevando fin d’ora la mandataria da tutte le responsabilità derivanti da dette sottoscrizioni.' },
        { type: 'p', text: 'Il sottoscritto si impegna a presentare in qualsiasi momento, su richiesta delle autorità competenti, qualsiasi giustificazione supplementare che dette autorità ritenessero indispensabile per il rilascio del certificato stesso, come pure ad accettare qualunque controllo eventualmente richiesto da parte di dette autorità, della propria contabilità e delle circostanze relative alla fabbricazione dei prodotti di cui sopra.' },
        { type: 'gap', h: 10 },
        { type: 'sign2', left: 'Data e Luogo', leftValue: `${COMPANY.place.toUpperCase()}, ${itDate(today)}`, right: 'Firma e Timbro' },
    ];
}

// ---------------------------------------------------------------------------
// Montagem do PDF
// ---------------------------------------------------------------------------

const A4 = { width: 595.28, height: 841.89 };
const M = { left: 56, right: 56, top: 40, bottom: 46 };
const INK = [0.1, 0.1, 0.12];
const MUTED = [0.4, 0.4, 0.45];
const ACCENT = [0.17, 0.33, 0.55];

/**
 * Gera o PDF único. invoiceBytes: o PDF da fatura (ArrayBuffer/Uint8Array).
 * logoBytes: PNG do logo (opcional). signatureBytes: PNG da assinatura e
 * carimbo (opcional; sem ela, o espaço fica para assinar à mão). Devolve Uint8Array.
 */
export async function buildExportPdf({
    invoiceBytes, logoBytes, signatureBytes, invoiceNumber, invoiceDate, includeEur1,
    origin, producer, today = todayRome(),
}) {
    const { PDFDocument, StandardFonts, rgb } = await import('pdf-lib');
    const doc = await PDFDocument.create();
    doc.setTitle(`Export documents - invoice ${invoiceNumber}`);
    doc.setAuthor(COMPANY.name);

    if (invoiceBytes) {
        const src = await PDFDocument.load(invoiceBytes, { ignoreEncryption: true });
        const pages = await doc.copyPages(src, src.getPageIndices());
        pages.forEach((p) => doc.addPage(p));
    }

    const fonts = {
        regular: await doc.embedFont(StandardFonts.Helvetica),
        bold: await doc.embedFont(StandardFonts.HelveticaBold),
    };
    const logo = logoBytes ? await doc.embedPng(logoBytes) : null;
    const signature = signatureBytes ? await doc.embedPng(signatureBytes) : null;
    const color = (c) => rgb(c[0], c[1], c[2]);

    const ctx = { doc, fonts, logo, signature, color };
    renderDocument(ctx, freeExportBlocks({ invoiceNumber, invoiceDate, today }));
    if (includeEur1) renderDocument(ctx, eur1Blocks({ invoiceNumber, invoiceDate, today, origin, producer }));

    return doc.save();
}

/** Quebra o texto em linhas que cabem na largura. */
export function wrap(text, font, size, width) {
    const lines = [];
    for (const para of String(text).split('\n')) {
        let line = '';
        for (const word of para.split(/\s+/).filter(Boolean)) {
            const next = line ? `${line} ${word}` : word;
            if (line && font.widthOfTextAtSize(next, size) > width) {
                lines.push(line);
                line = word;
            } else {
                line = next;
            }
        }
        lines.push(line);
    }
    return lines;
}

function renderDocument(ctx, blocks) {
    const { doc, fonts, color, signature } = ctx;
    // assinatura e carimbo por cima da linha, a partir de x, com a base em bottom
    const drawSignature = (x, bottom, w) => {
        if (!signature) return;
        page.drawImage(signature, { x, y: bottom, width: w, height: (w * signature.height) / signature.width });
    };
    const width = A4.width - M.left - M.right;
    let page;
    let y;
    let pageNo = 0;

    const newPage = () => {
        page = doc.addPage([A4.width, A4.height]);
        pageNo += 1;
        y = drawLetterhead(ctx, page);
        page.drawText(String(pageNo), { x: A4.width - M.right - 6, y: M.bottom - 20, size: 9, font: fonts.regular, color: color(MUTED) });
    };
    const ensure = (h) => {
        if (y - h < M.bottom) newPage();
    };
    const lines = (text, { font = fonts.regular, size = 9.2, x = M.left, w = width, lead = 1.3, ink = INK, center = false } = {}) => {
        for (const line of wrap(text, font, size, w)) {
            ensure(size * lead);
            const lx = center ? M.left + (width - font.widthOfTextAtSize(line, size)) / 2 : x;
            page.drawText(line, { x: lx, y: y - size, size, font, color: color(ink) });
            y -= size * lead;
        }
    };

    newPage();
    for (const b of blocks) {
        switch (b.type) {
            case 'title':
                y -= 6;
                lines(b.text, { font: fonts.bold, size: 14, ink: ACCENT });
                y -= 8;
                break;
            case 'h':
                y -= 4;
                lines(b.text, { font: fonts.bold, size: 10.5, center: b.center });
                y -= 3;
                break;
            case 'columns': {
                const half = (width - 24) / 2;
                const l = wrap(b.left, fonts.bold, 9.5, half);
                const r = wrap(b.right, fonts.bold, 9.5, half);
                const rows = Math.max(l.length, r.length);
                ensure(rows * 13);
                for (let i = 0; i < rows; i++) {
                    if (l[i]) page.drawText(l[i], { x: M.left, y: y - 9.5, size: 9.5, font: fonts.bold, color: color(INK) });
                    if (r[i]) page.drawText(r[i], { x: M.left + half + 24, y: y - 9.5, size: 9.5, font: fonts.bold, color: color(INK) });
                    y -= 13;
                }
                y -= 10;
                break;
            }
            case 'p':
                lines(b.text, { font: b.bold ? fonts.bold : fonts.regular });
                y -= 5;
                break;
            case 'bullet': {
                ensure(14);
                page.drawCircle({ x: M.left + 3, y: y - 6.3, size: 1.8, color: color(INK) });
                lines(b.text, { x: M.left + 14, w: width - 14, size: 8.8 });
                y -= 3;
                break;
            }
            case 'check': {
                ensure(14);
                const bx = M.left + 4;
                const by = y - 10;
                page.drawRectangle({ x: bx, y: by, width: 9, height: 9, borderColor: color(INK), borderWidth: 0.8 });
                if (b.checked) {
                    page.drawLine({ start: { x: bx + 1.5, y: by + 1.5 }, end: { x: bx + 7.5, y: by + 7.5 }, thickness: 1.2, color: color(INK) });
                    page.drawLine({ start: { x: bx + 1.5, y: by + 7.5 }, end: { x: bx + 7.5, y: by + 1.5 }, thickness: 1.2, color: color(INK) });
                }
                lines(b.text, { x: M.left + 22, w: width - 22 });
                y -= 4;
                break;
            }
            case 'signature':
                ensure(30);
                y -= 18;
                page.drawText(b.label, { x: M.left, y, size: 9.5, font: fonts.regular, color: color(INK) });
                page.drawLine({ start: { x: M.left + 52, y: y - 2 }, end: { x: M.left + 230, y: y - 2 }, thickness: 0.6, color: color(INK) });
                drawSignature(M.left + 90, y - 18, 100);
                y -= 10;
                break;
            case 'sign2': {
                // com a imagem da assinatura, as linhas descem para dar espaço a ela
                const line = signature ? 70 : 40;
                ensure(line + 20);
                const rx = M.left + width / 2 + 20;
                page.drawText(b.left, { x: M.left + 30, y: y - 10, size: 9.5, font: fonts.regular, color: color(INK) });
                page.drawText(b.right, { x: rx + 30, y: y - 10, size: 9.5, font: fonts.regular, color: color(INK) });
                page.drawText(b.leftValue, { x: M.left, y: y - line + 8, size: 9.5, font: fonts.regular, color: color(INK) });
                page.drawLine({ start: { x: M.left, y: y - line }, end: { x: M.left + 180, y: y - line }, thickness: 0.6, color: color(INK) });
                page.drawLine({ start: { x: rx, y: y - line }, end: { x: rx + 180, y: y - line }, thickness: 0.6, color: color(INK) });
                drawSignature(rx + 40, y - line - 14, 100);
                y -= line + 10;
                break;
            }
            case 'keep':
                // mantém o bloco (local, data, assinatura) inteiro na mesma página
                ensure(b.h);
                break;
            case 'gap':
                y -= b.h;
                break;
            default:
                break;
        }
    }
}

/** Cabeçalho com logo e dados da empresa; devolve o y onde o corpo começa. */
function drawLetterhead({ fonts, logo, color }, page) {
    const top = A4.height - M.top;
    if (logo) {
        const w = 150;
        const h = (logo.height / logo.width) * w;
        page.drawImage(logo, { x: M.left, y: top - h, width: w, height: h });
    }
    const x = A4.width - M.right - 190;
    page.drawText(COMPANY.name, { x, y: top - 10, size: 11, font: fonts.bold, color: color(INK) });
    let y = top - 24;
    for (const line of COMPANY.lines) {
        page.drawText(line, { x, y, size: 8, font: fonts.regular, color: color(MUTED) });
        y -= 9.6;
    }
    y -= 8;
    page.drawLine({ start: { x: M.left, y }, end: { x: A4.width - M.right, y }, thickness: 0.6, color: color([0.82, 0.82, 0.85]) });
    return y - 14;
}

export function downloadBytes(bytes, filename) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
}
