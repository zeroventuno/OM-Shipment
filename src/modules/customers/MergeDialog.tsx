import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { GitMerge, Loader2 } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { countryLabel } from "@/modules/shipments/data/countries";
import { CUSTOMERS_KEY, DISMISSALS_KEY, mergeCustomers, type CustomerRow } from "./api";
import { customerWeight } from "./duplicates.js";

/** Une os clientes marcados na lista: escolhe qual cadastro fica e confirma. */
export default function MergeDialog({ customers, onClose, onMerged }: { customers: CustomerRow[]; onClose: () => void; onMerged: () => void }) {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const lang = i18n.language || "it";
  const [ordered] = useState(() => [...customers].sort((a, b) => customerWeight(b) - customerWeight(a) || a.name.localeCompare(b.name, lang)));
  const [mainId, setMainId] = useState(ordered[0].id);
  const main = ordered.find((c) => c.id === mainId)!;

  const merge = useMutation({
    mutationFn: () => mergeCustomers(mainId, ordered.filter((c) => c.id !== mainId).map((c) => c.id)),
    onSuccess: (r) => {
      queryClient.invalidateQueries({ queryKey: CUSTOMERS_KEY });
      queryClient.invalidateQueries({ queryKey: DISMISSALS_KEY });
      toast({ title: t("dup.merged", { main: main.name }), description: t("dup.mergedDetail", { addresses: r.addresses_moved, dups: r.addresses_duplicate }) });
      onMerged();
    },
    onError: (e) => toast({ title: t("Error"), description: (e as Error).message, variant: "destructive" }),
  });

  return (
    <Dialog open onOpenChange={(o) => !o && !merge.isPending && onClose()}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight">{t("dup.mergeTitle")}</DialogTitle>
          <DialogDescription>{t("dup.mergeIntro")}</DialogDescription>
        </DialogHeader>

        <div role="radiogroup" aria-label={t("dup.main")} className="flex flex-col gap-2">
          {ordered.map((c) => (
            <label key={c.id} className={cn("flex items-start gap-3 rounded-lg border p-3 cursor-pointer", c.id === mainId ? "border-foreground bg-secondary/50" : "border-border")}>
              <input type="radio" name="merge-main" className="mt-1 accent-primary" checked={c.id === mainId} onChange={() => setMainId(c.id)} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold break-words">{c.name}</span>
                  {c.id === mainId && <span className="rounded-full bg-foreground text-background px-2 py-0.5 text-[11px] font-semibold">{t("dup.main")}</span>}
                </span>
                <span className="block text-sm text-muted-foreground">{[c.city, c.country ? countryLabel(c.country, lang) : null].filter(Boolean).join(" · ") || "—"}</span>
                <span className="block text-[12px] text-muted-foreground tabular-nums">{t("dup.history", { s: c.shipments, a: c.tickets + c.warranties, r: c.addresses })}</span>
              </span>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-2">
          <Button variant="outline" disabled={merge.isPending} onClick={onClose}>{t("Cancel")}</Button>
          <Button disabled={merge.isPending} onClick={() => merge.mutate()}>
            {merge.isPending ? <Loader2 className="animate-spin" /> : <GitMerge />} {t("dup.merge", { n: ordered.length })}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
