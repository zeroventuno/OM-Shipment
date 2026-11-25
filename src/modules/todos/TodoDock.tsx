import { useEffect, useMemo, useState, useSyncExternalStore, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Check, ChevronDown, ChevronsRight, ListChecks, PanelRight, PictureInPicture2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { ticketAge, ticketsQuery } from "@/modules/assistance/api";
import { warrantiesQuery, warrantyAge } from "@/modules/warranties/api";
import { REQUESTS_QUERY_KEY, listRequests } from "@/modules/requests/api";
import { PICKUP_REQUESTS_QUERY_KEY, listPickupRequests } from "@/modules/pickups/api";
import { SERVICE_REQUESTS_QUERY_KEY, listServiceRequests } from "@/modules/service/api";
import { FERIE_KEY, listEmployees, listLeaves } from "@/modules/ferie/api";
import { myAccessQuery } from "@/modules/access/api";
import { isAreaOn } from "@/modules/access/areas";
import { AUTO_ORDER, TODOS_KEY, addTodo, autoItems, deleteTodo, listTodos, setTodoDone, type AutoKind } from "./api";

/*
 * A pílula do canto, como a do Rentaloop: recolhida mostra quantas coisas
 * faltam; aberta, a lista To Do. Em tela larga pode ficar presa à lateral
 * direita, e aí o sistema abre espaço para ela em vez de ficar por baixo.
 *
 * Em cima, os itens escritos à mão (de cada login). Embaixo, os automáticos:
 * pedidos de envio e de retirada pendentes, férias para decidir e
 * assistências e garantias paradas há mais de 30 dias.
 */

const WIDE = "(min-width: 1280px)";
const LIST_PAGE: Record<AutoKind, string> = {
  request: "/shipments/requests", pickup: "/shipments/pickups", service: "/service-requests", leave: "/ferie", ticket: "/assistance", warranty: "/warranties",
};
const OPEN_KEY = "om-todo-open";
const SIDE_KEY = "om-todo-side";

const read = (k: string) => { try { return window.localStorage.getItem(k); } catch { return null; } };
const save = (k: string, v: string) => { try { window.localStorage.setItem(k, v); } catch { /* sem armazenamento: não lembra */ } };
const subscribeWide = (cb: () => void) => {
  const mq = window.matchMedia(WIDE);
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
};

export function TodoDock({ onDocked }: { onDocked?: (docked: boolean) => void }) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const qc = useQueryClient();
  const enabled = !!session;
  const wide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE).matches, () => false);
  const [open, setOpen] = useState(() => read(OPEN_KEY) === "1");
  const [side, setSide] = useState(() => read(SIDE_KEY) === "1");
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const docked = open && side && wide;

  useEffect(() => { onDocked?.(docked); }, [docked, onDocked]);

  // mesmas consultas do menu: o cache é o mesmo, não pede duas vezes
  const todos = useQuery({ queryKey: TODOS_KEY, queryFn: listTodos, enabled });
  const requests = useQuery({ queryKey: REQUESTS_QUERY_KEY, queryFn: listRequests, enabled, refetchInterval: 120_000 });
  const pickups = useQuery({ queryKey: PICKUP_REQUESTS_QUERY_KEY, queryFn: listPickupRequests, enabled, refetchInterval: 120_000 });
  const services = useQuery({ queryKey: SERVICE_REQUESTS_QUERY_KEY, queryFn: listServiceRequests, enabled, refetchInterval: 120_000 });
  const tickets = useQuery({ ...ticketsQuery, enabled });
  const warranties = useQuery({ ...warrantiesQuery, enabled });
  const leaves = useQuery({ queryKey: [...FERIE_KEY, "leaves"], queryFn: listLeaves, enabled, refetchInterval: 120_000 });
  const employees = useQuery({ queryKey: [...FERIE_KEY, "employees"], queryFn: listEmployees, enabled });

  const access = useQuery({ ...myAccessQuery, enabled }).data;
  const auto = useMemo(() => {
    const now = new Date();
    const items = autoItems({
      requests: requests.data, pickups: pickups.data, services: services.data, leaves: leaves.data, employees: employees.data,
      tickets: (tickets.data ?? []).map((item) => ({ item, age: ticketAge(item, now) })).filter((x) => x.age.stale).map((x) => ({ item: x.item, days: x.age.days })),
      warranties: (warranties.data ?? []).map((item) => ({ item, age: warrantyAge(item, now) })).filter((x) => x.age.stale).map((x) => ({ item: x.item, days: x.age.days })),
    });
    // só o que este login pode abrir (painel Accessi)
    return items.filter((a) => (a.kind === "request" || a.kind === "pickup") ? isAreaOn(access, "spedizioni")
      : a.kind === "service" ? isAreaOn(access, "richieste")
      : a.kind === "ticket" ? isAreaOn(access, "assistenza")
        : a.kind === "warranty" ? isAreaOn(access, "garanzie")
          : !!access && access.ferie !== "none");
  }, [requests.data, pickups.data, services.data, tickets.data, warranties.data, leaves.data, employees.data, access]);

  const refresh = () => qc.invalidateQueries({ queryKey: TODOS_KEY });
  const add = useMutation({ mutationFn: () => addTodo(title, due || null), onSuccess: () => { setTitle(""); setDue(""); refresh(); } });
  const done = useMutation({ mutationFn: ({ id, value }: { id: string; value: boolean }) => setTodoDone(id, value), onSuccess: refresh });
  const remove = useMutation({ mutationFn: (id: string) => deleteTodo(id), onSuccess: refresh });

  if (!enabled) return null;

  const mine = todos.data ?? [];
  const openMine = mine.filter((x) => !x.done_at).sort((a, b) => (a.due_date ?? "9999").localeCompare(b.due_date ?? "9999"));
  const doneMine = mine.filter((x) => x.done_at);
  const total = openMine.length + auto.length;
  const today = new Date().toISOString().slice(0, 10);

  const toggle = (next: boolean) => { setOpen(next); save(OPEN_KEY, next ? "1" : "0"); };
  const toggleSide = () => { setSide(!side); save(SIDE_KEY, side ? "0" : "1"); };
  const onAdd = (e: FormEvent) => { e.preventDefault(); if (title.trim()) add.mutate(); };

  if (!open) {
    return (
      <button type="button" onClick={() => toggle(true)} aria-label={`${t("todo.title")} · ${t("todo.count", { count: total })}`}
        className="fixed bottom-24 right-4 lg:bottom-5 lg:right-5 z-40 inline-flex items-center gap-2 rounded-full bg-primary py-2.5 pl-4 pr-3 text-sm text-primary-foreground shadow-lg transition-transform hover:-translate-y-0.5">
        <ListChecks className="h-4 w-4" aria-hidden="true" />
        <span className="font-semibold">To Do</span>
        {total > 0 && <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-destructive px-1.5 text-[11px] font-bold tabular-nums">{total}</span>}
      </button>
    );
  }

  const headBtn = "inline-flex h-8 w-8 items-center justify-center rounded-full hover:bg-white/10";
  const groups = AUTO_ORDER.map((k) => [k, auto.filter((a) => a.kind === k)] as [AutoKind, typeof auto]).filter(([, l]) => l.length);

  return (
    <aside aria-label={t("todo.title")}
      className={cn("fixed z-40 flex flex-col overflow-hidden bg-background",
        docked ? "inset-y-0 right-0 w-[380px] border-l border-border"
          : "bottom-24 right-4 lg:bottom-5 lg:right-5 max-h-[min(640px,calc(100vh-8rem))] lg:max-h-[min(680px,calc(100vh-2.5rem))] w-[380px] max-w-[calc(100vw-2rem)] rounded-lg border border-border shadow-2xl")}>
      <div className="flex items-center gap-3 bg-primary py-3 pl-4 pr-2 text-primary-foreground">
        <ListChecks className="h-5 w-5 shrink-0" aria-hidden="true" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{t("todo.title")}</p>
          <p className="truncate text-xs opacity-70">{t("todo.count", { count: total })}</p>
        </div>
        {wide && (
          <button type="button" onClick={toggleSide} className={headBtn} aria-pressed={side}
            title={t(side ? "todo.float" : "todo.side")} aria-label={t(side ? "todo.float" : "todo.side")}>
            {side ? <PictureInPicture2 className="h-4 w-4" /> : <PanelRight className="h-4 w-4" />}
          </button>
        )}
        <button type="button" onClick={() => toggle(false)} className={headBtn} title={t("todo.collapse")} aria-label={t("todo.collapse")}>
          {docked ? <ChevronsRight className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4 flex flex-col gap-5">
        <form onSubmit={onAdd} className="flex flex-col gap-2">
          <div className="flex gap-2">
            <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={300} placeholder={t("todo.placeholder")} aria-label={t("todo.placeholder")}
              className="h-10 min-w-0 flex-1 rounded-md border border-input bg-card px-3 text-sm" />
            <button type="submit" disabled={!title.trim() || add.isPending} aria-label={t("todo.add")}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground disabled:opacity-40">
              <Plus className="h-4 w-4" />
            </button>
          </div>
          {title.trim() && (
            <label className="flex items-center gap-2 text-xs text-muted-foreground">
              {t("todo.due")}
              <input type="date" value={due} onChange={(e) => setDue(e.target.value)} className="h-8 rounded-md border border-input bg-card px-2 text-xs" />
            </label>
          )}
        </form>

        <section className="flex flex-col gap-1.5">
          <h3 className="eyebrow">{t("todo.mine")}</h3>
          {openMine.length === 0 && <p className="text-sm text-muted-foreground">{t("todo.mineEmpty")}</p>}
          <ul className="flex flex-col gap-1">
            {openMine.map((x) => (
              <li key={x.id} className="group flex items-start gap-2 rounded-md px-1 py-1 hover:bg-secondary/60">
                <button type="button" onClick={() => done.mutate({ id: x.id, value: true })} aria-label={t("todo.markDone")}
                  className="mt-0.5 h-5 w-5 shrink-0 rounded border border-foreground/50 hover:bg-secondary" />
                <span className="min-w-0 flex-1 text-sm">
                  {x.title}
                  {x.due_date && <span className={cn("ml-1.5 text-xs", x.due_date < today ? "font-semibold text-destructive" : "text-muted-foreground")}>
                    · {new Date(`${x.due_date}T12:00:00`).toLocaleDateString(undefined, { day: "2-digit", month: "2-digit" })}</span>}
                </span>
                <button type="button" onClick={() => remove.mutate(x.id)} aria-label={t("Delete")} className="opacity-0 group-hover:opacity-100 focus:opacity-100 p-0.5 text-muted-foreground hover:text-destructive">
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </li>
            ))}
          </ul>
        </section>

        {groups.map(([kind, list]) => (
          <section key={kind} className="flex flex-col gap-1.5">
            <h3 className="eyebrow">{t(`todo.auto.${kind}`)} · {list.length}</h3>
            <ul className="flex flex-col">
              {list.slice(0, 8).map((a) => (
                <li key={a.key}>
                  <Link to={a.to} onClick={() => { if (!docked) toggle(false); }} className="flex flex-col rounded-md px-2 py-1.5 hover:bg-secondary/60">
                    <span className="truncate text-sm font-medium">{a.title}</span>
                    <span className="truncate text-xs text-muted-foreground">{[a.sub, a.days != null ? t("todo.days", { count: a.days }) : null].filter(Boolean).join(" · ")}</span>
                  </Link>
                </li>
              ))}
              {list.length > 8 && <li><Link to={LIST_PAGE[kind]} className="px-2 text-xs underline">{t("todo.more", { count: list.length - 8 })}</Link></li>}
            </ul>
          </section>
        ))}

        {doneMine.length > 0 && (
          <section className="flex flex-col gap-1.5">
            <h3 className="eyebrow">{t("todo.done")}</h3>
            <ul className="flex flex-col gap-1">
              {doneMine.map((x) => (
                <li key={x.id} className="flex items-start gap-2 px-1 py-0.5 text-sm text-muted-foreground">
                  <button type="button" onClick={() => done.mutate({ id: x.id, value: false })} aria-label={t("todo.reopen")}
                    className="mt-0.5 inline-flex h-5 w-5 shrink-0 items-center justify-center rounded border border-foreground/30 bg-secondary"><Check className="h-3.5 w-3.5" /></button>
                  <span className="line-through">{x.title}</span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </aside>
  );
}
