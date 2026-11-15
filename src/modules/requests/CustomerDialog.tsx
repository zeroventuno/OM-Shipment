import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Copy } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { FactList } from "../common/Detail";
import { listCustomerAddresses, formatAddress, type Customer } from "./api";

/** Ficha do cliente: dados, endereço principal e todos os endereços de entrega. */
export default function CustomerDialog({ customer, onClose }: { customer: Customer | null; onClose: () => void }) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const addresses = useQuery({
    queryKey: ["customer-addresses", customer?.id],
    queryFn: () => listCustomerAddresses(customer!.id),
    enabled: !!customer,
  });

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: t("Copied") });
    } catch {
      // sem permissão de área de transferência
    }
  };

  const main = customer ? formatAddress(customer) : "";

  return (
    <Dialog open={!!customer} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        {customer && (
          <>
            <DialogHeader>
              <DialogTitle className="text-2xl font-bold tracking-tight break-words">{customer.name}</DialogTitle>
              <DialogDescription className="sr-only">{t("Customer details")}</DialogDescription>
            </DialogHeader>

            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em]">{t("Contacts")}</h3>
              <FactList
                facts={[
                  { label: t("Contact name"), value: customer.contact_name },
                  { label: t("Phone"), value: customer.phone && <a href={`tel:${customer.phone}`} className="underline underline-offset-2">{customer.phone}</a> },
                  { label: t("Email"), value: customer.email && <a href={`mailto:${customer.email}`} className="underline underline-offset-2">{customer.email}</a> },
                  { label: t("Tax ID"), value: customer.tax_id },
                ]}
              />
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em]">{t("Main address (billing)")}</h3>
              {main ? (
                <div className="flex items-start gap-2 text-sm">
                  <p className="flex-1 whitespace-pre-line">{main}</p>
                  <button type="button" onClick={() => copy(main)} aria-label={t("Copy address")} className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center hover:bg-secondary">
                    <Copy className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">{t("No address registered")}</p>
              )}
            </section>

            <section className="flex flex-col gap-2">
              <h3 className="text-xs font-bold uppercase tracking-[0.12em]">
                {t("Delivery addresses")} · {addresses.data?.length ?? 0}
              </h3>
              {addresses.isLoading && <p className="text-sm text-muted-foreground">…</p>}
              {addresses.data?.length === 0 && <p className="text-sm text-muted-foreground">{t("No address registered")}</p>}
              {addresses.data?.map((a) => {
                const text = formatAddress(a);
                return (
                  <div key={a.id} className="flex items-start gap-2 p-3 rounded-md border border-border text-sm">
                    <div className="flex-1 min-w-0">
                      {(a.label || a.is_default) && (
                        <p className="text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                          {[a.label, a.is_default ? t("Default") : null].filter(Boolean).join(" · ")}
                        </p>
                      )}
                      <p className="break-words">{text}</p>
                      {(a.contact_name || a.phone) && (
                        <p className="text-muted-foreground">{[a.contact_name, a.phone].filter(Boolean).join(" · ")}</p>
                      )}
                    </div>
                    <button type="button" onClick={() => copy(text)} aria-label={t("Copy address")} className="h-8 w-8 shrink-0 rounded-full flex items-center justify-center hover:bg-secondary">
                      <Copy className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
            </section>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
