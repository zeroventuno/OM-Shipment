/**
 * Leitura mínima de planilhas exportadas pelos portais: .xlsx (primeira aba)
 * ou .csv. Sem dependências — a biblioteca mais usada para xlsx tem falhas de
 * segurança abertas e quebraria o `npm audit` do CI.
 *
 * Devolve uma lista de objetos { "Cabeçalho": "valor" }.
 */
import { readFileSync } from 'node:fs';
import { inflateRawSync } from 'node:zlib';

/** Arquivos de um .zip (o .xlsx é um zip de XMLs). */
function unzip(buf) {
    let eocd = -1;
    for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
        if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Arquivo não é um .xlsx válido (zip sem diretório central)');
    const count = buf.readUInt16LE(eocd + 10);
    let p = buf.readUInt32LE(eocd + 16);
    const files = new Map();
    for (let n = 0; n < count; n++) {
        if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('Zip corrompido');
        const method = buf.readUInt16LE(p + 10);
        const size = buf.readUInt32LE(p + 20);
        const nameLen = buf.readUInt16LE(p + 28);
        const extraLen = buf.readUInt16LE(p + 30);
        const commentLen = buf.readUInt16LE(p + 32);
        const local = buf.readUInt32LE(p + 42);
        const name = buf.toString('utf8', p + 46, p + 46 + nameLen);
        const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
        const raw = buf.subarray(start, start + size);
        files.set(name, () => (method === 8 ? inflateRawSync(raw) : raw).toString('utf8'));
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

function readXlsx(buf) {
    const files = unzip(buf);
    const shared = files.has('xl/sharedStrings.xml')
        ? [...files.get('xl/sharedStrings.xml')().matchAll(/<si>([\s\S]*?)<\/si>/g)].map((m) => textOf(m[1]))
        : [];
    const sheetName = [...files.keys()].filter((k) => /^xl\/worksheets\/sheet\d+\.xml$/.test(k)).sort()[0];
    if (!sheetName) throw new Error('Nenhuma aba encontrada no .xlsx');
    const xml = files.get(sheetName)();
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

function readCsv(buf) {
    let text = buf.toString('utf8');
    // Exportações antigas vêm em Latin-1: o UTF-8 inválido vira "�".
    if ((text.match(/�/g) || []).length > 3) text = buf.toString('latin1');
    text = text.replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/, 1)[0];
    const sep = (firstLine.match(/;/g) || []).length > (firstLine.match(/,/g) || []).length ? ';' : ',';
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

export function readSpreadsheet(path) {
    const buf = readFileSync(path);
    const rows = buf.readUInt32LE(0) === 0x04034b50 ? readXlsx(buf) : readCsv(buf);
    const [header = [], ...body] = rows;
    const names = header.map((h) => String(h ?? '').trim());
    return body
        .filter((r) => r.some((v) => v != null && String(v).trim() !== ''))
        .map((r) => Object.fromEntries(names.map((h, i) => [h, r[i] == null ? '' : String(r[i])])));
}
