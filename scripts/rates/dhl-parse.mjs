// Lê o listino DHL Express (PDF do contrato "TIME DEFINITE / DAY DEFINITE")
// e gera a tabela padrão dos listini do Gestionale (JSON).
// Uso: node scripts/rates/dhl-parse.mjs <listino.pdf> > dhl.json
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

async function pages(file) {
  const doc = await pdfjs.getDocument({ data: new Uint8Array(fs.readFileSync(file)), useSystemFonts: true, verbosity: 0 }).promise;
  const out = [];
  for (let p = 1; p <= doc.numPages; p++) {
    const tc = await (await doc.getPage(p)).getTextContent();
    const rows = new Map();
    for (const it of tc.items) { const y = Math.round(it.transform[5]); (rows.get(y) ?? rows.set(y, []).get(y)).push([it.transform[4], it.str]); }
    out.push([...rows.entries()].sort((a, b) => b[0] - a[0])
      .map(([, r]) => r.sort((a, b) => a[0] - b[0]).map((x) => x[1]).join(' ').replace(/\s+/g, ' ').trim()).filter(Boolean));
  }
  return out;
}
const isNum = (s) => /^\d+(?:\.\d+)?$/.test(s);

const SERVICES = [
  [/DHL EXPRESS WORLDWIDE EXPORT/, { code: 'WPX', name: 'DHL Express Worldwide', direction: 'export', zoning: 'express', region: 'world' }],
  [/DHL EXPRESS WORLDWIDE IMPORT/, { code: 'WPX', name: 'DHL Express Worldwide', direction: 'import', zoning: 'express', region: 'world' }],
  [/DHL EXPRESS DOMESTIC(?! ZONING)/, { code: 'DOM', name: 'DHL Express Domestic', direction: 'export', zoning: 'domestic', region: 'italy' }],
  [/DHL ECONOMY SELECT EXPORT(?! ZONING)/, { code: 'ESI', name: 'DHL Economy Select', direction: 'export', zoning: 'economy', region: 'europe' }],
  [/DHL ECONOMY SELECT IMPORT(?! ZONING)/, { code: 'ESI', name: 'DHL Economy Select', direction: 'import', zoning: 'economy', region: 'europe' }],
];

function parseService(lines, base) {
  const svc = { ...base, zones: null, steps: [], perKg: [], extra: [] };
  let mode = null, step = null;
  for (const l of lines) {
    if (/^Documenti fino a/.test(l)) { mode = 'skip'; continue; }
    if (/^Non Documenti/.test(l)) { mode = 'rates'; continue; }
    const kg = l.match(/^KG (Zona .*)$/);
    if (kg) { if (mode === 'rates') svc.zones = [...kg[1].matchAll(/Zona (\w+)/g)].map((m) => m[1]); continue; }
    const sup = l.match(/^Supplemento per ogni (\d+(?:\.\d+)?) KG/);
    if (sup) { mode = 'extra'; step = Number(sup[1]); continue; }
    if (/^Da A /.test(l)) continue;
    if (/^Premium/.test(l)) { mode = null; continue; }
    const t = l.split(' ');
    if (mode === 'rates' && svc.zones && t.length === svc.zones.length + 1 && t.every(isNum)) {
      svc.steps.push({ upTo: Number(t[0]), prices: Object.fromEntries(svc.zones.map((z, i) => [z, Number(t[i + 1])])) });
    } else if (mode === 'extra' && svc.zones && isNum(t[0])) {
      // "10.1 20 1.28 ..." ou "300.1 99 999 3.28 ..." (99 999 = sem limite)
      let to, rest;
      if (t[1] === '99' && /^99/.test(t[2] ?? '')) { to = null; rest = t.slice(3); } else { to = Number(t[1]); rest = t.slice(2); }
      if (rest.length === svc.zones.length && rest.every(isNum)) {
        const from = Math.round((Number(t[0]) - 0.1) * 10) / 10; // "da 10.1" = a partir de 10
        svc.extra.push({ from, to, step, prices: Object.fromEntries(svc.zones.map((z, i) => [z, Number(rest[i])])) });
      }
    }
  }
  return svc;
}

// códigos próprios da DHL → ISO
const DHL_CODES = { XC: 'CW', XB: 'BQ', XE: 'BQ', XM: 'SX', XY: 'BL', XN: 'KN', XS: 'SO', KV: 'XK' };

function parseZoning(lines) {
  const toks = lines.join(' ').split(/\s+/);
  const out = {}, strays = [];
  for (let i = 0; i < toks.length; i++) {
    const m = toks[i].match(/^\(([A-Z]{2})\)$/);
    if (!m) continue;
    let j = i + 1;
    if (/^\*\d$/.test(toks[j] ?? '')) j++;
    if (/^\d$/.test(toks[j] ?? '')) {
      const iso = DHL_CODES[m[1]] ?? m[1];
      if (!out[iso]) out[iso] = toks[j];
      while (/^\d$/.test(toks[j + 1] ?? '')) strays.push(toks[++j]);
      i = j;
    } else if (strays.length) {
      const iso = DHL_CODES[m[1]] ?? m[1];
      if (!out[iso]) out[iso] = strays.shift();
    }
  }
  return out;
}

const all = await pages(process.argv[2]);
const services = [], zoning = {};
let validFrom = null;
for (const lines of all) {
  const text = lines.join('\n');
  const d = text.match(/Ratecard as of: (\d{2})-(\w{3})-(\d{4})/);
  if (d && !validFrom) validFrom = `${d[3]}-${String(['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].indexOf(d[2]) + 1).padStart(2, '0')}-${d[1]}`;
  if (/EXPORT ZONING & IMPORT ZONING/.test(text)) {
    const z = parseZoning(lines.filter((l) => !/Città/.test(l)));
    const key = /ECONOMY SELECT/.test(text) ? 'economy' : 'express';
    zoning[key] = { export: z, import: z };
    continue;
  }
  const hit = SERVICES.find(([re]) => re.test(text));
  if (hit) services.push(parseService(lines, hit[1]));
}
zoning.domestic = { export: { IT: 'A' } };
const out = {
  carrier: 'DHL', currency: 'EUR', validFrom,
  // divisore volumetrico: il contratto rimanda a MyDHL; 5000 è lo standard DHL Express
  volumetricDivisor: 5000, roundTo: 0.5,
  notes: 'Tariffe contratto DHL Express (Officine Mattio). Esclusi IVA, supplemento carburante, dazi e servizi opzionali.',
  zoning, services,
};
process.stdout.write(JSON.stringify(out, null, 1));
console.error('servizi: ' + services.map((s) => `${s.code}/${s.direction}(${s.steps.length} faixas, ${s.extra.length} suppl., zonas ${s.zones?.join('')})`).join(' | '));
console.error('zonari: ' + Object.entries(zoning).map(([k, v]) => `${k} ${Object.keys(v.export).length}`).join(', '));
