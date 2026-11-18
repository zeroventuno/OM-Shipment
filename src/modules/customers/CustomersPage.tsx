import { useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Copy, Download, GitMerge, Loader2, Plus, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { useDateLocale } from "@/i18n/dateLocale";
import { cn } from "@/lib/utils";
import { countryLabel, canonicalCountry } from "@/modules/shipments/data/countries";
import { formatMoney } from "@/modules/requests/api";
import { PageHeader, SearchBox } from "../common/PageHeader";
import { listCustomers, listAllAddresses, listDismissals, buildCustomersCsv, downloadText, CUSTOMERS_KEY, DISMISSALS_KEY, type CustomerRow } from "./api";
import { findDuplicateGroups } from "./duplicates.js";
import { key as nameKey } from "./importer.js";
import ImportDialog from "./ImportDialog";
import MergeDialog from "./MergeDialog";

type Activity = "all" | "shipments" | "service" | "none" | "noAddress";
type Sort = "name" | "last" | "count" | "cost";
const PAGE = 60;

/** Origem do cadastro -> rótulo. "csv:mbe" vira "Import MBE". */
export function sourceLabel(source: string, t: (k: string, o?: Record<string, string>) => string) {
  if (source.startsWith("csv:")) return t("Import {{name}}", { name: source.slice(4).toUpperCase() });
  return t(`source.${source}`, { defaultValue: source });
}

export default function CustomersPage() {
  const { t, i18n } = useTranslation();
  const locale = useDateLocale();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [params, setParams] = useSearchParams();
  const [shown, setShown] = useState(PAGE);
  const [importOpen, setImportOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  // a seleção sobrevive à busca: dá para achar um cliente, marcar e buscar o outro
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [mergeOpen, setMergeOpen] = useState(false);
  const toggleSelected = (id: string) => setSelectedIds((cur) => {
    const next = new Set(cur);
    if (next.has(id)) next.delete(id); else next.add(id);
    return next;
  });

  const q = params.get("q") ?? "";
  const country = params.get("country") ?? "";
  const source = params.get("source") ?? "";
  const activity = (params.get("activity") as Activity) || "all";
  const sort = (params.get("sort") as Sort) || "name";
  const setParam = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v && v !== "all" && !(k === "sort" && v === "name")) next.set(k, v);
    else next.delete(k);
    setParams(next, { replace: true });
    setShown(PAGE);
  };

  const { data: customers = [], isLoading, error } = useQuery({ queryKey: CUSTOMERS_KEY, queryFn: listCustomers });
  const { data: dismissed } = useQuery({ queryKey: DISMISSALS_KEY, queryFn: listDismissals });
  const duplicateGroups = useMemo(() => (dismissed && customers.length ? findDuplicateGroups(customers, dismissed).length : 0), [customers, dismissed]);
  const selected = useMemo(() => customers.filter((c) => selectedIds.has(c.id)), [customers, selectedIds]);
  const lang = i18n.language || "it";
  const countryName = (stored: string | null) => (stored ? countryLabel(stored, lang) : "");

  const countries = useMemo(() => {
    const m = new Map<string, { value: string; label: string; n: number }>();
    for (const c of customers) {
      if (!c.country) continue;
      const k = canonicalCountry(c.country);
      const cur = m.get(k);
      m.set(k, { value: k, label: countryLabel(c.country, lang), n: (cur?.n ?? 0) + 1 });
    }
    return [...m.values()].sort((a, b) => a.label.localeCompare(b.label, lang));
  }, [customers, lang]);

  const sources = useMemo(() => [...new Set(customers.map((c) => c.source))].sort(), [customers]);

  const filtered = useMemo(() => {
    const term = nameKey(q);
    const digits = q.replace(/\D/g, "");
    const list = customers.filter((c) => {
      if (country && canonicalCountry(c.country ?? "") !== country) return false;
      if (source && c.source !== source) return false;
      if (activity === "shipments" && c.shipments === 0) return false;
      if (activity === "service" && c.tickets + c.warranties === 0) return false;
      if (activity === "none" && c.shipments + c.tickets + c.warranties + c.requests > 0) return false;
      if (activity === "noAddress" && c.addresses > 0) return false;
      if (!term) return true;
      return [c.name, c.city, c.contact_name, c.email, c.tax_id].some((v) => v && nameKey(v).includes(term))
        || (digits.length >= 4 && !!c.phone && c.phone.replace(/\D/g, "").includes(digits));
    });
    const cost = (c: CustomerRow) => Number(c.freight_cost) || 0;
    const by: Record<Sort, (a: CustomerRow, b: CustomerRow) => number> = {
      name: (a, b) => a.name.localeCompare(b.name, lang),
      last: (a, b) => (b.last_shipment ?? "").localeCompare(a.last_shipment ?? ""),
      count: (a, b) => b.shipments - a.shipments || a.name.localeCompare(b.name, lang),
      cost: (a, b) => cost(b) - cost(a),
    };
    return list.sort(by[sort]);
  }, [customers, q, country, source, activity, sort, lang]);

  const stats = useMemo(() => {
    const year = new Date().getFullYear().toString();
    return {
      total: customers.length,
      active: customers.filter((c) => c.last_shipment?.startsWith(year)).length,
      service: customers.filter((c) => c.tickets + c.warranties > 0).length,
      noAddress: customers.filter((c) => c.addresses === 0).length,
    };
  }, [customers]);

  const exportCsv = async () => {
    setExporting(true);
    try {
      const addresses = await listAllAddresses();
      const ids = new Set(filtered.map((c) => c.id));
      const csv = buildCustomersCsv(filtered, addresses.filter((a) => ids.has(a.customer_id)), countryName);
      downloadText(`clienti-${format(new Date(), "yyyy-MM-dd")}.csv`, csv);
      toast({ title: t("{{count}} customers exported", { count: filtered.length }) });
    } catch (e) {
      toast({ title: t("Error"), description: (e as Error).message, variant: "destructive" });
    } finally {
      setExporting(false);
    }
  };

  const activityLabels: Record<Activity, string> = {
    all: t("All"),
    shipments: t("With shipments"),
    service: t("With assistance or warranty"),
    none: t("No activity"),
    noAddress: t("No delivery address"),
  };
  const selectCls = "h-11 rounded-full border border-border bg-card px-4 text-sm focus:outline-none focus:ring-2 focus:ring-ring min-w-0";

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("nav.customers")}
        title={t("Customer register")}
        actions={
          <>
            {duplicateGroups > 0 && (
              <Button variant="outline" asChild>
                <Link to="/customers/duplicates"><Copy /> {t("dup.button")} <span className="tabular-nums">({duplicateGroups})</span></Link>
              </Button>
            )}
            <Button variant="outline" onClick={exportCsv} disabled={exporting || filtered.length === 0}>
              {exporting ? <Loader2 className="animate-spin" /> : <Download />} {t("Export")}
            </Button>
            <Button variant="outline" onClick={() => setImportOpen(true)}><Upload /> {t("Import")}</Button>
            <Button asChild><Link to="/customers/new"><Plus /> {t("New customer")}</Link></Button>
          </>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {([
          ["Customers", stats.total, "all"],
          ["Shipped to this year", stats.active, "shipments"],
          ["With assistance or warranty", stats.service, "service"],
          ["No delivery address", stats.noAddress, "noAddress"],
        ] as const).map(([label, n, act]) => (
          <button
            key={label}
            type="button"
            onClick={() => setParam("activity", act)}
            className={cn("text-left bg-card border rounded-lg p-4 flex flex-col gap-1 transition-colors",
              activity === act ? "border-foreground" : "border-border hover:border-foreground/40")}
          >
            <span className="eyebrow">{t(label)}</span>
            <span className="text-2xl font-bold tabular-nums">{n.toLocaleString(lang)}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-col lg:flex-row lg:items-center gap-3">
        <SearchBox value={q} onChange={(v) => setParam("q", v)} placeholder={t("Name, city, e-mail, phone, VAT…")} />
        <div className="grid grid-cols-2 sm:flex gap-3">
          <select aria-label={t("Country")} value={country} onChange={(e) => setParam("country", e.target.value)} className={selectCls}>
            <option value="">{t("All countries")}</option>
            {countries.map((c) => <option key={c.value} value={c.value}>{c.label} ({c.n})</option>)}
          </select>
          <select aria-label={t("Origin")} value={source} onChange={(e) => setParam("source", e.target.value)} className={selectCls}>
            <option value="">{t("All origins")}</option>
            {sources.map((s) => <option key={s} value={s}>{sourceLabel(s, t)}</option>)}
          </select>
          <select aria-label={t("Activity")} value={activity} onChange={(e) => setParam("activity", e.target.value)} className={selectCls}>
            {(Object.keys(activityLabels) as Activity[]).map((a) => <option key={a} value={a}>{activityLabels[a]}</option>)}
          </select>
          <select aria-label={t("Sort by")} value={sort} onChange={(e) => setParam("sort", e.target.value)} className={selectCls}>
            <option value="name">{t("Name A–Z")}</option>
            <option value="last">{t("Latest shipment")}</option>
            <option value="count">{t("Most shipments")}</option>
            <option value="cost">{t("Highest freight cost")}</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <p className="py-16 text-center text-muted-foreground"><Loader2 className="inline h-6 w-6 animate-spin" /></p>
      ) : error ? (
        <p className="py-16 text-center text-destructive">{(error as Error).message}</p>
      ) : filtered.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t("No customers found")}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("{{count}} customers", { count: filtered.length })}</p>

          {/* computador: tabela */}
          <div className="hidden md:block bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left">
                  <th className="w-11 pl-2"><span className="sr-only">{t("dup.mergeTitle")}</span></th>
                  {[t("Customer"), t("Contacts"), t("Shipments"), t("Latest shipment"), t("Assistance / warranties"), t("Addresses")].map((h, i) => (
                    <th key={h} className={cn("px-4 py-3 eyebrow font-semibold", i >= 2 && "text-right")}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.slice(0, shown).map((c) => (
                  <tr key={c.id} onClick={() => navigate(`/customers/${c.id}`)} className={cn("border-b border-muted last:border-0 hover:bg-secondary/60 cursor-pointer", selectedIds.has(c.id) && "bg-secondary/60")}>
                    <td className="w-11 pl-2" onClick={(e) => e.stopPropagation()}>
                      <SelectBox checked={selectedIds.has(c.id)} label={t("dup.select", { name: c.name })} onChange={() => toggleSelected(c.id)} />
                    </td>
                    <td className="px-4 py-3 max-w-[22rem]">
                      <Link to={`/customers/${c.id}`} onClick={(e) => e.stopPropagation()} className="font-semibold hover:underline underline-offset-4 break-words">{c.name}</Link>
                      <p className="text-muted-foreground truncate">{[c.city, countryName(c.country)].filter(Boolean).join(" · ") || "—"}</p>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground max-w-[16rem]">
                      <p className="truncate">{c.contact_name || c.email || "—"}</p>
                      {c.phone && <p className="truncate">{c.phone}</p>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">
                      <p className="font-semibold">{c.shipments || "—"}</p>
                      {Number(c.freight_cost) > 0 && <p className="text-muted-foreground">{formatMoney(Number(c.freight_cost), lang)}</p>}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums text-muted-foreground">
                      {c.last_shipment ? format(new Date(c.last_shipment), "dd/MM/yyyy", { locale }) : "—"}
                    </td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.tickets + c.warranties ? `${c.tickets} / ${c.warranties}` : "—"}</td>
                    <td className="px-4 py-3 text-right tabular-nums">{c.addresses || <span className="text-destructive">0</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* celular: cartões */}
          <div className="md:hidden flex flex-col gap-3">
            {filtered.slice(0, shown).map((c) => (
              <div key={c.id} className="relative">
              <Link to={`/customers/${c.id}`} className={cn("bg-card border rounded-lg p-4 pr-14 flex flex-col gap-1.5 active:bg-secondary", selectedIds.has(c.id) ? "border-foreground" : "border-border")}>
                <p className="font-semibold text-[17px] tracking-tight break-words">{c.name}</p>
                <p className="text-sm text-muted-foreground">{[c.city, countryName(c.country)].filter(Boolean).join(" · ") || "—"}</p>
                <div className="flex flex-wrap gap-x-4 gap-y-1 text-[12px] text-muted-foreground tabular-nums">
                  <span>{t("Shipments")}: <strong className="text-foreground">{c.shipments}</strong></span>
                  {c.tickets + c.warranties > 0 && <span>{t("Assistance / warranties")}: <strong className="text-foreground">{c.tickets} / {c.warranties}</strong></span>}
                  <span>{t("Addresses")}: <strong className={c.addresses ? "text-foreground" : "text-destructive"}>{c.addresses}</strong></span>
                </div>
              </Link>
              <div className="absolute right-1 top-1">
                <SelectBox checked={selectedIds.has(c.id)} label={t("dup.select", { name: c.name })} onChange={() => toggleSelected(c.id)} />
              </div>
              </div>
            ))}
          </div>

          {shown < filtered.length && (
            <Button variant="outline" className="self-center" onClick={() => setShown((n) => n + PAGE)}>
              {t("Show more")} ({filtered.length - shown})
            </Button>
          )}
        </>
      )}

      {selected.length > 0 && (
        <div className="sticky bottom-20 md:bottom-4 z-20 bg-card border border-foreground rounded-lg shadow-lg p-3 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex flex-wrap items-center gap-2 min-w-0 flex-1">
            <span className="text-sm font-semibold tabular-nums">{t("dup.selected", { count: selected.length })}</span>
            {selected.map((c) => (
              <span key={c.id} className="inline-flex items-center gap-1 rounded-full bg-secondary pl-3 pr-1 py-0.5 text-[13px] max-w-full">
                <span className="truncate">{c.name}</span>
                <button type="button" aria-label={t("dup.remove", { name: c.name })} onClick={() => toggleSelected(c.id)} className="p-1 text-muted-foreground hover:text-foreground">
                  <X className="h-3.5 w-3.5" />
                </button>
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button variant="outline" onClick={() => setSelectedIds(new Set())}>{t("dup.clear")}</Button>
            <Button disabled={selected.length < 2} title={selected.length < 2 ? t("dup.pickTwo") : undefined} onClick={() => setMergeOpen(true)}>
              <GitMerge /> {t("dup.merge", { n: selected.length })}
            </Button>
          </div>
        </div>
      )}

      {mergeOpen && selected.length >= 2 && (
        <MergeDialog
          customers={selected}
          onClose={() => setMergeOpen(false)}
          onMerged={() => { setMergeOpen(false); setSelectedIds(new Set()); }}
        />
      )}

      <ImportDialog open={importOpen} onClose={() => setImportOpen(false)} customers={customers} />
    </div>
  );
}

function SelectBox({ checked, label, onChange }: { checked: boolean; label: string; onChange: () => void }) {
  return (
    <label className="flex h-11 w-11 items-center justify-center cursor-pointer">
      <input type="checkbox" className="h-4 w-4 accent-primary cursor-pointer" aria-label={label} checked={checked} onChange={onChange} />
    </label>
  );
}
