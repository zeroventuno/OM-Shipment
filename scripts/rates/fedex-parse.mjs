// Lê os PDFs da FedEx (listino "QuickLift" por zona e o arquivo "Zone/Bande")
// e gera a tabela padrão dos listini do Gestionale (JSON).
// Uso: node scripts/rates/fedex-parse.mjs <listino.pdf> <zone.pdf> > fedex.json
import fs from 'node:fs';
import * as pdfjs from 'pdfjs-dist/legacy/build/pdf.mjs';

const num = (s) => Number(String(s).replace(/\./g, '').replace(',', '.'));
const isNum = (s) => /^\d+(?:[.,]\d+)?$/.test(s);

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

// ---------- listino ----------
function parseRates(pageLines) {
  const services = [];
  let validFrom = null;
  for (const lines of pageLines) {
    const head = lines.find((l) => /^TARIFFE (MONDO|EUROPA) \/ (EXPORT|IMPORT)/.test(l));
    if (!head) continue;
    const region = /EUROPA/.test(head) ? 'europe' : 'world';
    const direction = /IMPORT/.test(head) ? 'import' : 'export';
    const d = head.match(/dal (\d+) (\w+) (\d{4})/);
    if (d && !validFrom) validFrom = `${d[3]}-${String(['gennaio','febbraio','marzo','aprile','maggio','giugno','luglio','agosto','settembre','ottobre','novembre','dicembre'].indexOf(d[2]) + 1).padStart(2, '0')}-${d[1].padStart(2, '0')}`;
    let cur = null, zones = null, skip = false, pendingAdd = null;
    const start = (code, name) => { cur = { code, name, region, direction, zones: null, steps: [], perKg: [] }; services.push(cur); zones = null; skip = false; pendingAdd = null; };
    for (const l of lines) {
      const svc = l.match(/(FedEx[^()]*?)\s*\((IPE|IP|IE|RE|IPF|IEF|REF)\)/);
      if (svc) { start(svc[2], svc[1].replace(/[®*]/g, '').replace(/\s+/g, ' ').trim()); continue; }
      if (!cur) continue;
      if (/^PESO \(KG\)/.test(l)) { zones = [...l.matchAll(/ZONA ([A-Z])/g)].map((m) => m[1]); cur.zones = cur.zones ?? zones; continue; }
      if (/Tariffe per imballaggi FedEx/.test(l)) { skip = true; continue; }
      if (/Tariffe per altri imballaggi/.test(l) || /Tariffa al kg/.test(l)) { skip = false; continue; }
      if (skip || !zones) continue;
      const add = l.match(/^(\d+(?:,\d)?) kg addizionali (.*)$/);
      if (add) { pendingAdd = { step: num(add[1]), prices: add[2].split(' ').map(num) }; continue; }
      const kg = l.match(/^(\d+)-(\d+) (.*)$/) || l.match(/^(1000) \+ (.*)$/);
      if (kg) {
        const from = num(kg[1]), to = kg[3] !== undefined ? num(kg[2]) : null, vals = (kg[3] ?? kg[2]).split(' ').map(num);
        if (vals.length === zones.length) cur.perKg.push({ from, to, prices: Object.fromEntries(zones.map((z, i) => [z, vals[i]])) });
        continue;
      }
      const parts = l.split(' ');
      if (isNum(parts[0]) && parts.length === zones.length + 1 && parts.slice(1).every(isNum)) {
        const w = num(parts[0]);
        const row = { upTo: w, prices: Object.fromEntries(zones.map((z, i) => [z, num(parts[i + 1])])) };
        if (pendingAdd) { row.addStep = pendingAdd.step; row.addPrices = Object.fromEntries(zones.map((z, i) => [z, pendingAdd.prices[i]])); pendingAdd = null; }
        cur.steps.push(row);
      }
    }
  }
  // tira serviços vazios (cabeçalhos de explicação sem tabela)
  return { validFrom, services: services.filter((s) => s.steps.length || s.perKg.length) };
}

// ---------- zone ----------
const ALIASES = {
  'usa': 'US', 'u.s.a.': 'US', 'olanda': 'NL', 'regno unito': 'GB', 'rep. ceca': 'CZ', 'rep. slovacca': 'SK', 'corea del sud': 'KR',
  'rep. dem. del congo': 'CD', 'congo': 'CG', 'hong kong (ras), cina': 'HK', 'macao (ras), cina': 'MO', 'taiwan, cina': 'TW',
  'isole vergini amer.': 'VI', 'isole vergini brit.': 'VG', 'st. kitts & nevis': 'KN', 'st. lucia': 'LC', 'st. vincent': 'VC',
  'st. maarten (nl)': 'SX', 'st. martin (fr)': 'MF', 'antigua & barbuda': 'AG', 'trinidad & tobago': 'TT', 'isole turks & caicos': 'TC',
  'bonaire, saba, st. eustatius': 'BQ', 'eswatini (swaziland)': 'SZ', 'principato di monaco': 'MC', 'isola réunion': 'RE',
  'isole cayman': 'KY', 'isole cook': 'CK', 'isole fiji': 'FJ', 'isole marshall': 'MH', 'isole faröe': 'FO', 'saipan': 'MP',
  'wallis & futuna': 'WF', 'timor est': 'TL', 'costa d\'avorio': 'CI', 'macedonia del nord': 'MK', 'bosnia-erzegovina': 'BA',
  'palestina': 'PS', 'kirghizistan': 'KG', 'guyana francese': 'GF', 'polinesia francese': 'PF', 'papua nuova guinea': 'PG',
  'repubblica dominicana': 'DO', 'emirati arabi uniti': 'AE', 'arabia saudita': 'SA', 'nuova caledonia': 'NC', 'nuova zelanda': 'NZ',
  'curaçao': 'CW', 'bahrain': 'BH', 'porto rico': 'PR', 'tailandia': 'TH', 'malesia': 'MY', 'guadalupa': 'GP', 'micronesia': 'FM', 'sudafrica': 'ZA', 'capo verde': 'CV', 'groenlandia': 'GL', 'gibilterra': 'GI',
};
const dn = new Intl.DisplayNames(['it'], { type: 'region' });
const BY_NAME = {};
// códigos antigos que o Intl ainda nomeia ("Francia" = FX, "Germania" = DD…)
const DEPRECATED = new Set(['DD', 'FX', 'ZR', 'YU', 'CS', 'BU', 'TP', 'SU', 'UK', 'QO', 'EU', 'EZ', 'UN', 'ZZ', 'AN', 'NT', 'YD', 'BQ'.slice(0, 0)]);
for (let a = 65; a <= 90; a++) for (let b = 65; b <= 90; b++) {
  const code = String.fromCharCode(a, b);
  if (DEPRECATED.has(code) || Intl.getCanonicalLocales(`und-${code}`)[0] !== `und-${code}`) continue;
  try { const n = dn.of(code); if (n && n !== code) BY_NAME[n.toLowerCase()] = code; } catch { /* sem nome */ }
}
const isoOf = (name) => {
  const k = name.toLowerCase().replace(/\s*\(ue\)\s*/, '').replace(/\*+$/, '').trim();
  return ALIASES[k] ?? BY_NAME[k] ?? null;
};

function parseZones(pageLines) {
  const zones = { export: {}, import: {} }, unknown = [];
  const CODES = new Set(['ZONA', 'IPE', 'IP', 'IPF', 'IE', 'IEF', 'RE', 'REF', 'F']);
  for (const lines of pageLines) {
    const text = lines.join(' ');
    const direction = /ZONE IMPORT/.test(text) ? 'import' : 'export';
    const body = text.split(/PAESE\/TERRITORIO/).slice(1).join(' PAESE/TERRITORIO ').split(/Servizio disponibile/)[0]
      .replace(/(^|\s)([A-ZÀ-Ü]) (?=[a-zà-ü.][\p{L}.]+)/gu, '$1$2')   // "A lgeria" -> "Algeria", "U .S.A." -> "U.S.A."
      .replace(/\(UE\)/g, ' ').replace(/\*+/g, ' ');
    let toks = body.split(/\s+/).filter(Boolean);
    // tira os cabeçalhos "PAESE/TERRITORIO ZONA IPE IP IPF ..." (sequências de 2+ códigos de serviço)
    const clean = [];
    for (let i = 0; i < toks.length; i++) {
      if (toks[i] === 'PAESE/TERRITORIO') continue;
      let j = i; while (j < toks.length && CODES.has(toks[j])) j++;
      if (j - i >= 2) { i = j - 1; continue; }
      clean.push(toks[i]);
    }
    toks = clean;
    let name = [];
    for (let i = 0; i < toks.length; i++) {
      const tk = toks[i], next = toks[i + 1];
      if (tk === 'a' || tk === '-') { continue; }
      const zoneLike = /^[A-IM-PR-X]$/.test(tk) && name.length > 0 && (next === undefined || next === 'a' || next === '-' || /^[A-ZÀ-Ü]/.test(next));
      if (zoneLike) {
        const n = name.join(' ');
        name = [];
        if (/^(Memphis|New York|Altre città|Città principali)$/.test(n)) continue;
        // sobra de outra coluna antes do nome (ex.: "Memphis Ecuador"): tira palavras do começo até achar o país
        let words = n.split(' '), iso = null;
        while (words.length && !(iso = isoOf(words.join(' ')))) words = words.slice(1);
        if (!iso) { if (!/^[A-Z]$|^(Memphis|New York|Altre città|Città principali)$/.test(n)) unknown.push(`${direction}:${n}`); continue; }
        if (!zones[direction][iso]) zones[direction][iso] = tk;
        continue;
      }
      name.push(tk);
    }
    // EUA: zona H para os pacotes (Memphis/New York mudam só no Freight)
    if (/U\.S\.A\./.test(body)) zones[direction].US = 'H';
  }
  return { zones, unknown };
}

const [ratesFile, zonesFile] = process.argv.slice(2);
const rates = parseRates(await pages(ratesFile));
const { zones, unknown } = parseZones(await pages(zonesFile));
const out = {
  carrier: 'FedEx', currency: 'EUR', validFrom: rates.validFrom,
  // FedEx: peso volumétrico = L×P×A (cm) / 5000; o peso cobrado sobe de 0,5 em 0,5 kg
  volumetricDivisor: 5000, roundTo: 0.5,
  notes: 'Tariffe base FedEx (QuickLift B2B Band05). Esclusi supplemento carburante, dazi e servizi accessori.',
  zoning: { default: zones }, services: rates.services,
};
process.stdout.write(JSON.stringify(out, null, 1));
console.error(`servizi: ${out.services.map((s) => `${s.code}/${s.region}/${s.direction}(${s.steps.length}+${s.perKg.length})`).join(' ')}`);
console.error(`paesi export ${Object.keys(zones.export).length}, import ${Object.keys(zones.import).length}; non riconosciuti: ${[...new Set(unknown)].join(' | ')}`);
