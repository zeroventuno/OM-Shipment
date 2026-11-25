import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { UserPlus, RefreshCw, Check } from 'lucide-react';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { COUNTRIES, countryCode } from '../../data/countries';
import { findCustomerForShipment } from '../../services/importDocsApi';
import { createCustomer, updateCustomer } from '@/modules/customers/api';

/**
 * Depois de ler a fatura: o cliente do bloco CUSTOMER existe na anagrafica?
 *   - não existe → botão "Crea cliente", com os dados da fatura para conferir;
 *   - existe com endereço diferente (ou sem endereço) → "Aggiorna scheda".
 * Nada é gravado sem o clique.
 */

const FIELDS = ['address', 'postal_code', 'city', 'country', 'tax_id', 'phone', 'email'];
const COL = { address: 'address_line1', postal_code: 'postal_code', city: 'city', country: 'country', tax_id: 'tax_id', phone: 'phone', email: 'email' };
const norm = (v) => String(v || '').toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

/** "ID" → "Indonésia" (como os países ficam na ficha do cliente). */
const storedCountry = (iso) => {
    const code = iso === 'GB' ? 'UK' : iso;
    return COUNTRIES.find((c) => c.code === code)?.value || iso || '';
};

/** Campos da fatura que a ficha não tem ou tem diferente. */
function customerDiff(customer, info) {
    return FIELDS.filter((k) => {
        const fromInvoice = info[k];
        if (!fromInvoice) return false;
        const current = customer[COL[k]];
        if (k === 'country') return countryCode(current) !== (fromInvoice === 'GB' ? 'UK' : fromInvoice) && countryCode(current) !== fromInvoice;
        return norm(current) !== norm(fromInvoice);
    });
}

export function InvoiceCustomerCheck({ info, onSaved }) {
    const { t } = useTranslation();
    const [state, setState] = useState(null); // { customer, diff } | 'missing' | 'saved'
    const [open, setOpen] = useState(false);
    const [form, setForm] = useState(null);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    useEffect(() => {
        let alive = true;
        setState(null); setOpen(false); setError('');
        if (!info?.name) return undefined;
        setForm({ ...info, country: storedCountry(info.country) });
        findCustomerForShipment(info.name).then((c) => {
            if (!alive) return;
            if (!c) return setState('missing');
            const diff = customerDiff(c, info);
            setState(diff.length ? { customer: c, diff } : null);
        }).catch(() => {});
        return () => { alive = false; };
    }, [info]);

    if (!state || !form) return null;
    if (state === 'saved') {
        return <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5" />{t('exp.cust.saved')}</p>;
    }

    const missing = state === 'missing';
    const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
    const save = async () => {
        setBusy(true); setError('');
        const fields = {
            address_line1: form.address, postal_code: form.postal_code, city: form.city, country: form.country,
            tax_id: form.tax_id, phone: form.phone, email: form.email,
        };
        try {
            if (missing) {
                await createCustomer({ name: form.name, ...fields });
            } else {
                // só o que a fatura traz: o resto da ficha fica como está
                const changed = Object.fromEntries(state.diff.map((k) => [COL[k], fields[COL[k]]]).filter(([, v]) => String(v || '').trim()));
                await updateCustomer(state.customer.id, changed);
            }
            setState('saved');
            onSaved?.();
        } catch (err) {
            setError(err.message === 'DUPLICATE' ? t('exp.cust.duplicate') : t('exp.cust.error'));
        } finally {
            setBusy(false);
        }
    };

    return (
        <div className="space-y-3 rounded-md border border-primary/30 bg-secondary/60 p-3 text-sm">
            <p>
                {missing
                    ? t('exp.cust.missing', { name: info.name })
                    : t('exp.cust.differs', { name: state.customer.name, fields: state.diff.map((k) => t(`exp.cust.f.${k}`)).join(', ') })}
                {!missing && (
                    <> <Link to={`/customers/${state.customer.id}`} className="text-primary underline" target="_blank" rel="noreferrer">{t('exp.cust.open')}</Link></>
                )}
            </p>
            {!open ? (
                <Button type="button" variant="outlined" size="sm" onClick={() => setOpen(true)}>
                    {missing ? <UserPlus className="mr-2 h-4 w-4" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                    {missing ? t('exp.cust.create') : t('exp.cust.update')}
                </Button>
            ) : (
                <div className="space-y-3">
                    {missing && <Input label={t('imp.name')} value={form.name} onChange={set('name')} />}
                    <Input label={t('imp.address')} value={form.address} onChange={set('address')} />
                    <div className="grid grid-cols-2 gap-3">
                        <Input label={t('imp.postal')} value={form.postal_code} onChange={set('postal_code')} />
                        <Input label={t('imp.city')} value={form.city} onChange={set('city')} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Input label={t('imp.country')} value={form.country} onChange={set('country')} />
                        <Input label={t('imp.tax')} value={form.tax_id} onChange={set('tax_id')} />
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                        <Input label={t('imp.phone')} value={form.phone} onChange={set('phone')} />
                        <Input label="E-mail" value={form.email} onChange={set('email')} />
                    </div>
                    {!missing && <p className="text-xs text-muted-foreground">{t('exp.cust.onlyChanged')}</p>}
                    {error && <p className="text-xs text-error">{error}</p>}
                    <div className="flex gap-2">
                        <Button type="button" size="sm" disabled={busy || !form.name.trim()} onClick={save}>
                            {missing ? t('exp.cust.saveNew') : t('exp.cust.saveUpdate')}
                        </Button>
                        <Button type="button" size="sm" variant="ghost" onClick={() => setOpen(false)}>{t('Cancel')}</Button>
                    </div>
                </div>
            )}
        </div>
    );
}
