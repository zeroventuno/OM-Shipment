import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Download, Share, X } from "lucide-react";
import { cn } from "@/lib/utils";

/*
 * Convite para pôr a página na tela de início do celular (vira um app).
 * Android/Chrome: botão Installa (evento beforeinstallprompt). iPhone:
 * explica Condividi → Aggiungi alla schermata Home. Some quando já está
 * aberta como app ou quando a pessoa fecha o aviso.
 */

type PromptEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

const standalone = () =>
  window.matchMedia?.("(display-mode: standalone)").matches || (navigator as Navigator & { standalone?: boolean }).standalone === true;
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const mobile = () => isIos() || /android/i.test(navigator.userAgent);

export function InstallHint({ storageKey, className }: { storageKey: string; className?: string }) {
  const { t } = useTranslation();
  const [prompt, setPrompt] = useState<PromptEvent | null>(null);
  const [hidden, setHidden] = useState(() => { try { return localStorage.getItem(storageKey) === "1"; } catch { return false; } });

  useEffect(() => {
    const f = (e: Event) => { e.preventDefault(); setPrompt(e as PromptEvent); };
    window.addEventListener("beforeinstallprompt", f);
    return () => window.removeEventListener("beforeinstallprompt", f);
  }, []);

  if (hidden || standalone() || (!prompt && !mobile())) return null;
  const close = () => { setHidden(true); try { localStorage.setItem(storageKey, "1"); } catch { /* sem armazenamento */ } };

  return (
    <div role="note" className={cn("flex items-start gap-3 rounded-lg border border-border bg-card p-4 text-sm", className)}>
      {isIos() ? <Share className="mt-0.5 h-5 w-5 shrink-0" /> : <Download className="mt-0.5 h-5 w-5 shrink-0" />}
      <div className="min-w-0 flex-1">
        <p className="font-semibold">{t("pwa.title")}</p>
        <p className="text-muted-foreground">{t(isIos() ? "pwa.ios" : "pwa.android")}</p>
        {prompt && (
          <button type="button" className="mt-2 h-10 rounded-full bg-primary px-4 text-sm font-semibold text-primary-foreground"
            onClick={async () => { await prompt.prompt(); await prompt.userChoice; setPrompt(null); close(); }}>
            {t("pwa.install")}
          </button>
        )}
      </div>
      <button type="button" onClick={close} aria-label={t("pwa.dismiss")} className="p-1 text-muted-foreground hover:text-foreground"><X className="h-4 w-4" /></button>
    </div>
  );
}
