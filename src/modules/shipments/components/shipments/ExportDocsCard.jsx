import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { FileText, Download, Upload, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { supabase } from '@/lib/supabase';
import { ExportCatalog } from './ExportCatalog';
import { ItemsEditor } from './ItemsEditor';
import { emptyItem, cleanItems } from '../../services/docItems';
import { buildExportPdf, downloadBytes, EUR1_THRESHOLD } from '../../services/exportDocs';
import { itemsTotal, money } from '../../services/importDocs';
import { originStatementFor, REX_NUMBER, REX_THRESHOLD } from '../../services/commercialInvoice';
import { findCustomerByName, loadExportCatalog, saveCodeRelations } from '../../services/importDocsApi';
import { codeBase, itemFromCatalog, matchCatalogInfo, orderTypeFromHs, parseInvoiceText } from '../../services/invoiceParser';
import { pdfLines } from '../../services/pdfText';
import { ddtNumberFromName, parseDdtText } from '../../services/ddtParser';

const MAX_BYTES = 15 * 1024 * 1024;
const emptyConsignee = { name: '', address: '', postal_code: '', city: '', country: '', tax_id: '', contact: '', phone: '', email: '' };
const num = (v) => Number(String(v ?? '').trim().replace(/\./g, '').replace(',', '.'));

/**
 * Documentos de alfândega de um envio fora da UE, num PDF só:
 *   - a fatura do gestionale (PDF enviado aqui, não fica salvo), assinada;
 *   - a Commercial Invoice em inglês, com artigos, HS, origem e, para o Reino
 *     Unido, a declaração de origem com o número REX;
 *   - o packing list, quando o envio tem caixas, com a referência do DDT;
 *   - a cópia do DDT (bolla di scarico), quando carregado (também não fica salvo);
 *   - a declaração de livre exportação e, se precisar, o mandato EUR.1.
 */
export function ExportDocsCard({ customerName, invoiceValue, country, parcels, reference, onInvoiceRead }) {
    const { t } = useTranslation();
    const fileRef = useRef(null);
    const ddtRef = useRef(null);
    // DDT: { name, bytes } + número e data (lidos do PDF, editáveis)
    const [ddt, setDdt] = useState(null);
    const [ddtNumber, setDdtNumber] = useState('');
    const [ddtDate, setDdtDate] = useState('');
    const [ddtAttach, setDdtAttach] = useState(false);
    const [ddtRead, setDdtRead] = useState(null); // 'ok' | 'fail' | null
    const statementKind = originStatementFor(country);
    const [invoice, setInvoice] = useState(null); // { name, bytes }
    const [number, setNumber] = useState('');
    const [date, setDate] = useState('');
    const [value, setValue] = useState(invoiceValue ? String(invoiceValue) : '');
    // Reino Unido: a origem vai na fatura (declaração REX), não no EUR.1.
    const [eur1, setEur1] = useState(!statementKind && Number(invoiceValue) > EUR1_THRESHOLD);
    const [eur1Touched, setEur1Touched] = useState(false);
    const [origin, setOrigin] = useState('wholly');
    const [producer, setProducer] = useState('eu');
    const [busy, setBusy] = useState(false);
    // assinatura e carimbo: ficam no banco (só equipe logada lê), não na pasta pública
    const [signature, setSignature] = useState(null); // Uint8Array | null
    const [signLoaded, setSignLoaded] = useState(false);
    const [useSign, setUseSign] = useState(true);
    const [error, setError] = useState('');

    // Commercial Invoice
    const [commercial, setCommercial] = useState(true);
    const [statement, setStatement] = useState(!!statementKind);
    const [consignee, setConsignee] = useState(emptyConsignee);
    // Despachante: a mercadoria vai para ele (consignee) e ele entrega ao
    // cliente em outro país; o cliente da fatura vira o comprador (Sold to).
    const [viaForwarder, setViaForwarder] = useState(false);
    const [forwarder, setForwarder] = useState(emptyConsignee);
    const [items, setItems] = useState([emptyItem()]);
    const [freight, setFreight] = useState('');
    const [terms, setTerms] = useState('DAP');
    const [catalog, setCatalog] = useState([]);

    useEffect(() => {
        let alive = true;
        supabase.from('company_assets').select('data_base64').eq('key', 'legal_rep_signature').maybeSingle()
            .then(({ data }) => {
                if (!alive) return;
                if (data?.data_base64) setSignature(Uint8Array.from(atob(data.data_base64), (c) => c.charCodeAt(0)));
                setSignLoaded(true);
            });
        loadExportCatalog().then((c) => alive && setCatalog(c)).catch(() => {});
        return () => { alive = false; };
    }, []);

    useEffect(() => { setStatement(!!statementKind); }, [statementKind]);

    // Destinatário = ficha do cliente; o país do envio vale se a ficha não tiver.
    useEffect(() => {
        let alive = true;
        findCustomerByName(customerName).then((c) => {
            if (!alive) return;
            setConsignee({
                name: c?.name || customerName || '',
                address: [c?.address_line1, c?.address_line2].filter(Boolean).join(', '),
                postal_code: c?.postal_code || '',
                city: c?.city || '',
                country: c?.country || country || '',
                tax_id: c?.tax_id || '',
                contact: c?.contact_name || '',
                phone: c?.phone || '',
                email: c?.email || '',
            });
        }).catch(() => {});
        return () => { alive = false; };
    }, [customerName, country]);

    const amount = num(value);
    useEffect(() => {
        if (!eur1Touched) setEur1(!statementKind && amount > EUR1_THRESHOLD);
    }, [amount, eur1Touched, statementKind]);

    const onFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setError('');
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return setError(t('exp.err.pdf'));
        if (file.size > MAX_BYTES) return setError(t('exp.err.size'));
        const bytes = new Uint8Array(await file.arrayBuffer());
        setInvoice({ name: file.name, bytes });
        // "FT 1255 - cliente.pdf" / "FTI_1356_EC_#60019.pdf" → 1255 / 1356
        const m = /(?:FTI?|fatt(?:ura)?|invoice)[\s_.-]*(\d{1,6})/i.exec(file.name);
        if (m && !number) setNumber(m[1]);
        readInvoice(bytes);
    };

    const onDdtFile = async (e) => {
        const file = e.target.files?.[0];
        e.target.value = '';
        if (!file) return;
        setError('');
        if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) return setError(t('pl.err.pdf'));
        if (file.size > MAX_BYTES) return setError(t('exp.err.size'));
        const bytes = new Uint8Array(await file.arrayBuffer());
        setDdt({ name: file.name, bytes });
        setDdtRead(null);
        const fromName = ddtNumberFromName(file.name);
        try {
            const r = parseDdtText(await pdfLines(bytes));
            setDdtNumber(r.number || fromName);
            setDdtDate(r.date || '');
            setDdtRead(r.number && r.date ? 'ok' : 'fail');
        } catch (err) {
            console.error('DDT read error:', err);
            setDdtNumber(fromName);
            setDdtRead('fail');
        }
    };
    const removeDdt = () => { setDdt(null); setDdtNumber(''); setDdtDate(''); setDdtRead(null); };

    // Lê a fatura do gestionale: número, data, artigos (com o produto da loja
    // quando o código já está relacionado) e frete. O que não der para ler
    // continua sendo preenchido à mão.
    const [readInfo, setReadInfo] = useState(null); // { items, matched } | 'fail'
    const readInvoice = async (bytes) => {
        setReadInfo(null);
        try {
            const r = parseInvoiceText(await pdfLines(bytes));
            if (r.number) setNumber(r.number);
            if (r.date) setDate(r.date);
            if (!r.items.length) return setReadInfo('fail');
            let matched = 0;
            let suggested = 0;
            const rows = r.items.map((it) => {
                const m = matchCatalogInfo(it.description, catalog, it.code);
                const base = {
                    ...emptyItem(), code: it.code, qty: String(it.qty).replace('.', ','), unit_value: it.unit_value.toFixed(2).replace('.', ','),
                    invoice_description: it.description, hs_invoice: it.hs_code,
                };
                if (!m) return { ...base, description: it.description, hs_code: it.hs_code };
                if (m.sure) matched += 1; else suggested += 1;
                // pelo nome é palpite: fica marcado até alguém confirmar o produto
                return { ...base, ...itemFromCatalog(m.row, it.description), unconfirmed: !m.sure };
            });
            setItems(rows);
            setFreight(r.freight ? String(r.freight).replace('.', ',') : '');
            const total = r.items.reduce((s, it) => s + it.qty * it.unit_value, 0) + r.freight;
            if (!value) setValue(String(Math.round(total * 100) / 100).replace('.', ','));
            setReadInfo({ items: r.items.length, matched, suggested });
            // dados do envio (ordem, tipo, cliente, país, frete pago) para o formulário principal
            onInvoiceRead?.({
                orderRef: r.orderRef,
                customer: r.customer,
                country: r.country,
                freight: r.freight,
                orderType: orderTypeFromHs(rows.map((x) => x.hs_code)),
            });
        } catch (err) {
            console.error('Invoice read error:', err);
            setReadInfo('fail');
        }
    };

    const goods = cleanItems(items);
    const freightValue = num(freight) || 0;
    const ciTotal = itemsTotal(goods) + freightValue;
    const mismatch = commercial && amount > 0 && goods.length > 0 && Math.abs(ciTotal - amount) > 0.01;
    const ciReady = !commercial || (consignee.name.trim() && (!viaForwarder || forwarder.name.trim()) && goods.length > 0);
    const trimmed = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, String(v).trim()]));
    // no PDF: consignee = quem recebe a mercadoria; buyer = cliente da fatura, se for outro
    const shipTo = trimmed(viaForwarder ? forwarder : consignee);
    const buyer = viaForwarder ? trimmed(consignee) : null;
    // produto sugerido pelo nome e ainda não confirmado: não gera
    const unconfirmed = commercial && items.some((it) => it.unconfirmed && it.description.trim());
    const boxes = (parcels || []).filter((p) => Number(p.weight) > 0);
    const ddtInfo = ddtNumber.trim() ? { number: ddtNumber.trim(), date: ddtDate } : null;
    const ready = invoice && number.trim() && date && ciReady && !unconfirmed;
    const rexMissing = commercial && statement && !REX_NUMBER;

    const generate = async () => {
        setError('');
        setBusy(true);
        try {
            const logo = await fetch('/logo.png').then((r) => (r.ok ? r.arrayBuffer() : null)).catch(() => null);
            const bytes = await buildExportPdf({
                invoiceBytes: invoice.bytes, logoBytes: logo, signatureBytes: useSign ? signature : null, invoiceNumber: number.trim(), invoiceDate: date,
                includeEur1: eur1, origin, producer,
                commercial: commercial ? {
                    consignee: shipTo,
                    buyer,
                    items: goods,
                    freight: freightValue,
                    terms: terms.trim(),
                    parcels: boxes,
                    statement: statement ? statementKind || 'uk' : null,
                } : null,
                packing: boxes.length ? {
                    consignee: shipTo,
                    buyer,
                    parcels: boxes,
                    items: commercial ? goods : [],
                    ddt: ddtInfo,
                    reference: String(reference || '').trim(),
                } : null,
                ddtBytes: boxes.length && ddt && ddtAttach ? ddt.bytes : null,
            });
            if (commercial) {
                // relação código da fatura → produto, para as próximas faturas
                saveCodeRelations(goods.filter((g) => g.code && g.catalog_id).map((g) => ({ code: codeBase(g.code), catalogId: g.catalog_id })), catalog).catch(() => {});
            }
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
    const eyebrow = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground';
    const partyFields = (data, set) => {
        const field = (label, key) => (
            <Input label={label} value={data[key]} onChange={(e) => set({ ...data, [key]: e.target.value })} />
        );
        return (
            <>
                {field(t('imp.name'), 'name')}
                {field(t('imp.address'), 'address')}
                <div className="grid grid-cols-2 gap-3">
                    {field(t('imp.postal'), 'postal_code')}
                    {field(t('imp.city'), 'city')}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    {field(t('imp.country'), 'country')}
                    {field(t('imp.tax'), 'tax_id')}
                </div>
                {field(t('imp.contact'), 'contact')}
                <div className="grid grid-cols-2 gap-3">
                    {field(t('imp.phone'), 'phone')}
                    {field('E-mail', 'email')}
                </div>
            </>
        );
    };

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center"><FileText className="mr-2 h-5 w-5" />{t('exp.title')}</CardTitle>
                <p className="text-sm text-muted-foreground">{t('exp.intro')}</p>
            </CardHeader>
            <CardContent className="space-y-4">
                <ExportCatalog />
                <div>
                    <span className={eyebrow}>{t('exp.invoice')}</span>
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
                    {readInfo && (
                        <p role="status" className={`mt-2 text-xs ${readInfo === 'fail' ? 'text-error' : 'text-muted-foreground'}`}>
                            {readInfo === 'fail' ? t('exp.ci.readFail') : t('exp.ci.read', { n: readInfo.items, m: readInfo.matched, s: readInfo.suggested })}
                        </p>
                    )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <Input label={t('exp.number')} value={number} onChange={(e) => setNumber(e.target.value)} placeholder="1255" />
                    <Input label={t('exp.date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                    <Input label={t('exp.value')} inputMode="decimal" value={value} onChange={(e) => setValue(e.target.value)} placeholder="9990" />
                </div>

                {/* ------------------------------------------------ DDT e packing list: só com caixas */}
                {boxes.length > 0 && (
                    <div className="space-y-3 rounded-md border border-border p-3">
                        <span className={eyebrow}>{t('pl.ddt')}</span>
                        {ddt ? (
                            <div className="flex items-center justify-between gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm">
                                <span className="truncate">{ddt.name}</span>
                                <button type="button" aria-label={t('pl.ddtRemove')} className="text-muted-foreground hover:text-error" onClick={removeDdt}>
                                    <X className="h-4 w-4" />
                                </button>
                            </div>
                        ) : (
                            <Button type="button" variant="outlined" className="w-full" onClick={() => ddtRef.current?.click()}>
                                <Upload className="mr-2 h-4 w-4" />{t('pl.ddtUpload')}
                            </Button>
                        )}
                        <input ref={ddtRef} type="file" accept="application/pdf,.pdf" className="hidden" onChange={onDdtFile} />
                        {ddtRead === 'fail' && <p role="status" className="text-xs text-error">{t('pl.ddtReadFail')}</p>}
                        <div className="grid grid-cols-2 gap-3">
                            <Input label={t('pl.ddtNumber')} value={ddtNumber} onChange={(e) => setDdtNumber(e.target.value)} placeholder="2/380" />
                            <Input label={t('pl.ddtDate')} type="date" value={ddtDate} onChange={(e) => setDdtDate(e.target.value)} />
                        </div>
                        {ddt && (
                            <label className="flex items-start gap-2 text-sm cursor-pointer">
                                <input type="checkbox" className="mt-1 accent-primary" checked={ddtAttach} onChange={(e) => setDdtAttach(e.target.checked)} />
                                <span>{t('pl.ddtAttach')}</span>
                            </label>
                        )}
                        <p className="text-xs text-muted-foreground">{t('pl.included', { n: boxes.length })}</p>
                    </div>
                )}

                {/* ------------------------------------------------ Commercial Invoice */}
                <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="mt-1 accent-primary" checked={commercial} onChange={(e) => setCommercial(e.target.checked)} />
                    <span><strong>{t('exp.ci')}</strong> — {t('exp.ci.hint')}</span>
                </label>
                {commercial && (
                    <div className="space-y-4 rounded-md border border-border p-3">
                        <div className="space-y-3">
                            <span className={eyebrow}>{viaForwarder ? t('exp.ci.buyer') : t('exp.ci.consignee')}</span>
                            {partyFields(consignee, setConsignee)}
                        </div>
                        <label className="flex items-start gap-2 text-sm cursor-pointer">
                            <input type="checkbox" className="mt-1 accent-primary" checked={viaForwarder} onChange={(e) => setViaForwarder(e.target.checked)} />
                            <span><strong>{t('exp.ci.forwarder')}</strong> — {t('exp.ci.forwarderHint')}</span>
                        </label>
                        {viaForwarder && (
                            <div className="space-y-3 rounded-md border border-dashed border-border p-3">
                                <span className={eyebrow}>{t('exp.ci.shipTo')}</span>
                                {partyFields(forwarder, setForwarder)}
                            </div>
                        )}

                        <ItemsEditor items={items} setItems={setItems} catalog={catalog} extraTotal={freightValue} withCode />

                        <div className="grid grid-cols-2 gap-3">
                            <Input label={t('exp.ci.freight')} inputMode="decimal" value={freight} onChange={(e) => setFreight(e.target.value)} placeholder="0,00" />
                            <Input label={t('exp.ci.terms')} value={terms} onChange={(e) => setTerms(e.target.value)} placeholder="DAP" />
                        </div>
                        {mismatch && (
                            <p className="text-sm text-error">{t('exp.ci.mismatch', { ci: money(ciTotal), invoice: money(amount) })}</p>
                        )}

                        <label className="flex items-start gap-2 text-sm cursor-pointer">
                            <input type="checkbox" className="mt-1 accent-primary" checked={statement} onChange={(e) => setStatement(e.target.checked)} />
                            <span>{t('exp.ci.statement')}</span>
                        </label>
                        {rexMissing && (
                            <p className={`text-xs ${amount > REX_THRESHOLD ? 'text-error' : 'text-muted-foreground'}`}>
                                {t('exp.ci.rexMissing', { limit: REX_THRESHOLD.toLocaleString('it-IT') })}
                            </p>
                        )}
                    </div>
                )}

                <label className="flex items-start gap-2 text-sm cursor-pointer">
                    <input type="checkbox" className="mt-1 accent-primary" checked={eur1} onChange={(e) => { setEur1(e.target.checked); setEur1Touched(true); }} />
                    <span>{t('exp.eur1', { limit: EUR1_THRESHOLD.toLocaleString('it-IT') })}</span>
                </label>
                {statementKind && <p className="-mt-2 text-xs text-muted-foreground">{t('exp.ci.noEur1Uk')}</p>}

                {signature ? (
                    <label className="flex items-start gap-2 text-sm cursor-pointer">
                        <input type="checkbox" className="mt-1 accent-primary" checked={useSign} onChange={(e) => setUseSign(e.target.checked)} />
                        <span>{t('exp.sign')}</span>
                    </label>
                ) : signLoaded && <p className="text-xs text-muted-foreground">{t('exp.sign.none')}</p>}

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
                {!ready && (
                    <p className={`text-xs ${unconfirmed ? 'text-error' : 'text-muted-foreground'}`}>
                        {unconfirmed ? t('exp.ci.unconfirmed') : commercial && !ciReady ? t('exp.ci.missing') : t('exp.missing')}
                    </p>
                )}
            </CardContent>
        </Card>
    );
}
