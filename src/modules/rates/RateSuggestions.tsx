import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Calculator, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { formatMoney, type Box } from "@/modules/requests/api";
import { countryCode } from "@/modules/shipments/data/countries";
import { quoteCard, type Parcel } from "./calc";
import { RATES_KEY, listRateCards } from "./api";

/*
 * No Nuovo envio: com o país e os colos já preenchidos, mostra quem sai mais
 * barato pelos listini guardados (a mesma conta da tela Listini corrieri).
 * É uma estimativa antes de pedir os orçamentos nos portais: sem carburante.
 */

const SHOW = 5;

export function RateSuggestions({ country, boxes, pickup = false }: { country: string; boxes: Box[] | null; pickup?: boolean }) {
  const { t, i18n } = useTranslation();
  const cards = useQuery({ queryKey: RATES_KEY, queryFn: listRateCards, staleTime: 10 * 60_000 });
  const iso = country ? countryCode(country) ?? (country.length === 2 ? country.toUpperCase() : null) : null;
  const parcels: Parcel[] = useMemo(() => (boxes ?? [])
    .map((b) => ({ weight: Number(b.weight) || 0, length: Number(b.depth) || 0, width: Number(b.width) || 0, height: Number(b.height) || 0 }))
    .filter((p) => p.weight > 0 || (p.length && p.width && p.height)), [boxes]);

  const results = useMemo(() => {
    if (!iso || !parcels.length) return [];
    // ritiro: a mercadoria vem para a OM, então vale a tabela de import
    const direction = pickup ? "import" : "export";
    return (cards.data ?? []).filter((c) => c.tariff && c.status !== "archived")
      .flatMap((c) => quoteCard(c.tariff!, iso, direction, parcels).map((q) => ({ ...q, card: c })))
      .sort((a, b) => a.price - b.price);
  }, [cards.data, iso, parcels, pickup]);

  const hint = !iso ? t("rt.sug.needCountry") : !parcels.length ? t("rt.sug.needBoxes") : null;

  return (
    <section className="rounded-lg border border-border bg-card p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <h3 className="flex items-center gap-2 text-xs font-bold uppercase tracking-[0.12em]"><Calculator className="h-4 w-4" />{t("rt.sug.title")}</h3>
        <Link to="/shipments/rates" className="text-xs font-semibold underline underline-offset-4">{t("rt.sug.all")}</Link>
      </div>
      {cards.isLoading ? <div className="flex justify-center py-4"><Loader2 className="h-5 w-5 animate-spin" /></div>
        : hint ? <p className="text-sm text-muted-foreground">{hint}</p>
        : results.length === 0 ? <p className="text-sm text-muted-foreground">{t("rt.noResults")}</p> : (
          <ul className="flex flex-col divide-y divide-border">
            {results.slice(0, SHOW).map((q, i) => (
              <li key={`${q.card.id}-${q.service}-${i}`} className={cn("flex items-baseline justify-between gap-3 py-2 text-sm", i === 0 && "font-semibold")}>
                <span className="min-w-0">
                  <span className="block truncate">{q.card.carrier} · {q.serviceName}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {q.preset ? t("rt.estimate", { preset: q.preset }) : `${String(q.chargeable).replace(".", ",")} kg`}
                    {q.card.status === "evaluation" && ` · ${t("rt.st.evaluation")}`}
                  </span>
                </span>
                <span className="shrink-0 tabular-nums">{formatMoney(q.price, i18n.language)}</span>
              </li>
            ))}
          </ul>
        )}
      <p className="mt-3 text-xs text-muted-foreground">{t("rt.sug.note")}</p>
    </section>
  );
}
