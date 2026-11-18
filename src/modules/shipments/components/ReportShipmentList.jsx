import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Camera, FileCheck, Pencil, Trash2, Truck } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from './ui/Button';
import { countryLabel } from '../data/countries';

const PAGE = 30;
const ICON_BUTTON = 'h-11 w-11 flex items-center justify-center rounded-full text-foreground active:bg-secondary disabled:text-gray-300';

function Amount({ label, value, negative, strong }) {
    return (
        <div className="min-w-0">
            <dt className="text-[11px] text-muted-foreground">{label}</dt>
            <dd className={cn('text-sm tabular-nums', strong && 'font-semibold', negative && 'text-destructive')}>€ {value}</dd>
        </div>
    );
}

/** Lista de envios do Report no celular: um card por envio, com todas as ações da tabela. */
export default function ReportShipmentList({ shipments, selectedItems, onSelectAll, onSelectItem, onDelete, onPhotos, onPod }) {
    const { t, i18n } = useTranslation();
    const [shown, setShown] = useState(PAGE);

    if (shipments.length === 0) {
        return <p className="py-8 text-center text-muted-foreground">{t('No shipments found')}</p>;
    }

    return (
        <div className="flex flex-col gap-3">
            <label className="flex min-h-11 items-center gap-3 text-sm">
                <input
                    type="checkbox"
                    className="h-5 w-5 accent-primary"
                    checked={selectedItems.length === shipments.length}
                    onChange={onSelectAll}
                />
                {t('Select all')}
            </label>

            {shipments.slice(0, shown).map((s) => {
                const quote = s.selectedQuote;
                const profit = s.profit || 0;
                return (
                    <article key={s.id} className={cn('rounded-lg border bg-card', selectedItems.includes(s.id) ? 'border-foreground' : 'border-border')}>
                        <div className="flex items-start gap-1 p-1 pb-0">
                            <label className="flex h-11 w-11 shrink-0 items-center justify-center">
                                <input
                                    type="checkbox"
                                    className="h-5 w-5 accent-primary"
                                    aria-label={`${t('Order')} ${s.orderId}`}
                                    checked={selectedItems.includes(s.id)}
                                    onChange={() => onSelectItem(s.id)}
                                />
                            </label>
                            <Link to={`/shipments/${s.id}`} className="min-w-0 flex-1 py-2.5 pr-3">
                                <span className="flex items-baseline justify-between gap-3 text-xs text-muted-foreground">
                                    <span className="font-semibold tabular-nums text-foreground">{s.orderId}</span>
                                    <span className="shrink-0 tabular-nums">{new Date(s.createdAt).toLocaleDateString(i18n.language)}</span>
                                </span>
                                <span className="mt-1 block break-words text-[17px] font-semibold leading-snug tracking-tight">{s.customerName || '-'}</span>
                                <span className="mt-0.5 block text-sm text-muted-foreground">
                                    {[countryLabel(s.destinationCountry, i18n.language), quote ? `${quote.portal} / ${quote.carrier}` : t('Customer Cost/Pickup')].filter(Boolean).join(' · ')}
                                </span>
                                {s.orderType && (
                                    <span className="mt-2 inline-block rounded-full border border-border px-2 py-0.5 text-[11px] font-medium">{t(s.orderType)}</span>
                                )}
                            </Link>
                        </div>

                        <dl className="mx-4 mt-1 grid grid-cols-2 min-[360px]:grid-cols-4 items-end gap-2 border-t border-muted pt-3">
                            <Amount label={t('Cost')} value={quote ? quote.price : '0.00'} />
                            <Amount label={t('Customer Payment')} value={s.customerPayment} />
                            <Amount label={t('Profit')} value={profit.toFixed(2)} negative={profit < 0} strong />
                            <Amount label={t('Savings')} value={(s.savings || 0).toFixed(2)} strong />
                        </dl>

                        <div className="flex items-center gap-0.5 p-1">
                            {s.trackingCode ? (
                                <button type="button" id={`track-${s.id}`} data-num={s.trackingCode} className={cn('tracking-trigger', ICON_BUTTON)} aria-label={`${t('Tracking')} ${s.trackingCode}`}>
                                    <Truck className="h-5 w-5" />
                                </button>
                            ) : (
                                <button type="button" disabled className={ICON_BUTTON} aria-label={t('No tracking')}><Truck className="h-5 w-5" /></button>
                            )}
                            <button type="button" disabled={!s.photoUrls?.length} className={ICON_BUTTON} aria-label={s.photoUrls?.length ? `${s.photoUrls.length} ${t('Photos')}` : t('No photos')} onClick={() => onPhotos(s.photoUrls)}>
                                <Camera className="h-5 w-5" />
                            </button>
                            <button type="button" disabled={!s.podFiles?.length} className={ICON_BUTTON} aria-label={s.podFiles?.length ? t('Proof of delivery') : t('No proof of delivery')} onClick={() => onPod(s.podFiles[0])}>
                                <FileCheck className="h-5 w-5" />
                            </button>
                            <Link to={`/shipments/${s.id}`} className={cn(ICON_BUTTON, 'ml-auto')} aria-label={t('Edit')}>
                                <Pencil className="h-5 w-5" />
                            </Link>
                            <button type="button" className={cn(ICON_BUTTON, 'text-destructive')} aria-label={t('Delete')} onClick={() => onDelete(s.id)}>
                                <Trash2 className="h-5 w-5" />
                            </button>
                        </div>
                    </article>
                );
            })}

            {shown < shipments.length && (
                <Button variant="outlined" className="self-center" onClick={() => setShown((n) => n + PAGE)}>
                    {t('Show more')} ({shipments.length - shown})
                </Button>
            )}
        </div>
    );
}
