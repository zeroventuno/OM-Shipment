#!/usr/bin/env node
/**
 * Links do formulário público de garantia e assistência.
 *
 *   npm run service-link -- create "Clienti finali"
 *   npm run service-link -- list
 *   npm run service-link -- disable <id>
 *
 * O endereço completo aparece UMA vez, na criação; no banco fica só o hash do
 * token. Quem tem o link só consegue enviar pedidos. Se virar alvo de spam,
 * desative e crie outro.
 *
 * Precisa de TARGET_DATABASE_URL no .env. APP_URL (opcional) muda o endereço
 * base; o padrão é https://om-shipment.vercel.app.
 */
import postgres from 'postgres';
import { createHash, randomInt } from 'node:crypto';

const ALPHABET = 'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const newToken = () => Array.from({ length: 16 }, () => ALPHABET[randomInt(ALPHABET.length)]).join('');

const [command, ...args] = process.argv.slice(2);
const url = process.env.TARGET_DATABASE_URL?.trim();
if (!url) {
    console.error('Falta TARGET_DATABASE_URL no .env');
    process.exit(1);
}
const appUrl = (process.env.APP_URL || 'https://om-shipment.vercel.app').replace(/\/$/, '');
const sql = postgres(url, { ssl: 'require', max: 1 });

try {
    if (command === 'create') {
        const [name] = args;
        if (!name) throw new Error('Uso: create "<nome do link>"');
        const token = newToken();
        const [row] = await sql`
            INSERT INTO public.service_links (name, token_hash)
            VALUES (${name}, ${createHash('sha256').update(token).digest('hex')})
            RETURNING id`;
        console.log(`Link criado: "${name}" (id ${row.id})\n`);
        console.log(`  ${appUrl}/assistenza/${token}\n`);
        console.log('Guarde agora: ele não aparece de novo.');
    } else if (command === 'list') {
        const rows = await sql`
            SELECT l.id, l.name, l.active,
                   (SELECT count(*)::int FROM public.service_requests r WHERE r.link_id = l.id) AS requests
            FROM public.service_links l ORDER BY l.created_at`;
        for (const r of rows) {
            console.log(`${r.id}  ${r.active ? 'ativo     ' : 'desativado'}  ${String(r.requests).padStart(4)} pedidos  ${r.name}`);
        }
        if (!rows.length) console.log('Nenhum link.');
    } else if (command === 'disable') {
        const [id] = args;
        if (!id) throw new Error('Uso: disable <id>');
        const rows = await sql`UPDATE public.service_links SET active = false WHERE id = ${id} RETURNING name`;
        console.log(rows.length ? `Link "${rows[0].name}" desativado.` : 'Id não encontrado.');
    } else {
        console.log('Comandos: create "<nome>" · list · disable <id>');
    }
} catch (err) {
    console.error('Erro:', err.message);
    process.exitCode = 1;
} finally {
    await sql.end();
}
