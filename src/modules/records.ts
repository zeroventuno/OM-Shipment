import type { HistoryEntry } from "./schema";

/*
 * Utilitários comuns às assistências e às garantias: conversão entre o
 * formato do banco (snake_case, datas em texto) e o do app (camelCase, Date),
 * e o cálculo do histórico de alterações.
 *
 * Esta lógica ficava no servidor Express do antigo OM-Assist; agora o app fala
 * direto com o Supabase e ela roda no navegador.
 */

const toCamelKey = (key: string) => key.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());
const toSnakeKey = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`);

/** Linha do banco → objeto do app. As colunas em `dateColumns` viram Date. */
export function fromRow<T>(row: Record<string, unknown>, dateColumns: readonly string[]): T {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
        const camel = toCamelKey(key);
        out[camel] = dateColumns.includes(camel) && typeof value === "string" ? new Date(value) : value;
    }
    return out as T;
}

/** Objeto do app → linha do banco. Ignora campos `undefined`. */
export function toRow(data: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data)) {
        if (value === undefined) continue;
        out[toSnakeKey(key)] = value instanceof Date ? value.toISOString() : value;
    }
    return out;
}

/** Troca strings vazias por null nos campos opcionais (como fazia o servidor). */
export function emptyToNull<T extends Record<string, unknown>>(data: T, keys: readonly (keyof T)[]): T {
    const out = { ...data };
    for (const key of keys) {
        if (out[key] === "") out[key] = null as T[keyof T];
    }
    return out;
}

const formatValue = (value: unknown): string => {
    if (value === null || value === undefined || value === "") return "-";
    if (value instanceof Date) return value.toISOString();
    return String(value);
};

const formatDateOnly = (value: unknown): string => {
    if (value === null || value === undefined || value === "") return "-";
    if (value instanceof Date) return value.toISOString().split("T")[0];
    if (typeof value === "string" && value.includes("-")) return value.split("T")[0];
    return String(value);
};

export function createdEntry(field: string, now = new Date()): HistoryEntry {
    return { field, oldValue: null, newValue: "Creato", date: now.toISOString(), action: "created" };
}

/**
 * Compara o registro atual com os dados novos e devolve uma entrada de
 * histórico para cada campo que mudou. `field` guarda o nome do campo
 * (ex.: "clientName"); o rótulo traduzido é resolvido na hora de exibir.
 * Campos de data são comparados só pelo dia.
 */
export function diffHistory(
    current: Record<string, unknown>,
    update: Record<string, unknown>,
    dateFields: readonly string[],
    now = new Date(),
): HistoryEntry[] {
    const entries: HistoryEntry[] = [];
    for (const key of Object.keys(update)) {
        if (update[key] === undefined) continue;
        const format = dateFields.includes(key) ? formatDateOnly : formatValue;
        const oldValue = format(current[key]);
        const newValue = format(update[key]);
        if (oldValue !== newValue) {
            entries.push({ field: key, oldValue, newValue, date: now.toISOString(), action: "updated" });
        }
    }
    return entries;
}
