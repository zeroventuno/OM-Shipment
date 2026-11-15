#!/usr/bin/env node
/**
 * Servidor MCP do OM Gestionale.
 *
 * Expõe a API de parceiros (garantias, assistências e envios) como
 * ferramentas para assistentes de IA (Claude, Codex, etc.). Roda localmente
 * por stdio e fala com o Supabase pela mesma API REST descrita em
 * docs/integracao-parceiros.md — não acessa o banco diretamente.
 *
 * Variáveis de ambiente:
 *   OM_SUPABASE_URL   https://<projeto>.supabase.co
 *   OM_ANON_KEY       chave anônima (pública) do projeto
 *   OM_PARTNER_KEY    chave do parceiro (omp_…), gerada por npm run partner-key
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';

const BASE = process.env.OM_SUPABASE_URL?.replace(/\/$/, '');
const ANON = process.env.OM_ANON_KEY;
const KEY = process.env.OM_PARTNER_KEY;

if (!BASE || !ANON || !KEY) {
    console.error('Defina OM_SUPABASE_URL, OM_ANON_KEY e OM_PARTNER_KEY.');
    process.exit(1);
}

/** Chama uma função da API de parceiros e devolve o JSON. */
async function rpc(fn, body = {}) {
    // Não envia parâmetros vazios: a função usa o valor padrão dela.
    const clean = Object.fromEntries(Object.entries(body).filter(([, v]) => v !== undefined && v !== null && v !== ''));
    const res = await fetch(`${BASE}/rest/v1/rpc/${fn}`, {
        method: 'POST',
        headers: { apikey: ANON, 'Content-Type': 'application/json', 'x-partner-key': KEY },
        body: JSON.stringify(clean),
    });
    const text = await res.text();
    if (!res.ok) {
        let message = text;
        try { message = JSON.parse(text).message ?? text; } catch { /* resposta não-JSON */ }
        throw new Error(`${fn}: HTTP ${res.status} — ${message}`);
    }
    return text ? JSON.parse(text) : null;
}

const asResult = (data) => ({ content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] });
const asError = (err) => ({ isError: true, content: [{ type: 'text', text: err.message }] });
const run = (fn) => async (args) => {
    try { return asResult(await fn(args)); } catch (err) { return asError(err); }
};

const server = new McpServer({ name: 'om-gestionale', version: '1.0.0' });

server.registerTool('list_warranties', {
    title: 'Listar garantias',
    description: 'Lista processos de garantia da Officine Mattio, do menos ao mais recentemente alterado. Use updated_since para buscar só o que mudou desde a última consulta.',
    inputSchema: {
        updated_since: z.string().optional().describe('Data/hora ISO 8601; só garantias alteradas depois dela'),
        status: z.enum(['In attesa', 'In lavorazione', 'Completato']).optional().describe('Filtra pelo status'),
        max_rows: z.number().int().min(1).max(500).optional().describe('Máximo de itens (padrão 100)'),
    },
}, run((a) => rpc('partner_list_warranties', a)));

server.registerTool('get_warranty', {
    title: 'Ver garantia',
    description: 'Detalhe de uma garantia, com histórico e envios ligados. Busque pelo protocolo (ex.: OMW-26-012) ou pelo número da ordem de venda.',
    inputSchema: {
        protocol: z.string().optional().describe('Protocolo OMW-AA-NNN'),
        order_number: z.string().optional().describe('Número da ordem de venda ligada à garantia'),
    },
}, run((a) => rpc('partner_get_warranty', a)));

server.registerTool('list_tickets', {
    title: 'Listar assistências',
    description: 'Lista tickets de assistência (componentes enviados ao fabricante), do menos ao mais recentemente alterado.',
    inputSchema: {
        updated_since: z.string().optional().describe('Data/hora ISO 8601'),
        max_rows: z.number().int().min(1).max(500).optional(),
    },
}, run((a) => rpc('partner_list_tickets', a)));

server.registerTool('list_shipments', {
    title: 'Listar envios',
    description: 'Lista envios com transportadora, rastreio, custo, serviço (standard/express) e agente. Filtre por order_id para achar os envios de uma ordem de venda.',
    inputSchema: {
        updated_since: z.string().optional().describe('Data/hora ISO 8601'),
        order_id: z.string().optional().describe('Número da ordem / referência do envio'),
        max_rows: z.number().int().min(1).max(500).optional(),
    },
}, run((a) => rpc('partner_list_shipments', a)));

server.registerTool('add_note', {
    title: 'Adicionar nota',
    description: 'Registra uma nota no histórico de uma garantia ou assistência (aparece no sistema com o nome do parceiro). Requer chave com permissão de escrita.',
    inputSchema: {
        kind: z.enum(['warranty', 'ticket']),
        reference: z.string().describe('Protocolo da garantia (ou id) / id do ticket'),
        note: z.string().min(1).max(2000),
    },
}, run((a) => rpc('partner_add_note', a)));

server.registerTool('update_warranty_admin', {
    title: 'Atualizar dados administrativos da garantia',
    description: 'Grava número da ordem de venda, fatura e/ou valor de uma garantia. Só altera os campos enviados. Requer chave com permissão de escrita.',
    inputSchema: {
        protocol: z.string(),
        order_number: z.string().optional(),
        invoice: z.string().optional(),
        value: z.string().optional(),
    },
}, run((a) => rpc('partner_update_warranty_admin', a)));

await server.connect(new StdioServerTransport());
