import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, ExternalLink, GitMerge, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { countryLabel } from "@/modules/shipments/data/countries";
import { PageHeader } from "../common/PageHeader";
import {
  CUSTOMERS_KEY, DISMISSALS_KEY, dismissPairs, listCustomers, listDismissals, mergeCustomers, type CustomerRow,
} from "./api";
import { findDuplicateGroups, groupPairs } from "./duplicates.js";
import { sourceLabel } from "./CustomersPage";

type Level = "certain" | "probable" | "check";
interface Group { id: string; level: Level; reasons: string[]; members: CustomerRow[] }
const PAGE = 20;

const LEVEL_STYLE: Record<Level, string> = {
  certain: "bg-foreground text-background",
  probable: "bg-accent text-accent-foreground",
  check: "border border-border text-muted-foreground",
};

export default function DuplicatesPage() {
  const { t } = useTranslation();
  const [level, setLevel] = useState<Level | "all">("all");
  const [shown, setShown] = useState(PAGE);

  const customers = useQuery({ queryKey: CUSTOMERS_KEY, queryFn: listCustomers });
  const dismissals = useQuery({ queryKey: DISMISSALS_KEY, queryFn: listDismissals });

  const groups = useMemo<Group[]>(
    () => (customers.data && dismissals.data ? findDuplicateGroups(customers.data, dismissals.data) as Group[] : []),
    [customers.data, dismissals.data],
  );
  const counts = useMemo(() => groups.reduce((m, g) => ({ ...m, [g.level]: (m[g.level] ?? 0) + 1 }), {} as Record<string, number>), [groups]);
  const visible = level === "all" ? groups : groups.filter((g) => g.level === level);
  const loading = customers.isLoading || dismissals.isLoading;
  const error = customers.error || dismissals.error;

  return (
    <div className="flex flex-col gap-6">
      <Link to="/customers" className="tap-target inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground w-fit">
        <ArrowLeft className="h-4 w-4" /> {t("dup.back")}
      </Link>
      <PageHeader eyebrow={t("nav.customers")} title={t("dup.title")} />
      <p className="text-sm text-muted-foreground -mt-2 max-w-3xl">{t("dup.intro")}</p>

      <div className="flex flex-wrap gap-2" role="tablist">
        {(["all", "certain", "probable", "check"] as const).map((l) => (
          <button
            key={l}
            type="button"
            role="tab"
            aria-selected={level === l}
            onClick={() => { setLevel(l); setShown(PAGE); }}
            className={cn("h-9 px-4 rounded-full border text-sm transition-colors",
              level === l ? "border-foreground bg-foreground text-background" : "border-border hover:border-foreground/40")}
          >
            {t(`dup.level.${l}`)} <span className="tabular-nums opacity-70">{l === "all" ? groups.length : counts[l] ?? 0}</span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="py-16 text-center text-muted-foreground"><Loader2 className="inline h-6 w-6 animate-spin" /></p>
      ) : error ? (
        <p className="py-16 text-center text-destructive">{(error as Error).message}</p>
      ) : visible.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{groups.length === 0 ? t("dup.none") : t("dup.noneLevel")}</p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">{t("dup.count", { count: visible.length })}</p>
          <div className="flex flex-col gap-4">
            {visible.slice(0, shown).map((g) => <GroupCard key={g.id} group={g} />)}
          </div>
          {shown < visible.length && (
            <Button variant="outline" className="self-center" onClick={() => setShown((n) => n + PAGE)}>
              {t("Show more")} ({visible.length - shown})
            </Button>
          )}
        </>
      )}
    </div>
  );
}

function GroupCard({ group }: { group: Group }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const lang = i18n.language || "it";
  const [mainId, setMainId] = useState(group.members[0].id);
  const [excluded, setExcluded] = useState<Set<string>>(new Set());

  const included = group.members.filter((m) => !excluded.has(m.id));
  const main = group.members.find((m) => m.id === mainId)!;
  const others = included.filter((m) => m.id !== mainId);

  const done = () => {
    queryClient.invalidateQueries({ queryKey: CUSTOMERS_KEY });
    queryClient.invalidateQueries({ queryKey: DISMISSALS_KEY });
  };
  const merge = useMutation({
    mutationFn: () => mergeCustomers(mainId, others.map((m) => m.id)),
    onSuccess: (r) => {
      done();
      toast({ title: t("dup.merged", { main: main.name }), description: t("dup.mergedDetail", { addresses: r.addresses_moved, dups: r.addresses_duplicate }) });
    },
    onError: (e) => toast({ title: t("Error"), description: (e as Error).message, variant: "destructive" }),
  });
  const dismiss = useMutation({
    mutationFn: () => dismissPairs(groupPairs(included.map((m) => m.id)) as [string, string][]),
    onSuccess: () => { done(); toast({ title: t("dup.dismissed") }); },
    onError: (e) => toast({ title: t("Error"), description: (e as Error).message, variant: "destructive" }),
  });

  const toggle = (id: string) => {
    const next = new Set(excluded);
    if (next.has(id)) next.delete(id); else next.add(id);
    setExcluded(next);
    if (next.has(mainId)) setMainId(group.members.find((m) => !next.has(m.id))?.id ?? mainId);
  };
  const busy = merge.isPending || dismiss.isPending;
  const onMerge = () => {
    if (others.length === 0) return;
    if (window.confirm(t("dup.confirm", { main: main.name, others: others.map((m) => m.name).join(", ") }))) merge.mutate();
  };

  return (
    <section className="bg-card border border-border rounded-lg overflow-hidden">
      <header className="px-4 py-3 border-b border-border flex flex-wrap items-center gap-2">
        <span className={cn("rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-[0.08em]", LEVEL_STYLE[group.level])}>
          {t(`dup.level.${group.level}`)}
        </span>
        {group.reasons.map((r) => (
          <span key={r} className="rounded-full bg-secondary px-2.5 py-0.5 text-[12px]">{t(`dup.reason.${r}`)}</span>
        ))}
      </header>

      <div className={cn("grid divide-y md:divide-y-0 md:divide-x divide-border",
        group.members.length === 2 ? "md:grid-cols-2" : "md:grid-cols-3")}>
        {group.members.map((m) => {
          const isMain = m.id === mainId;
          const out = excluded.has(m.id);
          return (
            <div key={m.id} className={cn("p-4 flex flex-col gap-2 text-sm", out && "opacity-40", isMain && !out && "bg-secondary/50")}>
              <div className="flex items-center justify-between gap-3">
                <label className="inline-flex items-center gap-2 cursor-pointer font-medium">
                  <input type="radio" name={`main-${group.id}`} className="accent-primary" checked={isMain} disabled={out}
                    onChange={() => setMainId(m.id)} />
                  {t("dup.main")}
                </label>
                {group.members.length > 2 && (
                  <label className="inline-flex items-center gap-1.5 cursor-pointer text-muted-foreground">
                    <input type="checkbox" className="accent-primary" checked={!out} onChange={() => toggle(m.id)} />
                    {t("dup.include")}
                  </label>
                )}
              </div>
              <div className="flex items-start justify-between gap-2">
                <p className="font-semibold text-[16px] break-words">{m.name}</p>
                <Link to={`/customers/${m.id}`} target="_blank" title={t("dup.open")} aria-label={t("dup.open")}
                  className="tap-target shrink-0 text-muted-foreground hover:text-foreground mt-0.5">
                  <ExternalLink className="h-4 w-4" />
                </Link>
              </div>
              <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-[13px]">
                <Field label={t("Origin")} value={sourceLabel(m.source, t)} />
                <Field label={t("dup.contact")} value={m.contact_name} />
                <Field label={t("dup.reason.phone")} value={m.phone} />
                <Field label="E-mail" value={m.email} />
                <Field label="P.IVA" value={m.tax_id} />
                <Field label={t("dup.address")} value={[m.address_line1, [m.postal_code, m.city].filter(Boolean).join(" "), m.country ? countryLabel(m.country, lang) : null].filter(Boolean).join(", ")} />
              </dl>
              <p className="text-[12px] text-muted-foreground tabular-nums">
                {t("dup.history", { s: m.shipments, a: m.tickets + m.warranties, r: m.addresses })}
              </p>
            </div>
          );
        })}
      </div>

      <footer className="px-4 py-3 border-t border-border flex flex-wrap items-center justify-end gap-2">
        {included.length < 2 && <span className="text-sm text-muted-foreground mr-auto">{t("dup.needTwo")}</span>}
        <Button variant="outline" disabled={busy || included.length < 2} onClick={() => dismiss.mutate()}>
          {dismiss.isPending ? <Loader2 className="animate-spin" /> : <X />} {t("dup.notDuplicates")}
        </Button>
        <Button disabled={busy || others.length === 0} onClick={onMerge}>
          {merge.isPending ? <Loader2 className="animate-spin" /> : <GitMerge />} {t("dup.merge", { n: included.length })}
        </Button>
      </footer>
    </section>
  );
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={cn("break-words min-w-0", !value && "text-muted-foreground")}>{value || "—"}</dd>
    </>
  );
}
