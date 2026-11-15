import { useTranslation } from "react-i18next";
import { type Warranty } from "../schema";
import MetricCards from "../MetricCards";

export default function WarrantyMetrics({ warranties }: { warranties: Warranty[] }) {
  const { t } = useTranslation();
  const count = (status: string) => warranties.filter((w) => w.status === status).length;

  return (
    <MetricCards
      metrics={[
        { id: "warranty-total", title: t("Total"), value: warranties.length, color: "text-primary" },
        { id: "warranty-waiting", title: t("Waiting"), value: count("In attesa"), color: "text-amber-600" },
        { id: "warranty-in-progress", title: t("In progress"), value: count("In lavorazione"), color: "text-blue-600" },
        { id: "warranty-completed", title: t("Completed"), value: count("Completato"), color: "text-muted-foreground" },
      ]}
    />
  );
}
