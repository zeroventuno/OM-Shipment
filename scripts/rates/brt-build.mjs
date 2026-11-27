/*
 * Listino BRT (contratto Officine Mattio, offerta 6525640 del 20/10/2025,
 * valido 01/01/2025–31/12/2025, poi adeguato ogni anno con l'indice ISTAT).
 * Il PDF è una scansione senza testo: le tabelle sono trascritte a mano qui.
 *
 *   node scripts/rates/brt-build.mjs > brt.json
 *
 * Servizi:
 *  - Italia (nazionale, a peso): ÷4000 (250 kg/m³), oltre 50 kg a quintale.
 *  - @Smart Europe monocollo e multicollo (fino a 5 colli): 4 gruppi, max 31,5 kg
 *    e 0,25 m³ per collo, niente volumetrico. CH, GB, NO solo monocollo.
 *  - Euroexpress (strada, per paese): ÷4000, oltre 100 kg a quintale.
 *  - @Smart Out of Europe, BRT Air (zone 1–13): ÷4000, max 31,5 kg per collo,
 *    oltre 70 kg a kg.
 * Esclusi: supplemento carburante, isole e zone disagiate, oneri doganali.
 */

const q = (v) => Math.round(v * 10) / 1000; // €/quintale → €/kg

// ---------- Italia ----------
const italy = {
  code: "BRT-IT", name: "BRT Italia", region: "domestic", direction: "export", zones: ["IT"], zoning: "domestic",
  volumetricDivisor: 4000, roundTo: 1,
  steps: [[3, 5.9], [5, 6.9], [10, 8.9], [30, 13.9], [50, 15.9]].map(([upTo, p]) => ({ upTo, prices: { IT: p } })),
  perKg: [{ from: 51, to: null, prices: { IT: q(18.9) } }],
};
const italyImport = { ...italy, code: "BRT-IT-R", name: "BRT Italia (ritiro)", direction: "import" };

// ---------- @Smart Europe ----------
const G = ["A", "B", "C", "D"];
const groups = {
  A: ["FR", "NL", "AT", "HR", "HU", "DE", "CH", "SI"],
  B: ["ES", "BG", "BE", "PL", "CZ", "LU"],
  C: ["DK", "PT", "GR", "SK", "RO"],
  D: ["FI", "EE", "LV", "LT", "SE", "IE", "GB", "NO"],
};
const monoOnly = new Set(["CH", "GB", "NO"]); // solo monocollo DAP
const smartMono = {}, smartMulti = {};
for (const g of G) for (const c of groups[g]) { smartMono[c] = g; if (!monoOnly.has(c)) smartMulti[c] = g; }
const rows = (table) => table.map(([upTo, ...p]) => ({ upTo, prices: Object.fromEntries(G.map((g, i) => [g, p[i]])) }));
const smartMonoSvc = {
  code: "BRT-SE1", name: "BRT @Smart Europe (1 collo)", region: "europe", direction: "export", zones: G, zoning: "smartMono",
  volumetricDivisor: 0, roundTo: 1, maxParcels: 1, maxParcelKg: 31.5, maxParcelM3: 0.25, perKg: [],
  steps: rows([
    [1, 8.45, 9.2, 9.95, 13.0],
    [3, 9.65, 10.9, 12.45, 16.25],
    [10, 11.95, 14.0, 16.15, 21.4],
    [20, 15.85, 18.75, 20.45, 26.75],
    [31.5, 22.05, 27.3, 31.15, 41.4],
  ]),
};
const smartMultiSvc = {
  code: "BRT-SE5", name: "BRT @Smart Europe (multicollo)", region: "europe", direction: "export", zones: G, zoning: "smartMulti",
  volumetricDivisor: 0, roundTo: 1, minParcels: 2, maxParcels: 5, maxParcelKg: 31.5, maxParcelM3: 0.25, perKg: [],
  steps: rows([
    [1, 14.55, 16.4, 17.65, 24.9],
    [3, 15.45, 17.35, 18.75, 26.0],
    [10, 20.55, 24.5, 29.1, 40.25],
    [20, 26.3, 32.1, 37.9, 52.2],
    [30, 33.05, 40.35, 46.85, 64.5],
    [50, 44.6, 54.55, 62.9, 86.65],
    [100, 63.15, 77.25, 86.05, 117.4],
    [157.5, 94.3, 120.6, 139.75, 192.05],
  ]),
};

// ---------- Euroexpress ----------
// paese: 0/2, 3/5, 6/10, 11/25, 26/50, 51/75, 76/100, oltre (€/q.le)
const euro = {
  EE: [43.8, 47.5, 51.1, 58.4, 88.3, 131.3, 177.3, 171.5],
  LV: [43.8, 47.5, 51.1, 58.4, 88.3, 131.3, 177.3, 171.5],
  LT: [43.8, 47.5, 51.1, 58.4, 88.3, 131.3, 177.3, 171.5],
  PL: [40.4, 41.1, 42.8, 49.0, 77.1, 102.2, 123.2, 96.3],
  CZ: [33.8, 35.0, 37.3, 41.9, 47.8, 65.9, 72.1, 64.7],
  SK: [33.8, 35.0, 37.3, 41.9, 47.8, 65.9, 72.1, 64.7],
  HU: [33.8, 35.0, 37.3, 41.9, 47.8, 65.9, 72.1, 64.7],
  SI: [33.8, 35.0, 37.3, 41.9, 47.8, 65.9, 72.1, 64.7],
  RO: [72.1, 72.9, 73.8, 77.1, 107.2, 154.9, 160.7, 159.0],
  BG: [67.1, 67.9, 68.7, 71.2, 98.8, 140.6, 146.6, 142.3],
  HR: [37.3, 38.8, 40.9, 46.0, 52.6, 73.0, 80.3, 71.5],
  CH: [78.8, 82.2, 89.2, 96.1, 114.4, 125.5, 134.9, 109.5],
  AT: [16.3, 17.7, 20.0, 25.0, 32.7, 45.0, 56.9, 50.3],
  DE: [17.0, 18.8, 21.5, 31.7, 43.0, 60.6, 75.7, 67.2],
  BE: [15.6, 17.8, 21.1, 28.7, 46.7, 66.2, 84.8, 80.3],
  LU: [15.6, 17.8, 21.1, 28.7, 46.7, 66.2, 84.8, 80.3],
  FR: [19.4, 21.3, 24.4, 31.2, 41.8, 58.6, 75.1, 66.3],
  NL: [15.1, 17.5, 21.0, 29.3, 49.5, 70.8, 91.5, 86.2],
  ES: [17.8, 18.8, 20.4, 25.3, 33.6, 46.7, 59.3, 52.8],
  AD: [143.7, 144.4, 158.5, 167.7, 178.5, 198.2, 217.5, 180.9],
  GI: [60.3, 65.4, 73.9, 91.1, 118.5, 162.9, 206.9, 202.3],
  PT: [18.8, 20.9, 24.6, 32.3, 46.1, 68.5, 90.4, 84.0],
  GB: [15.5, 17.5, 21.0, 28.4, 39.9, 58.5, 76.7, 70.5],
  IE: [62.4, 63.9, 72.4, 83.6, 109.8, 140.8, 159.7, 147.0],
  DK: [58.4, 62.1, 65.7, 80.3, 94.9, 116.8, 153.2, 145.9],
  NO: [130.7, 131.1, 131.8, 134.1, 150.6, 179.7, 187.9, 175.3],
  FI: [58.4, 62.1, 65.7, 80.3, 94.9, 135.0, 178.7, 171.5],
  SE: [90.5, 90.9, 113.6, 146.7, 166.9, 198.0, 201.5, 151.7], // S3/S4 (le zone S5/S9 costano meno)
};
const euroCodes = Object.keys(euro);
const euroSvc = {
  code: "BRT-EX", name: "BRT Euroexpress", region: "europe", direction: "export", zones: euroCodes, zoning: "euroexpress",
  volumetricDivisor: 4000, roundTo: 1,
  steps: [2, 5, 10, 25, 50, 75, 100].map((upTo, i) => ({ upTo, prices: Object.fromEntries(euroCodes.map((c) => [c, euro[c][i]])) })),
  perKg: [{ from: 101, to: null, prices: Object.fromEntries(euroCodes.map((c) => [c, q(euro[c][7])])) }],
};

// ---------- @Smart Out of Europe (BRT Air) ----------
const Z = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12", "13"];
// peso: zone 1..7 (p. 17–18) e zone 8..13 (p. 19)
const airA = [
  [0.5, 24.5, 31.51, 27.92, 15.85, 26.2, 18.9, 18.9],
  [1, 24.66, 36.09, 28.03, 17.68, 26.81, 23.16, 21.94],
  [1.5, 25.17, 40.93, 29.08, 20.45, 27.76, 27.76, 25.94],
  [2, 26.75, 45.49, 29.84, 22.28, 30.2, 32.63, 29.59],
  [2.5, 28.9, 50.03, 31.78, 24.11, 32.63, 36.9, 33.24],
  [3, 31.22, 55.11, 31.89, 25.94, 34.46, 42.38, 37.51],
  [3.5, 33.95, 60.25, 32.52, 28.91, 36.83, 47.18, 41.7],
  [4, 36.12, 64.83, 36.44, 30.74, 38.65, 52.05, 45.96],
  [4.5, 38.32, 69.44, 36.53, 32.56, 40.48, 56.32, 49.62],
  [5, 40.5, 73.46, 51.76, 34.39, 42.92, 61.19, 53.88],
  [5.5, 43.27, 76.29, 52.67, 37.04, 44.95, 62.01, 58.96],
  [6, 45.25, 80.55, 52.75, 39.47, 46.78, 62.01, 59.08],
  [6.5, 47.2, 84.81, 52.84, 41.3, 48.61, 62.01, 59.14],
  [7, 49.19, 89.08, 52.93, 43.13, 49.83, 68.1, 68.1],
  [7.5, 51.17, 93.34, 71.92, 44.95, 51.65, 71.99, 71.99],
  [8, 53.14, 97.61, 72.06, 47.39, 53.48, 72.11, 72.11],
  [8.5, 55.07, 101.87, 72.13, 49.22, 54.7, 72.19, 72.19],
  [9, 57.06, 106.12, 72.25, 51.04, 56.52, 74.81, 74.81],
  [9.5, 59.04, 110.39, 72.38, 52.87, 58.35, 74.92, 74.92],
  [10, 61.01, 114.65, 72.45, 55.31, 59.57, 78.77, 78.77],
  [11, 66.52, 122.79, 76.53, 60.32, 63.36, 86.62, 86.62],
  [12, 70.57, 129.49, 83.02, 63.97, 65.8, 98.19, 98.19],
  [13, 74.64, 136.19, 98.41, 68.23, 68.23, 98.37, 98.37],
  [14, 78.69, 142.93, 98.49, 71.89, 70.67, 102.32, 102.32],
  [15, 82.73, 149.64, 98.75, 76.15, 73.11, 102.5, 102.5],
  [16, 88.0, 157.57, 100.1, 81.04, 76.78, 103.92, 103.92],
  [17, 92.05, 164.32, 101.69, 85.3, 79.21, 107.96, 107.96],
  [18, 96.1, 171.0, 101.78, 88.96, 81.04, 108.18, 108.18],
  [19, 100.15, 177.7, 102.08, 93.22, 83.48, 108.33, 108.33],
  [20, 106.51, 186.75, 104.47, 96.87, 85.91, 113.37, 113.37],
  [22, 116.09, 201.74, 106.04, 105.99, 92.59, 116.25, 116.25],
  [24, 124.07, 214.84, 106.39, 113.91, 96.86, 118.0, 118.0],
  [26, 132.03, 227.92, 106.79, 122.44, 101.73, 132.13, 132.13],
  [28, 140.96, 241.96, 108.14, 132.5, 107.53, 133.48, 133.48],
  [30, 153.81, 259.9, 189.16, 142.25, 112.4, 189.17, 189.17],
  [35, 180.81, 301.79, 198.95, 198.95, 221.78, 221.78, 221.78],
  [40, 198.69, 333.3, 225.19, 225.19, 227.87, 227.87, 227.87],
  [45, 218.86, 367.15, 228.48, 228.48, 231.06, 231.06, 231.06],
  [50, 236.72, 398.63, 240.82, 240.82, 267.33, 267.33, 267.33],
  [55, 256.59, 432.2, 295.54, 295.54, 295.61, 295.61, 295.61],
  [60, 274.49, 463.74, 309.23, 309.23, 321.87, 321.87, 321.87],
  [65, 294.47, 497.4, 324.78, 324.78, 325.08, 325.08, 325.08],
  [70, 312.35, 528.89, 326.12, 326.12, 488.44, 488.44, 488.44],
];
const airB = [
  [0.5, 52.5, 31.09, 18.37, 23.66, 24.4, 24.4],
  [1, 52.59, 31.19, 19.42, 26.65, 24.5, 24.5],
  [1.5, 53.03, 35.41, 22.21, 32.52, 24.93, 24.93],
  [2, 53.12, 35.49, 24.63, 38.07, 25.02, 26.05],
  [2.5, 54.22, 38.12, 27.05, 43.6, 26.34, 28.03],
  [3, 58.43, 44.53, 29.21, 48.15, 28.24, 30.08],
  [3.5, 62.68, 45.19, 31.89, 53.96, 30.68, 32.67],
  [4, 66.42, 45.26, 34.03, 59.23, 32.58, 34.73],
  [4.5, 70.15, 57.93, 36.18, 64.5, 34.47, 36.78],
  [5, 73.83, 58.06, 38.32, 69.76, 36.38, 38.85],
  [5.5, 78.34, 58.96, 40.72, 73.97, 38.58, 41.15],
  [6, 82.12, 59.08, 42.32, 77.34, 40.02, 42.7],
  [6.5, 85.77, 59.14, 43.94, 80.7, 41.43, 44.22],
  [7, 89.51, 68.1, 45.57, 84.09, 42.83, 45.74],
  [7.5, 93.21, 71.99, 47.15, 87.44, 44.25, 47.27],
  [8, 96.94, 72.11, 48.77, 90.82, 45.68, 48.82],
  [8.5, 100.63, 72.19, 50.36, 94.2, 47.09, 50.34],
  [9, 104.37, 74.81, 51.94, 97.56, 48.52, 51.88],
  [9.5, 108.05, 74.92, 53.63, 100.94, 49.9, 53.37],
  [10, 111.8, 78.77, 54.96, 104.31, 51.36, 54.94],
  [11, 119.68, 86.62, 57.19, 112.1, 55.18, 58.96],
  [12, 126.39, 98.19, 59.81, 118.31, 57.65, 61.62],
  [13, 133.04, 98.37, 62.46, 124.55, 60.14, 64.31],
  [14, 139.75, 102.32, 65.06, 130.79, 62.61, 66.98],
  [15, 146.45, 102.5, 67.68, 136.98, 65.11, 69.68],
  [16, 154.36, 103.92, 71.54, 144.46, 68.82, 73.58],
  [17, 161.05, 107.96, 74.17, 150.68, 71.3, 76.25],
  [18, 167.75, 108.18, 76.78, 156.92, 73.79, 78.94],
  [19, 174.46, 108.33, 79.42, 163.1, 76.27, 81.62],
  [20, 183.46, 113.37, 84.36, 171.65, 81.07, 86.6],
  [22, 198.99, 116.25, 90.28, 185.78, 86.84, 92.73],
  [24, 212.46, 118.0, 94.67, 197.93, 91.11, 97.33],
  [26, 225.96, 132.13, 99.03, 210.08, 95.32, 101.87],
  [28, 240.38, 133.48, 104.43, 223.17, 100.49, 107.36],
  [30, 258.74, 189.17, 113.64, 264.85, 109.62, 116.83],
  [35, 296.42, 221.78, 133.21, 278.75, 127.3, 135.18],
  [40, 325.25, 227.87, 143.88, 305.74, 136.1, 144.65],
  [45, 356.37, 231.06, 156.81, 335.05, 147.23, 156.45],
  [50, 385.18, 267.33, 167.5, 362.06, 156.05, 165.94],
  [55, 416.03, 295.61, 180.2, 391.07, 166.91, 177.46],
  [60, 444.84, 321.87, 190.85, 418.06, 175.71, 186.93],
  [65, 475.8, 325.08, 203.68, 447.21, 186.67, 198.56],
  [70, 504.61, 488.44, 214.34, 474.19, 195.48, 208.05],
];
const airOver = [6.7, 6.82, 6.82, 6.82, 6.82, 6.82, 6.82, 7.43, 6.82, 4.99, 6.33, 6.33, 6.33];
if (airA.length !== airB.length || airA.some((r, i) => r[0] !== airB[i][0])) throw new Error("righe BRT Air non allineate");
const airSvc = {
  code: "BRT-AIR", name: "BRT @Smart Out of Europe (Air)", region: "world", direction: "export", zones: Z, zoning: "air",
  volumetricDivisor: 4000, roundTo: 0.5, maxParcelKg: 31.5,
  steps: airA.map((r, i) => ({ upTo: r[0], prices: Object.fromEntries(Z.map((z, j) => [z, j < 7 ? r[j + 1] : airB[i][j - 6]])) })),
  perKg: [{ from: 71, to: null, prices: Object.fromEntries(Z.map((z, j) => [z, airOver[j]])) }],
};
const airZones = {
  1: "CA US", 2: "AU NZ",
  3: "AR BR CL CN CO KR EC PH JP HK MY MX PE SG ZA TH TW VN",
  4: "AE", 5: "TR", 6: "SA EG JO IN OM", 7: "BH BD KW NP PK QA LK",
  8: "AL BA GI GL IS MK MD ME RS",
  9: "AF DZ AO AI AG CW BQ SX AM AW AZ BS BB BZ BJ BM BT BO BW BN BF BI KH CM CV TD CG CI CR DM SV ER ET FJ GA GM GE GH JM GD GP BL GU GT GF GN GQ GY HT HN ID IQ KY CK MH SB TC VI VG IL KZ KE KG KI LA LS LB LR LY MO MG MW MV ML MA MQ MR MU FM MN MS MZ NA NR NI NE NG NU NC PW PA PG PY PF PR CF CD DO RE RW KN VC MP AS LC SN SC SO SR SZ TZ TL TG TO TT TN TM TV UG UY UZ VU VE WF YE ZM ZW",
  10: "AT BE DK FI FR DE GR IE LU NL PT MC ES SE",
  11: "BG CY HR EE LV LT MT PL CZ RO SK SI HU",
  12: "GB CH", 13: "AD FO LI NO",
};
const air = {};
for (const [z, list] of Object.entries(airZones)) for (const c of list.split(" ")) {
  if (air[c]) throw new Error(`${c} in due zone Air`);
  air[c] = z;
}

const card = {
  carrier: "BRT",
  currency: "EUR",
  validFrom: "2025-01-01",
  volumetricDivisor: 4000,
  roundTo: 1,
  notes: "Contratto BRT (offerta 6525640, 20/10/2025), valido 01/01/2025–31/12/2025, adeguato ogni anno con l'indice ISTAT dal 01/01/2026: i prezzi 2026 possono essere un po' più alti. Esclusi carburante, isole e località disagiate, oneri doganali (GB 52,50 €). Svezia: zone postali S3/S4.",
  zoning: {
    domestic: { export: { IT: "IT" }, import: { IT: "IT" } },
    smartMono: { export: smartMono },
    smartMulti: { export: smartMulti },
    euroexpress: { export: Object.fromEntries(euroCodes.map((c) => [c, c])) },
    air: { export: air },
  },
  services: [italy, italyImport, smartMonoSvc, smartMultiSvc, euroSvc, airSvc],
};
process.stdout.write(JSON.stringify(card, null, 1));
