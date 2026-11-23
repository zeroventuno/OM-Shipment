import { useId } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { itemsTotal, money } from '../../services/importDocs';
import { hsDiffers, itemFromCatalog, matchCatalogInfo, missingGender } from '../../services/invoiceParser';
import { emptyItem, cleanItems, productIdSuggestions } from '../../services/docItems';

/**
 * Lista de artigos para documentos de alfândega (proforma IMP e Commercial
 * Invoice): descrição, quantidade, HS, origem e valor unitário, com atalho
 * para puxar descrição e HS do catálogo.
 */

export function ItemsEditor({ items, setItems, catalog, label, extraTotal = 0, withCode = false, withProductId = false }) {
    const { t } = useTranslation();
    const productIdsList = useId();
    const small = 'h-9 w-full rounded-md border border-input bg-card px-2 text-sm';
    const setItem = (i, field, value) => setItems((l) => l.map((x, j) => (j === i ? { ...x, [field]: value } : x)));
    const addFromCatalog = (id) => {
        const c = catalog.find((x) => x.id === id);
        if (!c) return;
        const row = { ...emptyItem(), ...itemFromCatalog(c) };
        setItems((l) => (l.length === 1 && !l[0].description ? [row] : [...l, row]));
    };
    // escolher o produto da linha (e assim relacionar o código da fatura);
    // escolhido à mão, está confirmado
    const pickProduct = (i, id, sure = true) => {
        const c = catalog.find((x) => x.id === id);
        setItems((l) => l.map((x, j) => (j !== i ? x
            : c ? { ...x, ...itemFromCatalog(c, x.invoice_description), unconfirmed: !sure }
                : { ...x, catalog_id: '', unconfirmed: false })));
    };
    // código digitado: se já estiver relacionado, preenche sozinho; pelo nome, só sugere
    const lookupCode = (i) => {
        const it = items[i];
        if (!it?.code?.trim() || it.catalog_id) return;
        const m = matchCatalogInfo(it.description, catalog, it.code);
        if (m) pickProduct(i, m.row.id, m.sure);
    };
    // todo o catálogo por grupo: produtos da loja primeiro, depois os artigos
    const groups = [
        ['shop', t('exp.ci.group.shop')],
        ['shipped', t('exp.ci.group.shipped')],
        ['other', t('exp.ci.group.other')],
    ].map(([key, title]) => [title, catalog.filter((c) => (['shop', 'shipped'].includes(c.section) ? c.section : 'other') === key)])
        .filter(([, rows]) => rows.length);
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
                    {withCode && (
                        <div className="grid grid-cols-[7rem_1fr] gap-2">
                            <input className={small} aria-label={t('exp.ci.code')} placeholder={t('exp.ci.code')} value={it.code || ''} onChange={(e) => setItem(i, 'code', e.target.value)} onBlur={() => lookupCode(i)} />
                            <select className={small} aria-label={t('exp.ci.product')} value={it.catalog_id || ''} onChange={(e) => pickProduct(i, e.target.value)}>
                                <option value="">{t('exp.ci.free')}</option>
                                {groups.map(([title, rows]) => (
                                    <optgroup key={title} label={title}>
                                        {rows.map((c) => <option key={c.id} value={c.id}>{c.item}{c.hs_code ? ` · ${c.hs_code}` : ''}</option>)}
                                    </optgroup>
                                ))}
                            </select>
                        </div>
                    )}
                    {withProductId && (
                        <input className={small} list={productIdsList} autoComplete="off" aria-label={t('imp.productId')} placeholder={`${t('imp.productId')} (L8FRAME)`} value={it.code || ''} onChange={(e) => setItem(i, 'code', e.target.value)} />
                    )}
                    <textarea rows={2} className="w-full rounded-md border border-input bg-card px-2 py-1.5 text-sm" placeholder={t('imp.description')} value={it.description} onChange={(e) => setItem(i, 'description', e.target.value)} />
                    {it.note && <p className="text-xs text-muted-foreground">{it.note}</p>}
                    {it.unconfirmed && (
                        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-error/40 bg-error/5 px-2 py-1.5">
                            <p className="text-xs text-error">{t('exp.ci.suggested', { name: it.invoice_description || it.code })}</p>
                            <Button type="button" variant="outlined" size="sm" onClick={() => setItem(i, 'unconfirmed', false)}>{t('exp.ci.confirm')}</Button>
                        </div>
                    )}
                    {hsDiffers(it.hs_invoice, it.hs_code) && <p className="text-xs text-error">{t('exp.ci.hsInvoice', { hs: it.hs_invoice, ci: it.hs_code })}</p>}
                    {withCode && missingGender(it) && <p className="text-xs text-muted-foreground">{t('exp.ci.gender')}</p>}
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
            {withProductId && (
                <datalist id={productIdsList}>
                    {productIdSuggestions(catalog).map((code) => <option key={code} value={code} />)}
                </datalist>
            )}
            <div className="flex items-center justify-between">
                <Button type="button" variant="outlined" size="sm" onClick={() => setItems((l) => [...l, emptyItem()])}><Plus className="mr-1 h-4 w-4" />{t('imp.addItem')}</Button>
                <span className="text-sm font-semibold tabular-nums">{t('Total')}: € {money(total)}</span>
            </div>
        </div>
    );
}
