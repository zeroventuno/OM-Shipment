import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { AlertTriangle, BookOpen, Check, ChevronDown, Copy, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { filterCatalog } from '../../services/exportCatalog';

const EMPTY = { section: 'other', item: '', description_en: '', hs_code: '', hs_note: '', verified: false, origin: '', composition: '', erp_codes: [] };

/**
 * Catálogo de artigos para exportação: descrição em inglês, HS de referência e
 * origem, para copiar na fatura do gestionale. A equipe pode editar.
 */
export function ExportCatalog() {
    const { t } = useTranslation();
    const [open, setOpen] = useState(false);
    const [rows, setRows] = useState(null);
    const [query, setQuery] = useState('');
    const [editing, setEditing] = useState(null); // { id?, ...campos }
    const [copied, setCopied] = useState('');
    const [error, setError] = useState('');

    const load = async () => {
        const { data, error: err } = await supabase.from('export_catalog')
            .select('*').eq('active', true).order('sort_order').order('item');
        if (err) setError(t('cat.err.load'));
        else setRows(data);
    };

    useEffect(() => {
        if (open && rows === null) load();
    }, [open]); // eslint-disable-line react-hooks/exhaustive-deps

    const list = useMemo(() => filterCatalog(rows || [], query), [rows, query]);

    const copy = async (text, key) => {
        try {
            await navigator.clipboard.writeText(text);
            setCopied(key);
            setTimeout(() => setCopied((c) => (c === key ? '' : c)), 1500);
        } catch {
            /* sem permissão de área de transferência: o texto continua visível */
        }
    };

    const save = async () => {
        const { id, ...fields } = editing;
        const payload = {
            ...fields,
            item: fields.item.trim(),
            description_en: fields.description_en.trim(),
            hs_code: fields.hs_code?.trim() || null,
            hs_note: fields.hs_note?.trim() || null,
            origin: fields.origin?.trim() || null,
            composition: fields.composition?.trim() || null,
            erp_codes: (Array.isArray(fields.erp_codes) ? fields.erp_codes : String(fields.erp_codes || '').split(','))
                .map((c) => String(c).trim().toUpperCase()).filter(Boolean),
            updated_at: new Date().toISOString(),
        };
        if (!payload.item || !payload.description_en) return setError(t('cat.err.required'));
        setError('');
        const res = id
            ? await supabase.from('export_catalog').update(payload).eq('id', id)
            : await supabase.from('export_catalog').insert({ ...payload, sort_order: 1000 });
        if (res.error) return setError(t('cat.err.save'));
        setEditing(null);
        load();
    };

    const remove = async (row) => {
        if (!window.confirm(t('cat.confirmRemove', { item: row.item }))) return;
        // só desativa: o artigo some da lista mas continua no banco
        const { error: err } = await supabase.from('export_catalog').update({ active: false, updated_at: new Date().toISOString() }).eq('id', row.id);
        if (err) return setError(t('cat.err.save'));
        setEditing(null);
        load();
    };

    const CopyBtn = ({ text, k }) => (
        <button type="button" onClick={() => copy(text, k)} title={t('cat.copy')} aria-label={t('cat.copy')}
            className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary hover:text-foreground">
            {copied === k ? <Check className="h-3.5 w-3.5 text-primary" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
    );

    const form = editing && (
        <div className="space-y-2 rounded-md border border-primary/40 bg-secondary/30 p-3">
            <Input label={t('cat.item')} value={editing.item} onChange={(e) => setEditing({ ...editing, item: e.target.value })} />
            <div>
                <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t('cat.description')}</label>
                <textarea rows={2} className="w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    value={editing.description_en} onChange={(e) => setEditing({ ...editing, description_en: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-2">
                <Input label="HS" value={editing.hs_code || ''} onChange={(e) => setEditing({ ...editing, hs_code: e.target.value })} />
                <Input label={t('cat.hsNote')} value={editing.hs_note || ''} onChange={(e) => setEditing({ ...editing, hs_note: e.target.value })} />
            </div>
            <Input label={t('cat.origin')} value={editing.origin || ''} onChange={(e) => setEditing({ ...editing, origin: e.target.value })} />
            <Input label={t('cat.composition')} value={editing.composition || ''} onChange={(e) => setEditing({ ...editing, composition: e.target.value })} />
            <Input label={t('cat.codes')} placeholder="C315C1, M067A" value={Array.isArray(editing.erp_codes) ? editing.erp_codes.join(', ') : editing.erp_codes || ''} onChange={(e) => setEditing({ ...editing, erp_codes: e.target.value })} />
            <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" className="accent-primary" checked={editing.verified} onChange={(e) => setEditing({ ...editing, verified: e.target.checked })} />
                {t('cat.verified')}
            </label>
            <div className="flex items-center gap-2 pt-1">
                <Button type="button" size="sm" onClick={save}>{t('cat.save')}</Button>
                <Button type="button" size="sm" variant="ghost" onClick={() => { setEditing(null); setError(''); }}>{t('cat.cancel')}</Button>
                {editing.id && (
                    <button type="button" className="ml-auto text-xs text-muted-foreground hover:text-error inline-flex items-center gap-1"
                        onClick={() => remove(editing)}>
                        <Trash2 className="h-3.5 w-3.5" />{t('cat.remove')}
                    </button>
                )}
            </div>
        </div>
    );

    return (
        <div className="rounded-md border border-border">
            <button type="button" onClick={() => setOpen(!open)} aria-expanded={open}
                className="flex w-full items-center justify-between px-3 py-2.5 text-sm font-medium">
                <span className="flex items-center gap-2"><BookOpen className="h-4 w-4" />{t('cat.title')}</span>
                <ChevronDown className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
                <div className="space-y-3 border-t border-border p-3">
                    <p className="text-xs text-muted-foreground">{t('cat.intro')}</p>
                    <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                            <Input className="pl-9" value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t('cat.search')} />
                        </div>
                        <Button type="button" size="icon" variant="ghost" title={t('cat.add')} aria-label={t('cat.add')}
                            onClick={() => setEditing({ ...EMPTY })}>
                            <Plus className="h-4 w-4" />
                        </Button>
                    </div>
                    {error && <p className="text-sm text-error">{error}</p>}
                    {editing && !editing.id && form}
                    {rows === null && !error && <p className="text-sm text-muted-foreground">{t('cat.loading')}</p>}
                    {rows && list.length === 0 && <p className="text-sm text-muted-foreground">{t('cat.empty')}</p>}
                    <ul className="max-h-[420px] space-y-2 overflow-y-auto pr-1">
                        {list.map((r) => (editing?.id === r.id ? <li key={r.id}>{form}</li> : (
                            <li key={r.id} className="rounded-md border border-border p-2.5 text-sm">
                                <div className="flex items-start justify-between gap-2">
                                    <span className="font-medium">{r.item}</span>
                                    <button type="button" className="shrink-0 rounded p-1 text-muted-foreground hover:bg-secondary" title={t('cat.edit')} aria-label={t('cat.edit')}
                                        onClick={() => { setEditing({ ...EMPTY, ...r }); setError(''); }}>
                                        <Pencil className="h-3.5 w-3.5" />
                                    </button>
                                </div>
                                <div className="mt-1 flex items-start gap-1">
                                    <span className="flex-1 text-muted-foreground">{r.description_en}</span>
                                    <CopyBtn text={r.description_en} k={`${r.id}-d`} />
                                </div>
                                <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                                    {r.hs_code && (
                                        <span className="inline-flex items-center gap-1 font-mono text-xs">
                                            HS {r.hs_code}<CopyBtn text={r.hs_code} k={`${r.id}-h`} />
                                        </span>
                                    )}
                                    {!r.verified && (
                                        <span className="inline-flex items-center gap-1 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-accent-foreground">
                                            <AlertTriangle className="h-3 w-3" />{t('cat.toVerify')}
                                        </span>
                                    )}
                                    {r.hs_note && <span className="text-xs text-muted-foreground">{r.hs_note}</span>}
                                </div>
                                {r.origin && <p className="mt-1 text-xs"><span className="text-muted-foreground">{t('cat.origin')}:</span> {r.origin}</p>}
                                {r.composition && <p className="mt-1 text-xs"><span className="text-muted-foreground">{t('cat.composition')}:</span> {r.composition}</p>}
                                {r.erp_codes?.length > 0 && <p className="mt-1 text-xs font-mono"><span className="font-sans text-muted-foreground">{t('cat.codes')}:</span> {r.erp_codes.join(', ')}</p>}
                            </li>
                        )))}
                    </ul>
                    <p className="text-[11px] text-muted-foreground">{t('cat.disclaimer')}</p>
                </div>
            )}
        </div>
    );
}
