import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LIVE } from "@/lib/live";
import { ticketsQuery } from "@/modules/assistance/api";
import { warrantiesQuery } from "@/modules/warranties/api";
import { PageHeader, SearchBox } from "../common/PageHeader";
import { ENTRIES_KEY, itDay, listEntries } from "./api";

/** Lista dos Controlli di entrata (OME), mais novos primeiro. */
export default function EntriesPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [q, setQ] = useState("");
  const { data = [], isLoading, error } = useQuery({ queryKey: ENTRIES_KEY, queryFn: listEntries, ...LIVE });
  const tickets = useQuery(ticketsQuery);
  const warranties = useQuery(warrantiesQuery);

  const codeOf = useMemo(() => {
    const m = new Map<string, string>();
    for (const x of tickets.data ?? []) if (x.code) m.set(`t:${x.id}`, x.code);
    for (const x of warranties.data ?? []) if (x.protocolNumber) m.set(`w:${x.id}`, x.protocolNumber);
    return m;
  }, [tickets.data, warranties.data]);

  const term = q.trim().toLowerCase();
  const rows = data.filter((e) => !term || [e.code, e.customer_name, e.bike_model, e.serial_number, e.agent].some((v) => v?.toLowerCase().includes(term)));

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        eyebrow={t("ec.eyebrow")}
        title={t("ec.titlePlural")}
        actions={
          <>
            <SearchBox value={q} onChange={setQ} placeholder={t("ec.search")} />
            <Button asChild><Link to="/entries/new"><Plus className="mr-2 h-4 w-4" />{t("ec.new")}</Link></Button>
          </>
        }
      />
      {isLoading ? (
        <p className="py-16 text-center text-muted-foreground">…</p>
      ) : error ? (
        <p className="py-16 text-center text-destructive">{(error as Error).message}</p>
      ) : rows.length === 0 ? (
        <p className="py-16 text-center text-muted-foreground">{t("ec.empty")}</p>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-border bg-card">
          <table className="w-full text-sm">
            <thead className="text-left text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
              <tr className="border-b border-border">
                <th className="px-4 py-3">{t("ec.code")}</th>
                <th className="px-4 py-3">{t("ec.arrival")}</th>
                <th className="px-4 py-3">{t("Customer")}</th>
                <th className="px-4 py-3">{t("ec.model")}</th>
                <th className="px-4 py-3">{t("ec.serial")}</th>
                <th className="px-4 py-3">{t("ec.link")}</th>
                <th className="px-4 py-3 text-right">{t("ec.marks")}</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((e) => (
                <tr key={e.id} onClick={() => navigate(`/entries/${e.id}`)} className="cursor-pointer border-b border-border last:border-0 hover:bg-muted/40">
                  <td className="px-4 py-3 font-mono font-semibold">{e.code}</td>
                  <td className="px-4 py-3 whitespace-nowrap">{itDay(e.arrival_date)}</td>
                  <td className="px-4 py-3">{e.customer_name}</td>
                  <td className="px-4 py-3">{e.bike_model || "—"}</td>
                  <td className="px-4 py-3 font-mono text-xs">{e.serial_number || "—"}</td>
                  <td className="px-4 py-3 text-xs">
                    {[e.ticket_id && codeOf.get(`t:${e.ticket_id}`), e.warranty_id && codeOf.get(`w:${e.warranty_id}`), e.shipment_id && t("ec.pickup")].filter(Boolean).join(" · ") || "—"}
                  </td>
                  <td className="px-4 py-3 text-right tabular-nums">{e.marks.length || "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
