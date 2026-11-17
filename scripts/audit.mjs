// Auditoria de segurança do CI: falha com qualquer alerta "high" ou
// "critical", menos os da lista abaixo — cada um com o motivo e uma data de
// revisão. Passada a data, o alerta volta a bloquear até ser reavaliado.
import { execSync } from 'node:child_process';

const IGNORE = {
    'GHSA-fc5q-39xc-vjpf': {
        pkg: 'picomatch',
        reason: 'ReDoS em padrões glob; só usado no build (vite, tailwind, vitest), não vai para o navegador. Sem versão corrigida em 17/11/2026.',
        reviewBy: '2027-01-31',
    },
};

const LEVELS = ['high', 'critical'];
const today = new Date().toISOString().slice(0, 10);

let report;
try {
    report = execSync('npm audit --json', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
} catch (e) {
    report = e.stdout; // npm audit sai com código ≠ 0 quando acha algo
}
const vulns = JSON.parse(report || '{}').vulnerabilities || {};

const blocking = [];
const ignored = new Set();
for (const v of Object.values(vulns)) {
    for (const via of v.via || []) {
        if (typeof via !== 'object' || !LEVELS.includes(via.severity)) continue;
        const id = (via.url || '').split('/').pop();
        const rule = IGNORE[id];
        if (rule && rule.reviewBy >= today) {
            ignored.add(`${id} (${via.name}) — ${rule.reason} Rever até ${rule.reviewBy}.`);
        } else {
            blocking.push(`${via.severity.toUpperCase()} ${via.name}: ${via.title} — ${via.url}${rule ? ' (prazo de revisão vencido)' : ''}`);
        }
    }
}

for (const line of ignored) console.log(`ignorado: ${line}`);
if (blocking.length) {
    console.error([...new Set(blocking)].join('\n'));
    console.error(`\n${new Set(blocking).size} alerta(s) high/critical.`);
    process.exit(1);
}
console.log('Auditoria ok: nenhum alerta high/critical fora da lista de exceções.');
