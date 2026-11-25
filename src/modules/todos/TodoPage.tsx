import { useEffect } from "react";
import { Link } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { Loader2, Monitor } from "lucide-react";
import { InstallHint } from "@/components/InstallHint";
import { TodoBody, useTodoData } from "./TodoDock";

/*
 * O To Do em tela cheia, para o celular (/todo). Posta na tela de início,
 * abre como um app (todo.webmanifest). Mesmo login e mesmas regras do
 * Accessi da pílula do Gestionale.
 */
export default function TodoPage() {
  const { t } = useTranslation();
  const d = useTodoData();
  useEffect(() => { document.title = "To Do · Officine Mattio"; }, []);

  return (
    <div className="min-h-screen bg-background">
      <header className="sticky top-0 z-10 bg-primary text-primary-foreground pt-[env(safe-area-inset-top)]">
        <div className="mx-auto flex max-w-xl items-center justify-between gap-3 px-4 py-4">
          <div className="flex flex-col gap-1.5">
            <img src="/logo.png" alt="Officine Mattio" className="h-5 w-auto invert self-start" />
            <span className="tricolor h-0.5 w-10" aria-hidden="true" />
          </div>
          <div className="text-right">
            <p className="text-base font-semibold">{t("todo.title")}</p>
            <p className="text-xs text-white/70">{t("todo.count", { count: d.total })}</p>
          </div>
        </div>
      </header>
      <main className="mx-auto flex max-w-xl flex-col gap-6 px-4 py-5 pb-[calc(2rem+env(safe-area-inset-bottom))]">
        <InstallHint storageKey="om-pwa-todo-hidden" />
        {d.loading ? <Loader2 className="mx-auto h-6 w-6 animate-spin" /> : <TodoBody d={d} big />}
        <Link to="/shipments" className="flex items-center justify-center gap-2 py-3 text-sm text-muted-foreground underline">
          <Monitor className="h-4 w-4" />{t("todo.openGestionale")}
        </Link>
      </main>
    </div>
  );
}
