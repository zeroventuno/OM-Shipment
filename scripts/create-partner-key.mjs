#!/usr/bin/env node
/**
 * Cria (ou desativa) uma chave da API de parceiros.
 *
 *   npm run partner-key -- create "Sistema de vendas" read,write
 *   npm run partner-key -- list
 *   npm run partner-key -- revoke <id>
 *
 * A chave aparece UMA vez, na criação; no banco fica só o hash SHA-256.
 * Envie a chave ao parceiro por um canal seguro (não por e-mail aberto).
 *
 * Precisa de TARGET_DATABASE_URL no .env (conexão do banco do sistema).
 */
import postgres from 'postgres';
import { createHash, randomBytes } from 'node:crypto';

const [command, ...args] = process.argv.slice(2);
const url = process.env.TARGET_DATABASE_URL?.trim();
if (!url) {
    console.error('Falta TARGET_DATABASE_URL no .env');
    process.exit(1);
}
const sql = postgres(url, { ssl: 'require', max: 1 });

try {
    if (command === 'create') {
        const [name, scopeList = 'read'] = args;
        if (!name) throw new Error('Uso: create "<nome do sistema>" [read|read,write]');
        const scopes = scopeList.split(',').map((s) => s.trim()).filter(Boolean);
        if (scopes.some((s) => !['read', 'write'].includes(s))) throw new Error('Scopes válidos: read, write');
        const key = 'omp_' + randomBytes(32).toString('base64url');
        const [row] = await sql`
            INSERT INTO public.partner_keys (name, key_hash, scopes)
            VALUES (${name}, ${createHash('sha256').update(key).digest('hex')}, ${scopes})
            RETURNING id`;
        console.log(`Chave criada para "${name}" (${scopes.join(', ')}), id ${row.id}`);
        console.log('\nGuarde agora — ela não aparece de novo:\n');
        console.log(`  ${key}\n`);
    } else if (command === 'list') {
        const rows = await sql`SELECT id, name, scopes, active, created_at, last_used_at FROM public.partner_keys ORDER BY created_at`;
        for (const r of rows) {
            console.log(`${r.id}  ${r.active ? 'ativa   ' : 'revogada'}  ${r.scopes.join(',').padEnd(10)}  ${r.name}  (último uso: ${r.last_used_at?.toISOString() ?? 'nunca'})`);
        }
        if (!rows.length) console.log('Nenhuma chave.');
    } else if (command === 'revoke') {
        const [id] = args;
        if (!id) throw new Error('Uso: revoke <id>');
        const rows = await sql`UPDATE public.partner_keys SET active = false WHERE id = ${id} RETURNING name`;
        console.log(rows.length ? `Chave de "${rows[0].name}" revogada.` : 'Id não encontrado.');
    } else {
        console.log('Comandos: create "<nome>" [read|read,write] · list · revoke <id>');
    }
} catch (err) {
    console.error('Erro:', err.message);
    process.exitCode = 1;
} finally {
    await sql.end();
}
