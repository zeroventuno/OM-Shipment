import { useEffect, useId, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Search } from 'lucide-react';
import { supabase } from '@/lib/supabase';
import { countryLabel } from '../../data/countries';

/**
 * Campo Cliente do novo envio: busca no cadastro de clientes enquanto se
 * digita (no banco, sem limite de 1000 nomes). Escolher um cliente preenche o
 * nome e devolve o cadastro para quem chamou (ex.: preencher o país). Texto
 * livre continua valendo para quem ainda não está cadastrado.
 */
export function CustomerSearch({ value, onChange, onSelect }) {
    const { t, i18n } = useTranslation();
    const listId = useId();
    const [open, setOpen] = useState(false);
    const [results, setResults] = useState([]);
    const [loading, setLoading] = useState(false);
    const [active, setActive] = useState(-1);
    const boxRef = useRef(null);

    const term = (value || '').trim();

    useEffect(() => {
        if (!open || term.length < 2 || !supabase) {
            setResults([]);
            return;
        }
        let cancelled = false;
        setLoading(true);
        const timer = setTimeout(async () => {
            // Cada palavra precisa aparecer no nome ("simon lang" acha "SIMON LANGTON").
            let q = supabase.from('customers').select('id, name, city, country');
            for (const word of term.split(/\s+/).slice(0, 4)) {
                q = q.ilike('name', `%${word.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);
            }
            const { data, error } = await q.order('name').limit(12);
            if (cancelled) return;
            setLoading(false);
            setActive(-1);
            setResults(error ? [] : data);
        }, 200);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [term, open]);

    // Fecha ao clicar fora.
    useEffect(() => {
        const close = (e) => { if (!boxRef.current?.contains(e.target)) setOpen(false); };
        document.addEventListener('mousedown', close);
        return () => document.removeEventListener('mousedown', close);
    }, []);

    const pick = (c) => {
        onChange(c.name);
        onSelect?.(c);
        setOpen(false);
    };

    const onKeyDown = (e) => {
        if (!open || results.length === 0) return;
        if (e.key === 'ArrowDown') { e.preventDefault(); setActive((i) => Math.min(i + 1, results.length - 1)); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); setActive((i) => Math.max(i - 1, 0)); }
        else if (e.key === 'Enter' && active >= 0) { e.preventDefault(); pick(results[active]); }
        else if (e.key === 'Escape') setOpen(false);
    };

    const showList = open && term.length >= 2;

    return (
        <div className="w-full relative" ref={boxRef}>
            <label htmlFor={`${listId}-input`} className="text-muted-foreground mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em]">
                {t('Customer')}
            </label>
            <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <input
                    id={`${listId}-input`}
                    role="combobox"
                    aria-expanded={showList}
                    aria-controls={`${listId}-list`}
                    aria-autocomplete="list"
                    autoComplete="off"
                    placeholder={t('customerSearch.placeholder')}
                    className="flex h-11 w-full rounded-md border border-input bg-card pl-9 pr-3 py-2 text-sm placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2"
                    value={value || ''}
                    onChange={(e) => { onChange(e.target.value); setOpen(true); }}
                    onFocus={() => setOpen(true)}
                    onKeyDown={onKeyDown}
                />
            </div>
            {showList && (
                <ul id={`${listId}-list`} role="listbox" className="absolute z-30 mt-1 w-full min-w-[18rem] max-h-72 overflow-auto rounded-md border border-border bg-card shadow-lg py-1 text-sm">
                    {loading && results.length === 0 && <li className="px-3 py-2 text-muted-foreground">…</li>}
                    {!loading && results.length === 0 && (
                        <li className="px-3 py-2 text-muted-foreground">{t('customerSearch.none')}</li>
                    )}
                    {results.map((c, i) => (
                        <li
                            key={c.id}
                            role="option"
                            aria-selected={i === active}
                            onMouseDown={(e) => { e.preventDefault(); pick(c); }}
                            onMouseEnter={() => setActive(i)}
                            className={`px-3 py-2 cursor-pointer ${i === active ? 'bg-secondary' : ''}`}
                        >
                            <span className="font-medium">{c.name}</span>
                            <span className="text-muted-foreground">
                                {' · '}{[c.city, c.country && countryLabel(c.country, i18n.language || 'it')].filter(Boolean).join(', ') || '—'}
                            </span>
                        </li>
                    ))}
                </ul>
            )}
        </div>
    );
}
