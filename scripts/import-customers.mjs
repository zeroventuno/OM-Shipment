#!/usr/bin/env node
/**
 * Importa clientes e endereços de entrega exportados pelos portais.
 *
 *   npm run import-customers -- <arquivo.xlsx|.csv> --portal MBE            (simulação)
 *   npm run import-customers -- <arquivo.xlsx|.csv> --portal MBE --apply    (grava)
 *
 * Sem --apply nada é gravado: só sai o resumo e um relatório em
 * import-reports/ (fora do git) com tudo o que seria criado ou preenchido.
 *
 * - Junta linhas repetidas e grafias diferentes do mesmo cliente.
 * - Cliente que já existe: só preenche campos vazios; endereço diferente entra
 *   como endereço de entrega a mais. Nada existente é sobrescrito ou apagado.
 * - Pode rodar de novo com o mesmo arquivo: o que já existe é pulado.
 *
 * Precisa de TARGET_DATABASE_URL no .env.
 */
import postgres from 'postgres';
import { mkdirSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { readSpreadsheet } from './lib/spreadsheet.mjs';
import { normalizeRow, dropSharedContacts, groupRows, planImport, addressKey } from './lib/customer-import.mjs';

const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--') && args[args.indexOf(a) - 1] !== '--portal');
const portal = args[args.indexOf('--portal') + 1];
const apply = args.includes('--apply');
if (!file || !args.includes('--portal') || !portal || portal.startsWith('--')) {
    console.error('Uso: npm run import-customers -- <arquivo.xlsx|.csv> --portal <nome> [--apply]');
    process.exit(1);
}
const url = process.env.TARGET_DATABASE_URL?.trim();
if (!url) {
    console.error('Falta TARGET_DATABASE_URL no .env');
    process.exit(1);
}

const source = `csv:${portal.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
const rows = readSpreadsheet(file);
const { records, shared } = dropSharedContacts(rows.map(normalizeRow));
const groups = groupRows(records);
const problems = records.map((r, i) => ({ line: i + 2, ...r })).filter((r) => r.skip || r.problem);

const sql = postgres(url, { ssl: 'require', max: 1, onnotice: () => {} });
try {
    const existing = await sql`SELECT id, name, address_line1, contact_name, phone, email FROM public.customers`;
    const existingAddresses = (await sql`
        SELECT customer_id, address_line1, address_line2, address_line3, postal_code, city, country
        FROM public.customer_addresses`).map((a) => ({ customer_id: a.customer_id, key: addressKey(a) }));

    const plan = planImport(groups, existing, existingAddresses, { source });
    const forNew = plan.newAddresses.filter((a) => a.customerKey).length;
    const summary = {
        arquivo: basename(file),
        portal,
        linhas: rows.length,
        clientes_no_arquivo: groups.length,
        enderecos_diferentes_no_arquivo: groups.reduce((n, g) => n + g.addresses.length, 0),
        linhas_com_problema: problems.length,
        contatos_da_conta_descartados: [...shared.phones, ...shared.emails].join(', '),
        clientes_novos: plan.newCustomers.length,
        clientes_existentes_completados: plan.updates.length,
        clientes_existentes_sem_mudanca: plan.unchanged,
        enderecos_novos: plan.newAddresses.length,
        enderecos_em_clientes_novos: forNew,
        enderecos_a_mais_em_clientes_existentes: plan.newAddresses.length - forNew,
        clientes_com_mais_de_30_enderecos: plan.truncated,
    };
    console.table(summary);

    mkdirSync('import-reports', { recursive: true });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-');
    const report = join('import-reports', `${stamp}-${source.slice(4)}${apply ? '' : '-simulacao'}.json`);
    writeFileSync(report, JSON.stringify({ summary, problems, ...plan }, null, 2));
    console.log(`Relatório: ${report}`);

    if (!apply) {
        console.log('\nSimulação: nada foi gravado. Rode de novo com --apply para importar.');
    } else {
        await sql.begin(async (tx) => {
            const ids = new Map();
            const cols = ['name', 'address_line1', 'address_line2', 'address_line3', 'postal_code', 'city', 'region',
                'country', 'contact_name', 'phone', 'email', 'source'];
            for (let i = 0; i < plan.newCustomers.length; i += 500) {
                const chunk = plan.newCustomers.slice(i, i + 500);
                const inserted = await tx`
                    INSERT INTO public.customers ${tx(chunk.map((c) => Object.fromEntries(cols.map((k) => [k, c[k] ?? null]))), cols)}
                    RETURNING id`;
                chunk.forEach((c, j) => ids.set(c.key, inserted[j].id));
            }
            for (const u of plan.updates) {
                await tx`UPDATE public.customers SET ${tx(u.patch, Object.keys(u.patch))} WHERE id = ${u.id}`;
            }
            const acols = ['customer_id', 'address_line1', 'address_line2', 'address_line3', 'postal_code', 'city',
                'region', 'country', 'contact_name', 'phone', 'is_default'];
            const addrRows = plan.newAddresses.map((a) => ({
                ...Object.fromEntries(acols.map((k) => [k, a[k] ?? null])),
                customer_id: a.customerId ?? ids.get(a.customerKey),
                is_default: a.is_default,
            }));
            for (let i = 0; i < addrRows.length; i += 500) {
                await tx`INSERT INTO public.customer_addresses ${tx(addrRows.slice(i, i + 500), acols)}`;
            }
        });
        console.log(`\nImportado: ${plan.newCustomers.length} clientes novos, ${plan.updates.length} completados, ${plan.newAddresses.length} endereços.`);
    }
} finally {
    await sql.end();
}
