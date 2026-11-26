import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router-dom';
import { UserPlus, RefreshCw, Check } from 'lucide-react';
import { Button } from '../ui/Button';
import { COUNTRIES, countryCode } from '../../data/countries';
import { findCustomerForShipment } from '../../services/importDocsApi';
import { QuickCustomerDialog } from '@/modules/quick/QuickCustomerDialog';

/**
 * Depois de ler a fatura: o cliente do bloco CUSTOMER existe na anagrafica?
 *   - não existe → "Crea cliente": modal com os dados da fatura;
 *   - existe com endereço diferente (ou sem endereço) → "Aggiorna scheda".
 * O endereço da fatura é o de FATURAMENTO; o modal pergunta se a mercadoria
 * vai para lá ou para outro endereço de envio. Nada é gravado sem o clique.
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
        if (k === 'country') {
            const code = countryCode(current);
            return code !== (fromInvoice === 'GB' ? 'UK' : fromInvoice) && code !== fromInvoice;
        }
        return norm(current) !== norm(fromInvoice);
    });
}

export function InvoiceCustomerCheck({ info, onSaved }) {
    const { t } = useTranslation();
    const [state, setState] = useState(null); // { customer, diff } | 'missing' | 'saved'
    const [open, setOpen] = useState(false);

    useEffect(() => {
        let alive = true;
        setState(null);
        setOpen(false);
        if (!info?.name) return undefined;
        findCustomerForShipment(info.name).then((c) => {
            if (!alive) return;
            if (!c) return setState('missing');
            const diff = customerDiff(c, info);
            setState(diff.length ? { customer: c, diff } : null);
        }).catch(() => {});
        return () => { alive = false; };
    }, [info]);

    if (!state) return null;
    if (state === 'saved') {
        return <p role="status" className="flex items-center gap-1.5 text-xs text-muted-foreground"><Check className="h-3.5 w-3.5" />{t('exp.cust.saved')}</p>;
    }

    const missing = state === 'missing';
    const c = missing ? null : state.customer;
    // dados da fatura por cima do cadastro (o que a fatura não traz fica como está)
    const initial = {
        name: c?.name || info.name,
        address_line1: info.address || c?.address_line1 || '',
        address_line2: info.address ? '' : c?.address_line2 || '',
        address_line3: info.address ? '' : c?.address_line3 || '',
        postal_code: info.postal_code || c?.postal_code || '',
        city: info.city || c?.city || '',
        region: info.address ? '' : c?.region || '',
        country: info.country ? storedCountry(info.country) : c?.country || '',
        contact_name: c?.contact_name || '',
        phone: info.phone || c?.phone || '',
        email: info.email || c?.email || '',
        tax_id: info.tax_id || c?.tax_id || '',
    };

    return (
        <div className="space-y-3 rounded-md border border-primary/30 bg-secondary/60 p-3 text-sm">
            <p>
                {missing
                    ? t('exp.cust.missing', { name: info.name })
                    : t('exp.cust.differs', { name: c.name, fields: state.diff.map((k) => t(`exp.cust.f.${k}`)).join(', ') })}
                {!missing && (
                    <> <Link to={`/customers/${c.id}`} className="text-primary underline" target="_blank" rel="noreferrer">{t('exp.cust.open')}</Link></>
                )}
            </p>
            <Button type="button" variant="outlined" size="sm" onClick={() => setOpen(true)}>
                {missing ? <UserPlus className="mr-2 h-4 w-4" /> : <RefreshCw className="mr-2 h-4 w-4" />}
                {missing ? t('exp.cust.create') : t('exp.cust.update')}
            </Button>
            <QuickCustomerDialog
                open={open}
                onClose={() => setOpen(false)}
                initial={initial}
                customerId={c?.id ?? null}
                onSaved={(saved) => { setState('saved'); onSaved?.(saved); }}
            />
        </div>
    );
}
