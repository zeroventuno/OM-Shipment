import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Navigate } from "react-router-dom";
import { format } from "date-fns";
import qrcode from "qrcode-generator";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { useDateLocale } from "@/i18n/dateLocale";
import { cn } from "@/lib/utils";
import { PageHeader } from "../common/PageHeader";
import { publicOrigin } from "./text";
import {
  NFC_TAGS_QUERY_KEY, canWriteNfc, generateTags, nfcCanAdminQuery, listTags, markWritten, newOwnerLink, tagAction, writeChip,
  type NfcTag, type TagStatus,
} from "./api";

const tagUrl = (code: string) => `${publicOrigin(window.location.origin)}/t/${code}`;

const STATUS_STYLE: Record<TagStatus, string> = {
  blank: "bg-secondary text-secondary-foreground",
  written: "bg-white border border-border",
  active: "bg-primary text-primary-foreground",
  disabled: "bg-destructive text-destructive-foreground",
};

function Qr({ text }: { text: string }) {
  const svg = useMemo(() => {
    const q = qrcode(0, "M");
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 5, margin: 2, scalable: true });
  }, [text]);
  return <div className="w-44 h-44 bg-white p-1 rounded-md border border-border [&_svg]:w-full [&_svg]:h-full" dangerouslySetInnerHTML={{ __html: svg }} />;
}

type WriteState = { phase: "idle" | "writing" } | { phase: "done"; uid: string | null } | { phase: "error"; message: string };

function WriteDialog({ tag, onClose, onWritten }: { tag: NfcTag; onClose: () => void; onWritten: () => void }) {
  const { t } = useTranslation();
  const [state, setState] = useState<WriteState>({ phase: "idle" });
  const abort = useRef<AbortController | null>(null);
  const url = tagUrl(tag.code);

  async function start() {
    abort.current = new AbortController();
    setState({ phase: "writing" });
    try {
      const uid = await writeChip(url, false, abort.current.signal);
      await markWritten(tag.code, uid, false);
      setState({ phase: "done", uid });
      onWritten();
    } catch (e) {
      if ((e as Error).name === "AbortError") { setState({ phase: "idle" }); return; }
      setState({ phase: "error", message: (e as Error).message });
    }
  }

  async function manual() {
    try { await markWritten(tag.code, null, false); onWritten(); onClose(); } catch (e) { setState({ phase: "error", message: (e as Error).message }); }
  }

  const close = () => { abort.current?.abort(); onClose(); };

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t("nfc.writeTitle", { code: tag.code })}</DialogTitle>
          <DialogDescription>{t("nfc.lockNote")}</DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <span className="eyebrow">{t("nfc.writeUrl")}</span>
            <code className="text-sm break-all">{url}</code>
          </div>
          {canWriteNfc() ? (
            <>
              <p className="text-sm text-muted-foreground">{t("nfc.writeHint")}</p>
              {state.phase === "done" ? (
                <p className="font-semibold" role="status">{t("nfc.writeDone", { uid: state.uid ?? t("nfc.writeNoUid") })}</p>
              ) : (
                <Button onClick={start} disabled={state.phase === "writing"}>
                  {state.phase === "writing" ? t("nfc.writing") : t("nfc.writeStart")}
                </Button>
              )}
            </>
          ) : (
            <>
              <p className="text-sm">{t("nfc.notSupported")}</p>
              <Qr text={url} />
              <Button variant="outline" onClick={manual}>{t("nfc.markWritten")}</Button>
            </>
          )}
          {state.phase === "error" && <p className="text-sm text-destructive" role="alert">{t("nfc.writeError", { msg: state.message })}</p>}
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Só para os logins da lista nfc_admins; os outros voltam para Envios. */
export default function NfcAdminPage() {
  const { data: allowed, isLoading } = useQuery(nfcCanAdminQuery);
  if (isLoading) return null;
  return allowed ? <NfcAdmin /> : <Navigate to="/shipments" replace />;
}

function NfcAdmin() {
  const { t } = useTranslation();
  const locale = useDateLocale();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [howMany, setHowMany] = useState(10);
  const [productRef, setProductRef] = useState("");
  const [writing, setWriting] = useState<NfcTag | null>(null);

  const { data: tags = [], isLoading, error } = useQuery({ queryKey: NFC_TAGS_QUERY_KEY, queryFn: listTags });
  const refresh = () => queryClient.invalidateQueries({ queryKey: NFC_TAGS_QUERY_KEY });
  const onError = (e: Error) => toast({ title: t("Error"), description: e.message, variant: "destructive" });

  const generate = useMutation({
    mutationFn: () => generateTags(howMany, productRef.trim()),
    onSuccess: (codes) => { refresh(); toast({ title: t("nfc.generated", { count: codes.length }) }); },
    onError,
  });
  const action = useMutation({
    mutationFn: ({ code, kind }: { code: string; kind: "block" | "unblock" | "unlink" }) => tagAction(code, kind),
    onSuccess: refresh,
    onError,
  });
  const ownerLink = useMutation({
    mutationFn: (code: string) => newOwnerLink(code),
    onSuccess: async ({ token }) => {
      const link = `${window.location.origin}/nfc/profilo#${token}`;
      try { await navigator.clipboard.writeText(link); } catch { window.prompt(t("nfc.ownerLink"), link); }
      toast({ title: t("nfc.ownerLinkDone") });
    },
    onError,
  });

  const copy = async (code: string) => {
    try { await navigator.clipboard.writeText(tagUrl(code)); toast({ title: t("nfc.copied") }); } catch { window.prompt(t("nfc.copyUrl"), tagUrl(code)); }
  };
  const when = (d: string | null) => (d ? format(new Date(d), "dd/MM/yy HH:mm", { locale }) : "—");

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={t("nfc.eyebrow")} title={t("nfc.title")} />

      <form className="flex flex-wrap items-end gap-3 p-4 bg-card border border-border rounded-lg"
        onSubmit={(e) => { e.preventDefault(); generate.mutate(); }}>
        <label className="flex flex-col gap-1.5 w-24">
          <span className="eyebrow">{t("nfc.howMany")}</span>
          <Input type="number" min={1} max={100} value={howMany} onChange={(e) => setHowMany(Math.max(1, Math.min(100, Number(e.target.value) || 1)))} />
        </label>
        <label className="flex flex-col gap-1.5 flex-1 min-w-48">
          <span className="eyebrow">{t("nfc.productRef")}</span>
          <Input value={productRef} maxLength={120} onChange={(e) => setProductRef(e.target.value)} />
        </label>
        <Button type="submit" disabled={generate.isPending}>{t("nfc.generate")}</Button>
      </form>
      <p className="text-sm text-muted-foreground -mt-3">{t("nfc.health")}</p>

      {isLoading ? (
        <p className="py-16 text-center text-muted-foreground">…</p>
      ) : error ? (
        <p className="py-16 text-center text-destructive">{(error as Error).message}</p>
      ) : !tags.length ? (
        <p className="py-16 text-center text-muted-foreground">{t("nfc.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-3">
          {tags.map((tag) => (
            <li key={tag.code} className="flex flex-col gap-3 p-4 bg-card border border-border rounded-lg">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <span className="font-mono text-base font-semibold">{tag.code}</span>
                <span className={cn("px-2.5 py-0.5 rounded-full text-xs font-semibold", STATUS_STYLE[tag.status])}>{t(`nfc.status.${tag.status}`)}</span>
                {tag.product_ref && <span className="text-sm text-muted-foreground">{tag.product_ref}</span>}
                <span className="text-sm">{tag.has_owner ? `${t("nfc.owner")}: ${[tag.owner_name, tag.owner_email].filter(Boolean).join(" · ") || "—"}` : ""}</span>
              </div>
              <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-muted-foreground">
                <span>{t("nfc.written")}: {when(tag.written_at)}{tag.chip_uid ? ` · UID ${tag.chip_uid}` : ""}</span>
                <span>{t("nfc.scans")}: {tag.scans}{tag.last_scan ? ` · ${when(tag.last_scan)}` : ""}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant={tag.status === "blank" ? "default" : "outline"} onClick={() => setWriting(tag)}>
                  {tag.status === "blank" ? t("nfc.write") : t("nfc.rewrite")}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => copy(tag.code)}>{t("nfc.copyUrl")}</Button>
                {tag.status === "disabled" ? (
                  <Button size="sm" variant="ghost" onClick={() => action.mutate({ code: tag.code, kind: "unblock" })}>{t("nfc.unblock")}</Button>
                ) : (
                  <Button size="sm" variant="ghost" onClick={() => action.mutate({ code: tag.code, kind: "block" })}>{t("nfc.block")}</Button>
                )}
                {tag.has_owner && (
                  <>
                    <Button size="sm" variant="ghost" onClick={() => window.confirm(t("nfc.ownerLinkConfirm", { code: tag.code })) && ownerLink.mutate(tag.code)}>{t("nfc.ownerLink")}</Button>
                    <Button size="sm" variant="ghost" onClick={() => window.confirm(t("nfc.unlinkConfirm", { code: tag.code })) && action.mutate({ code: tag.code, kind: "unlink" })}>{t("nfc.unlink")}</Button>
                  </>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}

      {writing && <WriteDialog tag={writing} onClose={() => setWriting(null)} onWritten={refresh} />}
    </div>
  );
}
