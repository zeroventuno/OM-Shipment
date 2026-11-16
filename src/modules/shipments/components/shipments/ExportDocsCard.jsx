import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Download, Upload, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { buildExportPdf, downloadBytes, EUR1_THRESHOLD } from '../../services/exportDocs';

const MAX_BYTES = 15 * 1024 * 1024;

/**
 * Documentos de alfândega de um envio fora da UE. A fatura vem do gestionale
 * (PDF enviado aqui, não fica salvo); o resto é gerado e tudo sai num PDF só.
 */
export function ExportDocsCard({ customerName, invoiceValue }) {
    const { t } = useTranslation();
    const fileRef = useRef(null);
    const [invoice, setInvoice] = useState(null); // { name, bytes }
    const [number, setNumber] = useState('');
    const [date, setDate] = useState('');
    const [value, setValue] = useState(invoiceValue ? String(invoiceValue) : '');
    const [eur1, setEur1] = useState(Number(invoiceValue) > EUR1_THRESHOLD);
    const [eur1Touched, setEur1Touched] = useState(false);
    const [origin, setOrigin] = useState('wholly');
    const [producer, setProducer] = useState('eu');
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const amount = Number(String(value).replace(/\./g, '').replace(',', '.'));
    useEffect(() => {
        if (!eur1Touched) setEur1(amount > EUR1_THRESHOLD);
    }, [amount, eur1Touched]);

    const onFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setError('');
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return setError(t('exp.err.pdf'));
        if (file.size > MAX_BYTES) return setError(t('exp.err.size'));
        setInvoice({ name: file.name, bytes: new Uint8Array(await file.arrayBuffer()) });
        // "FT 1255 - cliente.pdf" → 1255
        const m = /(?:FT|fatt(?:ura)?|invoice)[\s_.-]*(\d{1,6})/i.exec(file.name);
        if (m && !number) setNumber(m[1]);
    };

    const ready = invoice && number.trim() && date;

    const generate = async () => {
        setError('');
        setBusy(true);
        try {
            const logo = await fetch('/logo.png').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
            const bytes = await buildExportPdf({
                invoiceBytes: invoice.bytes, logoBytes: logo, invoiceNumber: number.trim(), invoiceDate: date,
                includeEur1: eur1, origin, producer,
            });
            const who = (customerName || '').replace(/[^\w-]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 40);
            downloadBytes(bytes, `Export_FT${number.trim()}${who ? `_${who}` : ''}.pdf`);
        } catch (err) {
            console.error('Export docs error:', err);
            setError(t('exp.err.build'));
        } finally {
            setBusy(false);
        }
    };

    const radio = (name, current, set, options) => (
        <div className="space-y-1.5">
            {options.map(([val, label]) => (
                <label key={val} className="flex items-start gap-2 text-sm cursor-pointer">
                    <input type="radio" name={name} className="mt-1 accent-primary" checked={current === val} onChange={() => set(val)} />
                    <span>{label}</span>
                </label>
            ))}
        </div>
    );

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center"><FileText className="mr-2 h-5 w-5" />{t('exp.title')}</CardTitle>
                <p className="text-sm text-muted-foreground">{t('exp.intro')}</p>
            </CardHeader>
            <CardContent className="space-y-4">
                <div>
                    <span className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t('exp.invoice')}</span>
                    {invoice ? (
                        <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
                            <span className="truncate">{invoice.name}</span>
                            <button type="button" aria-label={t('exp.remove')} className="text-muted-foreground hover:text-error" onClick={() => setInvoice(null)}>
                                <X className="h-4 w-4" />
                            </button>
                        </div>
                    ) : (
                        <Button type="button" variant="outlined" className="w-full" onClick={() => fileRef.current?.click()}>
                            <Upload className="mr-2 h-4 w-4" />{t('exp.upload')}
                        </Button>
                    )}
                    <input ref={fileRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onFile} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Input label={t('exp.number')} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="1255" />
                    <Input label={t('exp.date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                    <Input label={t('exp.value')} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="9990" />
                </div>

                <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="mt-1 accent-primary" checked={eur1} onChange={(e) => { setEur1(e.target.checked); setEur1Touched(true); }} />
                    <span>{t('exp.eur1', { limit: EUR1_THRESHOLD.toLocaleString('it-IT') })}</span>
                </label>

                {eur1 && (
                    <div className="space-y-3 rounded-md border border-border p-3">
                        <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t('exp.origin')}</p>
                            {radio('exp-origin', origin, setOrigin, [['wholly', t('exp.origin.wholly')], ['worked', t('exp.origin.worked')]])}
                        </div>
                        <div>
                            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t('exp.producer')}</p>
                            {radio('exp-producer', producer, setProducer, [['eu', t('exp.producer.eu')], ['own', t('exp.producer.own')]])}
                        </div>
                    </div>
                )}

                {error && <p className="text-sm text-error">{error}</p>}
                <Button type="button" className="w-full" disabled={!ready || busy} onClick={generate}>
                    <Download className="mr-2 h-4 w-4" />{busy ? t('Generating...') : t('exp.download')}
                </Button>
                {!ready && <p className="text-xs text-muted-foreground">{t('exp.missing')}</p>}
            </CardContent>
        </Card>
    );
}
