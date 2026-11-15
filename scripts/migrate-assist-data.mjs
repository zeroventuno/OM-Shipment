#!/usr/bin/env node
/**
 * Copia as Assistências (tickets) e Garantias (warranties) do banco antigo do
 * OM-Assist para o banco do OM-Shipment, que passa a ser o banco único.
 *
 * Também copia as fotos das garantias do bucket `warranty-images` antigo para
 * o novo e troca as URLs gravadas em `warranties.images`.
 *
 * Antes de rodar:
 *   1. Aplique supabase/migrations/20261115000000_add_assistance_and_warranties.sql
 *      no SQL Editor do projeto do OM-Shipment.
 *   2. Preencha no .env:
 *        ASSIST_DATABASE_URL              conexão Postgres do banco ANTIGO (OM-Assist)
 *                                         (ou DATABASE_URL, nome usado pelo .env antigo)
 *        TARGET_SUPABASE_URL              https://<projeto-do-shipment>.supabase.co
 *        TARGET_SUPABASE_SERVICE_ROLE_KEY chave service_role do projeto do OM-Shipment
 *      (a service_role só é usada aqui, no seu computador; nunca vai para o app)
 *
 * Uso:
 *   npm run migrate:assist             # simulação: só mostra o que seria copiado
 *   npm run migrate:assist -- --apply  # copia de verdade
 *
 * Pode ser rodado de novo: registros que já existem no banco novo (mesmo id)
 * são pulados, e fotos já copiadas não são enviadas outra vez.
 */
import postgres from 'postgres';
import { createClient } from '@supabase/supabase-js';

const APPLY = process.argv.includes('--apply');
const BUCKET = 'warranty-images';
const PUBLIC_MARKER = `/storage/v1/object/public/${BUCKET}/`;

const TICKET_DATES = ['shipping_date', 'completion_date', 'created_at'];
const WARRANTY_DATES = ['start_date', 'created_at'];

function env(name) {
    const value = process.env[name]?.trim();
    if (!value) {
        console.error(`Falta a variável ${name} no .env (veja o cabeçalho deste script).`);
        process.exit(1);
    }
    return value;
}

/** O banco antigo grava timestamp sem fuso, em UTC: marca explicitamente como UTC. */
function asUtc(value) {
    if (value === null || value === undefined) return null;
    const text = String(value);
    return /([+-]\d{2}(:?\d{2})?|Z)$/.test(text) ? text : `${text}Z`;
}

function fixDates(row, columns) {
    const out = { ...row };
    for (const column of columns) out[column] = asUtc(out[column]);
    return out;
}

async function readTable(sql, table) {
    // row_to_json devolve as datas como texto, sem conversão de fuso pelo driver.
    const rows = await sql.unsafe(`SELECT row_to_json(t) AS row FROM public.${table} t ORDER BY created_at`);
    return rows.map((r) => r.row);
}

function check(result, what) {
    if (result.error) throw new Error(`${what}: ${result.error.message}`);
    return result.data;
}

async function main() {
    if (!process.env.ASSIST_DATABASE_URL && process.env.DATABASE_URL) {
        process.env.ASSIST_DATABASE_URL = process.env.DATABASE_URL;
    }
    const source = postgres(env('ASSIST_DATABASE_URL'), { ssl: 'require', max: 1 });
    const targetUrl = env('TARGET_SUPABASE_URL').replace(/\/$/, '');
    // service_role ignora o RLS: necessário para gravar sem um usuário logado.
    const target = createClient(targetUrl, env('TARGET_SUPABASE_SERVICE_ROLE_KEY'), {
        auth: { persistSession: false },
    });
    const storage = target.storage.from(BUCKET);

    try {
        for (const table of ['tickets', 'warranties']) {
            const { error } = await target.from(table).select('id').limit(1);
            if (error) {
                console.error(`A tabela ${table} não está acessível no banco novo (${error.message}).`);
                console.error('Aplique a migration 20261115000000_add_assistance_and_warranties.sql primeiro.');
                process.exit(1);
            }
        }
        const buckets = check(await target.storage.listBuckets(), 'listar buckets');
        if (!buckets.some((b) => b.id === BUCKET)) {
            console.error(`O bucket ${BUCKET} não existe no projeto novo. Aplique a migration primeiro.`);
            process.exit(1);
        }

        const tickets = (await readTable(source, 'tickets')).map((r) => fixDates(r, TICKET_DATES));
        const warranties = (await readTable(source, 'warranties')).map((r) => fixDates(r, WARRANTY_DATES));

        const existingTickets = new Set(check(await target.from('tickets').select('id'), 'ler tickets').map((r) => r.id));
        const targetWarranties = check(await target.from('warranties').select('id, protocol_number'), 'ler garantias');
        const existingWarranties = new Set(targetWarranties.map((r) => r.id));
        const newTickets = tickets.filter((t) => !existingTickets.has(t.id));
        const newWarranties = warranties.filter((w) => !existingWarranties.has(w.id));

        // Protocolo repetido com um registro diferente já existente no banco novo bloquearia a cópia.
        const targetProtocols = new Set(targetWarranties.map((r) => r.protocol_number).filter(Boolean));
        const protocolClashes = newWarranties.filter((w) => w.protocol_number && targetProtocols.has(w.protocol_number));

        const imageUrls = newWarranties.flatMap((w) => (Array.isArray(w.images) ? w.images : []));
        const toCopy = [...new Set(imageUrls.filter((url) => url.includes(PUBLIC_MARKER) && !url.startsWith(targetUrl)))];

        console.log('Banco antigo (OM-Assist):');
        console.log(`  assistências: ${tickets.length}  (novas para copiar: ${newTickets.length})`);
        console.log(`  garantias:    ${warranties.length}  (novas para copiar: ${newWarranties.length})`);
        console.log(`  fotos a copiar: ${toCopy.length}`);
        console.log('Banco novo (OM-Shipment) hoje:');
        console.log(`  assistências: ${existingTickets.size}, garantias: ${existingWarranties.size}`);
        if (protocolClashes.length) {
            console.error('\nProtocolos que já existem no banco novo com outro registro:');
            for (const w of protocolClashes) console.error(`  ${w.protocol_number} (id ${w.id})`);
            console.error('Resolva esses casos antes de copiar.');
            process.exit(1);
        }

        if (!APPLY) {
            console.log('\nSimulação concluída. Nada foi gravado. Rode com --apply para copiar.');
            return;
        }

        // 1. Fotos: baixa do bucket antigo e envia para o novo, com o mesmo nome de arquivo.
        const urlMap = new Map();
        for (const url of toCopy) {
            const path = decodeURIComponent(url.split(PUBLIC_MARKER)[1].split('?')[0]);
            const response = await fetch(url);
            if (!response.ok) throw new Error(`Não consegui baixar ${url}: HTTP ${response.status}`);
            const blob = await response.blob();
            const { error } = await storage.upload(path, blob, {
                contentType: response.headers.get('content-type') || undefined,
                upsert: false,
            });
            if (error && !/exists|duplicate/i.test(error.message)) {
                throw new Error(`Falha ao enviar ${path}: ${error.message}`);
            }
            urlMap.set(url, storage.getPublicUrl(path).data.publicUrl);
            process.stdout.write('.');
        }
        if (toCopy.length) process.stdout.write('\n');

        // 2. Registros. Mesmo id já existente é ignorado, então dá para rodar de novo.
        if (newTickets.length) {
            check(
                await target.from('tickets').upsert(newTickets, { onConflict: 'id', ignoreDuplicates: true }),
                'gravar assistências'
            );
        }
        if (newWarranties.length) {
            const rows = newWarranties.map((w) => ({
                ...w,
                images: Array.isArray(w.images) ? w.images.map((u) => urlMap.get(u) ?? u) : w.images,
            }));
            check(
                await target.from('warranties').upsert(rows, { onConflict: 'id', ignoreDuplicates: true }),
                'gravar garantias'
            );
        }

        // 3. Conferência.
        const count = async (table) => {
            const { count: n, error } = await target.from(table).select('*', { count: 'exact', head: true });
            if (error) throw new Error(error.message);
            return n;
        };
        const ticketCount = await count('tickets');
        const warrantyCount = await count('warranties');
        const copied = check(await target.from('warranties').select('images'), 'conferir fotos');
        const stillOld = copied.flatMap((w) => w.images ?? []).filter((u) => !u.startsWith(targetUrl)).length;

        console.log('\nCópia concluída. Banco novo agora tem:');
        console.log(`  assistências: ${ticketCount} (antigo: ${tickets.length})`);
        console.log(`  garantias:    ${warrantyCount} (antigo: ${warranties.length})`);
        console.log(`  fotos ainda apontando para o projeto antigo: ${stillOld}`);
    } finally {
        await source.end();
    }
}

main().catch((err) => {
    console.error('\nErro:', err.message);
    process.exit(1);
});
