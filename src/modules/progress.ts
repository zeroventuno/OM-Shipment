import type { HistoryEntry } from "./schema";

/** Depois de quantos dias parado um processo é considerado atrasado. */
export const STALE_AFTER_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Data da última mudança de etapa, lida do histórico. `fields` são os nomes
 * do campo de etapa: o atual ("status", "phase") e o rótulo antigo que o
 * sistema anterior gravava ("Stato", "Fase"). Sem mudança registrada, usa a
 * data de abertura.
 */
export function lastStageChange(
    history: HistoryEntry[] | null | undefined,
    fields: readonly string[],
    openedAt: Date | string,
): Date {
    let latest = new Date(openedAt);
    for (const entry of history ?? []) {
        if (entry.action !== "updated" || !fields.includes(entry.field)) continue;
        const when = new Date(entry.date);
        if (!Number.isNaN(when.getTime()) && when > latest) latest = when;
    }
    return latest;
}

/** Dias inteiros entre a data e agora (nunca negativo). */
export function daysSince(date: Date, now = new Date()): number {
    return Math.max(0, Math.floor((now.getTime() - date.getTime()) / DAY_MS));
}

export interface StageAge {
    /** Desde quando está na etapa atual. */
    since: Date;
    /** Dias na etapa atual. */
    days: number;
    /** Parado há mais de STALE_AFTER_DAYS e ainda não concluído. */
    stale: boolean;
}

export function stageAge(
    history: HistoryEntry[] | null | undefined,
    fields: readonly string[],
    openedAt: Date | string,
    done: boolean,
    now = new Date(),
): StageAge {
    const since = lastStageChange(history, fields, openedAt);
    const days = daysSince(since, now);
    return { since, days, stale: !done && days > STALE_AFTER_DAYS };
}
