import type { MyAccess } from "./api";

/*
 * Áreas que o administrador liga e desliga por login (painel Accessi).
 * O que não está desligado fica ligado. Ferie tem níveis à parte.
 */

export const AREA_KEYS = ["spedizioni", "assistenza", "garanzie", "richieste", "clienti", "referenti", "report"] as const;
export type AreaKey = (typeof AREA_KEYS)[number];

/** Começo do endereço de cada área. */
export const AREA_PATHS: Record<AreaKey, string> = {
  spedizioni: "/shipments",
  assistenza: "/assistance",
  garanzie: "/warranties",
  richieste: "/service-requests",
  clienti: "/customers",
  referenti: "/contacts",
  report: "/report",
};

export const isAreaOn = (access: Pick<MyAccess, "areas"> | undefined, key: AreaKey) => access?.areas?.[key] !== false;

/** Área a que um endereço pertence (ou null se não for uma delas). */
export function areaForPath(pathname: string): AreaKey | null {
  return AREA_KEYS.find((k) => pathname === AREA_PATHS[k] || pathname.startsWith(`${AREA_PATHS[k]}/`)) ?? null;
}

/** Primeira página que o login pode abrir (para o início e para redirecionar). */
export function firstAllowedPath(access: MyAccess | undefined): string {
  const key = AREA_KEYS.find((k) => k !== "report" && isAreaOn(access, k));
  if (key) return AREA_PATHS[key];
  if (access && access.ferie !== "none") return "/ferie";
  return "/no-access";
}
