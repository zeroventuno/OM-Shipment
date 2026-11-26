import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Field } from "@/modules/customers/fields";
import { WARRANTIES_QUERY_KEY, createWarranty } from "@/modules/warranties/api";
import { TICKETS_QUERY_KEY, createTicket } from "@/modules/assistance/api";
import type { InsertTicket, InsertWarranty, Ticket, Warranty } from "@/modules/schema";

/*
 * Garantia e assistência rápidas: só o básico, num modal por cima de tudo.
 * O resto se completa depois, com calma, na área de Garanzie ou Assistenza.
 * O código (OMW / OMA) vem do banco.
 */

type Fields = Record<string, string>;

function QuickForm({ open, onClose, title, hint, fields, initial, required, onCreate }: {
  open: boolean;
  onClose: () => void;
  title: string;
  hint: string;
  fields: { key: string; label: string; area?: boolean; type?: string; half?: boolean }[];
  initial: Fields;
  required: string[];
  onCreate: (v: Fields) => Promise<void>;
}) {
  const { t } = useTranslation();
  const [v, setV] = useState<Fields>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (open) { setV(initial); setError(""); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const missing = required.filter((k) => !(v[k] ?? "").trim());
  const submit = async () => {
    if (missing.length) return setError(t("qk.missing"));
    setBusy(true);
    setError("");
    try { await onCreate(v); onClose(); } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{hint}</DialogDescription>
        </DialogHeader>
        <form className="grid grid-cols-2 gap-4" onSubmit={(e) => { e.preventDefault(); submit(); }}>
          {fields.map((f) => (
            <div key={f.key} className={f.half ? "col-span-2 sm:col-span-1" : "col-span-2"}>
              <Field label={`${f.label}${required.includes(f.key) ? " *" : ""}`}>
                {f.area ? (
                  <Textarea rows={3} value={v[f.key] ?? ""} onChange={(e) => setV((s) => ({ ...s, [f.key]: e.target.value }))} />
                ) : (
                  <Input type={f.type ?? "text"} value={v[f.key] ?? ""} onChange={(e) => setV((s) => ({ ...s, [f.key]: e.target.value }))} />
                )}
              </Field>
            </div>
          ))}
          {error && <p role="alert" className="col-span-2 text-sm font-semibold text-destructive">{error}</p>}
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("Cancel")}</Button>
            <Button type="submit" disabled={busy}>{busy && <Loader2 className="animate-spin" />}{t("qk.create")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

export type WarrantyPrefill = Partial<Pick<InsertWarranty, "customerName" | "email" | "agent" | "serialNumber" | "bikeModel" | "size" | "problem">>;

export function QuickWarrantyDialog({ open, onClose, prefill, onCreated }: {
  open: boolean; onClose: () => void; prefill?: WarrantyPrefill; onCreated?: (w: Warranty) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return (
    <QuickForm
      open={open} onClose={onClose}
      title={t("qk.warrantyNew")} hint={t("qk.warrantyHint")}
      initial={{ customerName: "", email: "", agent: "", serialNumber: "", bikeModel: "", size: "", problem: "", ...prefill } as Fields}
      required={["customerName", "bikeModel", "problem"]}
      fields={[
        { key: "customerName", label: t("Customer") },
        { key: "email", label: t("Email"), type: "email", half: true },
        { key: "agent", label: t("ec.agent"), half: true },
        { key: "bikeModel", label: t("ec.model"), half: true },
        { key: "size", label: t("ec.size"), half: true },
        { key: "serialNumber", label: t("ec.serial") },
        { key: "problem", label: t("qk.problem"), area: true },
      ]}
      onCreate={async (v) => {
        const w = await createWarranty({
          customerName: v.customerName.trim(), email: v.email.trim(), agent: v.agent.trim(), serialNumber: v.serialNumber.trim(),
          bikeModel: v.bikeModel.trim(), size: v.size.trim(), problem: v.problem.trim(), processType: "Garantia",
        } as InsertWarranty);
        await queryClient.invalidateQueries({ queryKey: WARRANTIES_QUERY_KEY });
        onCreated?.(w);
      }}
    />
  );
}

export type TicketPrefill = Partial<Pick<InsertTicket, "clientName" | "clientEmail" | "agent" | "brand" | "component" | "serialNumber" | "problem">>;

export function QuickTicketDialog({ open, onClose, prefill, onCreated }: {
  open: boolean; onClose: () => void; prefill?: TicketPrefill; onCreated?: (tk: Ticket) => void;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  return (
    <QuickForm
      open={open} onClose={onClose}
      title={t("qk.ticketNew")} hint={t("qk.ticketHint")}
      initial={{ clientName: "", clientEmail: "", agent: "", brand: "", component: "", serialNumber: "", problem: "", ...prefill } as Fields}
      required={["clientName", "brand", "component"]}
      fields={[
        { key: "clientName", label: t("Customer") },
        { key: "clientEmail", label: t("Email"), type: "email", half: true },
        { key: "agent", label: t("ec.agent"), half: true },
        { key: "brand", label: t("qk.brand"), half: true },
        { key: "component", label: t("qk.component"), half: true },
        { key: "serialNumber", label: t("ec.serial") },
        { key: "problem", label: t("qk.problem"), area: true },
      ]}
      onCreate={async (v) => {
        const tk = await createTicket({
          clientName: v.clientName.trim(), clientEmail: v.clientEmail.trim(), agent: v.agent.trim(), brand: v.brand.trim(), component: v.component.trim(),
          serialNumber: v.serialNumber.trim(), problem: v.problem.trim(), phase: "Ingresso",
        } as InsertTicket);
        await queryClient.invalidateQueries({ queryKey: TICKETS_QUERY_KEY });
        onCreated?.(tk);
      }}
    />
  );
}
