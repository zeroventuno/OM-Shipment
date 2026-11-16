import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { Copy, Loader2, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useDateLocale } from "@/i18n/dateLocale";
import { cn } from "@/lib/utils";
import { countryLabel } from "@/modules/shipments/data/countries";
import { formatAddress, formatMoney, type AddressInput, type CustomerAddress } from "@/modules/requests/api";
import { BackLink, DetailCard } from "../common/Detail";
import { CustomerFields, AddressFields, Field, useCountries } from "./fields";
import {
  getCustomer, getActivity, updateCustomer, createCustomer, deleteCustomer, listAddresses, saveAddress, deleteAddress,
  CUSTOMERS_KEY, customerKey, type CustomerEdit, type CustomerRow,
} from "./api";
import { sourceLabel } from "./CustomersPage";

const emptyCustomer: CustomerEdit = { name: "", address_line1: "", city: "", country: "" };
const emptyAddress: AddressInput = { address_line1: "", city: "", country: "" };
const toEdit = (c: CustomerRow): CustomerEdit => ({
  name: c.name, address_line1: c.address_line1 ?? "", address_line2: c.address_line2 ?? "", address_line3: c.address_line3 ?? "",
  postal_code: c.postal_code ?? "", city: c.city ?? "", region: c.region ?? "", country: c.country ?? "",
  contact_name: c.contact_name ?? "", phone: c.phone ?? "", email: c.email ?? "", tax_id: c.tax_id ?? "", notes: c.notes ?? "",
});

/** /customers/new e /customers/:id — ficha do cliente. */
export default function CustomerDetailPage() {
  const { id = "new" } = useParams();
  const isNew = id === "new";
  const { t, i18n } = useTranslation();
  const locale = useDateLocale();
  const navigate = useNavigate();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const countries = useCountries();
  const lang = i18n.language || "it";

  const customer = useQuery({ queryKey: customerKey(id), queryFn: () => getCustomer(id), enabled: !isNew });
  const activity = useQuery({ queryKey: [...customerKey(id), "activity"], queryFn: () => getActivity(id), enabled: !isNew });
  const addresses = useQuery({ queryKey: [...customerKey(id), "addresses"], queryFn: () => listAddresses(id), enabled: !isNew });

  const [editing, setEditing] = useState(isNew);
  const [form, setForm] = useState<CustomerEdit>(emptyCustomer);
  const [error, setError] = useState("");
  const [addressDraft, setAddressDraft] = useState<(AddressInput & { id?: string; makeDefault?: boolean }) | null>(null);
  const [tab, setTab] = useState<"shipments" | "tickets" | "warranties" | "requests" | "orders">("shipments");

  useEffect(() => { if (customer.data && !editing) setForm(toEdit(customer.data)); }, [customer.data, editing]);

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: CUSTOMERS_KEY });
  };

  const save = useMutation({
    mutationFn: async () => {
      if (isNew) return createCustomer(form);
      await updateCustomer(id, form);
      return id;
    },
    onSuccess: (newId) => {
      refresh();
      setEditing(false);
      toast({ title: t("Saved") });
      if (isNew) navigate(`/customers/${newId}`, { replace: true });
    },
    onError: (e: Error) => setError(e.message === "DUPLICATE" ? t("A customer with this name already exists") : e.message),
  });

  const remove = useMutation({
    mutationFn: () => deleteCustomer(id),
    onSuccess: () => { refresh(); navigate("/customers", { replace: true }); },
    onError: (e: Error) => toast({ title: t("Error"), description: e.message, variant: "destructive" }),
  });

  const addressSave = useMutation({
    mutationFn: (a: AddressInput & { id?: string; makeDefault?: boolean }) => {
      const { makeDefault, ...fields } = a;
      return saveAddress(id, fields, !!makeDefault || (addresses.data?.length ?? 0) === 0);
    },
    onSuccess: () => { setAddressDraft(null); refresh(); },
    onError: (e: Error) => toast({ title: t("Error"), description: e.message, variant: "destructive" }),
  });
  const addressDelete = useMutation({
    mutationFn: deleteAddress,
    onSuccess: refresh,
    onError: (e: Error) => toast({ title: t("Error"), description: e.message, variant: "destructive" }),
  });

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!form.name.trim()) return setError(t("Fill in the customer name"));
    save.mutate();
  };

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); toast({ title: t("Copied") }); } catch { /* sem permissão */ }
  };

  if (!isNew && customer.isLoading) return <p className="py-16 text-center"><Loader2 className="inline h-6 w-6 animate-spin" /></p>;
  if (!isNew && customer.error) return <p className="py-16 text-center text-destructive">{(customer.error as Error).message}</p>;
  const c = customer.data;
  const act = activity.data;
  const used = c ? c.shipments + c.tickets + c.warranties + c.requests : 0;
  const dateOf = (d: string | null | undefined) => (d ? format(new Date(d), "dd/MM/yyyy", { locale }) : "—");

  return (
    <div className="flex flex-col gap-6">
      <BackLink to="/customers">{t("Customer register")}</BackLink>

      <header className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-1.5 min-w-0">
          <span className="eyebrow">{isNew ? t("New customer") : sourceLabel(c!.source, t)}</span>
          <h1 className="page-title break-words">{isNew ? t("New customer") : c!.name}</h1>
          {c && <p className="text-sm text-muted-foreground">{[c.city, c.country ? countryLabel(c.country, lang) : null].filter(Boolean).join(" · ")}</p>}
        </div>
        {!isNew && !editing && (
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setEditing(true)}><Pencil /> {t("Edit")}</Button>
            {used === 0 && (
              <Button variant="outline" onClick={() => window.confirm(t("Delete this customer? This cannot be undone.")) && remove.mutate()}>
                <Trash2 /> {t("Delete")}
              </Button>
            )}
          </div>
        )}
      </header>

      {c && (
        <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
          {([
            [t("Shipments"), String(c.shipments)],
            [t("Freight cost"), formatMoney(Number(c.freight_cost) || 0, lang)],
            [t("Assistance"), String(c.tickets)],
            [t("Warranties"), String(c.warranties)],
            [t("First / latest shipment"), c.first_shipment ? `${dateOf(c.first_shipment)} – ${dateOf(c.last_shipment)}` : "—"],
          ] as const).map(([label, v]) => (
            <div key={label} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-1 min-w-0">
              <span className="eyebrow">{label}</span>
              <span className="text-lg font-bold tabular-nums break-words">{v}</span>
            </div>
          ))}
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-start">
        {/* dados do cadastro */}
        {editing ? (
          <form onSubmit={onSubmit} className="flex flex-col gap-4 bg-card border border-border rounded-lg p-5 md:p-6" noValidate>
            <h2 className="text-xs font-bold uppercase tracking-[0.12em]">{t("Customer data")}</h2>
            <CustomerFields value={form} onChange={(f, v) => setForm((s) => ({ ...s, [f]: v }))} countries={countries} />
            <Field label={t("Internal notes")}>
              <Textarea value={form.notes ?? ""} onChange={(e) => setForm((s) => ({ ...s, notes: e.target.value }))} className="min-h-[80px]" />
            </Field>
            <p className="text-xs text-muted-foreground">{t("The address above is the main (billing) address. Delivery addresses are managed separately.")}</p>
            {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
            <div className="flex gap-2">
              <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" />}{t("Save")}</Button>
              <Button type="button" variant="outline" onClick={() => (isNew ? navigate("/customers") : (setEditing(false), setError("")))}>{t("Cancel")}</Button>
            </div>
          </form>
        ) : c && (
          <DetailCard title={t("Customer data")}>
            <dl className="flex flex-col text-sm">
              {([
                [t("Contact name"), c.contact_name],
                [t("Phone"), c.phone && <a href={`tel:${c.phone}`} className="underline underline-offset-2">{c.phone}</a>],
                [t("Email"), c.email && <a href={`mailto:${c.email}`} className="underline underline-offset-2 break-all">{c.email}</a>],
                [t("Tax ID"), c.tax_id],
                [t("Main address (billing)"), formatAddress(c)],
                [t("Internal notes"), c.notes && <span className="whitespace-pre-line">{c.notes}</span>],
                [t("Registered on"), dateOf(c.created_at)],
              ] as const).map(([label, value]) => (
                <div key={label} className="flex justify-between gap-4 py-2.5 border-b border-muted last:border-0">
                  <dt className="text-muted-foreground shrink-0">{label}</dt>
                  <dd className="font-semibold text-right break-words min-w-0">{value || "—"}</dd>
                </div>
              ))}
            </dl>
          </DetailCard>
        )}

        {/* endereços de entrega */}
        {!isNew && (
          <DetailCard
            title={`${t("Delivery addresses")} · ${addresses.data?.length ?? 0}`}
            action={<Button size="sm" variant="outline" onClick={() => setAddressDraft({ ...emptyAddress })}><Plus /> {t("Add")}</Button>}
          >
            {addresses.isLoading && <Loader2 className="h-5 w-5 animate-spin" />}
            {addresses.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("No address registered")}</p>}
            {addresses.data?.map((a: CustomerAddress) => {
              const text = formatAddress(a);
              return (
                <div key={a.id} className={cn("flex items-start gap-2 p-3 rounded-md border text-sm", a.is_default ? "border-foreground" : "border-border")}>
                  <div className="flex-1 min-w-0">
                    {(a.label || a.is_default) && (
                      <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                        {[a.label, a.is_default ? t("Default") : null].filter(Boolean).join(" · ")}
                      </p>
                    )}
                    <p className="break-words">{text}</p>
                    {(a.contact_name || a.phone) && <p className="text-muted-foreground">{[a.contact_name, a.phone].filter(Boolean).join(" · ")}</p>}
                  </div>
                  <div className="flex shrink-0">
                    <IconBtn label={t("Copy address")} onClick={() => copy(text)}><Copy /></IconBtn>
                    {!a.is_default && (
                      <IconBtn label={t("Make default")} onClick={() => addressSave.mutate({ ...stripAddress(a), makeDefault: true })}><Star /></IconBtn>
                    )}
                    <IconBtn label={t("Edit")} onClick={() => setAddressDraft({ ...stripAddress(a) })}><Pencil /></IconBtn>
                    <IconBtn label={t("Delete")} onClick={() => window.confirm(t("Delete this address?")) && addressDelete.mutate(a.id)}><Trash2 /></IconBtn>
                  </div>
                </div>
              );
            })}
          </DetailCard>
        )}
      </div>

      {/* histórico */}
      {!isNew && (
        <section className="flex flex-col gap-4">
          <div className="flex gap-1 p-1 rounded-full bg-secondary overflow-x-auto" role="tablist">
            {([
              ["shipments", t("Shipments"), act?.shipments.length],
              ["tickets", t("Assistance"), act?.tickets.length],
              ["warranties", t("Warranties"), act?.warranties.length],
              ["requests", t("Requests"), act?.requests.length],
              ["orders", t("Sales orders"), undefined],
            ] as const).map(([key, label, n]) => (
              <button
                key={key}
                type="button"
                role="tab"
                aria-selected={tab === key}
                onClick={() => setTab(key)}
                className={cn("shrink-0 h-10 px-4 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] whitespace-nowrap",
                  tab === key ? "bg-card shadow-sm" : "text-muted-foreground hover:text-foreground")}
              >
                {label}{n != null ? ` · ${n}` : ""}
              </button>
            ))}
          </div>

          {activity.isLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : act && (
            <div className="bg-card border border-border rounded-lg divide-y divide-muted">
              {tab === "shipments" && (act.shipments.length === 0 ? <Empty /> : act.shipments.map((s) => (
                <Row key={s.id} to={`/shipments/${s.id}`}
                  title={`${s.order_id || "—"} · ${s.order_type ?? ""}`}
                  sub={[dateOf(s.created_at), s.destination_country ? countryLabel(s.destination_country, lang) : null, [s.portal, s.carrier].filter(Boolean).join(" / "), s.tracking_code].filter(Boolean).join(" · ")}
                  right={s.cost != null ? formatMoney(Number(s.cost), lang) : undefined}
                  badge={t(s.status)} />
              )))}
              {tab === "tickets" && (act.tickets.length === 0 ? <Empty /> : act.tickets.map((x) => (
                <Row key={x.id} to={`/assistance/${x.id}`}
                  title={[x.component, x.brand].filter(Boolean).join(" · ") || "—"}
                  sub={[dateOf(x.created_at), x.approval_status].filter(Boolean).join(" · ")}
                  badge={t(x.phase)} />
              )))}
              {tab === "warranties" && (act.warranties.length === 0 ? <Empty /> : act.warranties.map((w) => (
                <Row key={w.id} to={`/warranties/${w.id}`}
                  title={`${w.protocol_number ?? "—"} · ${[w.bike_model, w.size].filter(Boolean).join(" ")}`}
                  sub={[dateOf(w.created_at), w.process_type, w.solution ? t(w.solution) : null, w.order_number].filter(Boolean).join(" · ")}
                  right={w.value ? `€ ${w.value}` : undefined}
                  badge={w.status ? t(w.status) : undefined} />
              )))}
              {tab === "requests" && (act.requests.length === 0 ? <Empty /> : act.requests.map((r) => (
                <Row key={r.id} to={r.shipment_id ? `/shipments/${r.shipment_id}` : "/shipments/requests"}
                  title={`${dateOf(r.created_at)} · ${r.requested_by}`}
                  sub={[r.service_level === "express" ? t("Express") : t("Standard"), r.invoice_value != null ? `${t("Invoiced")} ${formatMoney(r.invoice_value, lang)}` : null].filter(Boolean).join(" · ")}
                  badge={t(r.status === "pending" ? "Waiting" : r.status === "shipped" ? "Shipped" : "Cancelled")} />
              )))}
              {tab === "orders" && (
                <p className="p-5 text-sm text-muted-foreground">{t("Sales orders will appear here once the integration with the sales system is active.")}</p>
              )}
            </div>
          )}
          {act && (tab === "tickets" || tab === "warranties") && (
            <p className="text-xs text-muted-foreground">{t("Assistance and warranties are matched by customer name: cases typed with a different name do not appear here.")}</p>
          )}
        </section>
      )}

      <Dialog open={!!addressDraft} onOpenChange={(o) => !o && setAddressDraft(null)}>
        <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{addressDraft?.id ? t("Edit address") : t("New delivery address")}</DialogTitle>
            <DialogDescription className="sr-only">{t("Delivery addresses")}</DialogDescription>
          </DialogHeader>
          {addressDraft && (
            <form
              className="flex flex-col gap-4"
              noValidate
              onSubmit={(e) => {
                e.preventDefault();
                if (!addressDraft.address_line1.trim() || !addressDraft.city.trim() || !addressDraft.country) {
                  toast({ title: t("Fill in the delivery address, city and country"), variant: "destructive" });
                  return;
                }
                addressSave.mutate(addressDraft);
              }}
            >
              <AddressFields value={addressDraft} onChange={(f, v) => setAddressDraft((s) => s && { ...s, [f]: v })} countries={countries} />
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={!!addressDraft.makeDefault} onChange={(e) => setAddressDraft((s) => s && { ...s, makeDefault: e.target.checked })} />
                {t("Default delivery address")}
              </label>
              <div className="flex gap-2">
                <Button type="submit" disabled={addressSave.isPending}>{addressSave.isPending && <Loader2 className="animate-spin" />}{t("Save")}</Button>
                <Button type="button" variant="outline" onClick={() => setAddressDraft(null)}>{t("Cancel")}</Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

const stripAddress = (a: CustomerAddress): AddressInput & { id: string } => ({
  id: a.id, label: a.label ?? "", address_line1: a.address_line1, address_line2: a.address_line2 ?? "", address_line3: a.address_line3 ?? "",
  postal_code: a.postal_code ?? "", city: a.city, region: a.region ?? "", country: a.country, contact_name: a.contact_name ?? "", phone: a.phone ?? "",
});

function IconBtn({ label, onClick, children }: { label: string; onClick: () => void; children: React.ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label}
      className="h-8 w-8 rounded-full flex items-center justify-center hover:bg-secondary [&_svg]:h-3.5 [&_svg]:w-3.5">
      {children}
    </button>
  );
}

function Row({ to, title, sub, right, badge }: { to: string; title: string; sub?: string; right?: string; badge?: string }) {
  return (
    <Link to={to} className="flex items-start justify-between gap-3 p-4 hover:bg-secondary/60">
      <div className="min-w-0">
        <p className="font-semibold break-words">{title}</p>
        {sub && <p className="text-sm text-muted-foreground break-words">{sub}</p>}
      </div>
      <div className="shrink-0 flex flex-col items-end gap-1 text-sm">
        {badge && <span className="px-2.5 py-0.5 rounded-full border border-foreground text-[11px] font-semibold uppercase tracking-[0.06em]">{badge}</span>}
        {right && <span className="tabular-nums">{right}</span>}
      </div>
    </Link>
  );
}

function Empty() {
  const { t } = useTranslation();
  return <p className="p-5 text-sm text-muted-foreground">{t("Nothing here")}</p>;
}
