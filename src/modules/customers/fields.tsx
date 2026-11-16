import { useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Input } from "@/components/ui/input";
import { COUNTRIES, countryLabel } from "@/modules/shipments/data/countries";
import type { CustomerInput, AddressInput } from "@/modules/requests/api";

/*
 * Campos de cadastro de cliente e de endereço de entrega, usados no
 * formulário aberto de pedidos e na área Clienti.
 */

/** Países no idioma da tela, em ordem alfabética. */
export function useCountries(): Country[] {
  const { i18n } = useTranslation();
  return useMemo(() => {
    const lang = i18n.language || "it";
    return COUNTRIES.map((c: { code: string; value: string }) => ({ ...c, label: countryLabel(c.code, lang) }))
      .sort((a: Country, b: Country) => a.label.localeCompare(b.label, lang));
  }, [i18n.language]);
}

export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) {
  return (
    <label className="flex flex-col gap-1.5 min-w-0">
      <span className="eyebrow">{label}</span>
      {children}
      {hint && <span className="text-xs text-muted-foreground">{hint}</span>}
    </label>
  );
}


export type Country = { code: string; value: string; label: string };

/** Campos do cadastro de cliente (usados no pedido e na aba "Cadastrar cliente"). */
export function CustomerFields({ value, onChange, countries }: {
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
export function AddressFields({ value, onChange, countries }: {
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
