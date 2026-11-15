import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

/**
 * Cliente único do Supabase para todo o sistema (envios, assistências e
 * garantias usam o mesmo projeto e a mesma sessão de login).
 *
 * Fica `null` quando as variáveis não estão configuradas: o módulo de envios
 * cai para LocalStorage nesse caso (só para teste local).
 */
export const supabase: SupabaseClient | null =
    supabaseUrl && supabaseKey ? createClient(supabaseUrl, supabaseKey) : null;

/** Para os módulos que não têm modo offline: falha com mensagem clara. */
export function requireSupabase(): SupabaseClient {
    if (!supabase) {
        throw new Error('Supabase não configurado (VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY)');
    }
    return supabase;
}
