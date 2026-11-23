import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Plus, Trash2 } from 'lucide-react';
import { Button } from '../ui/Button';
import { kg, parcelsWeight } from '../../services/importDocs';
import { cleanBoxRows, rowFromPreset, toBoxRows } from '../../services/boxes';

/**
 * Caixas do envio: uma linha por collo (C × L × A em cm e peso em kg), com as
 * caixas padrão da OM para escolher. `value` é o que vai para o banco; a cada
 * mudança `onChange` recebe as caixas completas (ou null se não houver).
 */
export function BoxesEditor({ value, onChange, presets = [] }) {
    const { t } = useTranslation();
    const [rows, setRows] = useState(() => toBoxRows(value));
    // o último valor que saiu daqui: se `value` mudar por fora (envio carregado,
    // pedido do formulário), as linhas são refeitas a partir dele
    const emitted = useRef(value);
    useEffect(() => {
        if (value !== emitted.current) {
            emitted.current = value;
            setRows(toBoxRows(value));
        }
    }, [value]);

    const update = (next) => {
        setRows(next);
        const clean = cleanBoxRows(next);
        emitted.current = clean.length ? clean : null;
        onChange(emitted.current);
    };
    const setField = (i, field, v) => update(rows.map((x, j) => (j === i ? { ...x, [field]: v } : x)));
    const clean = cleanBoxRows(rows);
    const small = 'h-9 w-full rounded-md border border-input bg-card px-2 text-sm';

    return (
        <div className="space-y-2">
            {rows.map((b, i) => (
                <div key={i} className="space-y-1">
                    {b.name && <p className="text-xs text-muted-foreground">{b.name}</p>}
                    <div className="grid grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-2 items-center">
                        {['width', 'height', 'depth', 'weight'].map((k) => (
                            <input key={k} className={small} inputMode="decimal" aria-label={t(`imp.box.${k}`)} placeholder={t(`imp.box.${k}`)} value={b[k]} onChange={(e) => setField(i, k, e.target.value)} />
                        ))}
                        <button type="button" aria-label={t('imp.remove')} className="p-2 text-muted-foreground hover:text-error" onClick={() => update(rows.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                    </div>
                </div>
            ))}
            <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex flex-wrap items-center gap-2">
                    {presets.length > 0 && (
                        <select
                            className="h-9 rounded-md border border-input bg-card px-2 text-sm"
                            aria-label={t('pl.preset')}
                            value=""
                            onChange={(e) => {
                                const p = presets.find((x) => x.id === e.target.value);
                                if (p) update([...rows, rowFromPreset(p)]);
                            }}
                        >
                            <option value="">{t('pl.preset')}</option>
                            {presets.map((p) => (
                                <option key={p.id} value={p.id}>{p.name} · {kg(p.width)}×{kg(p.height)}×{kg(p.depth)}</option>
                            ))}
                        </select>
                    )}
                    <Button type="button" variant="outlined" size="sm" onClick={() => update([...rows, { width: '', height: '', depth: '', weight: '', name: '' }])}>
                        <Plus className="mr-1 h-4 w-4" />{t('pl.otherBox')}
                    </Button>
                </div>
                {clean.length > 0 && <span className="text-sm tabular-nums">{clean.length} · {kg(parcelsWeight(clean))} kg</span>}
            </div>
            {rows.length === 0 && <p className="text-xs text-muted-foreground">{t('pl.noBoxes')}</p>}
            {rows.length > clean.length && <p className="text-xs text-muted-foreground">{t('pl.incomplete')}</p>}
        </div>
    );
}
