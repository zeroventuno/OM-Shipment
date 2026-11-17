import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { itemsTotal, money } from '../../services/importDocs';

/**
 * Lista de artigos para documentos de alfândega (proforma IMP e Commercial
 * Invoice): descrição, quantidade, HS, origem e valor unitário, com atalho
 * para puxar descrição e HS do catálogo.
 */
export const emptyItem = () => ({ qty: '1', description: '', hs_code: '', origin: 'Italy', unit_value: '' });

const num = (v) => Number(String(v ?? '').trim().replace(',', '.'));

/** Artigos preenchidos, com números. */
export const cleanItems = (items) => items
    .filter((it) => it.description.trim())
    .map((it) => ({ qty: num(it.qty) || 1, description: it.description.trim(), hs_code: it.hs_code.trim(), origin: it.origin.trim(), unit_value: num(it.unit_value) || 0 }));

export function ItemsEditor({ items, setItems, catalog, label, extraTotal = 0 }) {
    const { t } = useTranslation();
    const small = 'h-9 w-full rounded-md border border-input bg-card px-2 text-sm';
    const setItem = (i, field, value) => setItems((l) => l.map((x, j) => (j === i ? { ...x, [field]: value } : x)));
    const addFromCatalog = (id) => {
        const c = catalog.find((x) => x.id === id);
        if (!c) return;
        const row = { ...emptyItem(), description: c.description_en || c.item, hs_code: (c.hs_code || '').split('/')[0].trim() };
        setItems((l) => (l.length === 1 && !l[0].description ? [row] : [...l, row]));
    };
    const total = itemsTotal(cleanItems(items)) + extraTotal;

    return (
        <div className="space-y-2">
            <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{label || t('imp.items')}</span>
            {catalog.length > 0 && (
                <select className={small} value="" onChange={(e) => addFromCatalog(e.target.value)}>
                    <option value="">{t('imp.fromCatalog')}</option>
                    {catalog.map((c) => <option key={c.id} value={c.id}>{c.item}{c.hs_code ? ` · ${c.hs_code}` : ''}</option>)}
                </select>
            )}
            {items.map((it, i) => (
                <div key={i} className="rounded-md border border-border p-2.5 space-y-2">
                    <textarea rows={2} className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm" placeholder={t('imp.description')} value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} />
                    {it.note && <p className="text-xs text-muted-foreground">{it.note}</p>}
                    <div className="grid grid-cols-[3.5rem_1fr_1fr] gap-2">
                        <input className={small} inputMode="decimal" aria-label={t('imp.qty')} placeholder={t('imp.qty')} value={it.qty} onChange={(e) => setItem(i, 'qty', e.target.value)} />
                        <input className={`${small} ${it.hs_code ? '' : 'border-error'}`} aria-label="HS code" placeholder="HS code" value={it.hs_code} onChange={(e) => setItem(i, 'hs_code', e.target.value)} />
                        <input className={small} aria-label={t('imp.origin')} placeholder={t('imp.origin')} value={it.origin} onChange={(e) => setItem(i, 'origin', e.target.value)} />
                    </div>
                    <div className="flex items-center gap-2">
                        <input className={small} inputMode="decimal" aria-label={t('imp.unitValue')} placeholder={`${t('imp.unitValue')} (€)`} value={it.unit_value} onChange={(e) => setItem(i, 'unit_value', e.target.value)} />
                        {items.length > 1 && (
                            <button type="button" aria-label={t('imp.remove')} className="p-2 text-muted-foreground hover:text-error" onClick={() => setItems((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                        )}
                    </div>
                </div>
            ))}
            <div className="flex items-center justify-between">
                <Button type="button" variant="outlined" size="sm" onClick={() => setItems((l) => [...l, emptyItem()])}><Plus className="mr-1 h-4 w-4" />{t('imp.addItem')}</Button>
                <span className="text-sm font-semibold tabular-nums">{t('Total')}: € {money(total)}</span>
            </div>
        </div>
    );
}
