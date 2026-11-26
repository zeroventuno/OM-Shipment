import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { format } from "date-fns";
import { CalendarDays, LifeBuoy, ListChecks, Loader2, Truck } from "lucide-react";
import { requireSupabase } from "@/lib/supabase";
import { cn } from "@/lib/utils";
import { useDateLocale } from "@/i18n/dateLocale";
import RequestFormPage from "@/modules/requests/RequestFormPage";
import PickupFormPage from "@/modules/pickups/PickupFormPage";
import ServiceFormPage from "@/modules/service/ServiceFormPage";
import { TrackingInfo } from "@/modules/requests/TrackingInfo";
import { formList, sameAgent } from "@/modules/requests/api";
import { LIVE } from "@/lib/live";

/*
 * O link pessoal (/ferie/<token>) como ponto de entrada de tudo: além de férias
 * e agenda, a pessoa pede envio ou retirada, assistência/garantia para um
 * cliente e acompanha os próprios pedidos. Os formulários são os mesmos dos
 * links de cada serviço; o banco reconhece o token pessoal neles
 * (migration 20261126130000_hub_link_pessoal) e marca a pessoa como agente.
 */

export type HubSection = "ferie" | "logistica" | "assistenza" | "richieste";
export const HUB_SECTIONS: HubSection[] = ["ferie", "logistica", "assistenza", "richieste"];
const ICONS = { ferie: CalendarDays, logistica: Truck, assistenza: LifeBuoy, richieste: ListChecks };

export function HubNav({ value, onChange }: { value: HubSection; onChange: (s: HubSection) => void }) {
  const { t } = useTranslation();
  return (
    <nav aria-label={t("hub.nav")} className="grid grid-cols-2 sm:grid-cols-4 gap-2">
      {HUB_SECTIONS.map((s) => {
        const Icon = ICONS[s];
        return (
          <button key={s} type="button" aria-current={value === s ? "page" : undefined} onClick={() => onChange(s)}
            className={cn("flex min-h-16 items-center gap-3 rounded-lg border px-4 py-3 text-left transition-colors",
              value === s ? "border-primary bg-primary text-primary-foreground" : "border-border bg-card hover:border-foreground")}>
            <Icon className="h-5 w-5 shrink-0" aria-hidden="true" />
            <span className="text-sm font-semibold leading-tight">{t(`hub.s.${s}`)}</span>
          </button>
        );
      })}
    </nav>
  );
}

/** Envio ou retirada: um formulário só, com a escolha no começo. */
export function HubLogistics({ token, agent }: { token: string; agent: string }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<"spedizione" | "ritiro">("spedizione");
  return (
    <div className="flex flex-col gap-5">
      <div role="radiogroup" aria-label={t("hub.log.what")} className="grid grid-cols-2 gap-2">
        {(["spedizione", "ritiro"] as const).map((k) => (
          <button key={k} type="button" role="radio" aria-checked={kind === k} onClick={() => setKind(k)}
            className={cn("rounded-lg border px-4 py-3 text-left", kind === k ? "border-primary ring-1 ring-primary bg-card" : "border-border bg-card hover:border-foreground")}>
            <span className="block text-sm font-semibold">{t(`hub.log.${k}`)}</span>
            <span className="block text-xs text-muted-foreground">{t(`hub.log.${k}Hint`)}</span>
          </button>
        ))}
      </div>
      {kind === "spedizione"
        ? <RequestFormPage key="s" token={token} embedded agent={agent} />
        : <PickupFormPage key="r" token={token} embedded agent={agent} />}
    </div>
  );
}

export function HubService({ token, agent }: { token: string; agent: string }) {
  return <ServiceFormPage token={token} embedded agent={agent} />;
}

interface MyPickup { id: string; code: string | null; created_at: string; status: "new" | "converted" | "rejected"; reason: string; shop_name: string; city: string; tracking_code: string | null; carrier: string | null }
interface MyService { id: string; code: string | null; created_at: string; status: "new" | "converted" | "rejected"; kind: "warranty" | "assistance"; customer_name: string; product: string }

const hubMyRequests = async (token: string) => {
  const { data, error } = await requireSupabase().rpc("hub_my_requests", { token });
  if (error) throw error;
  return data as { pickups: MyPickup[]; services: MyService[] };
};

type Item = { id: string; at: string; kind: string; title: string; sub: string; status: string; done: boolean; off: boolean; carrier?: string | null; tracking?: string | null; shipped?: boolean };

/** Tudo o que a pessoa pediu: envios (dos últimos 60 dias), retiradas e assistências. */
export function HubMyRequests({ token, agent }: { token: string; agent: string }) {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const mine = useQuery({ queryKey: ["hub-mine", token], queryFn: () => hubMyRequests(token), ...LIVE });
  const ships = useQuery({ queryKey: ["request-form", token, "list"], queryFn: () => formList(token), ...LIVE });

  if (mine.isLoading || ships.isLoading) return <div className="py-12 flex justify-center"><Loader2 className="h-6 w-6 animate-spin" /></div>;
  if (mine.isError && ships.isError) return <p className="text-sm text-destructive">{t("hub.mine.error")}</p>;

  const items: Item[] = [
    ...(ships.data ?? []).filter((r) => sameAgent(r.requested_by, agent)).map((r): Item => ({
      id: `s-${r.id}`, at: r.created_at, kind: r.is_pickup ? t("hub.kind.pickupShipment") : t("hub.kind.shipment"),
      title: r.customer, sub: r.country ?? "", status: t(`hub.st.ship.${r.status}`),
      done: r.status === "shipped", off: r.status === "cancelled", carrier: r.carrier, tracking: r.tracking_code, shipped: r.status === "shipped",
    })),
    ...(mine.data?.pickups ?? []).map((p): Item => ({
      id: `p-${p.id}`, at: p.created_at, kind: t("hub.kind.pickup"), title: p.shop_name, sub: [p.code, p.city].filter(Boolean).join(" · "),
      status: t(`hub.st.pickup.${p.status}`), done: p.status === "converted", off: p.status === "rejected",
      carrier: p.carrier, tracking: p.tracking_code, shipped: p.status === "converted" && !!p.tracking_code,
    })),
    ...(mine.data?.services ?? []).map((s): Item => ({
      id: `a-${s.id}`, at: s.created_at, kind: t(`hub.kind.${s.kind}`), title: s.customer_name, sub: [s.code, s.product].filter(Boolean).join(" · "),
      status: t(`hub.st.service.${s.status}`), done: s.status === "converted", off: s.status === "rejected",
    })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <section className="flex flex-col gap-3">
      <p className="text-sm text-muted-foreground">{t("hub.mine.hint")}</p>
      {items.length === 0 && <p className="text-muted-foreground">{t("hub.mine.none")}</p>}
      {items.map((it) => (
        <article key={it.id} className="bg-card border border-border rounded-lg p-4 flex flex-col gap-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="font-semibold text-[17px] tracking-tight truncate">
                <span className="mr-1.5 align-middle rounded-full border border-foreground px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.06em]">{it.kind}</span>
                {it.title}
              </p>
              <p className="text-sm text-muted-foreground">{format(new Date(it.at), "dd/MM/yyyy HH:mm", { locale })}{it.sub && ` · ${it.sub}`}</p>
            </div>
            <span className={cn("shrink-0 px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-[0.06em]",
              it.done ? "bg-primary text-primary-foreground" : it.off ? "bg-muted text-muted-foreground line-through" : "border border-foreground")}>
              {it.status}
            </span>
          </div>
          {it.shipped && <TrackingInfo carrier={it.carrier ?? null} code={it.tracking ?? null} />}
        </article>
      ))}
    </section>
  );
}
