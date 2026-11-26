import { Fragment, useEffect, useRef } from "react";
import { Link, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { ArrowLeft, Printer } from "lucide-react";
import { ticketsQuery } from "@/modules/assistance/api";
import { warrantiesQuery } from "@/modules/warranties/api";
import { BIKE_DIAGRAM } from "./BikeMarks";
import { COMPONENT_KEYS, CONTENT_KEYS, ENTRIES_KEY, getEntry, itDay, listPickupShipments, type EntryCheck } from "./api";

/*
 * Folha A4 com duas vias iguais do Controllo di entrata (uma metade cada,
 * com linha de corte), como o papel que a oficina já usava. Abre a janela
 * de impressão sozinha quando tudo carregou.
 */

const CSS = `
@page { size: A4 portrait; margin: 0; }
.ec-sheet { width: 210mm; background: #fff; color: #111; font-family: Helvetica, Arial, sans-serif; }
.ec-half { box-sizing: border-box; width: 210mm; height: 148.5mm; padding: 7mm 9mm 6mm; overflow: hidden; display: flex; flex-direction: column; gap: 2.6mm; }
.ec-half > * { flex-shrink: 0; }
.ec-half + .ec-half { border-top: 0.3mm dashed #888; }
.ec-head { display: flex; align-items: center; justify-content: space-between; border-bottom: 0.5mm solid #111; padding-bottom: 2mm; }
.ec-head img { height: 7mm; }
.ec-title { font-size: 15pt; font-weight: 700; letter-spacing: -.01em; }
.ec-code { text-align: right; }
.ec-code b { font-size: 14pt; font-family: ui-monospace, Menlo, monospace; }
.ec-code span { display: block; font-size: 7pt; text-transform: uppercase; letter-spacing: .12em; color: #555; }
.ec-row { display: grid; grid-template-columns: 1fr 1fr; gap: 4mm; min-height: 0; }
.ec-box { border: 0.3mm solid #111; border-radius: 1.5mm; padding: 2mm 2.6mm; min-width: 0; }
.ec-label { font-size: 6.5pt; text-transform: uppercase; letter-spacing: .12em; color: #555; font-weight: 700; margin-bottom: 1mm; }
.ec-fields { display: grid; grid-template-columns: auto 1fr; column-gap: 2.5mm; row-gap: 1mm; font-size: 8.5pt; }
.ec-fields dt { color: #555; white-space: nowrap; }
.ec-fields dd { margin: 0; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ec-text { font-size: 8.5pt; line-height: 1.3; white-space: pre-wrap; overflow: hidden; }
.ec-diagram { position: relative; width: 100%; aspect-ratio: 3 / 2; }
.ec-diagram img { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: contain; }
.ec-dot { position: absolute; width: 4.2mm; height: 4.2mm; margin: -2.1mm 0 0 -2.1mm; border-radius: 50%; background: #111; color: #fff; font-size: 6.5pt; font-weight: 700; display: flex; align-items: center; justify-content: center; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
.ec-list { font-size: 7.3pt; line-height: 1.35; margin: 0; padding: 0; list-style: none; display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); column-gap: 4mm; }
.ec-list li { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.ec-comp { display: grid; grid-template-columns: auto minmax(0,1fr) auto minmax(0,1fr); column-gap: 2mm; row-gap: .6mm; font-size: 7.5pt; }
.ec-comp dt { color: #555; }
.ec-comp dd { margin: 0; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.ec-contents { display: flex; flex-wrap: wrap; gap: 1mm 3mm; font-size: 8pt; }
.ec-miss { font-weight: 700; text-decoration: underline; }
.ec-sign { display: flex; justify-content: space-between; gap: 8mm; font-size: 7pt; color: #555; margin-top: auto; }
.ec-sign span { flex: 1; border-top: 0.3mm solid #999; padding-top: 1mm; }
@media screen {
  .ec-wrap { background: #e9e8e4; min-height: 100vh; padding: 24px 12px 48px; }
  .ec-sheet { margin: 0 auto; box-shadow: 0 10px 40px rgba(0,0,0,.18); }
}
@media print {
  .ec-toolbar { display: none !important; }
  html, body { background: #fff !important; }
}
`;

function Half({ e, copy, links }: { e: EntryCheck; copy: string; links: string }) {
  const { t } = useTranslation();
  const comps = COMPONENT_KEYS.filter((k) => e.components[k]);
  const checked = CONTENT_KEYS.filter((k) => e.contents[k] !== undefined);
  return (
    <div className="ec-half">
      <div className="ec-head">
        <div style={{ display: "flex", alignItems: "center", gap: "4mm" }}>
          <img src="/logo.png" alt="Officine Mattio" />
          <span className="ec-title">Controllo di entrata</span>
        </div>
        <div className="ec-code"><b>{e.code}</b><span>{copy}</span></div>
      </div>

      <div className="ec-row" style={{ gridTemplateColumns: "1fr 80mm" }}>
        <div style={{ display: "flex", flexDirection: "column", gap: "2.6mm", minWidth: 0 }}>
          <div className="ec-box">
            <dl className="ec-fields" style={{ margin: 0 }}>
              <dt>Cliente</dt><dd>{e.customer_name}</dd>
              <dt>Data arrivo</dt><dd>{itDay(e.arrival_date)}</dd>
              <dt>Modello</dt><dd>{[e.bike_model, e.size && `tg. ${e.size}`].filter(Boolean).join(" · ") || "—"}</dd>
              <dt>N. seriale</dt><dd>{e.serial_number || "—"}</dd>
              <dt>Agente</dt><dd>{e.agent || "—"}</dd>
              <dt>Scatola rotta</dt><dd>{e.box_damaged ? "Sì" : "No"}</dd>
              <dt>Collegato a</dt><dd>{links || "—"}</dd>
            </dl>
          </div>
          <div className="ec-box" style={{ flex: 1, minHeight: 0 }}>
            <p className="ec-label">Motivo</p>
            <p className="ec-text" style={{ maxHeight: "14mm" }}>{e.reason || "—"}</p>
          </div>
        </div>
        <div className="ec-box" style={{ padding: "1.5mm" }}>
          <div className="ec-diagram">
            <img src={BIKE_DIAGRAM} alt="" />
            {e.marks.map((m, i) => <span key={m.id} className="ec-dot" style={{ left: `${m.x}%`, top: `${m.y}%` }}>{i + 1}</span>)}
          </div>
        </div>
      </div>

      <div className="ec-row" style={{ gridTemplateColumns: "1.25fr 1fr" }}>
        <div className="ec-box">
          <p className="ec-label">Componenti</p>
          {comps.length ? (
            <dl className="ec-comp" style={{ margin: 0 }}>
              {comps.map((k) => <Fragment key={k}><dt>{t(`ec.c.${k}`, { lng: "it" })}</dt><dd>{e.components[k]}</dd></Fragment>)}
            </dl>
          ) : <p className="ec-text">—</p>}
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: "2.6mm", minWidth: 0 }}>
          <div className="ec-box">
            <p className="ec-label">Nella scatola</p>
            {checked.length ? (
              <div className="ec-contents">
                {checked.map((k) => (
                  <span key={k} className={e.contents[k] ? "" : "ec-miss"}>{e.contents[k] ? "✓" : "NO"} {t(`ec.k.${k}`, { lng: "it" })}</span>
                ))}
              </div>
            ) : <p className="ec-text">Non controllato.</p>}
          </div>
          <div className="ec-box" style={{ flex: 1 }}>
            <p className="ec-label">Osservazioni</p>
            <p className="ec-text" style={{ maxHeight: "10mm" }}>{e.notes || "—"}</p>
          </div>
        </div>
      </div>

      <div className="ec-box">
        <p className="ec-label">Difetti segnati sul disegno</p>
        {e.marks.length ? (
          <ol className="ec-list">
            {e.marks.map((m, i) => (
              <li key={m.id}><b>{i + 1}.</b> {t(`ec.kind.${m.kind}`, { lng: "it" })} · {m.side === "d" ? "lato trasm." : "lato opposto"}{m.note ? ` · ${m.note}` : ""}</li>
            ))}
          </ol>
        ) : <p className="ec-text">Nessun difetto segnato.</p>}
      </div>

      <div className="ec-sign"><span>Controllato da</span><span>Firma</span></div>
    </div>
  );
}

export default function EntryPrintPage() {
  const { id } = useParams();
  const { t } = useTranslation();
  const entry = useQuery({ queryKey: [...ENTRIES_KEY, id], queryFn: () => getEntry(id!) });
  const tickets = useQuery(ticketsQuery);
  const warranties = useQuery(warrantiesQuery);
  const pickups = useQuery({ queryKey: ["entry_checks", "pickups"], queryFn: listPickupShipments });
  const printed = useRef(false);

  const ready = entry.data && !tickets.isLoading && !warranties.isLoading && !pickups.isLoading;
  useEffect(() => {
    if (!ready || printed.current) return;
    printed.current = true;
    document.title = `${entry.data!.code} · Controllo di entrata`;
    const timer = setTimeout(() => window.print(), 600);
    return () => clearTimeout(timer);
  }, [ready, entry.data]);

  if (entry.error) return <p className="p-8 text-destructive">{(entry.error as Error).message}</p>;
  if (!entry.data) return <p className="p-8 text-muted-foreground">…</p>;
  const e = entry.data;
  const links = [
    tickets.data?.find((x) => x.id === e.ticket_id)?.code,
    warranties.data?.find((x) => x.id === e.warranty_id)?.protocolNumber,
    e.shipment_id ? `Ritiro ${pickups.data?.find((x) => x.id === e.shipment_id)?.order_id ?? ""}`.trim() : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="ec-wrap">
      <style>{CSS}</style>
      <div className="ec-toolbar mx-auto mb-4 flex max-w-[210mm] items-center justify-between gap-3">
        <Link to={`/entries/${e.id}`} className="inline-flex items-center gap-2 text-sm"><ArrowLeft className="h-4 w-4" />{t("ec.back")}</Link>
        <button type="button" onClick={() => window.print()} className="inline-flex h-10 items-center gap-2 rounded-full bg-black px-5 text-sm font-semibold text-white">
          <Printer className="h-4 w-4" />{t("ec.print")}
        </button>
      </div>
      <div className="ec-sheet">
        <Half e={e} copy="Copia 1 · Officina" links={links} />
        <Half e={e} copy="Copia 2 · Pratica" links={links} />
      </div>
    </div>
  );
}
