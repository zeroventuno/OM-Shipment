import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Loader2, ShieldCheck } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { PageHeader } from "../common/PageHeader";
import { ACCESS_LIST_KEY, FERIE_LEVELS, MY_ACCESS_KEY, listAccess, myAccessQuery, setAccess, type FerieLevel } from "./api";

/** Painel de acessos: quem vê e quem aprova em Ferie. Só para o administrador. */
export default function AccessPage() {
  const { data: me, isLoading } = useQuery(myAccessQuery);
  if (isLoading) return <p className="py-16 text-center text-muted-foreground">…</p>;
  return me?.admin ? <AccessPanel /> : <Navigate to="/shipments" replace />;
}

function AccessPanel() {
  const { t, i18n } = useTranslation();
  const { toast } = useToast();
  const qc = useQueryClient();
  const users = useQuery({ queryKey: ACCESS_LIST_KEY, queryFn: listAccess });
  const save = useMutation({
    mutationFn: ({ id, level }: { id: string; level: FerieLevel }) => setAccess(id, level),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ACCESS_LIST_KEY });
      qc.invalidateQueries({ queryKey: MY_ACCESS_KEY });
      qc.invalidateQueries({ queryKey: ["ferie"] });
      toast({ title: t("Saved") });
    },
    onError: (e: Error) => toast({ title: t("Error"), description: e.message, variant: "destructive" }),
  });

  return (
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={t("acc.eyebrow")} title={t("acc.title")} />
      <p className="max-w-3xl text-sm text-muted-foreground">{t("acc.intro")}</p>
      <ul className="max-w-3xl text-sm flex flex-col gap-1">
        {FERIE_LEVELS.map((l) => <li key={l}><span className="font-semibold">{t(`acc.level.${l}`)}</span>: {t(`acc.levelHint.${l}`)}</li>)}
      </ul>

      {users.isLoading ? <p className="py-12 text-center text-muted-foreground">…</p>
        : users.error ? <p className="py-12 text-center text-destructive">{(users.error as Error).message}</p> : (
          <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
            {users.data!.map((u) => (
              <li key={u.user_id} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                <span className="min-w-0">
                  <span className="flex items-center gap-1.5 font-semibold">
                    {u.email}
                    {u.admin && <span title={t("acc.admin")} className="inline-flex items-center gap-1 rounded-full bg-secondary px-2 py-0.5 text-[11px] font-semibold"><ShieldCheck className="h-3 w-3" />{t("acc.admin")}</span>}
                  </span>
                  <span className="block text-xs text-muted-foreground">
                    {u.last_sign_in_at ? t("acc.lastSignIn", { date: new Date(u.last_sign_in_at).toLocaleDateString(i18n.language) }) : t("acc.neverSignedIn")}
                  </span>
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  <span className="eyebrow">{t("nav.ferie")}</span>
                  <span role="radiogroup" aria-label={`${t("nav.ferie")} · ${u.email}`} className="inline-flex rounded-full border border-border bg-background p-0.5">
                    {FERIE_LEVELS.map((l) => (
                      <button key={l} type="button" role="radio" aria-checked={u.ferie === l} disabled={save.isPending}
                        onClick={() => u.ferie !== l && save.mutate({ id: u.user_id, level: l })}
                        className={cn("h-8 rounded-full px-3 text-xs font-semibold", u.ferie === l ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground")}>
                        {t(`acc.level.${l}`)}
                      </button>
                    ))}
                  </span>
                  {save.isPending && save.variables?.id === u.user_id && <Loader2 className="h-4 w-4 animate-spin" />}
                </span>
              </li>
            ))}
          </ul>
        )}
      <p className="max-w-3xl text-xs text-muted-foreground">{t("acc.nfc")}</p>
    </div>
  );
}
