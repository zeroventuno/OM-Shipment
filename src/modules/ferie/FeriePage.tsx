import { useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { AlertTriangle, Copy, Mail, MessageCircle, Link2, Loader2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { cn } from "@/lib/utils";
import { Field } from "@/modules/customers/fields";
import { PageHeader } from "../common/PageHeader";
import { myAccessQuery } from "../access/api";
import { LeaveMap } from "./LeaveMap";
import { PeopleChecklist } from "./PeopleChecklist";
import { waMessage, waNumber, waUrl } from "./whatsapp";
import { CanEditProvider, MonthNav, PartPicker, SectorsProvider, useCanEdit, StatusChip, useDuration, useMonthWindow, useSectorName, useSectors } from "./parts";
import {
  FERIE_KEY, addLeave, decideLeave, deleteEvent, ferieLink, listEmployees, listEvents, listLeaves, listVans,
  deleteEmployee, saveEmployee, saveEvent, saveSector, getNameOrder, setNameOrder, saveVan, setEmployeeToken, deleteSector, listSectors,
  type StaffEmployee, type StaffEvent, type StaffLeave, type Van,
} from "./api";
import {
  EVENT_KINDS, absences, displayName, orderedSectors, sectorId, splitName, blockingEvent, conflictsFor, isActive, leaveHours, newLinkToken, parseHours, todayRome, workingDays,
  type DayPart, type EventKind, type NameOrder, type Sector, type SectorInfo,
} from "./logic";
import { LIVE } from "@/lib/live";

type Tab = "map" | "requests" | "agenda" | "people" | "sectors" | "vans";
const select = "h-11 w-full rounded-md border border-input bg-card px-3 text-sm";

/** Ferie e agenda: mapa da equipe, pedidos, agenda, pessoas e furgões. */
export default function FeriePage() {
  const { t } = useTranslation();
  const access = useQuery(myAccessQuery);
  if (access.isLoading) return <p className="py-16 text-center text-muted-foreground">…</p>;
  if (!access.data || access.data.ferie === "none") return <p className="py-16 text-center text-muted-foreground">{t("fe.noAccess")}</p>;
  return <FerieInner canEdit={access.data.ferie === "approve"} />;
}

function FerieInner({ canEdit }: { canEdit: boolean }) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<Tab>("map");
  const employees = useQuery({ queryKey: [...FERIE_KEY, "employees"], queryFn: listEmployees, ...LIVE });
  const leaves = useQuery({ queryKey: [...FERIE_KEY, "leaves"], queryFn: listLeaves, ...LIVE });
  const events = useQuery({ queryKey: [...FERIE_KEY, "events"], queryFn: listEvents, ...LIVE });
  const vans = useQuery({ queryKey: [...FERIE_KEY, "vans"], queryFn: listVans });
  const sectors = useQuery({ queryKey: [...FERIE_KEY, "sectors"], queryFn: listSectors });
  const nameOrder = useQuery({ queryKey: [...FERIE_KEY, "nameOrder"], queryFn: getNameOrder });
  const order = nameOrder.data ?? "first_last";
  // nomes já na ordem escolhida para todas as telas
  const people = useMemo(() => (employees.data ?? []).map((e) => ({ ...e, name: displayName(e, order) }))
    .sort((a, b) => a.name.localeCompare(b.name)), [employees.data, order]);
  const [deciding, setDeciding] = useState<StaffLeave | null>(null);
  const [editingEvent, setEditingEvent] = useState<Partial<StaffEvent> | null>(null);
  const [addingLeave, setAddingLeave] = useState(false);

  const loading = employees.isLoading || leaves.isLoading || events.isLoading || vans.isLoading || sectors.isLoading;
  const error = employees.error || leaves.error || events.error || vans.error || sectors.error;
  const active = people.filter((e) => e.active);
  const waiting = (leaves.data ?? []).filter((l) => l.status === "pending").length;

  const tabs: [Tab, string][] = [
    ["map", t("fe.tab.map")], ["requests", waiting ? `${t("fe.tab.requests")} · ${waiting}` : t("fe.tab.requests")],
    ["agenda", t("fe.tab.agenda")], ["people", t("fe.tab.people")], ["sectors", t("fe.tab.sectors")], ["vans", t("fe.tab.vans")],
  ];

  return (
    <SectorsProvider value={sectors.data ?? []}>
    <CanEditProvider value={canEdit}>
    <div className="flex flex-col gap-6">
      <PageHeader eyebrow={t("fe.eyebrow")} title={t("fe.title")} actions={canEdit && (
        <>
          <Button variant="outline" onClick={() => setAddingLeave(true)} disabled={!active.length}><Plus className="h-4 w-4" />{t("fe.addLeave")}</Button>
          <Button onClick={() => setEditingEvent({ kind: "meeting", start_date: todayRome(), end_date: todayRome(), employee_ids: [] })}><Plus className="h-4 w-4" />{t("fe.newEvent")}</Button>
        </>
      )} />

      {!canEdit && <p className="rounded-md border border-border bg-secondary/50 px-4 py-2.5 text-sm">{t("fe.readOnly")}</p>}

      <div className="flex flex-wrap gap-2" role="tablist">
        {tabs.map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)}
            className={cn("h-9 px-4 rounded-full border text-[11px] font-semibold uppercase tracking-[0.1em]",
              tab === key ? "bg-primary text-primary-foreground border-primary" : "border-border bg-card hover:border-foreground")}>
            {label}
          </button>
        ))}
      </div>

      {loading ? <p className="py-16 text-center text-muted-foreground">…</p>
        : error ? <p className="py-16 text-center text-destructive">{(error as Error).message}</p>
          : tab === "map" ? (
            <MapTab employees={active} leaves={leaves.data!} events={events.data!} vans={vans.data!.filter((v) => v.active)}
              onLeave={canEdit ? (l) => setDeciding(leaves.data!.find((x) => x.id === l.id) ?? null) : undefined}
              onEvent={canEdit ? (ev) => setEditingEvent(events.data!.find((x) => x.id === ev.id) ?? null) : undefined} />
          ) : tab === "requests" ? (
            <RequestsTab employees={people} leaves={leaves.data!} events={events.data!} onDecide={setDeciding} />
          ) : tab === "agenda" ? (
            <AgendaTab events={events.data!} employees={people} vans={vans.data!} onEdit={setEditingEvent} />
          ) : tab === "people" ? (
            <PeopleTab employees={people} leaves={leaves.data!} order={order} />
          ) : tab === "sectors" ? (
            <SectorsTab sectors={sectors.data!} employees={people} />
          ) : <VansTab vans={vans.data!} />}

      {deciding && <DecideDialog leave={deciding} employees={people} leaves={leaves.data!} events={events.data!} onClose={() => setDeciding(null)} />}
      {editingEvent && <EventDialog value={editingEvent} employees={active} vans={(vans.data ?? []).filter((v) => v.active)} onClose={() => setEditingEvent(null)} />}
      {addingLeave && <AddLeaveDialog employees={active} onClose={() => setAddingLeave(false)} />}
    </div>
    </CanEditProvider>
    </SectorsProvider>
  );
}

function useRefresh() {
  const qc = useQueryClient();
  return () => qc.invalidateQueries({ queryKey: FERIE_KEY });
}

function useSave<A>(fn: (a: A) => Promise<unknown>, onDone?: () => void) {
  const { t } = useTranslation();
  const { toast } = useToast();
  const refresh = useRefresh();
  // com a internet lenta, um segundo toque antes da resposta não grava de novo
  const busy = useRef(false);
  return useMutation({
    mutationFn: async (a: A) => {
      if (busy.current) return;
      busy.current = true;
      try { await fn(a); } finally { busy.current = false; }
    },
    onSuccess: () => { refresh(); onDone?.(); toast({ title: t("Saved") }); },
    onError: (e: Error) => toast({ title: t("Error"), description: e.message, variant: "destructive" }),
  });
}

// --- Mapa -------------------------------------------------------------------

function MapTab({ employees, leaves, events, vans, onLeave, onEvent }: {
  employees: StaffEmployee[]; leaves: StaffLeave[]; events: StaffEvent[]; vans: Van[];
  onLeave?: (l: { id: string }) => void; onEvent?: (e: { id: string }) => void;
}) {
  const { t } = useTranslation();
  const win = useMonthWindow(2);
  if (!employees.length) return <p className="py-16 text-center text-muted-foreground">{t("fe.noPeople")}</p>;
  return (
    <div className="flex flex-col gap-3">
      <MonthNav win={win} />
      <LeaveMap from={win.first} days={win.days} today={win.today} employees={employees} leaves={leaves}
        events={events} vans={vans} onLeave={onLeave} onEvent={onEvent} />
      <p className="text-xs text-muted-foreground">{t("fe.map.hint")}</p>
    </div>
  );
}

// --- Pedidos ----------------------------------------------------------------

function useDates() {
  const { i18n } = useTranslation();
  const fmt = (d: string) => new Date(`${d}T12:00:00`).toLocaleDateString(i18n.language, { weekday: "short", day: "2-digit", month: "short", year: "numeric" });
  return (s: string, e: string) => (s === e ? fmt(s) : `${fmt(s)} → ${fmt(e)}`);
}

function Conflicts({ leave, employees, leaves, events }: { leave: StaffLeave; employees: StaffEmployee[]; leaves: StaffLeave[]; events: StaffEvent[] }) {
  const { t } = useTranslation();
  const sn = useSectorName();
  const sectorList = useSectors();
  const span = useDates();
  const person = employees.find((e) => e.id === leave.employee_id);
  if (!person) return null;
  const peers = conflictsFor(person, leave.start_date, leave.end_date, employees.filter((e) => e.active), absences(leaves, events), leave.id);
  const block = blockingEvent(person, leave.start_date, leave.end_date, events);
  if (!peers.length && !block) return <p className="text-xs text-muted-foreground">{t("fe.noConflicts")}</p>;
  return (
    <div className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/5 px-3 py-2 text-xs text-destructive">
      {block && <p className="flex items-center gap-1.5 font-semibold"><AlertTriangle className="h-3.5 w-3.5" />{t("fe.blockedBy", { title: block.title, dates: span(block.start_date, block.end_date) })}</p>}
      {peers.map((p, i) => (
        <p key={i}>
          {t(p.source === "event" ? "fe.conflictAway" : "fe.conflictWith", {
            name: p.employee.name, sector: sn(p.sector), dates: span(p.start_date, p.end_date),
          })}
          {p.viaSecondary && ` (${t("fe.viaSecondary")})`}
        </p>
      ))}
    </div>
  );
}

function RequestsTab({ employees, leaves, events, onDecide }: {
  employees: StaffEmployee[]; leaves: StaffLeave[]; events: StaffEvent[]; onDecide: (l: StaffLeave) => void;
}) {
  const { t } = useTranslation();
  const canEdit = useCanEdit();
  const sn = useSectorName();
  const sectorList = useSectors();
  const span = useDates();
  const duration = useDuration();
  const [filter, setFilter] = useState<"open" | "approved" | "closed">("open");
  const groups = {
    open: leaves.filter((l) => l.status === "pending" || l.status === "proposed").sort((a, b) => a.start_date.localeCompare(b.start_date)),
    approved: leaves.filter((l) => l.status === "approved"),
    closed: leaves.filter((l) => l.status === "rejected" || l.status === "cancelled"),
  };
  const visible = groups[filter];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap gap-2">
        {(["open", "approved", "closed"] as const).map((f) => (
          <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)}
            className={cn("h-8 px-3 rounded-full border text-xs font-semibold", filter === f ? "bg-secondary border-foreground" : "border-border bg-card")}>
            {t(`fe.filter.${f}`)} · {groups[f].length}
          </button>
        ))}
      </div>
      {visible.length === 0 ? <p className="py-12 text-center text-muted-foreground">{t("Nothing here")}</p> : (
        <ul className="flex flex-col gap-3">
          {visible.map((l) => {
            const person = employees.find((e) => e.id === l.employee_id);
            return (
              <li key={l.id} className="flex flex-col gap-2 rounded-lg border border-border bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{person?.name ?? "—"} <span className="text-xs font-normal text-muted-foreground">· {person && sn(person.primary_sector)}</span></p>
                    <p className="text-sm">{span(l.start_date, l.end_date)} · {duration(l)}</p>
                    {l.note && <p className="text-sm text-muted-foreground">“{l.note}”</p>}
                    {l.status === "proposed" && l.proposed_start && <p className="text-sm font-medium">{t("fe.proposedDates", { dates: span(l.proposed_start, l.proposed_end!) })}</p>}
                    {l.response_note && <p className="text-xs text-muted-foreground">{t("fe.response")}: {l.response_note}</p>}
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusChip status={l.status} />
                    {canEdit && <WaButton leave={l} person={person} />}
                    {canEdit && <Button size="sm" variant={l.status === "pending" ? "default" : "outline"} onClick={() => onDecide(l)}>{l.status === "pending" ? t("fe.decide") : t("Edit")}</Button>}
                  </div>
                </div>
                {isActive(l) && <Conflicts leave={l} employees={employees} leaves={leaves} events={events} />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DecideDialog({ leave, employees, leaves, events, onClose }: {
  leave: StaffLeave; employees: StaffEmployee[]; leaves: StaffLeave[]; events: StaffEvent[]; onClose: () => void;
}) {
  const { t } = useTranslation();
  const span = useDates();
  const duration = useDuration();
  const person = employees.find((e) => e.id === leave.employee_id);
  const [note, setNote] = useState(leave.response_note ?? "");
  const [proposing, setProposing] = useState(leave.status === "proposed");
  const [start, setStart] = useState(leave.proposed_start ?? leave.start_date);
  const [end, setEnd] = useState(leave.proposed_end ?? leave.end_date);
  // depois de salvar, o diálogo fica aberto para avisar pelo WhatsApp
  const [saved, setSaved] = useState<StaffLeave | null>(null);
  const save = useSave(async (d: Parameters<typeof decideLeave>[1]) => {
    await decideLeave(leave.id, d);
    setSaved({ ...leave, status: d.status, response_note: d.note?.trim() || null,
      proposed_start: d.status === "proposed" ? d.start : null, proposed_end: d.status === "proposed" ? d.end : null });
  });
  const okDates = !!start && !!end && end >= start;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-2xl font-bold tracking-tight">{person?.name}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip status={leave.status} />
            <span className="text-sm">{span(leave.start_date, leave.end_date)} · {duration(leave)}</span>
          </div>
          {leave.note && <p className="text-sm text-muted-foreground">“{leave.note}”</p>}
          <Conflicts leave={leave} employees={employees} leaves={leaves} events={events} />
          {proposing && (
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label={t("fe.from")}><Input type="date" value={start} onChange={(e) => setStart(e.target.value)} /></Field>
              <Field label={t("fe.to")}><Input type="date" value={end} min={start} onChange={(e) => setEnd(e.target.value)} /></Field>
            </div>
          )}
          <Field label={t("fe.responseNote")}><Textarea rows={2} value={note} onChange={(e) => setNote(e.target.value)} /></Field>
        </div>
        {saved ? (
          <DialogFooter className="flex-wrap items-center gap-2 sm:justify-between">
            <span className="flex items-center gap-2 text-sm font-medium"><StatusChip status={saved.status} />{t("Saved")}</span>
            <div className="flex flex-wrap gap-2">
              {saved.status !== "pending" && <WaButton leave={saved} person={person} size="default" />}
              <Button variant="outline" onClick={onClose}>{t("fe.close")}</Button>
            </div>
          </DialogFooter>
        ) : (
        <DialogFooter className="flex-wrap gap-2">
          {proposing ? (
            <>
              <Button variant="outline" onClick={() => setProposing(false)}>{t("Cancel")}</Button>
              <Button disabled={!okDates || save.isPending} onClick={() => save.mutate({ status: "proposed", start, end, note })}>{t("fe.sendProposal")}</Button>
            </>
          ) : (
            <>
              {leave.status !== "pending" && <Button variant="ghost" onClick={() => save.mutate({ status: "pending", note })}>{t("fe.backToPending")}</Button>}
              <Button variant="outline" className="text-destructive" disabled={save.isPending} onClick={() => save.mutate({ status: "rejected", note })}>{t("fe.reject")}</Button>
              <Button variant="outline" onClick={() => setProposing(true)}>{t("fe.propose")}</Button>
              <Button disabled={save.isPending} onClick={() => save.mutate({ status: "approved", note })}>{save.isPending && <Loader2 className="animate-spin" />}{t("fe.approve")}</Button>
            </>
          )}
        </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}

/** WhatsApp e e-mail da pessoa: acesos se cadastrados (abrem a conversa / o e-mail), apagados se faltam. */
function ContactIcons({ person }: { person: StaffEmployee }) {
  const { t } = useTranslation();
  const number = waNumber(person.phone);
  const email = person.email?.trim();
  // discretos: só o traço do ícone; cadastrado = escuro e clicável, faltando = quase apagado
  const base = "inline-flex h-6 w-6 items-center justify-center rounded";
  return (
    <span className="flex shrink-0 items-center gap-0.5">
      {number ? (
        <a href={`https://wa.me/${number}`} target="_blank" rel="noopener noreferrer" title={`WhatsApp · ${person.phone}`} aria-label={`WhatsApp ${person.name}`}
          className={cn(base, "text-foreground/70 hover:text-foreground hover:bg-secondary")}><MessageCircle className="h-3.5 w-3.5" /></a>
      ) : (
        <span title={t("fe.missingPhone")} aria-label={t("fe.missingPhone")} className={cn(base, "text-muted-foreground/25")}><MessageCircle className="h-3.5 w-3.5" /></span>
      )}
      {email ? (
        <a href={`mailto:${email}`} title={email} aria-label={`E-mail ${person.name}`}
          className={cn(base, "text-foreground/70 hover:text-foreground hover:bg-secondary")}><Mail className="h-3.5 w-3.5" /></a>
      ) : (
        <span title={t("fe.missingEmail")} aria-label={t("fe.missingEmail")} className={cn(base, "text-muted-foreground/25")}><Mail className="h-3.5 w-3.5" /></span>
      )}
    </span>
  );
}

/** Abre o WhatsApp com a resposta pronta para a pessoa (sem celular cadastrado, avisa). */
function WaButton({ leave, person, size = "sm" }: { leave: StaffLeave; person?: StaffEmployee; size?: "sm" | "default" }) {
  const { t } = useTranslation();
  const number = waNumber(person?.phone);
  const first = person?.first_name || person?.name.split(" ")[0] || "";
  const text = waMessage(leave, first, person?.link_token ? ferieLink(person.link_token) : null);
  if (!text || leave.status === "pending") return null;
  if (!number) return <span className="text-xs text-muted-foreground" title={t("fe.noPhoneHint")}>{t("fe.noPhone")}</span>;
  return (
    <Button asChild size={size} variant="outline">
      <a href={waUrl(number, text)} target="_blank" rel="noopener noreferrer"><MessageCircle className="h-4 w-4" />{t("fe.waNotify")}</a>
    </Button>
  );
}

function AddLeaveDialog({ employees, onClose }: { employees: StaffEmployee[]; onClose: () => void }) {
  const { t } = useTranslation();
  const today = todayRome();
  const [f, setF] = useState({ employee_id: employees[0]?.id ?? "", start_date: today, end_date: today, part: "full" as DayPart, hours: "", note: "" });
  const save = useSave(addLeave, onClose);
  const hoursValue = f.part === "full" ? null : parseHours(f.hours);
  const ok = f.employee_id && f.start_date && f.end_date >= f.start_date && (f.part === "full" || f.start_date === f.end_date) && !Number.isNaN(hoursValue);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="text-2xl font-bold tracking-tight">{t("fe.addLeave")}</DialogTitle></DialogHeader>
        <p className="text-sm text-muted-foreground">{t("fe.addLeaveHint")}</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2"><Field label={t("fe.person")}>
            <select className={select} value={f.employee_id} onChange={(e) => setF({ ...f, employee_id: e.target.value })}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </Field></div>
          <Field label={t("fe.from")}><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value, end_date: e.target.value > f.end_date ? e.target.value : f.end_date })} /></Field>
          <Field label={t("fe.to")}><Input type="date" value={f.end_date} min={f.start_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
          <div className="sm:col-span-2"><PartPicker value={f.part} singleDay={f.start_date === f.end_date} onChange={(part) => setF({ ...f, part })} hours={f.hours} onHours={(hours) => setF({ ...f, hours })} /></div>
          <div className="sm:col-span-2"><Field label={t("fe.note")}><Input value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} /></Field></div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>{t("Cancel")}</Button>
          <Button disabled={!ok || save.isPending} onClick={() => save.mutate({ ...f, hours: hoursValue })}>{t("Save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Agenda -----------------------------------------------------------------

function AgendaTab({ events, employees, vans, onEdit }: { events: StaffEvent[]; employees: StaffEmployee[]; vans: Van[]; onEdit: (e: StaffEvent) => void }) {
  const { t } = useTranslation();
  const canEdit = useCanEdit();
  const sn = useSectorName();
  const sectorList = useSectors();
  const span = useDates();
  const today = todayRome();
  const [past, setPast] = useState(false);
  const list = events.filter((e) => (past ? e.end_date < today : e.end_date >= today));
  if (past) list.reverse();
  const bookedBy = (ev: StaffEvent) => ev.booked_by ? ` · ${t("fe.bookedBy", { name: employees.find((e) => e.id === ev.booked_by)?.name ?? "—" })}` : "";
  const who = (ev: StaffEvent) => ev.kind === "van" ? vans.find((v) => v.id === ev.van_id)?.name
    : ev.employee_ids.length ? ev.employee_ids.map((id) => employees.find((e) => e.id === id)?.name).filter(Boolean).join(", ")
      : ev.sector ? sn(ev.sector) : t("fe.everyone");
  return (
    <div className="flex flex-col gap-4">
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={past} onChange={(e) => setPast(e.target.checked)} />{t("fe.showPast")}</label>
      {list.length === 0 ? <p className="py-12 text-center text-muted-foreground">{t("Nothing here")}</p> : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {list.map((ev) => (
            <li key={ev.id}>
              <button type="button" disabled={!canEdit} onClick={() => onEdit(ev)} className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left hover:bg-secondary/50">
                <span className="min-w-0">
                  <span className="block font-semibold">{ev.title}</span>
                  <span className="block text-sm text-muted-foreground">{span(ev.start_date, ev.end_date)}{ev.start_time && ` · ${ev.start_time.slice(0, 5)}${ev.end_time ? `–${ev.end_time.slice(0, 5)}` : ""}`} · {who(ev)}{bookedBy(ev)}</span>
                </span>
                <span className={cn("rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.08em]", ev.kind === "block" ? "bg-destructive/10 text-destructive" : "bg-secondary")}>{t(`fe.kind.${ev.kind}`)}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EventDialog({ value, employees, vans, onClose }: { value: Partial<StaffEvent>; employees: StaffEmployee[]; vans: Van[]; onClose: () => void }) {
  const { t } = useTranslation();
  const sn = useSectorName();
  const sectorList = useSectors();
  const { toast } = useToast();
  const refresh = useRefresh();
  const [f, setF] = useState({
    id: value.id, kind: (value.kind ?? "meeting") as EventKind, title: value.title ?? "",
    start_date: value.start_date ?? todayRome(), end_date: value.end_date ?? value.start_date ?? todayRome(),
    start_time: value.start_time?.slice(0, 5) ?? "", end_time: value.end_time?.slice(0, 5) ?? "",
    sector: (value.sector ?? "") as Sector | "", employee_ids: value.employee_ids ?? [], van_id: value.van_id ?? vans[0]?.id ?? "",
    notes: value.notes ?? "",
  });
  const save = useSave(saveEvent, onClose);
  const remove = useMutation({
    mutationFn: () => deleteEvent(f.id!),
    onSuccess: () => { refresh(); onClose(); },
    onError: (e: Error) => toast({ title: t("Error"), description: e.message, variant: "destructive" }),
  });
  const withSector = f.kind === "block" || f.kind === "meeting";
  const withPeople = f.kind === "meeting" || f.kind === "travel" || f.kind === "external";
  const ok = f.title.trim() && f.start_date && f.end_date >= f.start_date && (f.kind !== "van" || f.van_id)
    && (f.kind !== "travel" && f.kind !== "external" || f.employee_ids.length > 0);

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader><DialogTitle className="text-2xl font-bold tracking-tight">{f.id ? t("fe.editEvent") : t("fe.newEvent")}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="sm:col-span-2 flex flex-wrap gap-2" role="radiogroup" aria-label={t("fe.kindLabel")}>
            {EVENT_KINDS.filter((k) => k !== "van" || vans.length).map((k) => (
              <button key={k} type="button" role="radio" aria-checked={f.kind === k} onClick={() => setF({ ...f, kind: k })}
                className={cn("h-9 rounded-full border px-3 text-sm", f.kind === k ? "border-foreground bg-secondary font-semibold" : "border-border bg-card")}>
                {t(`fe.kind.${k}`)}
              </button>
            ))}
          </div>
          <p className="sm:col-span-2 text-xs text-muted-foreground">{t(`fe.kindHint.${f.kind}`)}</p>
          <div className="sm:col-span-2"><Field label={t("fe.eventTitle")}><Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} placeholder={t(`fe.titleExample.${f.kind}`)} /></Field></div>
          <Field label={t("fe.from")}><Input type="date" value={f.start_date} onChange={(e) => setF({ ...f, start_date: e.target.value, end_date: e.target.value > f.end_date ? e.target.value : f.end_date })} /></Field>
          <Field label={t("fe.to")}><Input type="date" value={f.end_date} min={f.start_date} onChange={(e) => setF({ ...f, end_date: e.target.value })} /></Field>
          <Field label={t("fe.startTime")}><Input type="time" value={f.start_time} onChange={(e) => setF({ ...f, start_time: e.target.value })} /></Field>
          <Field label={t("fe.endTime")}><Input type="time" value={f.end_time} onChange={(e) => setF({ ...f, end_time: e.target.value })} /></Field>
          {withSector && (
            <div className="sm:col-span-2"><Field label={t("fe.sectorLabel")}>
              <select className={select} value={f.sector} onChange={(e) => setF({ ...f, sector: e.target.value as Sector | "" })}>
                <option value="">{t("fe.everyone")}</option>
                {sectorList.filter((x) => x.active || x.id === f.sector).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
              </select>
            </Field></div>
          )}
          {f.kind === "van" && (
            <div className="sm:col-span-2"><Field label={t("fe.van")}>
              <select className={select} value={f.van_id} onChange={(e) => setF({ ...f, van_id: e.target.value })}>
                {vans.map((v) => <option key={v.id} value={v.id}>{v.name}{v.plate ? ` · ${v.plate}` : ""}</option>)}
              </select>
            </Field></div>
          )}
          {withPeople && (
            <div className="sm:col-span-2">
              <PeopleChecklist employees={employees} value={f.employee_ids} onChange={(employee_ids) => setF({ ...f, employee_ids })} sectorName={sn} />
            </div>
          )}
          <div className="sm:col-span-2"><Field label={t("fe.notes")}><Textarea rows={2} value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} /></Field></div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {f.id ? <Button variant="ghost" className="text-destructive" disabled={remove.isPending}
            onClick={() => { if (window.confirm(t("fe.confirmDeleteEvent", { title: f.title }))) remove.mutate(); }}>{t("Delete")}</Button> : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t("Cancel")}</Button>
            <Button disabled={!ok || save.isPending} onClick={() => save.mutate({
              ...f, sector: f.sector || null, van_id: f.van_id || null, start_time: f.start_time || null, end_time: f.end_time || null, notes: f.notes,
            })}>{t("Save")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Pessoas ----------------------------------------------------------------

function PeopleTab({ employees, leaves, order }: { employees: StaffEmployee[]; leaves: StaffLeave[]; order: NameOrder }) {
  const { t } = useTranslation();
  const canEdit = useCanEdit();
  const sn = useSectorName();
  const sectorList = useSectors();
  const { toast } = useToast();
  const [editing, setEditing] = useState<Partial<StaffEmployee> | null>(null);
  const year = todayRome().slice(0, 4);
  const used = useMemo(() => {
    const m = new Map<string, number>();
    const h = new Map<string, number>();
    for (const l of leaves) if (l.status === "approved" && l.start_date.startsWith(year)) {
      m.set(l.employee_id, (m.get(l.employee_id) ?? 0) + workingDays(l));
      if (leaveHours(l)) h.set(l.employee_id, (h.get(l.employee_id) ?? 0) + leaveHours(l));
    }
    return { days: m, hours: h };
  }, [leaves, year]);
  const link = useSave(({ id, token }: { id: string; token: string | null }) => setEmployeeToken(id, token));
  const setOrder = useSave(setNameOrder);
  const copy = async (token: string) => {
    try { await navigator.clipboard.writeText(ferieLink(token)); toast({ title: t("Copied") }); } catch { window.prompt(t("fe.copyHint"), ferieLink(token)); }
  };
  const sectorOrder = orderedSectors(sectorList, employees);
  const sorted = [...employees].sort((a, b) => Number(b.active) - Number(a.active) || sectorOrder.indexOf(a.primary_sector) - sectorOrder.indexOf(b.primary_sector) || a.name.localeCompare(b.name));
  // um grupo por setor principal (ativos) e, no fim, os desativados
  const groups: [string, string, StaffEmployee[]][] = [
    ...sectorOrder.map((s) => [s, sn(s), sorted.filter((e) => e.active && e.primary_sector === s)] as [string, string, StaffEmployee[]]),
    ["inactive", t("fe.inactive"), sorted.filter((e) => !e.active)] as [string, string, StaffEmployee[]],
  ].filter(([, , l]) => l.length > 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">{t("fe.peopleHint")}</p>
        {canEdit && <Button onClick={() => setEditing({ active: true })}><Plus className="h-4 w-4" />{t("fe.newPerson")}</Button>}
      </div>
      <div className="flex flex-wrap items-center gap-2 text-sm" role="radiogroup" aria-label={t("fe.nameOrder")}>
        <span className="eyebrow mr-1">{t("fe.nameOrder")}</span>
        {(["first_last", "last_first"] as const).map((o) => (
          <button key={o} type="button" role="radio" aria-checked={order === o} disabled={!canEdit || setOrder.isPending} onClick={() => order !== o && setOrder.mutate(o)}
            className={cn("h-8 rounded-full border px-3", order === o ? "border-foreground bg-secondary font-semibold" : "border-border bg-card")}>
            {t(`fe.order.${o}`)}
          </button>
        ))}
      </div>
      {sorted.length === 0 ? <p className="py-12 text-center text-muted-foreground">{t("fe.noPeople")}</p> : (
        <div className="flex flex-col gap-5">
          {groups.map(([key, title, list]) => (
            <section key={key} className="flex flex-col gap-2">
              {/* faixa do setor: separa os grupos de nomes */}
              <h3 className="flex items-center gap-2 border-l-4 border-foreground pl-2 text-xs font-bold uppercase tracking-[0.12em]">
                {title}<span className="font-semibold text-muted-foreground tabular-nums">· {list.length}</span>
              </h3>
              <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
                {list.map((e) => (
                  <li key={e.id} className={cn("flex flex-wrap items-center justify-between gap-3 px-4 py-3", !e.active && "opacity-50")}>
                    <div className="flex min-w-0 items-center gap-3">
                      <ContactIcons person={e} />
                      <button type="button" className="min-w-0 text-left" disabled={!canEdit} onClick={() => setEditing(e)}>
                        <span className="block font-semibold hover:underline">{e.name}</span>
                        <span className="block text-sm text-muted-foreground">
                          {e.secondary_sector ? `+ ${sn(e.secondary_sector)} · ` : ""}
                          {t("fe.usedThisYear", { count: used.days.get(e.id) ?? 0, year })}{used.hours.get(e.id) ? ` + ${t("fe.permitHours", { count: used.hours.get(e.id), n: String(used.hours.get(e.id)).replace(".", ",") })}` : ""}
                        </span>
                      </button>
                    </div>
                    {e.active && (
                      <div className="flex flex-wrap gap-2">
                        {e.link_token ? (
                          <>
                            <Button size="sm" variant="outline" onClick={() => copy(e.link_token!)}><Copy className="h-3.5 w-3.5" />{t("fe.copyLink")}</Button>
                            {canEdit && <Button size="sm" variant="ghost" onClick={() => { if (window.confirm(t("fe.confirmNewLink", { name: e.name }))) link.mutate({ id: e.id, token: newLinkToken() }); }}>{t("fe.newLink")}</Button>}
                          </>
                        ) : canEdit ? (
                          <Button size="sm" onClick={() => link.mutate({ id: e.id, token: newLinkToken() })}><Link2 className="h-3.5 w-3.5" />{t("fe.createLink")}</Button>
                        ) : null}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}
      {editing && <PersonDialog value={editing} others={employees} onClose={() => setEditing(null)} />}
    </div>
  );
}

function PersonDialog({ value, others, onClose }: { value: Partial<StaffEmployee>; others: StaffEmployee[]; onClose: () => void }) {
  const { t } = useTranslation();
  const sn = useSectorName();
  const sectorList = useSectors();
  const [f, setF] = useState({
    id: value.id,
    // ficha antiga só com "name": sugere a separação, que só grava ao salvar
    ...(value.first_name || value.last_name
      ? { first_name: value.first_name ?? "", last_name: value.last_name ?? "" }
      : splitName(value.name ?? "")),
    email: value.email ?? "", phone: value.phone ?? "", primary_sector: (value.primary_sector ?? sectorList.find((x) => x.active)?.id ?? "") as Sector,
    secondary_sector: (value.secondary_sector ?? "") as Sector | "", active: value.active ?? true,
  });
  const save = useSave(saveEmployee, onClose);
  const remove = useSave(deleteEmployee, onClose);
  // mesmo nome já cadastrado (ex.: salvou duas vezes com a internet lenta)
  const full = `${f.first_name} ${f.last_name}`.trim().toLowerCase();
  const twin = !f.id && !!full && others.some((o) => [o.first_name, o.last_name].filter(Boolean).join(" ").toLowerCase() === full || o.name.toLowerCase() === full
    || [o.last_name, o.first_name].filter(Boolean).join(" ").toLowerCase() === full);
  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader><DialogTitle className="text-2xl font-bold tracking-tight">{f.id ? value.name : t("fe.newPerson")}</DialogTitle></DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label={t("fe.firstName")}><Input value={f.first_name} autoComplete="off" onChange={(e) => setF({ ...f, first_name: e.target.value })} /></Field>
          <Field label={t("fe.lastName")}><Input value={f.last_name} autoComplete="off" onChange={(e) => setF({ ...f, last_name: e.target.value })} /></Field>
          {twin && <p className="sm:col-span-2 -mt-1 text-xs font-medium text-destructive">{t("fe.duplicateName")}</p>}
          <Field label="E-mail" hint={t("fe.emailHint")}><Input type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
          <Field label={t("fe.phone")} hint={t("fe.phoneHint")}><Input type="tel" inputMode="tel" value={f.phone} placeholder="+39 347 123 4567" onChange={(e) => setF({ ...f, phone: e.target.value })} /></Field>
          <Field label={t("fe.primarySector")}>
            <select className={select} value={f.primary_sector} onChange={(e) => {
              const s = e.target.value as Sector;
              setF({ ...f, primary_sector: s, secondary_sector: f.secondary_sector === s ? "" : f.secondary_sector });
            }}>
              {sectorList.filter((x) => x.active || x.id === f.primary_sector).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          <Field label={t("fe.secondarySector")}>
            <select className={select} value={f.secondary_sector} onChange={(e) => setF({ ...f, secondary_sector: e.target.value as Sector | "" })}>
              <option value="">—</option>
              {sectorList.filter((x) => x.id !== f.primary_sector && (x.active || x.id === f.secondary_sector)).map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
            </select>
          </Field>
          {f.id && <label className="sm:col-span-2 flex items-center gap-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} />{t("fe.activeHint")}</label>}
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {f.id ? (
            <Button variant="ghost" className="text-destructive" disabled={remove.isPending}
              onClick={() => { if (window.confirm(t("fe.confirmDeletePerson", { name: value.name }))) remove.mutate(f.id!); }}>
              {t("Delete")}
            </Button>
          ) : <span />}
          <div className="flex gap-2">
            <Button variant="outline" onClick={onClose}>{t("Cancel")}</Button>
            <Button disabled={!(f.first_name.trim() || f.last_name.trim()) || !f.primary_sector || save.isPending} onClick={() => save.mutate({
              ...f, secondary_sector: f.secondary_sector || null,
              // desativar também desliga o link
              ...(f.id && !f.active ? { link_token: null } : {}),
            })}>{t("Save")}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Setores ---------------------------------------------------------------

function SectorsTab({ sectors, employees }: { sectors: SectorInfo[]; employees: StaffEmployee[] }) {
  const { t } = useTranslation();
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState<(SectorInfo & { isNew?: boolean }) | null>(null);
  const save = useSave(({ s, isNew }: { s: SectorInfo; isNew: boolean }) => saveSector(s, isNew), () => setEditing(null));
  const remove = useSave(deleteSector, () => setEditing(null));
  const count = (id: string) => employees.filter((e) => e.primary_sector === id || e.secondary_sector === id).length;
  const sorted = [...sectors].sort((a, b) => a.sort_order - b.sort_order || a.name.localeCompare(b.name));
  const next = (sorted.at(-1)?.sort_order ?? 0) + 10;
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground max-w-2xl">{t("fe.sectorsHint")}</p>
        {canEdit && <Button onClick={() => setEditing({ id: "", name: "", sort_order: next, active: true, isNew: true })}><Plus className="h-4 w-4" />{t("fe.newSector")}</Button>}
      </div>
      <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
        {sorted.map((s) => (
          <li key={s.id}>
            <button type="button" disabled={!canEdit} onClick={() => setEditing(s)} className={cn("flex w-full items-center justify-between px-4 py-3 text-left hover:bg-secondary/50", !s.active && "opacity-50")}>
              <span className="font-semibold">{s.name}</span>
              <span className="text-sm text-muted-foreground">{t("fe.sectorPeople", { count: count(s.id) })}</span>
            </button>
          </li>
        ))}
      </ul>
      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="text-2xl font-bold tracking-tight">{editing.isNew ? t("fe.newSector") : editing.name}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <Field label={t("fe.name")}><Input value={editing.name} maxLength={60} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Abbigliamento / E-commerce" /></Field>
              <Field label={t("fe.sortOrder")} hint={t("fe.sortOrderHint")}><Input type="number" value={editing.sort_order} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) || 0 })} /></Field>
              {!editing.isNew && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.active} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />{t("fe.sectorActive")}</label>}
            </div>
            <DialogFooter className="gap-2 sm:justify-between">
              {!editing.isNew ? (
                <Button variant="ghost" className="text-destructive" disabled={count(editing.id) > 0 || remove.isPending}
                  title={count(editing.id) > 0 ? t("fe.sectorInUse") : undefined}
                  onClick={() => { if (window.confirm(t("fe.confirmDelete", { title: editing.name }))) remove.mutate(editing.id); }}>{t("Delete")}</Button>
              ) : <span />}
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setEditing(null)}>{t("Cancel")}</Button>
                <Button disabled={!editing.name.trim() || save.isPending} onClick={() => save.mutate({
                  s: { ...editing, id: editing.isNew ? sectorId(editing.name, sectors.map((x) => x.id)) : editing.id }, isNew: !!editing.isNew,
                })}>{t("Save")}</Button>
              </div>
            </DialogFooter>
            {!editing.isNew && count(editing.id) > 0 && <p className="text-xs text-muted-foreground">{t("fe.sectorInUse")}</p>}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

// --- Furgões ----------------------------------------------------------------

function VansTab({ vans }: { vans: Van[] }) {
  const { t } = useTranslation();
  const canEdit = useCanEdit();
  const [editing, setEditing] = useState<Partial<Van> | null>(null);
  const save = useSave(saveVan, () => setEditing(null));
  return (
    <div className="flex flex-col gap-4">
      {canEdit && <div className="flex justify-end"><Button onClick={() => setEditing({ name: "", active: true, sort_order: vans.length })}><Plus className="h-4 w-4" />{t("fe.newVan")}</Button></div>}
      {vans.length === 0 ? <p className="py-12 text-center text-muted-foreground">{t("fe.noVans")}</p> : (
        <ul className="flex flex-col divide-y divide-border rounded-lg border border-border bg-card">
          {vans.map((v) => (
            <li key={v.id}>
              <button type="button" disabled={!canEdit} onClick={() => setEditing(v)} className={cn("flex w-full items-center justify-between px-4 py-3 text-left hover:bg-secondary/50", !v.active && "opacity-50")}>
                <span className="font-semibold">{v.name}</span>
                <span className="text-sm text-muted-foreground">{v.plate}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {editing && (
        <Dialog open onOpenChange={(o) => !o && setEditing(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader><DialogTitle className="text-2xl font-bold tracking-tight">{editing.id ? editing.name : t("fe.newVan")}</DialogTitle></DialogHeader>
            <div className="grid gap-3">
              <Field label={t("fe.name")}><Input value={editing.name ?? ""} onChange={(e) => setEditing({ ...editing, name: e.target.value })} placeholder="Ducato bianco" /></Field>
              <Field label={t("fe.plate")}><Input value={editing.plate ?? ""} onChange={(e) => setEditing({ ...editing, plate: e.target.value })} /></Field>
              {editing.id && <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={editing.active ?? true} onChange={(e) => setEditing({ ...editing, active: e.target.checked })} />{t("fe.vanActive")}</label>}
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setEditing(null)}>{t("Cancel")}</Button>
              <Button disabled={!editing.name?.trim() || save.isPending} onClick={() => save.mutate({ ...editing, name: editing.name! })}>{t("Save")}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}

