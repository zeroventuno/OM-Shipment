import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from "react";
import { useParams } from "react-router-dom";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { CheckCircle2, Loader2, Plus, Search, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useDateLocale } from "@/i18n/dateLocale";
import { COUNTRIES, countryLabel } from "@/modules/shipments/data/countries";
import {
  formInfo, formCustomers, formCreateCustomer, formSubmit, formList, formBoxPresets, formCustomerAddresses, formAddAddress,
  boxSummary, totalWeight, formatAddress,
  type Box, type CustomerInput, type CustomerOption, type AddressInput,
} from "./api";

/*
 * Formulário público de pedido de envio, aberto pelo link /pedido/<token>.
 * Não exige login: quem tem o link vê só isto (novo pedido + pedidos feitos
 * com o mesmo link). O resto do sistema continua exigindo login.
 */

const NAME_KEY = "om-request-name";
const emptyBox = (): BoxDraft => ({ width: "", height: "", depth: "", weight: "" });
type BoxDraft = Record<keyof Box, string> & { presetId?: string };
const emptyCustomer: CustomerInput = { name: "", address_line1: "", city: "", country: "" };
const emptyAddress: AddressInput = { address_line1: "", city: "", country: "" };
const addressComplete = (a: AddressInput) => !!(a.address_line1.trim() && a.city.trim() && a.country);

function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="eyebrow">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}


type Country = { code: string; value: string; label: string };

/** Campos do cadastro de cliente (usados no pedido e na aba "Cadastrar cliente"). */
function CustomerFields({ value, onChange, countries }: {
  value: CustomerInput;
  onChange: (field: keyof CustomerInput, value: string) => void;
  countries: Country[];
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
        <Field label={`${t("Company / customer name")} *`}>
          <Input value={value.name} onChange={(e) => onChange("name", e.target.value)} />
        </Field>
        <Field label={`${t("Address line 1")} *`}>
          <Input value={value.address_line1} onChange={(e) => onChange("address_line1", e.target.value)} autoComplete="address-line1" />
        </Field>
        <div className="grid sm:grid-cols-2 gap-4">
          <Field label={t("Address line 2")}>
            <Input value={value.address_line2 ?? ""} onChange={(e) => onChange("address_line2", e.target.value)} autoComplete="address-line2" />
          </Field>
          <Field label={t("Address line 3")}>
            <Input value={value.address_line3 ?? ""} onChange={(e) => onChange("address_line3", e.target.value)} autoComplete="address-line3" />
          </Field>
        </div>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label={t("Postal code")}>
            <Input value={value.postal_code ?? ""} onChange={(e) => onChange("postal_code", e.target.value)} autoComplete="postal-code" />
          </Field>
          <Field label={`${t("City")} *`}>
            <Input value={value.city} onChange={(e) => onChange("city", e.target.value)} autoComplete="address-level2" />
          </Field>
          <Field label={t("Region")}>
            <Input value={value.region ?? ""} onChange={(e) => onChange("region", e.target.value)} autoComplete="address-level1" />
          </Field>
        </div>
        <Field label={`${t("Country")} *`}>
          <select
            value={value.country}
            onChange={(e) => onChange("country", e.target.value)}
            className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="">{t("Select...")}</option>
            {countries.map((c: { code: string; value: string; label: string }) => (
              <option key={c.code} value={c.value}>{c.label}</option>
            ))}
          </select>
        </Field>
        <div className="grid sm:grid-cols-3 gap-4">
          <Field label={t("Contact name")}>
            <Input value={value.contact_name ?? ""} onChange={(e) => onChange("contact_name", e.target.value)} />
          </Field>
          <Field label={t("Phone")}>
            <Input type="tel" value={value.phone ?? ""} onChange={(e) => onChange("phone", e.target.value)} autoComplete="tel" />
          </Field>
          <Field label={t("Email")}>
            <Input type="email" value={value.email ?? ""} onChange={(e) => onChange("email", e.target.value)} autoComplete="email" />
          </Field>
        </div>
        <Field label={t("Tax ID / VAT number")} hint={t("Fiscal code, partita IVA, VAT or EORI — used for customs and invoicing.")}>
          <Input value={value.tax_id ?? ""} onChange={(e) => onChange("tax_id", e.target.value)} />
        </Field>
    </div>
  );
}

/** Campos de um endereço de entrega. */
function AddressFields({ value, onChange, countries }: {
  value: AddressInput;
  onChange: (field: keyof AddressInput, value: string) => void;
  countries: Country[];
}) {
  const { t } = useTranslation();
  return (
    <div className="flex flex-col gap-4">
      <Field label={t("Address name (optional)")} hint={t("e.g. Warehouse, Milan shop")}>
        <Input value={value.label ?? ""} onChange={(e) => onChange("label", e.target.value)} />
      </Field>
      <Field label={`${t("Address line 1")} *`}>
        <Input value={value.address_line1} onChange={(e) => onChange("address_line1", e.target.value)} autoComplete="address-line1" />
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={t("Address line 2")}>
          <Input value={value.address_line2 ?? ""} onChange={(e) => onChange("address_line2", e.target.value)} autoComplete="address-line2" />
        </Field>
        <Field label={t("Address line 3")}>
          <Input value={value.address_line3 ?? ""} onChange={(e) => onChange("address_line3", e.target.value)} autoComplete="address-line3" />
        </Field>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
        <Field label={t("Postal code")}>
          <Input value={value.postal_code ?? ""} onChange={(e) => onChange("postal_code", e.target.value)} autoComplete="postal-code" />
        </Field>
        <Field label={`${t("City")} *`}>
          <Input value={value.city} onChange={(e) => onChange("city", e.target.value)} autoComplete="address-level2" />
        </Field>
        <Field label={t("Region")}>
          <Input value={value.region ?? ""} onChange={(e) => onChange("region", e.target.value)} autoComplete="address-level1" />
        </Field>
      </div>
      <Field label={`${t("Country")} *`}>
        <select
          value={value.country}
          onChange={(e) => onChange("country", e.target.value)}
          className="flex h-11 w-full rounded-md border border-input bg-card px-3 text-base sm:text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          <option value="">{t("Select...")}</option>
          {countries.map((c) => <option key={c.code} value={c.value}>{c.label}</option>)}
        </select>
      </Field>
      <div className="grid sm:grid-cols-2 gap-4">
        <Field label={t("Contact name")}>
          <Input value={value.contact_name ?? ""} onChange={(e) => onChange("contact_name", e.target.value)} />
        </Field>
        <Field label={t("Phone")}>
          <Input type="tel" value={value.phone ?? ""} onChange={(e) => onChange("phone", e.target.value)} autoComplete="tel" />
        </Field>
      </div>
    </div>
  );
}

export default function RequestFormPage() {
  const { token = "" } = useParams();
  const { t, i18n } = useTranslation();
  const locale = useDateLocale();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"new" | "customer" | "list">("new");

  const info = useQuery({ queryKey: ["request-form", token, "info"], queryFn: () => formInfo(token), retry: false });
  const customers = useQuery({ queryKey: ["request-form", token, "customers"], queryFn: () => formCustomers(token), enabled: info.isSuccess });
  const requests = useQuery({ queryKey: ["request-form", token, "list"], queryFn: () => formList(token), enabled: info.isSuccess });
  const presets = useQuery({ queryKey: ["request-form", token, "boxes"], queryFn: () => formBoxPresets(token), enabled: info.isSuccess });

  // --- formulário
  const [requestedBy, setRequestedBy] = useState(() => {
    try { return localStorage.getItem(NAME_KEY) ?? ""; } catch { return ""; }
  });
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<CustomerOption | null>(null);
  // Endereço de entrega escolhido: id de um endereço existente ou "new".
  const [addressChoice, setAddressChoice] = useState<string | null>(null);
  const [newAddress, setNewAddress] = useState<AddressInput>(emptyAddress);
  const [newCustomer, setNewCustomer] = useState<CustomerInput | null>(null);
  const [boxes, setBoxes] = useState<BoxDraft[]>([emptyBox()]);
  const [service, setService] = useState<"standard" | "express">("standard");
  const [orderRef, setOrderRef] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  // Aba "Cadastrar cliente"
  const [standalone, setStandalone] = useState<CustomerInput>(emptyCustomer);
  const [customerDone, setCustomerDone] = useState<{ name: string; existed: boolean } | null>(null);

  useEffect(() => {
    try { localStorage.setItem(NAME_KEY, requestedBy); } catch { /* sem localStorage */ }
  }, [requestedBy]);

  const addresses = useQuery({
    queryKey: ["request-form", token, "addresses", selected?.id],
    queryFn: () => formCustomerAddresses(token, selected!.id),
    enabled: !!selected,
  });

  // Ao escolher o cliente, já marca o endereço padrão (ou pede um novo se não houver).
  useEffect(() => {
    if (!selected || !addresses.data) return;
    if (addresses.data.length === 0) setAddressChoice("new");
    else setAddressChoice((c) => (c && (c === "new" || addresses.data!.some((a) => a.id === c)) ? c : (addresses.data!.find((a) => a.is_default) ?? addresses.data![0]).id));
  }, [selected, addresses.data]);

  const pickCustomer = (c: CustomerOption | null) => {
    setSelected(c);
    setAddressChoice(null);
    setNewAddress(emptyAddress);
  };

  const countries = useMemo(() => {
    const lang = i18n.language || "it";
    return COUNTRIES.map((c: { code: string; value: string }) => ({ ...c, label: countryLabel(c.code, lang) }))
      .sort((a: { label: string }, b: { label: string }) => a.label.localeCompare(b.label, lang));
  }, [i18n.language]);

  const matches = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return [];
    return (customers.data ?? []).filter((c) => c.name.toLowerCase().includes(term)).slice(0, 8);
  }, [search, customers.data]);

  const submit = useMutation({
    mutationFn: async () => {
      let customerId = selected?.id;
      let addressId: string | undefined;
      if (!customerId && newCustomer) {
        const created = await formCreateCustomer(token, newCustomer);
        customerId = created.id;
        addressId = created.address_id ?? undefined;
      }
      if (!customerId) throw new Error(t("Choose or register the customer"));
      if (selected) {
        addressId = addressChoice === "new"
          ? (await formAddAddress(token, selected.id, newAddress)).id
          : addressChoice ?? undefined;
      }
      return formSubmit(token, {
        customer_id: customerId,
        address_id: addressId,
        boxes: boxes.map((b) => ({
          width: Number(b.width), height: Number(b.height), depth: Number(b.depth), weight: Number(String(b.weight).replace(",", ".")),
        })),
        service_level: service,
        order_ref: orderRef || undefined,
        notes: notes || undefined,
        requested_by: requestedBy,
      });
    },
    onSuccess: () => {
      setSent(true);
      pickCustomer(null); setNewCustomer(null); setSearch("");
      setBoxes([emptyBox()]); setService("standard"); setOrderRef(""); setNotes("");
      queryClient.invalidateQueries({ queryKey: ["request-form", token] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const registerCustomer = useMutation({
    mutationFn: () => formCreateCustomer(token, standalone),
    onSuccess: (r) => {
      setCustomerDone({ name: r.name, existed: r.existed });
      setStandalone(emptyCustomer);
      queryClient.invalidateQueries({ queryKey: ["request-form", token, "customers"] });
    },
    onError: (e: Error) => setError(e.message),
  });

  const onRegisterCustomer = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!standalone.name.trim() || !standalone.address_line1.trim() || !standalone.city.trim() || !standalone.country) {
      return setError(t("Fill in the customer's name, address, city and country"));
    }
    registerCustomer.mutate();
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!requestedBy.trim()) return setError(t("Tell us your name"));
    if (!selected && !newCustomer) return setError(t("Choose or register the customer"));
    if (selected && addressChoice === "new" && !addressComplete(newAddress)) {
      return setError(t("Fill in the delivery address, city and country"));
    }
    if (selected && !addressChoice) return setError(t("Choose the delivery address"));
    if (newCustomer && (!newCustomer.name.trim() || !newCustomer.address_line1.trim() || !newCustomer.city.trim() || !newCustomer.country)) {
      return setError(t("Fill in the new customer's name, address, city and country"));
    }
    const invalid = boxes.some((b) => [b.width, b.height, b.depth, b.weight].some((v) => !(Number(String(v).replace(",", ".")) > 0)));
    if (invalid) return setError(t("Fill in the size and weight of every box"));
    submit.mutate();
  };

  const setCustomerField = (field: keyof CustomerInput, value: string) =>
    setNewCustomer((c) => ({ ...(c ?? emptyCustomer), [field]: value }));

  // --- telas de estado
  if (info.isLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-background"><Loader2 className="h-8 w-8 animate-spin" /></div>;
  }
  if (info.isError) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-background px-6 text-center">
        <img src="/logo.png" alt="Officine Mattio" className="h-7" />
        <p className="text-lg font-semibold">{t("This link is invalid or has been disabled.")}</p>
        <p className="text-sm text-muted-foreground">{t("Ask for a new link.")}</p>
      </div>
    );
  }

  const statusLabel = { pending: t("Waiting"), shipped: t("Shipped"), cancelled: t("Cancelled") };

  return (
    <div className="min-h-screen bg-background">
      <header className="bg-primary text-primary-foreground">
        <div className="max-w-3xl mx-auto px-4 md:px-8 py-5 flex items-center justify-between gap-4">
          <div className="flex flex-col gap-2">
            <img src="/logo.png" alt="Officine Mattio" className="h-6 w-auto invert self-start" />
            <span className="tricolor h-0.5 w-12" aria-hidden="true" />
          </div>
          <div className="flex gap-1.5" role="group" aria-label={t("Language")}>
            {(["it", "pt"] as const).map((lng) => (
              <button
                key={lng}
                type="button"
                onClick={() => i18n.changeLanguage(lng)}
                aria-pressed={i18n.language === lng}
                className={cn("h-9 w-12 rounded-full border text-[11px] font-semibold uppercase tracking-[0.12em]",
                  i18n.language === lng ? "bg-white text-primary border-white" : "border-white/30 text-white/70")}
              >
                {lng}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 md:px-8 py-8 flex flex-col gap-6">
        <div className="flex flex-col gap-1.5">
          <span className="eyebrow">{info.data?.name}</span>
          <h1 className="page-title">{t("Shipment request")}</h1>
        </div>

        <div role="tablist" className="grid grid-cols-3 p-1 rounded-full bg-secondary w-full sm:w-auto sm:self-start">
          {([
            ["new", t("New request"), t("tab.request")],
            ["customer", t("Register customer"), t("tab.customer")],
            ["list", `${t("Requests")} · ${requests.data?.length ?? 0}`, `${t("tab.list")} · ${requests.data?.length ?? 0}`],
          ] as const).map(([value, label, short]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => { setTab(value); setSent(false); setCustomerDone(null); setError(""); }}
              className={cn("h-10 px-2 sm:px-5 rounded-full text-[11px] font-semibold uppercase tracking-[0.08em] sm:tracking-[0.12em] whitespace-nowrap",
                tab === value ? "bg-card shadow-sm" : "text-foreground/70")}
            >
              <span className="sm:hidden">{short}</span>
              <span className="hidden sm:inline">{label}</span>
            </button>
          ))}
        </div>

        {tab === "new" && sent && (
          <div role="status" className="flex flex-col items-start gap-4 p-6 bg-card border border-border rounded-lg">
            <CheckCircle2 className="h-8 w-8" />
            <p className="text-lg font-semibold">{t("Request sent. Thank you!")}</p>
            <p className="text-sm text-muted-foreground">{t("You can follow it in the Requests tab.")}</p>
            <Button type="button" variant="outline" onClick={() => setSent(false)}>{t("New request")}</Button>
          </div>
        )}

        {tab === "new" && !sent && (
          <form onSubmit={onSubmit} className="flex flex-col gap-5" noValidate>
            <section className="bg-card border border-border rounded-lg p-5 md:p-6 flex flex-col gap-4">
              <Field label={t("Your name")}>
                <Input value={requestedBy} onChange={(e) => setRequestedBy(e.target.value)} autoComplete="name" />
              </Field>
            </section>

            <section className="bg-card border border-border rounded-lg p-5 md:p-6 flex flex-col gap-4">
              <h2 className="text-xs font-bold uppercase tracking-[0.12em]">{t("Customer")}</h2>

              {selected ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between gap-3 p-3 rounded-md bg-secondary">
                    <p className="font-semibold min-w-0 break-words">{selected.name}</p>
                    <button type="button" onClick={() => pickCustomer(null)} aria-label={t("Change customer")} className="h-10 w-10 shrink-0 rounded-full flex items-center justify-center hover:bg-card">
                      <X className="h-4 w-4" />
                    </button>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="eyebrow">{t("Delivery address")}</span>
                    {addresses.isLoading && <p className="text-sm text-muted-foreground">…</p>}
                    {addresses.data?.length === 0 && (
                      <p className="text-sm text-muted-foreground">{t("This customer has no delivery address yet: add it below.")}</p>
                    )}
                    <div role="radiogroup" aria-label={t("Delivery address")} className="flex flex-col gap-2">
                      {addresses.data?.map((a) => (
                        <button
                          key={a.id}
                          type="button"
                          role="radio"
                          aria-checked={addressChoice === a.id}
                          onClick={() => setAddressChoice(a.id)}
                          className={cn("text-left rounded-md border p-3 flex gap-3 items-start",
                            addressChoice === a.id ? "border-foreground bg-secondary" : "border-border hover:border-foreground")}
                        >
                          <span className={cn("mt-0.5 h-4 w-4 shrink-0 rounded-full border-2", addressChoice === a.id ? "border-foreground bg-foreground shadow-[inset_0_0_0_2px_white]" : "border-input")} aria-hidden="true" />
                          <span className="min-w-0">
                            {(a.label || a.is_default) && (
                              <span className="block text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                                {[a.label, a.is_default ? t("Default") : null].filter(Boolean).join(" · ")}
                              </span>
                            )}
                            <span className="block text-sm break-words">{formatAddress(a)}</span>
                            {a.contact_name && <span className="block text-xs text-muted-foreground">{a.contact_name}</span>}
                          </span>
                        </button>
                      ))}
                      {(addresses.data?.length ?? 0) > 0 && (
                        <button
                          type="button"
                          role="radio"
                          aria-checked={addressChoice === "new"}
                          onClick={() => setAddressChoice("new")}
                          className={cn("text-left rounded-md border border-dashed p-3 flex gap-3 items-center text-sm font-semibold",
                            addressChoice === "new" ? "border-foreground bg-secondary" : "border-input hover:border-foreground")}
                        >
                          <Plus className="h-4 w-4" aria-hidden="true" /> {t("New delivery address")}
                        </button>
                      )}
                    </div>
                    {addressChoice === "new" && (
                      <div className="pt-2">
                        <AddressFields
                          value={newAddress}
                          onChange={(field, value) => setNewAddress((a) => ({ ...a, [field]: value }))}
                          countries={countries}
                        />
                      </div>
                    )}
                  </div>
                </div>
              ) : newCustomer ? (
                <div className="flex flex-col gap-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold">{t("New customer")}</span>
                    <button type="button" onClick={() => setNewCustomer(null)} className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground hover:text-foreground">
                      {t("Cancel")}
                    </button>
                  </div>
                  <CustomerFields value={newCustomer} onChange={setCustomerField} countries={countries} />
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <label className="flex items-center gap-2 h-11 px-4 rounded-full bg-card border border-border focus-within:ring-2 focus-within:ring-ring">
                    <Search className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
                    <span className="sr-only">{t("Search customer")}</span>
                    <input
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      placeholder={t("Type the customer's name…")}
                      className="flex-1 min-w-0 bg-transparent text-base sm:text-sm outline-none"
                    />
                  </label>
                  {matches.length > 0 && (
                    <ul className="flex flex-col border border-border rounded-md divide-y divide-border overflow-hidden">
                      {matches.map((c) => (
                        <li key={c.id}>
                          <button type="button" onClick={() => pickCustomer(c)} className="w-full text-left px-4 py-3 hover:bg-secondary">
                            <span className="font-semibold">{c.name}</span>
                            <span className="text-sm text-muted-foreground"> · {[c.city, c.country].filter(Boolean).join(" · ") || "—"}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                  {search.trim() && matches.length === 0 && (
                    <p className="text-sm text-muted-foreground">{t("No customer with this name.")}</p>
                  )}
                  <Button
                    type="button"
                    variant="outline"
                    className="self-start"
                    onClick={() => setNewCustomer({ ...emptyCustomer, name: search.trim() })}
                  >
                    <Plus /> {t("Register new customer")}
                  </Button>
                </div>
              )}
            </section>

            <section className="bg-card border border-border rounded-lg p-5 md:p-6 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-bold uppercase tracking-[0.12em]">{t("Boxes")}</h2>
                <span className="text-sm text-muted-foreground">{t("Size in cm, weight in kg")}</span>
              </div>
              {boxes.map((b, i) => (
                <div key={i} className="flex flex-col gap-3 pb-4 border-b border-muted last:border-0 last:pb-0">
                {(presets.data?.length ?? 0) > 0 && (
                  <div className="flex flex-col gap-2">
                    <span className="eyebrow">{boxes.length > 1 ? `${t("Box")} ${i + 1} · ${t("Standard box")}` : t("Standard box")}</span>
                    <div role="radiogroup" aria-label={t("Standard box")} className="grid grid-cols-2 gap-2">
                      {presets.data?.map((p) => (
                        <button
                          key={p.id}
                          type="button"
                          role="radio"
                          aria-checked={b.presetId === p.id}
                          onClick={() => setBoxes((list) => list.map((x, j) => (j !== i ? x : {
                            presetId: p.id,
                            width: String(p.width), height: String(p.height), depth: String(p.depth),
                            weight: p.avg_weight != null ? String(p.avg_weight) : x.weight,
                          })))}
                          className={cn("text-left rounded-md border px-3 py-2.5 min-h-[60px]",
                            b.presetId === p.id ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-foreground")}
                        >
                          <span className="block text-sm font-semibold leading-tight">{p.name.replace(/^Scatola /i, "").replace(/^./, (ch) => ch.toUpperCase())}</span>
                          <span className={cn("block text-xs mt-1", b.presetId === p.id ? "text-white/75" : "text-muted-foreground")}>
                            {p.width}×{p.height}×{p.depth}{p.avg_weight != null ? ` · ${p.avg_weight} kg` : ""}
                          </span>
                        </button>
                      ))}
                      <button
                        type="button"
                        role="radio"
                        aria-checked={!b.presetId}
                        onClick={() => setBoxes((list) => list.map((x, j) => (j === i ? { ...x, presetId: undefined } : x)))}
                        className={cn("text-left rounded-md border border-dashed px-3 py-2.5 min-h-[60px] text-sm font-semibold",
                          !b.presetId ? "border-foreground bg-secondary" : "border-input hover:border-foreground")}
                      >
                        {t("Other size")}
                      </button>
                    </div>
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-3 items-end">
                  {(["width", "height", "depth", "weight"] as const).map((field) => (
                    <Field key={field} label={`${t(field === "width" ? "Width" : field === "height" ? "Height" : field === "depth" ? "Depth" : "Weight")}${field === "weight" ? " (kg)" : " (cm)"}`}>
                      <Input
                        inputMode="decimal"
                        value={b[field]}
                        onChange={(e) => setBoxes((list) => list.map((x, j) => (j === i ? { ...x, [field]: e.target.value, ...(field !== "weight" ? { presetId: undefined } : {}) } : x)))}
                      />
                    </Field>
                  ))}
                  {boxes.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setBoxes((list) => list.filter((_, j) => j !== i))}
                      aria-label={t("Remove box")}
                      className="h-11 w-11 rounded-full flex items-center justify-center text-muted-foreground hover:text-destructive hover:bg-secondary"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </div>
                </div>
              ))}
              <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setBoxes((l) => [...l, emptyBox()])} disabled={boxes.length >= 20}>
                <Plus /> {t("Add box")}
              </Button>
            </section>

            <section className="bg-card border border-border rounded-lg p-5 md:p-6 flex flex-col gap-4">
              <h2 className="text-xs font-bold uppercase tracking-[0.12em]">{t("Service")}</h2>
              <div role="radiogroup" aria-label={t("Service")} className="grid grid-cols-2 gap-2">
                {([["standard", t("Standard")], ["express", t("Express")]] as const).map(([value, label]) => (
                  <button
                    key={value}
                    type="button"
                    role="radio"
                    aria-checked={service === value}
                    onClick={() => setService(value)}
                    className={cn("h-12 rounded-full border text-[11px] font-semibold uppercase tracking-[0.1em]",
                      service === value ? "bg-primary text-primary-foreground border-primary" : "border-border hover:border-foreground")}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">{t("Express costs more: use it only when it is urgent.")}</p>
              <Field label={t("Order number (optional)")}>
                <Input value={orderRef} onChange={(e) => setOrderRef(e.target.value)} />
              </Field>
              <Field label={t("Notes (optional)")}>
                <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} className="min-h-[90px]" />
              </Field>
            </section>

            {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}

            <Button type="submit" size="lg" disabled={submit.isPending} className="self-stretch sm:self-start">
              {submit.isPending ? <Loader2 className="animate-spin" /> : null}
              {t("Send request")}
            </Button>
          </form>
        )}

        {tab === "customer" && customerDone && (
          <div role="status" className="flex flex-col items-start gap-4 p-6 bg-card border border-border rounded-lg">
            <CheckCircle2 className="h-8 w-8" />
            <p className="text-lg font-semibold">
              {customerDone.existed
                ? t("{{name}} was already registered.", { name: customerDone.name })
                : t("{{name}} registered. Thank you!", { name: customerDone.name })}
            </p>
            {customerDone.existed && <p className="text-sm text-muted-foreground">{t("If the address was missing, it was added now.")}</p>}
            <Button type="button" variant="outline" onClick={() => setCustomerDone(null)}>{t("Register another customer")}</Button>
          </div>
        )}

        {tab === "customer" && !customerDone && (
          <form onSubmit={onRegisterCustomer} className="flex flex-col gap-5" noValidate>
            <section className="bg-card border border-border rounded-lg p-5 md:p-6 flex flex-col gap-4">
              <h2 className="text-xs font-bold uppercase tracking-[0.12em]">{t("New customer")}</h2>
              <CustomerFields
                value={standalone}
                onChange={(field, value) => setStandalone((c) => ({ ...c, [field]: value }))}
                countries={countries}
              />
            </section>
            {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
            <Button type="submit" size="lg" disabled={registerCustomer.isPending} className="self-stretch sm:self-start">
              {registerCustomer.isPending ? <Loader2 className="animate-spin" /> : null}
              {t("Register customer")}
            </Button>
          </form>
        )}

        {tab === "list" && (
          <section className="flex flex-col gap-3">
            {requests.isLoading && <p className="text-muted-foreground">…</p>}
            {requests.data?.length === 0 && <p className="text-muted-foreground">{t("No requests in the last 60 days.")}</p>}
            {requests.data?.map((r) => (
              <article key={r.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-2">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold text-[17px] tracking-tight truncate">{r.customer}</p>
                    <p className="text-sm text-muted-foreground">
                      {format(new Date(r.created_at), "dd/MM/yyyy HH:mm", { locale })} · {r.requested_by}
                      {r.service_level === "express" && ` · ${t("Express")}`}
                    </p>
                  </div>
                  <span className={cn("shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.06em]",
                    r.status === "shipped" ? "bg-primary text-primary-foreground" : r.status === "cancelled" ? "bg-muted text-muted-foreground line-through" : "border border-foreground")}>
                    {statusLabel[r.status]}
                  </span>
                </div>
                <p className="text-sm">{r.boxes.map(boxSummary).join(" · ")} — {t("total")} {totalWeight(r.boxes)} kg</p>
                {r.status === "shipped" && (r.carrier || r.tracking_code) && (
                  <p className="text-sm font-semibold">{[r.carrier, r.tracking_code].filter(Boolean).join(" · ")}</p>
                )}
              </article>
            ))}
          </section>
        )}
      </main>
    </div>
  );
}
