import { ExternalLink, Truck } from "lucide-react";
import { useTranslation } from "react-i18next";
import { splitCarrier, trackingUrl } from "./api";

export /** Transportadora, número de rastreio e link para acompanhar (lista "Richieste"). */
function TrackingInfo({ carrier, code }: { carrier: string | null; code: string | null }) {
  const { t } = useTranslation();
  const { portal, courier } = splitCarrier(carrier);
  const url = trackingUrl(courier, code);
  return (
    <div className="mt-1 rounded-md border border-border bg-secondary/50 px-3 py-2.5 text-sm flex flex-col gap-1">
      <p className="flex items-center gap-2 font-semibold">
        <Truck className="h-4 w-4 shrink-0" />
        {courier ? t("Shipped with {{courier}}", { courier }) : t("Shipped")}
        {portal && <span className="font-normal text-muted-foreground">· {t("via {{portal}}", { portal })}</span>}
      </p>
      {code ? (
        <p className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span>{courier ? `${t("Tracking")} ${courier}` : t("Tracking")}: <span className="font-mono font-semibold select-all">{code}</span></span>
          {url && (
            <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 font-semibold underline underline-offset-2">
              {t("Track shipment")} <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
        </p>
      ) : (
        <p className="text-muted-foreground">{t("Tracking not available yet")}</p>
      )}
    </div>
  );
}
