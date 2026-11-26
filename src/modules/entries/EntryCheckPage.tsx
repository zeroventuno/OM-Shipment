import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Field } from "@/modules/customers/fields";
import { ticketsQuery } from "@/modules/assistance/api";
import { warrantiesQuery } from "@/modules/warranties/api";
import { todayRome } from "@/modules/ferie/logic";
import { CustomerSearch } from "@/modules/shipments/components/shipments/CustomerSearch";
import { PageHeader } from "../common/PageHeader";
import { BikeMarks } from "./BikeMarks";
import {
  COMPONENT_KEYS, CONTENT_KEYS, ENTRIES_KEY, deleteEntry, emptyEntry, getEntry, itDay, listPickupShipments, saveEntry,
  type ContentKey, type EntryDraft,
} from "./api";

const selectCls = "h-11 w-full rounded-md border border-input bg-card px-3 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary";

/**
 * Controllo di entrata: a ficha de quando a bike chega na caixa. Liga a uma
 * assistência, garantia ou retirada (e copia os dados de lá), guarda o mapa
 * dos defeitos e imprime em duas vias numa folha A4.
 */
export default function EntryCheckPage() {
  const { id } = useParams();
  const isNew = !id || id === "new";
  const [params] = useSearchParams();
  const { t } = useTranslation();
  const { toast } = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const existing = useQuery({ queryKey: [...ENTRIES_KEY, id], queryFn: () => getEntry(id!), enabled: !isNew });
  const tickets = useQuery(ticketsQuery);
  const warranties = useQuery(warrantiesQuery);
  const pickups = useQuery({ queryKey: ["entry_checks", "pickups"], queryFn: listPickupShipments });

  const [draft, setDraft] = useState<EntryDraft>(() => emptyEntry(todayRome()));
  const [loaded, setLoaded] = useState(isNew);

  useEffect(() => {
    if (existing.data && !loaded) {
      const { id: _id, code: _c, created_at: _a, updated_at: _u, ...rest } = existing.data;
      setDraft(rest);
      setLoaded(true);
    }
  }, [existing.data, loaded]);

  const set = <K extends keyof EntryDraft>(key: K, value: EntryDraft[K]) => setDraft((d) => ({ ...d, [key]: value }));
  const fill = (d: EntryDraft, patch: Partial<EntryDraft>): EntryDraft => {
    // só preenche o que ainda está vazio: o que a pessoa escreveu fica
    const out = { ...d };
    for (const [k, v] of Object.entries(patch) as [keyof EntryDraft, never][]) {
      const cur = out[k];
      if (v && (cur === null || cur === "" || cur === undefined)) out[k] = v;
    }
    return out;
  };

  const linkWarranty = (wid: string | null) => {
    const w = warranties.data?.find((x) => x.id === wid);
    setDraft((d) => {
      const next = { ...d, warranty_id: wid };
      if (!w) return next;
      const filled = fill(next, { customer_name: w.customerName, agent: w.agent, bike_model: w.bikeModel, serial_number: w.serialNumber, size: w.size, reason: w.problem });
      if (w.componentsDescription && !filled.components.other) filled.components = { ...filled.components, other: w.componentsDescription };
      return filled;
    });
  };
  const linkTicket = (tid: string | null) => {
    const tk = tickets.data?.find((x) => x.id === tid);
    setDraft((d) => {
      const next = { ...d, ticket_id: tid };
      return tk ? fill(next, { customer_name: tk.clientName, serial_number: tk.serialNumber ?? "", bike_model: [tk.brand, tk.component].filter(Boolean).join(" "), reason: tk.problem ?? "" }) : next;
    });
  };
  const linkPickup = (sid: string | null) => {
    const p = pickups.data?.find((x) => x.id === sid);
    setDraft((d) => (p ? fill({ ...d, shipment_id: sid }, { customer_name: p.customer_name ?? "" }) : { ...d, shipment_id: sid }));
    if (p?.warranty_id) linkWarranty(p.warranty_id);
    if (p?.ticket_id) linkTicket(p.ticket_id);
  };

  // novo a partir de uma pasta: /entries/new?warranty=…, ?ticket=…, ?shipment=…
  const [prefilled, setPrefilled] = useState(false);
  useEffect(() => {
    if (!isNew || prefilled || !tickets.data || !warranties.data || !pickups.data) return;
    setPrefilled(true);
    const w = params.get("warranty"), tk = params.get("ticket"), s = params.get("shipment");
    if (s) linkPickup(s);
    if (w) linkWarranty(w);
    if (tk) linkTicket(tk);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isNew, prefilled, tickets.data, warranties.data, pickups.data]);

  // print: salva antes e abre a folha (que lê do banco), na mesma aba
  const save = useMutation({
    mutationFn: (_opts: { print?: boolean }) => saveEntry(isNew ? null : id!, draft),
    onSuccess: (row, opts) => {
      queryClient.invalidateQueries({ queryKey: ENTRIES_KEY });
      queryClient.setQueryData([...ENTRIES_KEY, row.id], row);
      if (opts.print) return navigate(`/entries/${row.id}/print`);
      toast({ title: t("ec.saved", { code: row.code }) });
      if (isNew) navigate(`/entries/${row.id}`, { replace: true });
    },
    onError: (e: Error) => toast({ title: t("Error"), description: e.message, variant: "destructive" }),
  });
  const remove = useMutation({
    mutationFn: () => deleteEntry(id!),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ENTRIES_KEY }); navigate("/entries"); },
    onError: (e: Error) => toast({ title: t("Error"), description: e.message, variant: "destructive" }),
  });

  const ticketOptions = useMemo(() => (tickets.data ?? []).map((x) => ({ id: x.id, label: `${x.code ?? "OMA"} · ${x.clientName}` })), [tickets.data]);
  const warrantyOptions = useMemo(() => (warranties.data ?? []).map((x) => ({ id: x.id, label: `${x.protocolNumber ?? "OMW"} · ${x.customerName} · ${x.bikeModel}` })), [warranties.data]);
  const pickupOptions = useMemo(() => (pickups.data ?? []).map((x) => ({ id: x.id, label: `${x.order_id ?? "—"} · ${x.customer_name ?? ""} · ${itDay(x.created_at)}` })), [pickups.data]);

  if (!isNew && existing.isLoading) return <p className="py-16 text-center text-muted-foreground">…</p>;
  if (!isNew && existing.error) return <p className="py-16 text-center text-destructive">{(existing.error as Error).message}</p>;

  const code = existing.data?.code;
  const canSave = draft.customer_name.trim().length > 0 && !save.isPending;

  const cycle = (k: ContentKey) => {
    const cur = draft.contents[k];
    const next = cur === undefined ? true : cur ? false : undefined;
    const contents = { ...draft.contents };
    if (next === undefined) delete contents[k]; else contents[k] = next;
    set("contents", contents);
  };

  const linkSelect = (label: string, value: string | null, options: { id: string; label: string }[], onPick: (v: string | null) => void, to: (v: string) => string) => (
    <Field label={label}>
      <div className="flex gap-2">
        <select className={selectCls} value={value ?? ""} onChange={(e) => onPick(e.target.value || null)}>
          <option value="">{t("ec.none")}</option>
          {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
        {value && <Link to={to(value)} className="self-center whitespace-nowrap text-xs text-primary underline">{t("ec.open")}</Link>}
      </div>
    </Field>
  );

  return (
    <div className="flex flex-col gap-6 pb-24">
      <PageHeader
        eyebrow={t("ec.eyebrow")}
        title={code ? `${t("ec.title")} ${code}` : t("ec.new")}
        actions={
          <>
            <Button variant="outline" asChild><Link to="/entries"><ArrowLeft className="mr-2 h-4 w-4" />{t("ec.list")}</Link></Button>
          </>
        }
      />

      <section className="grid gap-4 rounded-2xl border border-border bg-card p-5 md:grid-cols-3">
        <span className="eyebrow md:col-span-3">{t("ec.link")}</span>
        {linkSelect(t("ec.ticket"), draft.ticket_id, ticketOptions, linkTicket, (v) => `/assistance/${v}`)}
        {linkSelect(t("ec.warranty"), draft.warranty_id, warrantyOptions, linkWarranty, (v) => `/warranties/${v}`)}
        {linkSelect(t("ec.pickup"), draft.shipment_id, pickupOptions, linkPickup, (v) => `/shipments/${v}`)}
        <p className="text-xs text-muted-foreground md:col-span-3">{t("ec.linkHint")}</p>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
          <CustomerSearch
            value={draft.customer_name}
            onChange={(v: string) => setDraft((d) => ({ ...d, customer_name: v, customer_id: null }))}
            onSelect={(c: { id: string; name: string }) => setDraft((d) => ({ ...d, customer_name: c.name, customer_id: c.id }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Field label={t("ec.arrival")}><Input type="date" value={draft.arrival_date} onChange={(e) => set("arrival_date", e.target.value)} /></Field>
            <Field label={t("ec.agent")}><Input value={draft.agent ?? ""} onChange={(e) => set("agent", e.target.value)} /></Field>
            <Field label={t("ec.model")}><Input value={draft.bike_model ?? ""} onChange={(e) => set("bike_model", e.target.value)} /></Field>
            <Field label={t("ec.size")}><Input value={draft.size ?? ""} onChange={(e) => set("size", e.target.value)} /></Field>
          </div>
          <Field label={t("ec.serial")}><Input value={draft.serial_number ?? ""} onChange={(e) => set("serial_number", e.target.value)} /></Field>
          <div className="flex flex-col gap-1.5">
            <span className="eyebrow">{t("ec.box")}</span>
            <div className="flex gap-2">
              {[false, true].map((v) => (
                <button key={String(v)} type="button" onClick={() => set("box_damaged", v)} aria-pressed={draft.box_damaged === v}
                  className={cn("h-10 rounded-full border px-5 text-sm font-medium",
                    draft.box_damaged === v ? (v ? "border-destructive bg-destructive/10" : "border-primary bg-primary text-primary-foreground") : "border-border hover:border-foreground")}>
                  {v ? t("ec.box.yes") : t("ec.box.no")}
                </button>
              ))}
            </div>
          </div>
          <Field label={t("ec.reason")}><Textarea rows={3} value={draft.reason ?? ""} onChange={(e) => set("reason", e.target.value)} /></Field>
        </section>

        <section className="rounded-2xl border border-border bg-card p-5">
          <BikeMarks marks={draft.marks} onChange={(m) => set("marks", m)} />
        </section>
      </div>

      <section className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5">
        <span className="eyebrow">{t("ec.components")}</span>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
          {COMPONENT_KEYS.map((k) => (
            <Field key={k} label={t(`ec.c.${k}`)}>
              <Input value={draft.components[k] ?? ""} placeholder={t(`ec.c.${k}.ph`)}
                onChange={(e) => set("components", { ...draft.components, [k]: e.target.value })} />
            </Field>
          ))}
        </div>
      </section>

      <section className="flex flex-col gap-3 rounded-2xl border border-border bg-card p-5">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="eyebrow">{t("ec.contents")}</span>
          <span className="text-xs text-muted-foreground">{t("ec.contentsHint")}</span>
        </div>
        <div className="flex flex-wrap gap-2">
          {CONTENT_KEYS.map((k) => {
            const v = draft.contents[k];
            return (
              <button key={k} type="button" onClick={() => cycle(k)}
                className={cn("h-10 rounded-full border px-4 text-sm font-medium",
                  v === true ? "border-primary bg-primary text-primary-foreground" : v === false ? "border-destructive bg-destructive/10 text-destructive" : "border-border text-muted-foreground hover:border-foreground")}>
                {v === false ? `${t("ec.missing")} ` : ""}{t(`ec.k.${k}`)}
              </button>
            );
          })}
        </div>
      </section>

      <section className="rounded-2xl border border-border bg-card p-5">
        <Field label={t("ec.notes")}><Textarea rows={3} value={draft.notes ?? ""} onChange={(e) => set("notes", e.target.value)} /></Field>
      </section>

      <div className="sticky bottom-4 z-10 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card/95 p-3 shadow-lg backdrop-blur">
        {!isNew ? (
          <Button variant="ghost" className="text-destructive" disabled={remove.isPending}
            onClick={() => { if (window.confirm(t("ec.confirmDelete", { code }))) remove.mutate(); }}>
            <Trash2 className="mr-2 h-4 w-4" />{t("ec.delete")}
          </Button>
        ) : <span className="text-xs text-muted-foreground">{!canSave ? t("ec.needCustomer") : ""}</span>}
        <div className="flex gap-2">
          <Button variant="outline" disabled={!canSave} onClick={() => save.mutate({ print: true })}>
            <Printer className="mr-2 h-4 w-4" />{t("ec.savePrint")}
          </Button>
          <Button disabled={!canSave} onClick={() => save.mutate({})}>{save.isPending ? "…" : t("ec.save")}</Button>
        </div>
      </div>
    </div>
  );
}
