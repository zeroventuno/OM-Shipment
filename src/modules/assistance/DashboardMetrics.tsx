import { useTranslation } from "react-i18next";
import { type Ticket } from "../schema";
import MetricCards from "../MetricCards";

export default function DashboardMetrics({ tickets }: { tickets: Ticket[] }) {
  const { t } = useTranslation();
  const count = (fn: (t: Ticket) => boolean) => tickets.filter(fn).length;

  return (
    <MetricCards
      metrics={[
        { id: "total", title: t("Total"), value: tickets.length, color: "text-primary" },
        { id: "in-progress", title: t("In progress"), value: count((x) => x.phase === "In lavorazione"), color: "text-amber-600" },
        { id: "approved", title: t("Approved"), value: count((x) => x.approvalStatus === "Approvato"), color: "text-green-600" },
        { id: "completed", title: t("Completed"), value: count((x) => x.phase === "Completato"), color: "text-muted-foreground" },
      ]}
    />
  );
}
