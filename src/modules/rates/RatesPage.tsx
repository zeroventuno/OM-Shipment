import { useMemo, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { FileText, Loader2, Paperclip, Plus, Trash2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Field, useCountries } from "@/modules/customers/fields";
import { formatMoney } from "@/modules/requests/api";
import { PageHeader } from "@/modules/common/PageHeader";
import { quoteCard, type Direction, type Parcel } from "./calc";
import { RATES_KEY, addRateFiles, createRateCard, listRateCards, rateFileUrl, removeRateFile, setRateStatus, type RateCard, type RateStatus } from "./api";

/*
 * Listini corrieri (Strumenti → /shipments/rates): os listini guardados e um
 * comparador. Com país, direção e colos, calcula o preço de cada serviço de
 * cada listino convertido, do mais barato ao mais caro. É o começo da
 * sugestão automática de portal/transportadora no Nuovo envio.
 */

type Row = { weight: string; length: string; width: string; height: string; qty: string };
const emptyRow = (): Row => ({ weight: "", length: "", width: "", height: "", qty: "1" });
const n = (v: string) => Number(v.replace(",", ".")) || 0;
const SELECT = "flex h-11 w-full rounded-md border border-input bg-card px-3 text-sm";

export default function RatesPage() {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const cards = useQuery({ queryKey: RATES_KEY, queryFn: listRateCards });
  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={t("rt.eyebrow")} title={t("rt.title")}
        actions={<Button onClick={() => setAdding(true)}><Plus className="mr-2 h-4 w-4" />{t("rt.new")}</Button>} />
      {cards.isLoading ? (
        <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /></div>
      ) : cards.isError ? (
        <p className="py-16 text-center text-destructive">{(cards.error as Error).message}</p>
      ) : (
        <>
          <Compare cards={cards.data ?? []} />
          <CardList cards={cards.data ?? []} />
        </>
      )}
      <NewCardDialog open={adding} onClose={() => setAdding(false)} />
    </div>
  );
}

function Compare({ cards }: { cards: RateCard[] }) {
  const { t, i18n } = useTranslation();
  const countries = useCountries();
  const [country, setCountry] = useState("DE");
  const [direction, setDirection] = useState<Direction>("export");
  const [rows, setRows] = useState<Row[]>([{ ...emptyRow(), weight: "25", length: "120", width: "30", height: "80" }]);
  const usable = cards.filter((c) => c.tariff && c.status !== "archived");

  const parcels: Parcel[] = rows.map((r) => ({ weight: n(r.weight), length: n(r.length), width: n(r.width), height: n(r.height), qty: Math.max(1, Math.round(n(r.qty))) }))
    .filter((p) => p.weight > 0 || (p.length && p.width && p.height));
  const results = useMemo(() => usable.flatMap((c) => quoteCard(c.tariff!, country, direction, parcels).map((q) => ({ ...q, card: c })))
    .sort((a, b) => a.price - b.price), [usable, country, direction, parcels]);
  const best = results[0]?.price;
  const setRow = (i: number, k: keyof Row, v: string) => setRows((rs) => rs.map((r, j) => (j === i ? { ...r, [k]: v } : r)));

  return (
    <section className="flex flex-col gap-5 rounded-lg border border-border bg-card p-5">
      <h2 className="text-xs font-bold uppercase tracking-[0.12em]">{t("rt.compare")}</h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label={t("rt.country")}>
          <select className={SELECT} value={country} onChange={(e) => setCountry(e.target.value)}>
            {countries.map((c) => <option key={c.code} value={c.code}>{c.label}</option>)}
          </select>
        </Field>
        <Field label={t("rt.direction")}>
          <div role="radiogroup" className="grid grid-cols-2 gap-2">
            {(["export", "import"] as const).map((d) => (
              <button key={d} type="button" role="radio" aria-checked={direction === d} onClick={() => setDirection(d)}
                className={cn("h-11 rounded-full border text-sm font-semibold", direction === d ? "border-primary bg-primary text-primary-foreground" : "border-border hover:border-foreground")}>
                {t(`rt.dir.${d}`)}
              </button>
            ))}
          </div>
        </Field>
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-muted-foreground text-[11px] font-semibold uppercase tracking-[0.12em]">{t("rt.parcels")}</span>
        {rows.map((r, i) => (
          <div key={i} className="grid grid-cols-[repeat(5,minmax(0,1fr))_auto] items-end gap-2">
            {(["weight", "length", "width", "height", "qty"] as const).map((k) => (
              <label key={k} className="flex min-w-0 flex-col gap-1 text-xs text-muted-foreground">
                {t(`rt.p.${k}`)}
                <Input inputMode="decimal" value={r[k]} onChange={(e) => setRow(i, k, e.target.value)} />
              </label>
            ))}
            <Button type="button" variant="ghost" size="icon" aria-label={t("rt.removeParcel")} disabled={rows.length === 1}
              onClick={() => setRows((rs) => rs.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></Button>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => setRows((rs) => [...rs, emptyRow()])}>
          <Plus className="mr-1 h-4 w-4" />{t("rt.addParcel")}
        </Button>
      </div>

      {usable.length === 0 ? <p className="text-sm text-muted-foreground">{t("rt.noCards")}</p>
        : parcels.length === 0 ? <p className="text-sm text-muted-foreground">{t("rt.needWeight")}</p>
        : results.length === 0 ? <p className="text-sm text-muted-foreground">{t("rt.noResults")}</p> : (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full text-sm">
              <thead className="text-left text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                <tr className="border-b border-border">
                  <th className="px-4 py-2.5">{t("rt.col.carrier")}</th>
                  <th className="px-3 py-2.5">{t("rt.col.service")}</th>
                  <th className="px-3 py-2.5">{t("rt.col.zone")}</th>
                  <th className="px-3 py-2.5 text-right">{t("rt.col.weight")}</th>
                  <th className="px-4 py-2.5 text-right">{t("rt.col.price")}</th>
                </tr>
              </thead>
              <tbody>
                {results.map((q, i) => (
                  <tr key={`${q.card.id}-${q.service}-${i}`} className={cn("border-b border-border last:border-0", q.price === best && "bg-secondary/70 font-semibold")}>
                    <td className="px-4 py-2.5">
                      {q.card.carrier}
                      {q.card.status === "evaluation" && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.08em] text-muted-foreground">{t("rt.st.evaluation")}</span>}
                    </td>
                    <td className="px-3 py-2.5">{q.serviceName} <span className="text-muted-foreground">({q.service})</span></td>
                    <td className="px-3 py-2.5 tabular-nums">{q.zone}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums">{String(q.chargeable).replace(".", ",")} kg</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(q.price, i18n.language)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      <p className="text-xs text-muted-foreground">{t("rt.note")}</p>
    </section>
  );
}

function CardList({ cards }: { cards: RateCard[] }) {
  const { t, i18n } = useTranslation();
  const qc = useQueryClient();
  const status = useMutation({ mutationFn: ({ id, s }: { id: string; s: RateStatus }) => setRateStatus(id, s), onSuccess: () => qc.invalidateQueries({ queryKey: RATES_KEY }) });
  const attach = useMutation({ mutationFn: ({ card, files }: { card: RateCard; files: File[] }) => addRateFiles(card, files), onSuccess: () => qc.invalidateQueries({ queryKey: RATES_KEY }) });
  const remove = useMutation({ mutationFn: ({ card, path }: { card: RateCard; path: string }) => removeRateFile(card, path), onSuccess: () => qc.invalidateQueries({ queryKey: RATES_KEY }) });
  const open = async (path: string) => { window.open(await rateFileUrl(path), "_blank", "noopener"); };
  const day = (d: string | null) => (d ? new Date(`${d.slice(0, 10)}T12:00:00`).toLocaleDateString(i18n.language) : "—");

  return (
    <section className="flex flex-col gap-3">
      <h2 className="text-xs font-bold uppercase tracking-[0.12em]">{t("rt.list")}</h2>
      {cards.length === 0 && <p className="text-sm text-muted-foreground">{t("rt.empty")}</p>}
      <div className="grid gap-3 md:grid-cols-2">
        {cards.map((c) => (
          <article key={c.id} className={cn("flex flex-col gap-3 rounded-lg border border-border bg-card p-4", c.status === "archived" && "opacity-60")}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <span className="eyebrow">{c.carrier} · {t("rt.validFrom")} {day(c.valid_from)}</span>
                <h3 className="font-bold leading-tight">{c.name}</h3>
              </div>
              <select aria-label={t("rt.status")} value={c.status} onChange={(e) => status.mutate({ id: c.id, s: e.target.value as RateStatus })}
                className="h-9 shrink-0 rounded-full border border-border bg-card px-3 text-xs font-semibold">
                {(["active", "evaluation", "archived"] as const).map((s) => <option key={s} value={s}>{t(`rt.st.${s}`)}</option>)}
              </select>
            </div>
            <p className="text-sm">
              {c.tariff
                ? t("rt.summary", { services: new Set(c.tariff.services.map((s) => s.code)).size, countries: Object.keys(c.tariff.zoning).reduce((m, k) => Math.max(m, Object.keys(c.tariff!.zoning[k].export ?? {}).length), 0) })
                : <span className="font-semibold">{t("rt.toConvert")}</span>}
            </p>
            {c.notes && <p className="text-xs text-muted-foreground">{c.notes}</p>}
            <div className="flex flex-wrap items-center gap-2">
              {c.files.map((f) => (
                <span key={f.path} className="inline-flex items-center rounded-full border border-border text-xs">
                  <button type="button" onClick={() => open(f.path)} className="inline-flex items-center gap-1.5 py-1 pl-3 pr-1.5 hover:underline">
                    <FileText className="h-3.5 w-3.5" />{f.name}
                  </button>
                  <button type="button" aria-label={t("rt.removeFile", { name: f.name })} title={t("rt.removeFile", { name: f.name })} disabled={remove.isPending}
                    onClick={() => { if (window.confirm(t("rt.confirmRemove", { name: f.name }))) remove.mutate({ card: c, path: f.path }); }}
                    className="mr-1 rounded-full p-1 text-muted-foreground hover:bg-muted hover:text-destructive">
                    <X className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
              <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-border px-3 py-1 text-xs text-muted-foreground hover:border-foreground">
                {attach.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Paperclip className="h-3.5 w-3.5" />}{t("rt.attach")}
                <input type="file" multiple accept=".pdf,.xlsx,.xls,.csv,image/*" className="sr-only"
                  onChange={(e) => { const files = [...(e.target.files ?? [])]; e.target.value = ""; if (files.length) attach.mutate({ card: c, files }); }} />
              </label>
            </div>
          </article>
        ))}
      </div>
      {(status.isError || attach.isError || remove.isError) && <p role="alert" className="text-sm text-destructive">{((status.error ?? attach.error ?? remove.error) as Error).message}</p>}
    </section>
  );
}

function NewCardDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { t } = useTranslation();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [v, setV] = useState({ carrier: "", name: "", status: "evaluation" as RateStatus, valid_from: "", notes: "" });
  const [error, setError] = useState("");
  const save = useMutation({
    mutationFn: () => createRateCard({ ...v, valid_from: v.valid_from || null }, [...(fileRef.current?.files ?? [])]),
    onSuccess: () => { qc.invalidateQueries({ queryKey: RATES_KEY }); setV({ carrier: "", name: "", status: "evaluation", valid_from: "", notes: "" }); onClose(); },
    onError: (e: Error) => setError(e.message),
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!v.carrier.trim() || !v.name.trim()) return setError(t("rt.needName"));
    setError("");
    save.mutate();
  };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t("rt.new")}</DialogTitle>
          <DialogDescription>{t("rt.newHint")}</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="grid grid-cols-2 gap-4">
          <div className="col-span-2 sm:col-span-1"><Field label={`${t("rt.col.carrier")} *`}><Input value={v.carrier} placeholder="MBE, BRT, DHL…" onChange={(e) => setV({ ...v, carrier: e.target.value })} /></Field></div>
          <div className="col-span-2 sm:col-span-1"><Field label={t("rt.status")}>
            <select className={SELECT} value={v.status} onChange={(e) => setV({ ...v, status: e.target.value as RateStatus })}>
              {(["active", "evaluation"] as const).map((s) => <option key={s} value={s}>{t(`rt.st.${s}`)}</option>)}
            </select>
          </Field></div>
          <div className="col-span-2"><Field label={`${t("rt.name")} *`}><Input value={v.name} placeholder={t("rt.namePh")} onChange={(e) => setV({ ...v, name: e.target.value })} /></Field></div>
          <div className="col-span-2 sm:col-span-1"><Field label={t("rt.validFrom")}><Input type="date" value={v.valid_from} onChange={(e) => setV({ ...v, valid_from: e.target.value })} /></Field></div>
          <div className="col-span-2 sm:col-span-1"><Field label={t("rt.files")}><input ref={fileRef} type="file" multiple accept=".pdf,.xlsx,.xls,.csv,image/*" className="block w-full text-sm" /></Field></div>
          <div className="col-span-2"><Field label={t("rt.notes")}><Textarea rows={2} value={v.notes} onChange={(e) => setV({ ...v, notes: e.target.value })} /></Field></div>
          {error && <p role="alert" className="col-span-2 text-sm font-semibold text-destructive">{error}</p>}
          <div className="col-span-2 flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>{t("Cancel")}</Button>
            <Button type="submit" disabled={save.isPending}>{save.isPending && <Loader2 className="animate-spin" />}{t("Save")}</Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
