/**
 * Leitura mínima de planilhas exportadas pelos portais: .xlsx (primeira aba)
 * ou .csv. Sem dependências — a biblioteca mais usada para xlsx tem falhas de
 * segurança abertas e quebraria o `npm audit` do CI.
 *
 * Funciona no navegador (botão "Importar" da área Clienti) e no Node
 * (`npm run import-customers`). A descompactação do .xlsx usa o
 * DecompressionStream do navegador/Node 18+, ou a função passada em `inflateRaw`.
 *
 * Devolve uma lista de objetos { "Cabeçalho": "valor" }.
 */

async function defaultInflateRaw(bytes) {
    if (typeof DecompressionStream === 'undefined') throw new Error('Este navegador não consegue abrir .xlsx: salve como .csv');
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('deflate-raw'));
    return new Uint8Array(await new Response(stream).arrayBuffer());
}

const utf8 = new TextDecoder('utf-8');

/** Arquivos de um .zip (o .xlsx é um zip de XMLs): nome -> função que devolve o texto. */
function unzip(bytes, inflateRaw) {
    const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    const u32 = (o) => view.getUint32(o, true);
    const u16 = (o) => view.getUint16(o, true);
    let eocd = -1;
    for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65557); i--) {
        if (u32(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Arquivo não é um .xlsx válido');
    const count = u16(eocd + 10);
    let p = u32(eocd + 16);
    const files = new Map();
    for (let n = 0; n < count; n++) {
        if (u32(p) !== 0x02014b50) throw new Error('Arquivo .xlsx corrompido');
        const method = u16(p + 10);
        const size = u32(p + 20);
        const nameLen = u16(p + 28);
        const extraLen = u16(p + 30);
        const commentLen = u16(p + 32);
        const local = u32(p + 42);
        const name = utf8.decode(bytes.subarray(p + 46, p + 46 + nameLen));
        const start = local + 30 + u16(local + 26) + u16(local + 28);
        const raw = bytes.subarray(start, start + size);
        files.set(name, async () => utf8.decode(method === 8 ? await inflateRaw(raw) : raw));
        p += 46 + nameLen + extraLen + commentLen;
    }
    return files;
}

const decodeXml = (s) => s
    .replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(Number(d)))
    .replace(/&amp;/g, '&');

/** Texto de um <si> ou <is>: junta todos os <t>, inclusive os de rich text. */
const textOf = (xml) => [...xml.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map((m) => decodeXml(m[1])).join('');

const colIndex = (ref) => {
    const letters = ref.match(/^[A-Z]+/)[0];
    let n = 0;
    for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
    return n - 1;
};

async function readXlsx(bytes, inflateRaw) {
    const files = unzip(bytes, inflateRaw);
    const shared = files.has('xl/sharedStrings.xml')
        ? [...(await files.get('xl/sharedStrings.xml')()).matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
        : [];
    const sheetName = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
    if (!sheetName) throw new Error('Nenhuma aba encontrada no .xlsx');
    const xml = await files.get(sheetName)();
    const rows = [];
    for (const r of xml.matchAll(/<row\b[^>]*>([\s\S]*?)<\/row>/g)) {
        const row = [];
        for (const c of r[1].matchAll(/<c\b([^>]*?)(?:\/>|>([\s\S]*?)<\/c>)/g)) {
            const attrs = c[1];
            const ref = attrs.match(/\br="([A-Z]+\d+)"/)?.[1];
            const type = attrs.match(/\bt="(\w+)"/)?.[1];
            const body = c[2] ?? '';
            let value = null;
            if (type === 'inlineStr') value = textOf(body);
            else {
                const v = body.match(/<v>([\s\S]*?)<\/v>/)?.[1];
                if (v != null) value = type === 's' ? shared[Number(v)] : decodeXml(v);
            }
            row[ref ? colIndex(ref) : row.length] = value;
        }
        rows.push(row);
    }
    return rows;
}

export function parseCsvText(input) {
    const text = input.replace(/^\uFEFF/, '');
    const firstLine = text.split(/\r?\n/, 1)[0];
    const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';'
        : (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';
    const rows = [];
    let row = [], field = '', quoted = false;
    for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (quoted) {
            if (ch === '"' && text[i + 1] === '"') { field += '"'; i++; }
            else if (ch === '"') quoted = false;
            else field += ch;
        } else if (ch === '"') quoted = true;
        else if (ch === sep) { row.push(field); field = ''; }
        else if (ch === '\n' || ch === '\r') {
            if (ch === '\r' && text[i + 1] === '\n') i++;
            row.push(field); rows.push(row); row = []; field = '';
        } else field += ch;
    }
    if (field || row.length) { row.push(field); rows.push(row); }
    return rows;
}

function readCsv(bytes) {
    let text = utf8.decode(bytes);
    // Exportações antigas vêm em Latin-1: o UTF-8 inválido vira "�".
    if ((text.match(/�/g) || []).length > 3) text = new TextDecoder('windows-1252').decode(bytes);
    return parseCsvText(text);
}

/** bytes do arquivo (.xlsx ou .csv) -> linhas como objetos pelo cabeçalho. */
export async function parseSpreadsheet(input, { inflateRaw = defaultInflateRaw } = {}) {
    const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
    const isZip = bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
    const rows = isZip ? await readXlsx(bytes, inflateRaw) : readCsv(bytes);
    const [header = [], ...body] = rows;
    const names = header.map((h) => String(h ?? '').trim());
    return body
        .filter((r) => r.some((v) => v != null && String(v).trim() !== ''))
        .map((r) => Object.fromEntries(names.map((h, i) => [h, r[i] == null ? '' : String(r[i])])));
}
