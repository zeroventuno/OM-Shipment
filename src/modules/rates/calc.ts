/*
 * Listini corrieri: a tabela padrão de um listino e a conta do preço.
 * Sem React e sem Supabase, para os testes rodarem com dados finos.
 *
 * Um listino tem zonas por país (export e import) e serviços. Cada serviço
 * tem faixas de peso ("até X kg" por zona); uma faixa pode ter um degrau
 * ("+0,5 kg" ou "+10 kg addizionali") que vale entre a faixa anterior e ela.
 * Acima da última faixa: ou preço por kg × peso total (FedEx), ou degraus somados
 * ao preço da última faixa (DHL, "supplemento per ogni X kg").
 * O peso cobrado é o maior entre o real e o volumétrico (L×P×A ÷ divisor),
 * arredondado para cima (0,5 kg; acima das faixas, 1 kg).
 */

export type Direction = "export" | "import";

export interface Step { upTo: number; prices: Record<string, number>; addStep?: number; addPrices?: Record<string, number> }
export interface PerKg { from: number; to: number | null; prices: Record<string, number> }
/** Acima da última faixa, somando ao preço dela: +prices[zona] a cada `step` kg entre from e to. */
export interface Extra { from: number; to: number | null; step: number; prices: Record<string, number> }
export interface Service {
  code: string; name: string; region: string; direction: Direction; zones: string[] | null;
  /** qual zonário do listino o serviço usa (padrão: "default") */
  zoning?: string;
  steps: Step[]; perKg: PerKg[]; extra?: Extra[];
}

export interface RateCardData {
  carrier: string;
  currency: string;
  validFrom: string | null;
  volumetricDivisor: number;
  roundTo: number;
  notes?: string;
  /** zonário: nome → direção → país (ISO) → zona */
  zoning: Record<string, Partial<Record<Direction, Record<string, string>>>>;
  services: Service[];
  /**
   * Listino "a pacchi tipo" (ex.: simulações da My Parcel): preço fechado por
   * país para alguns pacotes padrão. Cada colo usa o menor pacote tipo que o
   * comporta (pelo peso tassato); o resultado é uma estimativa.
   */
  presets?: Preset[];
}

export interface Preset {
  key: string; label: string; weight: number; length: number; width: number; height: number;
  /** país (ISO) → preço e serviço usado */
  prices: Record<string, { price: number; service: string }>;
}

export interface Parcel { weight: number; length?: number; width?: number; height?: number; qty?: number }

export interface Quote { service: string; serviceName: string; zone: string; chargeable: number; price: number; perKg: boolean; /** pacco tipo usado (listino a pacchi tipo) */ preset?: string }

const ceilTo = (x: number, step: number) => Math.ceil(x / step - 1e-9) * step;
const round2 = (x: number) => Math.round(x * 100) / 100;

/** Peso cobrado do envio: soma, colo por colo, do maior entre real e volumétrico. */
export function chargeableWeight(parcels: Parcel[], divisor: number, roundTo = 0.5): number {
  const total = parcels.reduce((sum, p) => {
    const vol = p.length && p.width && p.height ? (p.length * p.width * p.height) / divisor : 0;
    return sum + Math.max(p.weight || 0, vol) * (p.qty || 1);
  }, 0);
  return total > 0 ? ceilTo(total, roundTo) : 0;
}

/** Soma dos degraus de `extra` entre os pesos a e b (o "da 10.1" conta a partir de 10). */
function extraBetween(extra: Extra[], zone: string, a: number, b: number): number | null {
  let sum = 0;
  for (const t of extra) {
    const lo = Math.max(a, t.from), hi = Math.min(b, t.to ?? Infinity);
    if (hi <= lo + 1e-9) continue;
    const add = t.prices[zone];
    if (add == null) return null;
    sum += Math.ceil((hi - lo) / t.step - 1e-9) * add;
  }
  return sum;
}

/** Preço de um serviço numa zona para um peso já cobrado; null se não houver tarifa. */
export function priceFor(svc: Service, zone: string, weight: number): { price: number; perKg: boolean; chargeable: number } | null {
  const last = svc.steps[svc.steps.length - 1];
  const extra = svc.extra ?? [];
  if (last && weight <= last.upTo + 1e-9) {
    const i = svc.steps.findIndex((s) => s.upTo >= weight - 1e-9);
    const step = svc.steps[i];
    const base = step.prices[zone];
    if (base == null) return null;
    if (i > 0 && weight < step.upTo - 1e-9) {
      const prev = svc.steps[i - 1];
      if (prev.prices[zone] == null) return null;
      // FedEx: degrau da própria faixa ("+0,5 kg addizionali")
      if (step.addStep && step.addPrices?.[zone] != null) {
        const n = Math.ceil((weight - prev.upTo) / step.addStep - 1e-9);
        return { price: round2(Math.min(prev.prices[zone] + n * step.addPrices[zone], base)), perKg: false, chargeable: weight };
      }
      // DHL: "supplemento per ogni X kg" entre a faixa de baixo e o peso
      if (extra.length) {
        const add = extraBetween(extra, zone, prev.upTo, weight);
        if (add != null && add > 0) return { price: round2(Math.min(prev.prices[zone] + add, base)), perKg: false, chargeable: weight };
      }
    }
    return { price: base, perKg: false, chargeable: weight };
  }
  if (extra.length && last) {
    if (last.prices[zone] == null) return null;
    const covered = Math.max(...extra.map((t) => t.to ?? Infinity));
    if (weight > covered + 1e-9) return null;
    const add = extraBetween(extra, zone, last.upTo, weight);
    return add == null ? null : { price: round2(last.prices[zone] + add), perKg: false, chargeable: weight };
  }
  if (!svc.perKg.length) return null;
  const w = Math.ceil(weight - 1e-9);
  const tiers = [...svc.perKg].sort((a, b) => a.from - b.from);
  if (w < tiers[0].from) return null;
  const tier = [...tiers].reverse().find((t) => w >= t.from) ?? tiers[0];
  const rate = tier.prices[zone];
  if (rate == null) return null;
  return { price: round2(rate * w), perKg: true, chargeable: w };
}

/** Todas as opções de um listino para um envio, da mais barata à mais cara. */
export function quoteCard(card: RateCardData, country: string, direction: Direction, parcels: Parcel[]): Quote[] {
  const weight = chargeableWeight(parcels, card.volumetricDivisor || 5000, card.roundTo || 0.5);
  if (!weight) return [];
  // o Gestionale guarda o Reino Unido como UK; os listini usam o ISO (GB)
  const iso = country.toUpperCase() === "UK" ? "GB" : country.toUpperCase();
  if (card.presets?.length) return direction === "export" ? quotePresets(card, iso, parcels) : [];
  const out: Quote[] = [];
  for (const svc of card.services) {
    if (svc.direction !== direction) continue;
    const zone = card.zoning[svc.zoning ?? "default"]?.[direction]?.[iso];
    if (!zone || !(svc.zones ?? []).includes(zone)) continue;
    const p = priceFor(svc, zone, weight);
    if (p) out.push({ service: svc.code, serviceName: svc.name, zone, chargeable: p.chargeable, price: p.price, perKg: p.perKg });
  }
  return out.sort((a, b) => a.price - b.price);
}

/** Listino a pacchi tipo: cada colo vira o menor pacote padrão que o comporta. */
function quotePresets(card: RateCardData, iso: string, parcels: Parcel[]): Quote[] {
  const div = card.volumetricDivisor || 5000;
  const sized = (card.presets ?? []).map((p) => ({ p, w: chargeableWeight([p], div, card.roundTo || 0.5) })).sort((a, b) => a.w - b.w);
  let price = 0, chargeable = 0;
  const used: Preset[] = [];
  for (const parcel of parcels) {
    const w = chargeableWeight([{ ...parcel, qty: 1 }], div, card.roundTo || 0.5);
    if (!w) continue;
    const fit = sized.find((x) => x.w >= w - 1e-9 && x.p.prices[iso]);
    if (!fit) return [];
    const qty = parcel.qty || 1;
    price += fit.p.prices[iso].price * qty;
    chargeable += w * qty;
    for (let i = 0; i < qty; i++) used.push(fit.p);
  }
  if (!used.length) return [];
  const services = [...new Set(used.map((p) => p.prices[iso].service))].join(" + ");
  const labels = [...new Set(used.map((p) => p.label))].join(" + ");
  return [{ service: "", serviceName: services, zone: "—", chargeable, price: round2(price), perKg: false, preset: labels }];
}
