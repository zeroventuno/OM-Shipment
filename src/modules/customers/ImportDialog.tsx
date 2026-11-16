import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Loader2, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Field } from "./fields";
import { parseSpreadsheet } from "./spreadsheet.js";
import { normalizeRow, dropSharedContacts, groupRows, planImport, detectColumns, toImportPayload } from "./importer.js";
import { existingAddressKeys, runImport, CUSTOMERS_KEY, type CustomerRow } from "./api";

type Plan = ReturnType<typeof planImport>;
interface Analysis {
  file: string;
  rows: number;
  customersInFile: number;
  columns: Record<string, string>;
  problems: { line: number; name?: string; reason: string }[];
  shared: string[];
  plan: Plan;
  source: string;
}

/**
 * Importa clientes de uma planilha (.xlsx/.csv) exportada de um portal ou
 * do próprio botão "Esporta". Primeiro mostra o que vai acontecer; só grava
 * ao confirmar. Repetidos são juntados, nada existente é sobrescrito e
 * endereços novos de clientes existentes entram como endereços a mais.
 */
export default function ImportDialog({ open, onClose, customers }: { open: boolean; onClose: () => void; customers: CustomerRow[] }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const [file, setFile] = useState<File | null>(null);
  const [origin, setOrigin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [done, setDone] = useState<{ customers: number; updated: number; addresses: number } | null>(null);

  const reset = () => { setFile(null); setOrigin(""); setAnalysis(null); setDone(null); setError(""); setBusy(false); };
  const close = () => { reset(); onClose(); };

  const analyze = async () => {
    if (!file) return setError(t("Choose a file"));
    if (!origin.trim()) return setError(t("Tell us where the file comes from"));
    setError("");
    setBusy(true);
    try {
      const rows = await parseSpreadsheet(await file.arrayBuffer()) as Record<string, string>[];
      if (rows.length === 0) throw new Error(t("The file is empty"));
      const columns = detectColumns(Object.keys(rows[0])) as Record<string, string>;
      if (!columns.name) throw new Error(t("No customer name column found (e.g. 'Ragione sociale', 'Company', 'Name')."));
      const normalized = rows.map(normalizeRow);
      const { records, shared } = dropSharedContacts(normalized);
      const groups = groupRows(records);
      const source = `csv:${origin.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`;
      const plan = planImport(groups, customers, await existingAddressKeys(), { source });
      setAnalysis({
        file: file.name,
        rows: rows.length,
        customersInFile: groups.length,
        columns,
        problems: normalized
          .map((r: { skip?: string; problem?: string | null; name?: string | null }, i: number) => ({ line: i + 2, name: r.name ?? undefined, reason: r.skip ?? r.problem ?? "" }))
          .filter((p: { reason: string }) => p.reason),
        shared: [...shared.phones, ...shared.emails],
        plan,
        source,
      });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const confirm = async () => {
    if (!analysis) return;
    setBusy(true);
    setError("");
    try {
      const result = await runImport(toImportPayload(analysis.plan, analysis.source));
      setDone(result);
      await queryClient.invalidateQueries({ queryKey: CUSTOMERS_KEY });
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const p = analysis?.plan;
  const forExisting = p ? p.newAddresses.filter((a: { customerId?: string }) => a.customerId).length : 0;
  const nothingToDo = p && p.newCustomers.length + p.updates.length + p.newAddresses.length === 0;

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight">{t("Import customers")}</DialogTitle>
          <DialogDescription>
            {t("Excel (.xlsx) or CSV file exported from a portal, or from the Export button. Duplicates are merged and nothing already registered is overwritten.")}
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div role="status" className="flex flex-col items-start gap-4 py-2">
            <CheckCircle2 className="h-8 w-8" />
            <p className="text-lg font-semibold">
              {t("Imported: {{customers}} new customers, {{updated}} completed, {{addresses}} addresses.", done)}
            </p>
            <Button onClick={close}>{t("Close")}</Button>
          </div>
        ) : analysis && p ? (
          <div className="flex flex-col gap-5">
            <p className="text-sm text-muted-foreground">
              {t("{{file}}: {{rows}} rows, {{customers}} different customers.", { file: analysis.file, rows: analysis.rows, customers: analysis.customersInFile })}
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {([
                [t("New customers"), p.newCustomers.length],
                [t("Existing, completed"), p.updates.length],
                [t("New addresses"), p.newAddresses.length],
                [t("Already registered"), p.unchanged],
              ] as const).map(([label, n]) => (
                <div key={label} className="border border-border rounded-lg p-3 flex flex-col gap-1">
                  <span className="eyebrow">{label}</span>
                  <span className="text-2xl font-bold tabular-nums">{n}</span>
                </div>
              ))}
            </div>
            {forExisting > 0 && (
              <p className="text-sm">{t("{{count}} of the new addresses belong to customers already registered: they become extra delivery addresses.", { count: forExisting })}</p>
            )}

            <section className="flex flex-col gap-1.5 text-sm">
              <h3 className="eyebrow">{t("Columns recognised")}</h3>
              <p className="text-muted-foreground break-words">
                {Object.entries(analysis.columns).map(([field, header]) => `${t(`col.${field}`)} ← “${header}”`).join(" · ")}
              </p>
            </section>

            {p.newCustomers.length > 0 && (
              <section className="flex flex-col gap-1.5 text-sm">
                <h3 className="eyebrow">{t("Sample of new customers")}</h3>
                <ul className="flex flex-col gap-1">
                  {p.newCustomers.slice(0, 6).map((c: { key: string; name: string; city?: string | null; country?: string | null }) => (
                    <li key={c.key}><strong>{c.name}</strong> <span className="text-muted-foreground">{[c.city, c.country].filter(Boolean).join(" · ")}</span></li>
                  ))}
                </ul>
              </section>
            )}

            {analysis.shared.length > 0 && (
              <p className="text-sm text-muted-foreground">
                {t("Ignored because they repeat across many customers (probably the portal account's own): {{list}}", { list: analysis.shared.join(", ") })}
              </p>
            )}

            {analysis.problems.length > 0 && (
              <section className="flex flex-col gap-1.5 text-sm">
                <h3 className="eyebrow">{t("{{count}} rows with problems (imported without address or skipped)", { count: analysis.problems.length })}</h3>
                <ul className="flex flex-col gap-0.5 text-muted-foreground max-h-40 overflow-y-auto">
                  {analysis.problems.slice(0, 50).map((x) => (
                    <li key={x.line}>{t("Row {{n}}", { n: x.line })}{x.name ? ` · ${x.name}` : ""} — {x.reason}</li>
                  ))}
                </ul>
              </section>
            )}

            {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
            <div className="flex flex-wrap gap-2">
              <Button onClick={confirm} disabled={busy || !!nothingToDo}>
                {busy ? <Loader2 className="animate-spin" /> : null}
                {nothingToDo ? t("Nothing new to import") : t("Confirm import")}
              </Button>
              <Button variant="outline" onClick={() => setAnalysis(null)} disabled={busy}>{t("Back")}</Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-4">
            <Field label={t("File")}>
              <label className="flex items-center gap-3 h-12 px-4 rounded-md border border-dashed border-border bg-card cursor-pointer hover:border-foreground">
                <Upload className="h-4 w-4 shrink-0" />
                <span className="truncate text-sm">{file ? file.name : t("Choose .xlsx or .csv")}</span>
                <input type="file" accept=".xlsx,.csv,.txt" className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
              </label>
            </Field>
            <Field label={t("Where does it come from?")} hint={t("e.g. DHL, MyParcel, BRT. Saved as the customers' origin.")}>
              <Input value={origin} onChange={(e) => setOrigin(e.target.value)} className="text-base sm:text-sm" />
            </Field>
            {error && <p role="alert" className="text-sm font-semibold text-destructive">{error}</p>}
            <Button onClick={analyze} disabled={busy} className="self-start">
              {busy ? <Loader2 className="animate-spin" /> : null}
              {t("Analyse file")}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
