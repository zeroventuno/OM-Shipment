import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { useTranslation } from "react-i18next";
import { Bell, BellOff } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { REQUESTS_QUERY_KEY, listRequests } from "@/modules/requests/api";
import { PICKUP_REQUESTS_QUERY_KEY, listPickupRequests } from "@/modules/pickups/api";
import { SERVICE_REQUESTS_QUERY_KEY, listServiceRequests } from "@/modules/service/api";
import { FERIE_KEY, listEmployees, listLeaves } from "@/modules/ferie/api";
import { myAccessQuery } from "@/modules/access/api";
import { isAreaOn } from "@/modules/access/areas";
import { diffNews, type NewsItem } from "./news";

/*
 * Notificações do navegador (aparecem no Mac como as outras) quando chega um
 * pedido novo: envio, retirada, pedido de cliente (garantia/assistência) e
 * férias. Funciona com o Gestionale aberto numa aba, mesmo em segundo plano.
 * Cada login só recebe o que pode abrir (painel Accessi).
 */

const ON_KEY = "om-notify-on";
const seenKey = (uid: string) => `om-notify-seen-${uid}`;
const POLL = 60_000;
const CHANGE = "om-notify-change";

const read = (k: string) => { try { return localStorage.getItem(k); } catch { return null; } };
const save = (k: string, v: string) => { try { localStorage.setItem(k, v); } catch { /* sem armazenamento */ } };
const supported = () => typeof window !== "undefined" && "Notification" in window;

/*
 * Sino curto tocado pela própria aba quando chega um aviso. O Brave e o Chrome no
 * Mac mostram as notificações de sites sem som, mesmo com o som ligado no sistema.
 * O navegador só deixa tocar depois de um clique na página: o contexto de áudio é
 * criado (e destravado) no primeiro clique, e o som sai a partir daí.
 */
let audio: AudioContext | null = null;
const unlockAudio = () => {
  try {
    audio ??= new AudioContext();
    if (audio.state === "suspended") void audio.resume();
  } catch { /* sem Web Audio */ }
};
export function playChime() {
  try {
    unlockAudio();
    if (!audio || audio.state !== "running") return;
    const t0 = audio.currentTime;
    // duas notas (lá e mi), cada uma com ataque rápido e queda suave
    [[880, 0], [1318.5, 0.14]].forEach(([freq, at]) => {
      const osc = audio!.createOscillator();
      const gain = audio!.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + at);
      gain.gain.exponentialRampToValueAtTime(0.25, t0 + at + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + at + 0.6);
      osc.connect(gain).connect(audio!.destination);
      osc.start(t0 + at);
      osc.stop(t0 + at + 0.65);
    });
  } catch { /* sem Web Audio */ }
}

/** Liga/desliga, com o pedido de permissão do navegador. */
export function useNotifySwitch() {
  const { t } = useTranslation();
  const SAMPLE_TITLE = () => t("nt.readyTitle");
  const SAMPLE_BODY = () => t("nt.readyBody");
  const [on, setOn] = useState(() => supported() && read(ON_KEY) === "1" && Notification.permission === "granted");
  const [denied, setDenied] = useState(() => supported() && Notification.permission === "denied");
  const toggle = async () => {
    if (!supported()) return;
    if (on) { setOn(false); save(ON_KEY, "0"); window.dispatchEvent(new Event(CHANGE)); return; }
    const p = Notification.permission === "granted" ? "granted" : await Notification.requestPermission();
    setDenied(p === "denied");
    if (p === "granted") {
      // recomeça do zero: o que já existe agora não vira aviso
      try { Object.keys(localStorage).filter((k) => k.startsWith("om-notify-seen-")).forEach((k) => localStorage.removeItem(k)); } catch { /* sem armazenamento */ }
      setOn(true); save(ON_KEY, "1"); window.dispatchEvent(new Event(CHANGE));
      new Notification(SAMPLE_TITLE(), { body: SAMPLE_BODY(), icon: "/apple-touch-icon.png" });
      playChime();
    }
  };
  return { on, denied, toggle, supported: supported() };
}

export function NotifyButton({ className, light = false }: { className?: string; light?: boolean }) {
  const { t } = useTranslation();
  const { on, denied, toggle, supported: ok } = useNotifySwitch();
  if (!ok) return null;
  return (
    <button type="button" onClick={toggle} aria-pressed={on} title={denied ? t("nt.deniedHint") : undefined}
      className={cn("w-full flex items-center justify-center gap-2 h-10 rounded-full border text-[11px] font-semibold uppercase tracking-[0.12em]",
        light
          ? (on ? "border-primary bg-primary text-primary-foreground" : "border-border text-foreground hover:border-foreground")
          : (on ? "border-white bg-white text-primary" : "border-white/25 text-white/80 hover:text-white hover:border-white"), className)}>
      {on ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
      {t(on ? "nt.on" : denied ? "nt.denied" : "nt.off")}
    </button>
  );
}

/** Fica montado no layout: confere a cada minuto e avisa o que for novo. */
export function Notifier() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { session, user } = useAuth();
  // o botão do menu avisa quando liga ou desliga
  const [, bump] = useState(0);
  useEffect(() => {
    const f = () => bump((x) => x + 1);
    window.addEventListener(CHANGE, f);
    return () => window.removeEventListener(CHANGE, f);
  }, []);
  const enabled = !!session && supported() && read(ON_KEY) === "1" && Notification.permission === "granted";
  const access = useQuery({ ...myAccessQuery, enabled: !!session }).data;
  const ship = enabled && isAreaOn(access, "spedizioni");
  const svc = enabled && isAreaOn(access, "richieste");
  const fer = enabled && !!access && access.ferie !== "none";
  const requests = useQuery({ queryKey: REQUESTS_QUERY_KEY, queryFn: listRequests, enabled: ship, refetchInterval: POLL, refetchIntervalInBackground: true });
  const pickups = useQuery({ queryKey: PICKUP_REQUESTS_QUERY_KEY, queryFn: listPickupRequests, enabled: ship, refetchInterval: POLL, refetchIntervalInBackground: true });
  const service = useQuery({ queryKey: SERVICE_REQUESTS_QUERY_KEY, queryFn: listServiceRequests, enabled: svc, refetchInterval: POLL, refetchIntervalInBackground: true });
  const leaves = useQuery({ queryKey: [...FERIE_KEY, "leaves"], queryFn: listLeaves, enabled: fer, refetchInterval: POLL, refetchIntervalInBackground: true });
  const employees = useQuery({ queryKey: [...FERIE_KEY, "employees"], queryFn: listEmployees, enabled: fer });
  const ready = useRef(false);

  // destrava o som no primeiro clique da sessão (exigência dos navegadores)
  useEffect(() => {
    if (!enabled) return;
    window.addEventListener("pointerdown", unlockAudio, { once: true });
    return () => window.removeEventListener("pointerdown", unlockAudio);
  }, [enabled]);

  useEffect(() => {
    if (!enabled || !user || !access) return;
    // espera as listas que vão ser usadas carregarem, para a primeira passada marcar tudo como visto
    if ((ship && (!requests.data || !pickups.data)) || (svc && !service.data) || (fer && (!leaves.data || !employees.data))) return;
    const items: NewsItem[] = [];
    if (ship) {
      for (const r of requests.data ?? []) if (r.status === "pending")
        items.push({ key: `r${r.id}`, title: t("nt.request"), body: [r.customer?.name, r.requested_by].filter(Boolean).join(" · "), to: "/shipments/requests" });
      for (const p of pickups.data ?? []) if (p.status === "new")
        items.push({ key: `p${p.id}`, title: t("nt.pickup"), body: [p.shop_name, p.city].filter(Boolean).join(" · "), to: "/shipments/pickups" });
    }
    if (svc) for (const s of service.data ?? []) if (s.status === "new")
      items.push({ key: `s${s.id}`, title: t("nt.service"), body: [s.customer_name, s.product].filter(Boolean).join(" · "), to: "/service-requests" });
    if (fer) for (const l of leaves.data ?? []) if (l.status === "pending") {
      const name = employees.data?.find((e) => e.id === l.employee_id)?.name ?? "";
      const d = (x: string) => x.slice(8, 10) + "/" + x.slice(5, 7);
      items.push({ key: `l${l.id}`, title: t("nt.leave"), body: `${name} · ${l.start_date === l.end_date ? d(l.start_date) : `${d(l.start_date)}–${d(l.end_date)}`}`, to: "/ferie" });
    }
    const raw = read(seenKey(user.id));
    const { notify, seen } = diffNews(items, raw ? JSON.parse(raw) : null);
    save(seenKey(user.id), JSON.stringify(seen));
    ready.current = true;
    if (notify.length) playChime();
    for (const n of notify.slice(0, 5)) {
      const note = new Notification(n.title, { body: n.body, icon: "/apple-touch-icon.png", tag: n.key });
      note.onclick = () => { window.focus(); navigate(n.to); note.close(); };
    }
  }, [enabled, user, access, ship, svc, fer, requests.data, pickups.data, service.data, leaves.data, employees.data, navigate, t]);

  return null;
}
