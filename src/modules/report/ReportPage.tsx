import { useMemo } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Loader2, Printer } from "lucide-react";
import { canonicalCountry, countryLabel } from "@/modules/shipments/data/countries";
import { buildInsights, buildReport, dayOf, sectionOf, STALLED_DAYS, type Insight, type InsightSection, type InsightVar, type Totals } from "./compute";
import { loadReportData, loadReportYears } from "./data";
import {
  CountRow, Cumulative, GOOD, HBars, INK, Kpi, MonthBars, Page, RED, Reading, SectionTitle, ShareBar, SubTitle, Table, eyebrow, type Delta,
} from "./ReportParts";

type Sec = "summary" | "shipments" | "carriers" | "geo" | "customers" | "balance" | "agents" | "assistance" | "warranties" | "requests" | "quality" | "conclusions" | "method";

const SECTION_OF_INSIGHT: Record<InsightSection, Sec> = {
  ship: "shipments", carr: "carriers", geo: "geo", cli: "customers", bal: "balance", ass: "assistance", war: "warranties", req: "requests", q: "quality",
};

const ORDER_TYPE_KEY: Record<string, string> = {
  Bicycle: "Bicycle", "Frame Kit": "FrameKit", Components: "Components", Warranty: "Warranty",
  "Clothing/Accessories": "Clothing", Gift: "Gift", Rental: "Rental", Other: "Other",
};
const PHASE_KEY: Record<string, string> = { Ingresso: "Ingresso", Spedito: "Spedito", "In lavorazione": "InLavorazione", Completato: "Completato" };
const SOLUTION_KEY: Record<string, string> = { Pintura: "paint", "Reparação + Pintura": "repairPaint", "Substituição": "replace", "": "none" };

const country = (stored: string) => String(canonicalCountry(stored));

/**
 * Report annuale (/report?year=2026): una pagina a schermo con l'aspetto di
 * carta bianca, pensata per la stampa A4 (una sezione per foglio) e il PDF.
 */
export default function ReportPage() {
  const { t, i18n } = useTranslation();
  const [params, setParams] = useSearchParams();
  const lang = i18n.language?.startsWith("pt") ? "pt" : "it";
  const tag = lang === "pt" ? "pt-BR" : "it-IT";
  const today = dayOf(new Date().toISOString());
  const thisYear = Number(today.slice(0, 4));
  const asked = Number(params.get("year"));
  const year = Number.isInteger(asked) && asked >= 2000 && asked <= thisYear ? asked : thisYear;

  const years = useQuery({ queryKey: ["report-years", thisYear], queryFn: () => loadReportYears(thisYear), staleTime: 60 * 60 * 1000 });
  const data = useQuery({ queryKey: ["report", year], queryFn: () => loadReportData(year), staleTime: 5 * 60 * 1000 });

  const model = useMemo(() => (data.data ? buildReport(data.data, { year, today, country }) : null), [data.data, year, today]);
  const insights = useMemo(() => (model ? buildInsights(model) : []), [model]);

  const yearOptions = years.data ?? [thisYear];
  const options = yearOptions.includes(year) ? yearOptions : [year, ...yearOptions];

  return (
    <div className="min-h-screen bg-[#F3F3F1] text-[#0A0A0A] print:bg-white">
      <style>{`
        @media print {
          @page { size: A4; margin: 15mm 16mm; }
          html, body { background: #fff !important; }
          .rep-root { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
        }
      `}</style>

      {/* barra degli strumenti: non va sulla carta */}
      <div className="no-print z-10 sm:sticky sm:top-0 border-b border-black/10 bg-[#F3F3F1]/95 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-[900px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <Link to="/shipments" className="inline-flex h-10 items-center gap-2 rounded-full border border-black/15 bg-white px-4 text-sm font-medium hover:bg-black/[0.03]">
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
            {t("rep.toolbar.back")}
          </Link>
          <div className="flex flex-wrap items-center gap-3">
            <label className="flex items-center gap-2 text-sm">
              <span className="eyebrow">{t("rep.toolbar.year")}</span>
              <select
                value={year}
                onChange={(e) => setParams({ year: e.target.value })}
                className="h-10 rounded-full border border-black/15 bg-white px-4 text-sm font-semibold tabular-nums"
              >
                {options.map((y) => <option key={y} value={y}>{y}</option>)}
              </select>
            </label>
            <button
              type="button"
              onClick={() => window.print()}
              disabled={!model}
              className="inline-flex h-10 items-center gap-2 rounded-full bg-[#0A0A0A] px-5 text-sm font-semibold text-white hover:bg-[#292D30] disabled:opacity-50"
            >
              <Printer className="h-4 w-4" aria-hidden="true" />
              {t("rep.toolbar.print")}
            </button>
          </div>
        </div>
        <p className="mx-auto hidden max-w-[900px] px-4 pb-2 text-xs text-black/50 sm:block">{t("rep.toolbar.hint")}</p>
      </div>

      <div className="rep-root mx-auto my-6 max-w-[900px] bg-white px-4 py-6 shadow-[0_1px_3px_rgba(0,0,0,0.08)] sm:px-10 print:my-0 print:max-w-none print:p-0 print:shadow-none">
        {data.isLoading && (
          <p className="flex items-center justify-center gap-2 py-32 text-sm text-black/55">
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
            {t("rep.loading")}
          </p>
        )}
        {data.error && <p className="py-32 text-center text-sm" style={{ color: RED }}>{t("rep.error", { msg: (data.error as Error).message })}</p>}
        {model && <Report model={model} insights={insights} lang={lang} tag={tag} today={today} />}
      </div>
    </div>
  );
}

function Report({ model: r, insights, lang, tag, today }: {
  model: ReturnType<typeof buildReport>;
  insights: Insight[];
  lang: "it" | "pt";
  tag: string;
  today: string;
}) {
  const { t } = useTranslation();

  // ── formati, nella lingua di chi legge ──
  // Ponto de milhar sempre (o padrão italiano não põe em 4 dígitos: "7462" ao lado de "53.220").
  const ALWAYS = { useGrouping: "always" } as unknown as Intl.NumberFormatOptions;
  const nf = new Intl.NumberFormat(tag, ALWAYS);
  const n = (v: number) => nf.format(v);
  const pct = (v: number) => new Intl.NumberFormat(tag, { style: "percent", maximumFractionDigits: v > 0 && v < 0.095 ? 1 : 0 }).format(v);
  const dec = (v: number) => new Intl.NumberFormat(tag, { minimumFractionDigits: 1, maximumFractionDigits: 1 }).format(v);
  const compact = (v: number) => new Intl.NumberFormat(tag, { notation: "compact", maximumFractionDigits: 1 }).format(v);
  const eur = (v: number, cents = false) =>
    new Intl.NumberFormat(tag, { ...ALWAYS, style: "currency", currency: "EUR", minimumFractionDigits: cents ? 2 : 0, maximumFractionDigits: cents ? 2 : 0 }).format(v);
  const cap = (x: string) => x.replace(/^./, (c) => c.toUpperCase());
  const monthLong = (i: number) => cap(new Intl.DateTimeFormat(tag, { month: "long" }).format(new Date(2026, i, 1)));
  const monthShort = (i: number) => cap(new Intl.DateTimeFormat(tag, { month: "short" }).format(new Date(2026, i, 1)).replace(/\.$/, ""));
  const fmtDate = (d: string) => new Intl.DateTimeFormat(tag, { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${d}T12:00:00`));
  const shareOf = (part: number, whole: number) => (whole > 0 ? pct(part / whole) : "—");
  const avgOf = (cost: number, priced: number) => (priced > 0 ? eur(cost / priced, true) : "—");
  const nShip = (v: number) => t("rep.nShipments", { count: v, n: n(v) });

  const fmtVar = (v: InsightVar): string =>
    "money" in v ? eur(v.money, v.cents)
      : "pct" in v ? pct(v.pct)
        : "n" in v ? n(v.n)
          : "dec" in v ? dec(v.dec)
            : "month" in v ? new Intl.DateTimeFormat(tag, { month: "long" }).format(new Date(2026, v.month, 1))
              : "date" in v ? fmtDate(v.date)
                : "country" in v ? countryLabel(v.country, lang)
                  : v.text;
  const say = (i: Insight) => t(i.key, Object.fromEntries(Object.entries(i.vars).map(([k, v]) => [k, fmtVar(v)])));
  const toItem = (i: Insight) => ({ text: say(i), watch: i.tone === "watch" });
  const readingOf = (sec: Sec) => insights.filter((i) => SECTION_OF_INSIGHT[sectionOf(i.key)] === sec).map(toItem);

  const orderType = (k: string) => (ORDER_TYPE_KEY[k] ? t(`rep.ot.${ORDER_TYPE_KEY[k]}`) : k);
  const phase = (k: string) => (PHASE_KEY[k] ? t(`rep.phase.${PHASE_KEY[k]}`) : k === "—" ? t("rep.unknown") : k);
  const solution = (k: string) => (k in SOLUTION_KEY ? t(`rep.sol.${SOLUTION_KEY[k]}`) : k);
  const unknown = (k: string) => (k === "—" || !k ? t("rep.unknown") : k);

  const tot = r.totals;
  const hasShip = tot.shipments > 0;
  const hasAnything = hasShip || r.tickets.count > 0 || r.warranties.count > 0 || r.requests.count > 0;
  const hasPrev = r.prev.cost > 0;
  const labels = Array.from({ length: 12 }, (_, i) => monthShort(i));
  const lastMonth = r.current ? Number(today.slice(5, 7)) - 1 : 11;

  const q = r.quality;
  const qualityRows = (
    [
      { key: "noCost", n: q.noCost },
      { key: "noTracking", n: q.noTracking },
      { key: "noCountry", n: q.noCountry },
      { key: "noAgent", n: q.noAgent },
      { key: "warrantyNoValue", n: q.warrantyNoValue },
      { key: "ticketNoDate", n: q.ticketNoDate },
    ] as const
  ).filter((x) => x.n > 0);

  const sections: { id: Sec; title: string }[] = [
    { id: "summary" as const, title: t("rep.s.summary") },
    ...(hasShip ? [{ id: "shipments" as const, title: t("rep.s.shipments") }] : []),
    ...(hasShip && r.carriers.length > 0 ? [{ id: "carriers" as const, title: t("rep.s.carriers") }] : []),
    ...(hasShip ? [{ id: "geo" as const, title: t("rep.s.geo") }] : []),
    ...(r.customers.active > 0 ? [{ id: "customers" as const, title: t("rep.s.customers") }] : []),
    ...(r.balance.best.length + r.balance.worst.length > 0 ? [{ id: "balance" as const, title: t("rep.s.balance") }] : []),
    ...(r.agentsDetail.length > 0 || r.ecommerce.n > 0 ? [{ id: "agents" as const, title: t("rep.s.agents") }] : []),
    ...(r.tickets.count > 0 ? [{ id: "assistance" as const, title: t("rep.s.assistance") }] : []),
    ...(r.warranties.count > 0 ? [{ id: "warranties" as const, title: t("rep.s.warranties") }] : []),
    ...(r.requests.count > 0 ? [{ id: "requests" as const, title: t("rep.s.requests") }] : []),
    { id: "quality" as const, title: t("rep.s.quality") },
    { id: "conclusions" as const, title: t("rep.s.conclusions") },
    { id: "method" as const, title: t("rep.s.method") },
  ];
  const num = (id: Sec) => sections.findIndex((s) => s.id === id) + 1;
  const titleOf = (id: Sec) => sections.find((s) => s.id === id)?.title ?? "";
  const running = (
    <>
      <span>{t("rep.brand")}</span>
      <span>{t("rep.title")} {r.year}</span>
    </>
  );

  // il delta dei KPI: rispetto all'anno precedente (stesso periodo se l'anno è in corso)
  const prevText = String(r.prevYear);
  const deltaKey = r.compare?.until ? "rep.deltaYtd" : "rep.delta";
  const delta = (pick: (x: Totals) => number, higherIsBetter: boolean | null): Delta | null => {
    if (!r.compare) return null;
    const now = pick(r.compare.now);
    const before = pick(r.compare.prev);
    if (!(before > 0)) return null;
    const up = now >= before;
    return { text: t(deltaKey, { pct: pct(Math.abs(now / before - 1)), prev: prevText }), up, good: higherIsBetter == null || up === higherIsBetter };
  };
  // il saldo è quasi sempre negativo: la differenza in euro dice di più della percentuale
  const balanceDelta: Delta | null = r.compare && r.compare.prev.shipments > 0
    ? (() => {
      const diff = r.compare.now.balance - r.compare.prev.balance;
      return { text: t(deltaKey, { pct: eur(Math.abs(diff)), prev: prevText }), up: diff >= 0, good: diff >= 0 };
    })()
    : null;

  const period = r.current ? t("rep.period.current", { until: fmtDate(today), prev: prevText }) : t("rep.period.closed", { year: r.year });

  const quarters = [0, 1, 2, 3].map((k) => r.months.slice(k * 3, k * 3 + 3).reduce((s, m) => s + m.cost, 0));
  // Pontos fortes: só o que é positivo. Os dados neutros ("info") ficam na leitura de cada seção.
  const highlights = insights.filter((i) => i.tone === "good").slice(0, 10);
  const watch = insights.filter((i) => i.tone === "watch");
  const summaryItems = insights.filter((i) => sectionOf(i.key) !== "q").slice(0, 6).map(toItem);

  const withCountry = r.geo.italy.n + r.geo.abroad.n;
  const topCountries = r.geo.countries.slice(0, 10);
  const restCountries = withCountry - topCountries.reduce((s, c) => s + c.n, 0);
  const topTypes = r.orderTypes.slice(0, 5);
  const restTypes = tot.shipments - topTypes.reduce((s, g) => s + g.n, 0);
  const liveReq = r.requests.count - r.requests.cancelled;

  return (
    <>
      {/* ── copertina ── */}
      <Page first>
        <div className="flex min-h-[70vh] flex-col print:min-h-[255mm]">
          <div>
            <img src="/logo.png" alt={t("rep.brand")} className="h-9 w-auto max-w-[16rem] object-contain object-left" />
            <div className="tricolor mt-5 h-[3px] w-28 border-y border-black/5" aria-hidden="true" />
          </div>
          <div className="my-auto py-16">
            <p className="text-[11px] font-bold uppercase tracking-[0.24em] text-black/55">{t("rep.title")}</p>
            <p className="mt-3 text-[96px] font-extrabold leading-[0.82] tracking-[-0.05em] tabular-nums sm:text-[132px]">{r.year}</p>
            <p className="mt-8 text-[20px] font-extrabold tracking-tight sm:text-[22px]">{t("rep.subtitle")}</p>
            <p className="mt-2 max-w-[52ch] text-[12.5px] leading-relaxed text-black/60">{period}</p>
          </div>
          <div className="grid gap-8 border-t-2 pt-5 sm:grid-cols-[1fr_auto] print:grid-cols-[1fr_auto]" style={{ borderColor: INK }}>
            <div>
              <p className={eyebrow}>{t("rep.contents")}</p>
              <ol className="mt-2 gap-x-8 text-[12px] sm:columns-2 print:columns-2">
                {(hasAnything ? sections : []).map((s, i) => (
                  <li key={s.id} className="flex break-inside-avoid gap-2.5 py-0.5">
                    <span className="w-5 font-bold tabular-nums text-black/45">{String(i + 1).padStart(2, "0")}</span>
                    {s.title}
                  </li>
                ))}
              </ol>
            </div>
            <div className="self-end text-[10.5px] leading-relaxed text-black/50 sm:text-right print:text-right">
              <p>{t("rep.generated", { d: fmtDate(today) })}</p>
              <p>OM Gestionale</p>
            </div>
          </div>
        </div>
      </Page>

      {!hasAnything ? (
        <Page running={running}>
          <p className="py-16 text-center text-sm text-black/55">{t("rep.empty", { year: r.year })}</p>
        </Page>
      ) : (
        <>
          {/* ── 1. sintesi ── */}
          <Page running={running}>
            <SectionTitle n={num("summary")} title={titleOf("summary")} intro={t("rep.s.summary.intro")} />
            <div className="grid grid-cols-2 gap-x-6 gap-y-7 sm:grid-cols-4 print:grid-cols-4">
              <Kpi label={t("rep.kpi.shipments")} value={n(tot.shipments)} delta={delta((x) => x.shipments, true)} />
              <Kpi label={t("rep.kpi.cost")} value={eur(tot.cost)} delta={delta((x) => x.cost, null)} />
              <Kpi label={t("rep.kpi.paid")} value={eur(tot.paid)} delta={delta((x) => x.paid, true)} />
              <Kpi label={t("rep.kpi.balance")} value={eur(tot.balance)} sub={t("rep.kpi.balance.sub")} delta={balanceDelta} />
              <Kpi label={t("rep.kpi.savings")} value={eur(tot.savings)} delta={delta((x) => x.savings, true)} />
              <Kpi label={t("rep.kpi.customers")} value={n(tot.customers)} delta={delta((x) => x.customers, true)} />
              <Kpi label={t("rep.kpi.tickets")} value={n(tot.tickets)} delta={delta((x) => x.tickets, null)} />
              <Kpi label={t("rep.kpi.warranties")} value={n(tot.warranties)} delta={delta((x) => x.warranties, null)} />
            </div>
            {hasShip && (
              <div className="mt-8">
                <MonthBars labels={labels} values={r.months.map((m) => m.cost)} fmt={compact} fmtAxis={compact} />
                <p className="mt-1 text-[10px] text-black/45">{t("rep.chart.cost")}</p>
              </div>
            )}
            <Reading title={t("rep.mainFindings")} items={summaryItems} />
          </Page>

          {/* ── 2. spedizioni e costi ── */}
          {hasShip && (
            <Page running={running}>
              <SectionTitle n={num("shipments")} title={titleOf("shipments")} intro={t("rep.s.shipments.intro")} />
              <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 print:grid-cols-3">
                <Kpi label={t("rep.kpi.avgCost")} value={avgOf(tot.cost, tot.priced)} sub={t("rep.kpi.avgCost.sub")} />
                <Kpi label={t("rep.kpi.recovery")} value={tot.cost > 0 ? pct(tot.paid / tot.cost) : "—"} sub={t("rep.kpi.recovery.sub")} />
                <Kpi label={t("rep.kpi.pickup")} value={n(r.pickup)} sub={t("rep.kpi.pickup.sub", { pct: shareOf(r.pickup, tot.shipments) })} />
              </div>
              <div className="mt-8">
                <MonthBars labels={labels} values={r.months.map((m) => m.cost)} marker={hasPrev ? r.months.map((m) => m.prevCost) : null} fmt={compact} fmtAxis={compact} />
                <p className="mt-1 text-[10px] text-black/45">{hasPrev ? t("rep.chart.costPrev", { prev: prevText }) : t("rep.chart.cost")}</p>
              </div>

              <SubTitle>{t("rep.months.title")}</SubTitle>
              <Table
                head={[t("rep.col.month"), t("rep.col.shipments"), t("rep.col.cost"), t("rep.col.paid"), t("rep.col.balance"), t("rep.col.avgCost"), t("rep.col.share")]}
                rows={r.months.map((m, i) => [
                  monthLong(i),
                  m.shipments ? n(m.shipments) : "—",
                  m.cost ? eur(m.cost) : "—",
                  m.paid ? eur(m.paid) : "—",
                  m.shipments ? eur(m.balance) : "—",
                  avgOf(m.cost, m.priced),
                  m.cost ? shareOf(m.cost, tot.cost) : "—",
                ])}
                foot={[t("rep.total"), n(tot.shipments), eur(tot.cost), eur(tot.paid), eur(tot.balance), avgOf(tot.cost, tot.priced), tot.cost ? pct(1) : "—"]}
              />

              <div className="mt-8 grid gap-8 sm:grid-cols-2 print:grid-cols-2">
                <div className="break-inside-avoid">
                  <SubTitle>{t("rep.quarters.title")}</SubTitle>
                  <ShareBar cols={1} parts={quarters.map((v, i) => ({ label: t("rep.quarter", { n: i + 1 }), value: v, detail: `${eur(v)} · ${shareOf(v, tot.cost)}` }))} />
                </div>
                <div className="break-inside-avoid">
                  <SubTitle>{t("rep.service.title")}</SubTitle>
                  <ShareBar
                    cols={1}
                    parts={(["standard", "express"] as const).map((k) => ({
                      label: t(`rep.service.${k}`),
                      value: r.service[k].n,
                      detail: `${n(r.service[k].n)} · ${shareOf(r.service[k].n, tot.shipments)} · ${t("rep.avg", { v: avgOf(r.service[k].cost, r.service[k].priced) })}`,
                    }))}
                  />
                </div>
              </div>
              {hasPrev && (
                <div className="break-inside-avoid">
                  <SubTitle>{t("rep.cumulative.title")}</SubTitle>
                  <Cumulative labels={labels} now={r.months.map((m) => m.cost)} prev={r.months.map((m) => m.prevCost)} fmtAxis={compact} nowLabel={String(r.year)} prevLabel={prevText} lastMonth={lastMonth} />
                </div>
              )}
              <Reading title={t("rep.reading")} items={readingOf("shipments")} />
            </Page>
          )}

          {/* ── 3. corrieri e portali ── */}
          {hasShip && r.carriers.length > 0 && (
            <Page running={running}>
              <SectionTitle n={num("carriers")} title={titleOf("carriers")} intro={t("rep.s.carriers.intro")} />
              <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 print:grid-cols-3">
                <Kpi label={t("rep.kpi.cost")} value={eur(tot.cost)} />
                <Kpi label={t("rep.kpi.savings")} value={eur(tot.savings)} />
                <Kpi label={t("rep.kpi.savingsPct")} value={tot.savings > 0 ? pct(r.savingsPct) : "—"} sub={t("rep.kpi.savingsPct.sub")} />
              </div>
              <SubTitle>{t("rep.portals.title")}</SubTitle>
              {(() => {
                const portalCost = r.portals.reduce((s, p) => s + p.cost, 0);
                return (
                  <ShareBar
                    parts={r.portals.slice(0, 6).map((p) => ({
                      label: unknown(p.key),
                      value: p.cost,
                      detail: `${eur(p.cost)} · ${shareOf(p.cost, portalCost)} · ${nShip(p.n)}`,
                    }))}
                  />
                );
              })()}
              <SubTitle aside={t("rep.carriers.aside")}>{t("rep.carriers.title")}</SubTitle>
              <HBars
                rows={r.carriers.slice(0, 12).map((c) => ({
                  label: unknown(c.key),
                  value: c.cost,
                  text: eur(c.cost),
                  sub: t("rep.carriers.sub", { n: n(c.n), avg: avgOf(c.cost, c.priced) }),
                }))}
              />
              {tot.savings > 0 && (
                <>
                  <SubTitle>{t("rep.savings.title")}</SubTitle>
                  <p className="text-[11.5px] leading-relaxed text-black/70">{t("rep.savings.text", { money: eur(tot.savings), pct: pct(r.savingsPct) })}</p>
                </>
              )}
              <Reading title={t("rep.reading")} items={readingOf("carriers")} />
            </Page>
          )}

          {/* ── 4. destinazioni e tipologie ── */}
          {hasShip && (
            <Page running={running}>
              <SectionTitle n={num("geo")} title={titleOf("geo")} intro={t("rep.s.geo.intro")} />
              {withCountry > 0 ? (
                <>
                  <SubTitle>{t("rep.geo.split")}</SubTitle>
                  <ShareBar
                    parts={(["italy", "abroad"] as const).map((k) => ({
                      label: t(`rep.geo.${k}`),
                      value: r.geo[k].n,
                      detail: `${n(r.geo[k].n)} · ${shareOf(r.geo[k].n, withCountry)} · ${t("rep.avg", { v: avgOf(r.geo[k].cost, r.geo[k].priced) })}`,
                    }))}
                  />
                  <div className="mt-2 grid gap-8 sm:grid-cols-2 print:grid-cols-2">
                    <div className="break-inside-avoid">
                      <SubTitle>{t("rep.geo.countries")}</SubTitle>
                      <HBars
                        rows={[
                          ...topCountries.map((c) => ({ label: countryLabel(c.label, lang), value: c.n, text: n(c.n), sub: shareOf(c.n, withCountry) })),
                          ...(restCountries > 0 ? [{ label: t("rep.others"), value: restCountries, text: n(restCountries), sub: shareOf(restCountries, withCountry) }] : []),
                        ]}
                      />
                    </div>
                    <div className="break-inside-avoid">
                      <SubTitle>{t("rep.geo.avgCost")}</SubTitle>
                      <Table
                        head={[t("rep.col.country"), t("rep.col.shipments"), t("rep.col.cost"), t("rep.col.avgCost")]}
                        rows={topCountries.map((c) => [countryLabel(c.label, lang), n(c.n), c.cost ? eur(c.cost) : "—", avgOf(c.cost, c.priced)])}
                      />
                    </div>
                  </div>
                  {r.geo.noCountry > 0 && <p className="mt-3 text-[10.5px] text-black/50">{t("rep.geo.noCountry", { n: n(r.geo.noCountry) })}</p>}
                </>
              ) : (
                <p className="text-[11.5px] text-black/55">{t("rep.noData")}</p>
              )}
              <SubTitle>{t("rep.types.title")}</SubTitle>
              <ShareBar
                parts={[
                  ...topTypes.map((g) => ({ label: orderType(g.key), value: g.n, detail: `${n(g.n)} · ${shareOf(g.n, tot.shipments)} · ${t("rep.avg", { v: avgOf(g.cost, g.priced) })}` })),
                  ...(restTypes > 0 ? [{ label: t("rep.others"), value: restTypes, detail: `${n(restTypes)} · ${shareOf(restTypes, tot.shipments)}` }] : []),
                ]}
              />
              <Reading title={t("rep.reading")} items={readingOf("geo")} />
            </Page>
          )}

          {/* ── 5. clienti e agenti ── */}
          {r.customers.active > 0 && (
            <Page running={running}>
              <SectionTitle n={num("customers")} title={titleOf("customers")} intro={t("rep.s.customers.intro")} />
              <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4 print:grid-cols-4">
                <Kpi label={t("rep.kpi.active")} value={n(r.customers.active)} delta={delta((x) => x.customers, true)} />
                <Kpi label={t("rep.kpi.new")} value={n(r.customers.fresh)} sub={`${shareOf(r.customers.fresh, r.customers.active)} · ${t("rep.kpi.new.sub")}`} />
                <Kpi label={t("rep.kpi.returning")} value={n(r.customers.returning)} sub={`${shareOf(r.customers.returning, r.customers.active)} · ${t("rep.kpi.returning.sub")}`} />
                <Kpi label={t("rep.kpi.top10")} value={pct(r.customers.top10Share)} sub={t("rep.kpi.top10.sub")} />
              </div>
              <div className="mt-2 grid gap-8 sm:grid-cols-2 print:grid-cols-2">
                <div className="min-w-0 break-inside-avoid">
                  <SubTitle>{t("rep.cust.byCount")}</SubTitle>
                  <Table
                    head={[t("rep.col.customer"), t("rep.col.shipments"), t("rep.col.cost")]}
                    rows={r.customers.byCount.map((c) => [c.name, n(c.n), c.cost ? eur(c.cost) : "—"])}
                  />
                </div>
                <div className="min-w-0 break-inside-avoid">
                  <SubTitle>{t("rep.cust.byCost")}</SubTitle>
                  <Table
                    head={[t("rep.col.customer"), t("rep.col.cost"), t("rep.col.shipments")]}
                    rows={r.customers.byCost.map((c) => [c.name, c.cost ? eur(c.cost) : "—", n(c.n)])}
                  />
                </div>
              </div>
              <Reading title={t("rep.reading")} items={readingOf("customers")} />
            </Page>
          )}

          {/* ── saldo trasporti per cliente: i migliori e i peggiori ── */}
          {r.balance.best.length + r.balance.worst.length > 0 && (() => {
            const withAgent = [...r.balance.best, ...r.balance.worst].some((b) => b.agent);
            const head = [t("rep.col.customer"), t("rep.col.shipments"), t("rep.col.cost"), t("rep.col.paid"), t("rep.col.balance"), t("rep.col.coverage"), t("rep.col.unpaid"), ...(withAgent ? [t("rep.col.agent")] : [])];
            const rows = (list: typeof r.balance.best) => list.map((b) => [
              b.name, n(b.n), b.cost ? eur(b.cost) : "—", b.paid ? eur(b.paid) : "—",
              `${b.balance > 0 ? "+" : ""}${eur(b.balance)}`, b.cost > 0 ? pct(b.paid / b.cost) : "—", b.unpaid ? n(b.unpaid) : "—",
              ...(withAgent ? [b.agent || "—"] : []),
            ]);
            return (
              <Page running={running}>
                <SectionTitle n={num("balance")} title={titleOf("balance")} intro={t("rep.s.balance.intro")} />
                <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4 print:grid-cols-4">
                  <Kpi label={t("rep.kpi.inProfit")} value={n(r.balance.inProfit)} sub={t("rep.kpi.inProfit.sub")} />
                  <Kpi label={t("rep.kpi.profitTotal")} value={eur(r.balance.profitTotal)} />
                  <Kpi label={t("rep.kpi.inLoss")} value={n(r.balance.inLoss)} sub={t("rep.kpi.inLoss.sub")} />
                  <Kpi label={t("rep.kpi.lossTotal")} value={eur(r.balance.lossTotal)} sub={r.balance.inLoss > 10 ? t("rep.kpi.lossTotal.sub", { pct: pct(r.balance.worst10Share) }) : undefined} />
                </div>
                <SubTitle>{t("rep.bal.best")}</SubTitle>
                {r.balance.best.length ? <Table head={head} rows={rows(r.balance.best)} /> : <p className="text-[11.5px] text-black/55">{t("rep.bal.none")}</p>}
                <SubTitle>{t("rep.bal.worst")}</SubTitle>
                {r.balance.worst.length ? <Table head={head} rows={rows(r.balance.worst)} /> : <p className="text-[11.5px] text-black/55">{t("rep.bal.none")}</p>}
                <p className="mt-2 text-[10px] leading-relaxed text-black/50">{t("rep.bal.note")}</p>
                <Reading title={t("rep.reading")} items={readingOf("balance")} />
              </Page>
            );
          })()}

          {/* ── agenti ed e-commerce (dati registrati da novembre 2026) ── */}
          {(r.agentsDetail.length > 0 || r.ecommerce.n > 0) && (
            <Page running={running}>
              <SectionTitle n={num("agents")} title={titleOf("agents")} intro={t("rep.s.agents.intro")} />
              <p className="mb-6 border-l-2 pl-3 text-[11.5px] leading-relaxed text-black/70" style={{ borderColor: RED }}>{t("rep.agents.partial")}</p>
              <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4 print:grid-cols-4">
                <Kpi label={t("rep.kpi.withAgent")} value={n(r.withAgent)} sub={t("rep.kpi.withAgent.sub", { pct: shareOf(r.withAgent, tot.shipments) })} />
                <Kpi label={t("rep.kpi.agents")} value={n(r.agentsDetail.length)} />
                <Kpi label={t("rep.kpi.b2c")} value={n(r.ecommerce.n)} sub={r.ecommerce.first ? t("rep.kpi.b2c.sub", { d: fmtDate(r.ecommerce.first), pct: shareOf(r.ecommerce.n, tot.shipments) }) : undefined} />
                <Kpi label={t("rep.kpi.b2cBalance")} value={r.ecommerce.n ? eur(r.ecommerce.balance) : "—"} sub={r.ecommerce.n ? t("rep.kpi.b2cBalance.sub", { cost: eur(r.ecommerce.cost), paid: eur(r.ecommerce.paid) }) : undefined} />
              </div>
              {r.agentsDetail.length > 0 && (
                <>
                  <SubTitle>{t("rep.agents.title")}</SubTitle>
                  <Table
                    head={[t("rep.col.agent"), t("rep.col.shipments"), t("rep.col.share"), t("rep.col.cost"), t("rep.col.paid"), t("rep.col.balance"), t("rep.col.warranties")]}
                    rows={r.agentsDetail.slice(0, 15).map((a) => [
                      a.key, n(a.n), shareOf(a.n, tot.shipments), a.cost ? eur(a.cost) : "—", a.paid ? eur(a.paid) : "—",
                      a.n ? `${a.balance > 0 ? "+" : ""}${eur(a.balance)}` : "—", a.warranties ? n(a.warranties) : "—",
                    ])}
                  />
                </>
              )}
              {r.ecommerce.n > 0 && (
                <>
                  <SubTitle>{t("rep.b2c.title")}</SubTitle>
                  <HBars
                    rows={r.ecommerce.byType.map((g) => ({
                      label: orderType(g.key),
                      value: g.n,
                      text: n(g.n),
                      sub: `${shareOf(g.n, r.ecommerce.n)} · ${eur(g.cost)}`,
                    }))}
                  />
                  <p className="mt-2 text-[10px] leading-relaxed text-black/50">{t("rep.b2c.note")}</p>
                </>
              )}
            </Page>
          )}

          {/* ── 6. assistenze ── */}
          {r.tickets.count > 0 && (
            <Page running={running}>
              <SectionTitle n={num("assistance")} title={titleOf("assistance")} intro={t("rep.s.assistance.intro")} />
              <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-4 print:grid-cols-4">
                <Kpi label={t("rep.kpi.ass.count")} value={n(r.tickets.count)} delta={delta((x) => x.tickets, null)} />
                <Kpi
                  label={t("rep.kpi.ass.approval")}
                  value={r.tickets.approvalRate != null ? pct(r.tickets.approvalRate) : "—"}
                  sub={t("rep.kpi.ass.approval.sub", { a: n(r.tickets.approved), r: n(r.tickets.rejected) })}
                />
                <Kpi
                  label={t("rep.kpi.ass.days")}
                  value={r.tickets.avgDays != null ? t("rep.days", { d: dec(r.tickets.avgDays) }) : "—"}
                  sub={t("rep.kpi.ass.days.sub", { n: n(r.tickets.measured) })}
                />
                <Kpi label={t("rep.kpi.ass.shipping")} value={eur(r.tickets.shippingCost)} sub={t("rep.kpi.ass.shipping.sub")} />
              </div>
              <div className="mt-2 grid gap-8 sm:grid-cols-2 print:grid-cols-2">
                <div className="break-inside-avoid">
                  <SubTitle>{t("rep.ass.phases")}</SubTitle>
                  <ShareBar cols={1} parts={r.tickets.phases.map((p) => ({ label: phase(p.key), value: p.n, detail: `${n(p.n)} · ${shareOf(p.n, r.tickets.count)}` }))} />
                </div>
                <div className="break-inside-avoid">
                  <SubTitle>{t("rep.ass.brands")}</SubTitle>
                  <HBars rows={r.tickets.brands.slice(0, 8).map((b) => ({ label: unknown(b.key), value: b.n, text: n(b.n), sub: shareOf(b.n, r.tickets.count) }))} />
                </div>
              </div>
              {r.tickets.linkedShipments > 0 && (
                <p className="mt-6 text-[11.5px] leading-relaxed text-black/70">{t("rep.ass.linked", { n: n(r.tickets.linkedShipments), cost: eur(r.tickets.linkedCost) })}</p>
              )}
              <Reading title={t("rep.reading")} items={readingOf("assistance")} />
            </Page>
          )}

          {/* ── 7. garanzie ── */}
          {r.warranties.count > 0 && (
            <Page running={running}>
              <SectionTitle n={num("warranties")} title={titleOf("warranties")} intro={t("rep.s.warranties.intro")} />
              <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 print:grid-cols-3">
                <Kpi
                  label={t("rep.kpi.war.count")}
                  value={n(r.warranties.count)}
                  sub={t("rep.kpi.war.count.sub", { covered: n(r.warranties.covered), paid: n(r.warranties.paid) })}
                  delta={delta((x) => x.warranties, null)}
                />
                <Kpi label={t("rep.kpi.war.valuePaid")} value={eur(r.warranties.valuePaid)} sub={t("rep.nCases", { count: r.warranties.paid, n: n(r.warranties.paid) })} />
                <Kpi label={t("rep.kpi.war.valueTotal")} value={eur(r.warranties.valueTotal)} sub={t("rep.kpi.war.valueTotal.sub", { n: n(r.warranties.withValue) })} />
                <Kpi
                  label={t("rep.kpi.war.days")}
                  value={r.warranties.avgDays != null ? t("rep.days", { d: dec(r.warranties.avgDays) }) : "—"}
                  sub={t("rep.kpi.war.days.sub", { n: n(r.warranties.measured) })}
                />
                <Kpi label={t("rep.kpi.war.open")} value={n(r.warranties.open)} sub={t("rep.kpi.war.open.sub", { n: n(r.warranties.stalled), days: STALLED_DAYS })} />
              </div>
              <div className="mt-2 grid gap-8 sm:grid-cols-2 print:grid-cols-2">
                <div className="break-inside-avoid">
                  <SubTitle>{t("rep.war.process")}</SubTitle>
                  <ShareBar
                    cols={1}
                    parts={[
                      { label: t("rep.war.covered"), value: r.warranties.covered, detail: `${n(r.warranties.covered)} · ${shareOf(r.warranties.covered, r.warranties.count)}` },
                      { label: t("rep.war.paid"), value: r.warranties.paid, detail: `${n(r.warranties.paid)} · ${shareOf(r.warranties.paid, r.warranties.count)}` },
                    ]}
                  />
                </div>
                <div className="break-inside-avoid">
                  <SubTitle>{t("rep.war.solutions")}</SubTitle>
                  <ShareBar cols={1} parts={r.warranties.solutions.map((s) => ({ label: solution(s.key), value: s.n, detail: `${n(s.n)} · ${shareOf(s.n, r.warranties.count)}` }))} />
                </div>
              </div>
              <SubTitle>{t("rep.war.producers")}</SubTitle>
              <HBars rows={r.warranties.producers.slice(0, 10).map((p) => ({ label: unknown(p.key), value: p.n, text: n(p.n), sub: shareOf(p.n, r.warranties.count) }))} />
              {r.warranties.shippingCost > 0 && <p className="mt-4 text-[11.5px] leading-relaxed text-black/70">{t("rep.war.shipping", { cost: eur(r.warranties.shippingCost) })}</p>}
              <Reading title={t("rep.reading")} items={readingOf("warranties")} />
            </Page>
          )}

          {/* ── 8. richieste di spedizione ── */}
          {r.requests.count > 0 && (
            <Page running={running}>
              <SectionTitle n={num("requests")} title={titleOf("requests")} intro={t("rep.s.requests.intro")} />
              <div className="grid grid-cols-2 gap-x-6 gap-y-6 sm:grid-cols-3 print:grid-cols-3">
                <Kpi
                  label={t("rep.kpi.req.count")}
                  value={n(r.requests.count)}
                  sub={t("rep.kpi.req.count.sub", { shipped: n(r.requests.shipped), pending: n(r.requests.pending), cancelled: n(r.requests.cancelled) })}
                />
                <Kpi label={t("rep.kpi.req.express")} value={n(r.requests.express)} sub={t("rep.kpi.req.express.sub", { pct: shareOf(r.requests.express, liveReq) })} />
                <Kpi label={t("rep.kpi.req.invoice")} value={eur(r.requests.invoiceTotal)} sub={t("rep.kpi.req.invoice.sub")} />
                <Kpi label={t("rep.kpi.req.insured")} value={eur(r.requests.insuredTotal)} sub={t("rep.kpi.req.insured.sub", { n: n(r.requests.withoutInsurance) })} />
                <Kpi
                  label={t("rep.kpi.req.days")}
                  value={r.requests.avgDaysToShip != null ? t("rep.days", { d: dec(r.requests.avgDaysToShip) }) : "—"}
                  sub={t("rep.kpi.req.days.sub", { n: n(r.requests.measured) })}
                />
              </div>
              {r.requests.cancelled > 0 && <p className="mt-4 text-[10.5px] text-black/50">{t("rep.req.note")}</p>}
              <Reading title={t("rep.reading")} items={readingOf("requests")} />
            </Page>
          )}

          {/* ── 9. qualità dei dati ── */}
          <Page running={running}>
            <SectionTitle n={num("quality")} title={titleOf("quality")} intro={t("rep.s.quality.intro")} />
            {qualityRows.length === 0 ? (
              <p className="text-[11.5px] text-black/60">{t("rep.q.allGood")}</p>
            ) : (
              <div className="grid gap-4">
                {qualityRows.map((x) => (
                  <CountRow key={x.key} n={n(x.n)} title={t(`rep.q.${x.key}`)} hint={t(`rep.q.${x.key}.hint`)} />
                ))}
              </div>
            )}
          </Page>

          {/* ── 10. conclusioni ── */}
          <Page running={running}>
            <SectionTitle n={num("conclusions")} title={titleOf("conclusions")} intro={t("rep.s.conclusions.intro")} />
            <div className="grid gap-10 sm:grid-cols-2 print:grid-cols-2">
              {[
                { id: "good", title: t("rep.highlights"), items: highlights, color: GOOD, empty: t("rep.highlights.none") },
                { id: "watch", title: t("rep.watch"), items: watch, color: RED, empty: t("rep.watch.none") },
              ].map((col) => (
                <div key={col.id}>
                  <p className="border-b-2 pb-1.5 text-[13px] font-bold" style={{ borderColor: col.color }}>{col.title}</p>
                  {col.items.length === 0 ? (
                    <p className="mt-3 text-[11.5px] text-black/55">{col.empty}</p>
                  ) : (
                    <ol className="mt-3 grid gap-3">
                      {col.items.map((i, k) => (
                        <li key={i.key} className="grid break-inside-avoid grid-cols-[1.5rem_minmax(0,1fr)] text-[12px] leading-relaxed">
                          <span className="font-bold tabular-nums" style={{ color: col.color }}>{k + 1}</span>
                          <span>{say(i)}</span>
                        </li>
                      ))}
                    </ol>
                  )}
                </div>
              ))}
            </div>
          </Page>

          {/* ── 11. note di metodo ── */}
          <Page running={running}>
            <SectionTitle n={num("method")} title={titleOf("method")} />
            <ul className="grid max-w-[68ch] gap-2.5 text-[11.5px] leading-relaxed text-black/75">
              {["scope", "cost", "paid", "savings", "customers", "warranties", "amounts", ...(r.current ? ["current"] : [])].map((k) => (
                <li key={k} className="grid grid-cols-[0.9rem_minmax(0,1fr)]">
                  <span aria-hidden="true" className="text-black/40">—</span>
                  <span>{t(`rep.m.${k}`)}</span>
                </li>
              ))}
            </ul>
            <p className="mt-10 text-[10.5px] text-black/45">{t("rep.m.footer", { d: fmtDate(today) })}</p>
          </Page>
        </>
      )}
    </>
  );
}
