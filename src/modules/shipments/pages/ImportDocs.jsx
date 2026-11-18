import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Download, ExternalLink, Ban, RotateCcw } from 'lucide-react';
import { itDate } from '../services/exportDocs';
import { money } from '../services/importDocs';
import { countryLabel } from '../data/countries';
import { downloadImportDoc, listImportDocs, setImportDocCancelled } from '../services/importDocsApi';

/**
 * Registro das proformas de importação (IMP-NNN): todos os números já usados,
 * com o ritiro de origem. Um documento errado é anulado — o número continua
 * usado, para a sequência não ter buracos nem repetições.
 */
export default function ImportDocs() {
    const { t, i18n } = useTranslation();
    const [rows, setRows] = useState(null);
    const [error, setError] = useState('');

    const load = () => listImportDocs().then(setRows).catch((e) => setError(e.message));
    useEffect(() => { load(); }, []);

    const toggle = async (d) => {
        if (!d.cancelled && !window.confirm(t('imp.confirmCancel', { code: d.code }))) return;
        try {
            await setImportDocCancelled(d.id, !d.cancelled);
            load();
        } catch (e) {
            setError(e.message);
        }
    };

    const valid = rows?.filter((d) => !d.cancelled) ?? [];

    const actions = (d) => (
        <div className="flex justify-end gap-1">
            {d.shipment_id && (
                <Link to={`/shipments/${d.shipment_id}`} title={t('imp.openPickup')} aria-label={t('imp.openPickup')} className="p-3 md:p-1.5 text-muted-foreground hover:text-foreground"><ExternalLink className="h-4 w-4" /></Link>
            )}
            <button type="button" title={t('imp.download')} aria-label={t('imp.download')} className="p-3 md:p-1.5 text-muted-foreground hover:text-foreground" onClick={() => downloadImportDoc(d)}><Download className="h-4 w-4" /></button>
            <button type="button" title={d.cancelled ? t('imp.restore') : t('imp.cancel')} aria-label={d.cancelled ? t('imp.restore') : t('imp.cancel')} className="p-3 md:p-1.5 text-muted-foreground hover:text-foreground" onClick={() => toggle(d)}>
                {d.cancelled ? <RotateCcw className="h-4 w-4" /> : <Ban className="h-4 w-4" />}
            </button>
        </div>
    );

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div>
                <h1 className="page-title">{t('imp.registerTitle')}</h1>
                <p className="text-muted-foreground mt-2 max-w-3xl">{t('imp.registerIntro')}</p>
            </div>

            {rows && rows.length > 0 && (
                <p className="text-sm text-muted-foreground">
                    {t('imp.registerCount', { n: rows.length, last: rows[0].code, valid: valid.length })}
                </p>
            )}

            {error && <p className="text-sm text-error">{error}</p>}
            {!rows ? (
                <p className="py-16 text-center text-muted-foreground">{t('imp.loading')}</p>
            ) : rows.length === 0 ? (
                <p className="py-16 text-center text-muted-foreground">{t('imp.registerEmpty')}</p>
            ) : (
                <>
                <div className="md:hidden flex flex-col gap-3">
                    {rows.map((d) => (
                        <article key={d.id} className={`bg-card border border-border rounded-lg p-4 pb-1 ${d.cancelled ? 'text-muted-foreground' : ''}`}>
                            <div className="flex items-center justify-between gap-3">
                                <span className="flex flex-wrap items-center gap-2 font-semibold tabular-nums">
                                    <span className={d.cancelled ? 'line-through' : ''}>{d.code}</span>
                                    {d.cancelled && <span className="rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase">{t('imp.cancelled')}</span>}
                                </span>
                                <span className="shrink-0 text-sm tabular-nums text-muted-foreground">{itDate(d.issued_on)}</span>
                            </div>
                            <p className="mt-2 break-words text-[17px] font-semibold leading-snug tracking-tight">{d.shipper?.name}</p>
                            <p className="text-sm text-muted-foreground">{[d.shipper?.city, d.shipper?.country && countryLabel(d.shipper.country, i18n.language || 'it')].filter(Boolean).join(', ')}</p>
                            {d.reason && <p className="mt-2 text-sm">{d.reason}</p>}
                            <div className="mt-2 flex items-center justify-between gap-3 border-t border-muted pt-1">
                                <span className="font-semibold tabular-nums">€ {money(d.total_value)}</span>
                                {actions(d)}
                            </div>
                        </article>
                    ))}
                </div>
                <div className="hidden md:block bg-card border border-border rounded-lg overflow-x-auto">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.1em] text-muted-foreground">
                                <th className="px-4 py-3 font-semibold">{t('imp.col.number')}</th>
                                <th className="px-4 py-3 font-semibold">{t('imp.date')}</th>
                                <th className="px-4 py-3 font-semibold">{t('imp.shipper')}</th>
                                <th className="px-4 py-3 font-semibold">{t('imp.reason')}</th>
                                <th className="px-4 py-3 font-semibold text-right">{t('imp.col.value')}</th>
                                <th className="px-4 py-3" />
                            </tr>
                        </thead>
                        <tbody>
                            {rows.map((d) => (
                                <tr key={d.id} className={`border-b border-border last:border-0 ${d.cancelled ? 'text-muted-foreground' : ''}`}>
                                    <td className="px-4 py-3 font-semibold tabular-nums whitespace-nowrap">
                                        <span className={d.cancelled ? 'line-through' : ''}>{d.code}</span>
                                        {d.cancelled && <span className="ml-2 rounded-full border border-border px-2 py-0.5 text-[10px] font-semibold uppercase">{t('imp.cancelled')}</span>}
                                    </td>
                                    <td className="px-4 py-3 tabular-nums whitespace-nowrap">{itDate(d.issued_on)}</td>
                                    <td className="px-4 py-3">
                                        <div className="font-medium">{d.shipper?.name}</div>
                                        <div className="text-xs text-muted-foreground">{[d.shipper?.city, d.shipper?.country && countryLabel(d.shipper.country, i18n.language || 'it')].filter(Boolean).join(', ')}</div>
                                    </td>
                                    <td className="px-4 py-3 text-xs">{d.reason}</td>
                                    <td className="px-4 py-3 text-right tabular-nums whitespace-nowrap">€ {money(d.total_value)}</td>
                                    <td className="px-4 py-3">
                                        {actions(d)}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
                </>
            )}
        </div>
    );
}
