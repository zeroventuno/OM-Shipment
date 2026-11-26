import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { AddressInput, CustomerInput } from "@/modules/requests/api";
import { AddressFields, CustomerFields, useCountries } from "@/modules/customers/fields";
import { CUSTOMERS_KEY, createCustomer, listAddresses, saveAddress, updateCustomer } from "@/modules/customers/api";
import { cn } from "@/lib/utils";
import { sameAddress } from "./address";

export type QuickCustomer = { id: string; name: string; country: string };

const emptyCustomer: CustomerInput = { name: "", address_line1: "", city: "", country: "" };
const emptyAddress: AddressInput = { address_line1: "", city: "", country: "" };

/**
 * Cliente novo (ou o endereço de faturamento de um cliente que já existe),
 * num modal por cima de tudo. O endereço do cadastro é o de FATURAMENTO; no
 * fim pergunta se a mercadoria vai para lá: se sim, vira também endereço de
 * envio; se não, cadastra o endereço de envio certo.
 *
 * customerId: atualiza esse cliente em vez de criar um.
 */
export function QuickCustomerDialog({ open, onClose, initial, customerId, onSaved }: {
  open: boolean;
  onClose: () => void;
  initial?: Partial<CustomerInput>;
  customerId?: string | null;
  onSaved?: (c: QuickCustomer) => void;
}) {
  const { t } = useTranslation();
  const countries = useCountries();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CustomerInput>(emptyCustomer);
  const [ship, setShip] = useState<"same" | "other" | "keep">("same");
  const [shipAddr, setShipAddr] = useState<AddressInput>(emptyAddress);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) return;
    setForm({ ...emptyCustomer, ...initial, name: initial?.name ?? "" } as CustomerInput);
    setShip(customerId ? "keep" : "same");
    setShipAddr({ ...emptyAddress, country: initial?.country ?? "" });
    setError("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const save = async () => {
    setError("");
    if (!form.name.trim()) return setError(t("qk.needName"));
    const hasBilling = form.address_line1.trim() && form.city.trim() && form.country;
    if (ship === "same" && !hasBilling) return setError(t("qk.needBilling"));
    if (ship === "other" && (!shipAddr.address_line1.trim() || !shipAddr.city.trim() || !shipAddr.country)) return setError(t("qk.needShipping"));
    setBusy(true);
    try {
      let id = customerId ?? null;
      if (id) await updateCustomer(id, form);
      else id = await createCustomer(form);
      const current = await listAddresses(id);
      const add = async (a: AddressInput) => {
        if (current.some((x) => sameAddress(x, a))) return;
        await saveAddress(id!, a, current.length === 0);
      };
      if (ship === "same") {
        await add({ address_line1: form.address_line1, address_line2: form.address_line2, address_line3: form.address_line3, postal_code: form.postal_code,
          city: form.city, region: form.region, country: form.country, contact_name: form.contact_name, phone: form.phone });
      } else if (ship === "other") {
        await add(shipAddr);
      }
      queryClient.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      onSaved?.({ id, name: form.name.trim(), country: form.country });
      onClose();
    } catch (e) {
      setError((e as Error).message === "DUPLICATE" ? t("A customer with this name already exists") : (e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const choice = (value: typeof ship, label: string) => (
    <button type="button" onClick={() => setShip(value)} aria-pressed={ship === value}
      className={cn("rounded-full border px-4 py-2 text-sm font-medium", ship === value ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-foreground")}>
      {label}
    </button>
  );

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>{customerId ? t("qk.customerUpdate") : t("qk.customerNew")}</DialogTitle>
          <DialogDescription>{t("qk.customerHint")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-2">
            <span className="eyebrow">{t("qk.billing")}</span>
            <CustomerFields value={form} onChange={(f, v) => setForm((s) => ({ ...s, [f]: v }))} countries={countries} />
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-border p-4">
            <span className="eyebrow">{t("qk.shipQuestion")}</span>
            <div className="flex flex-wrap gap-2">
              {choice("same", t("qk.shipSame"))}
              {choice("other", t("qk.shipOther"))}
              {customerId && choice("keep", t("qk.shipKeep"))}
            </div>
            {ship === "other" && (
              <AddressFields value={shipAddr} onChange={(f, v) => setShipAddr((s) => ({ ...s, [f]: v }))} countries={countries} />
            )}
          </div>
          {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("Cancel")}</Button>
            <Button type="button" onClick={save} disabled={busy}>{busy && <Loader2 className="animate-spin" />}{t("Save")}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
