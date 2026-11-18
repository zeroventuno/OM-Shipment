import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { FileText, Download, Plus, Trash2, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../ui/Card';
import { Input } from '../ui/Input';
import { Button } from '../ui/Button';
import { IMPORT_REASONS, money, parcelsWeight, kg } from '../../services/importDocs';
import { ItemsEditor } from './ItemsEditor';
import { emptyItem, cleanItems as toCleanItems } from '../../services/docItems';
import { todayRome } from '../../services/exportDocs';
import { CustomerSearch } from './CustomerSearch';
import {
    NEW_ADDRESS, addressToSave, initialAddressChoice, shipperAddressFields, shipperFromCustomer,
} from '../../services/customerShipper';
import {
    addCustomerAddress, downloadImportDoc, findCustomerForShipment, issueImportDoc, listImportDocs,
    loadAddressOptions, loadCustomer, loadExportCatalog,
} from '../../services/importDocsApi';

/**
 * Ritiro de fora da UE: proforma de importação com o CLIENTE como remetente e a
 * Officine Mattio como destinatária, mais o packing list, num PDF assinado.
 * Cada documento recebe o próximo número IMP-NNN ao ser emitido.
 */

const emptyShipper = { name: '', address: '', postal_code: '', city: '', country: '', tax_id: '', contact: '', phone: '', email: '' };
const toStr = (v) => (v === null || v === undefined ? '' : String(v));
const num = (v) => Number(String(v ?? '').trim().replace(',', '.'));

export function ImportDocsCard({ shipmentId, customerName, country, parcels }) {
    const { t } = useTranslation();
    const [docs, setDocs] = useState([]);
    const [catalog, setCatalog] = useState([]);
    const [editing, setEditing] = useState(null); // id do documento em edição, ou null = novo
    const [shipper, setShipper] = useState(emptyShipper);
    const [customerId, setCustomerId] = useState(null);
    const [customer, setCustomer] = useState(null);
    const [picked, setPicked] = useState(null); // cliente escolhido à mão para este nome
    const [lookupDone, setLookupDone] = useState(false);
    const [changingCustomer, setChangingCustomer] = useState(false);
    const [customerSearch, setCustomerSearch] = useState('');
    const [addresses, setAddresses] = useState([]);
    const [addressChoice, setAddressChoice] = useState('');
    const [date, setDate] = useState(todayRome());
    const [reason, setReason] = useState('warranty');
    const [reasonText, setReasonText] = useState('');
    const [returned, setReturned] = useState(true);
    const [notes, setNotes] = useState('');
    const [items, setItems] = useState([emptyItem()]);
    const [boxes, setBoxes] = useState([]);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');

    const reload = () => shipmentId && listImportDocs(shipmentId).then(setDocs).catch(() => {});
    useEffect(() => { reload(); }, [shipmentId]); // eslint-disable-line react-hooks/exhaustive-deps
    useEffect(() => { loadExportCatalog().then(setCatalog).catch(() => {}); }, []);

    // Remetente = ficha do cliente. Um endereço só já entra preenchido; com
    // vários, o usuário escolhe; sem ficha, valem o nome e o país da retirada.
    useEffect(() => {
        if (editing) return;
        let alive = true;
        setLookupDone(false);
        const pickedId = picked?.forName === customerName ? picked.id : null;
        (async () => {
            const c = await (pickedId ? loadCustomer(pickedId) : findCustomerForShipment(customerName));
            return [c, c ? await loadAddressOptions(c) : []];
        })().catch(() => [null, []]).then(([c, options]) => {
            if (!alive) return;
            const choice = initialAddressChoice(options);
            setCustomer(c);
            setCustomerId(c?.id || null);
            setAddresses(options);
            setAddressChoice(choice);
            setShipper({ ...emptyShipper, ...shipperFromCustomer(c, options.find((o) => o.key === choice), { name: customerName, country }) });
            setChangingCustomer(false);
            setLookupDone(true);
        });
        return () => { alive = false; };
    }, [customerName, country, editing, picked]);

    const chooseAddress = (value) => {
        setAddressChoice(value);
        const option = addresses.find((o) => o.key === value);
        setShipper((s) => ({ ...s, ...shipperAddressFields(customer, option, country) }));
    };
    const pickCustomer = (c) => {
        setCustomerSearch('');
        setPicked({ id: c.id, forName: customerName });
    };

    useEffect(() => {
        if (!editing) setBoxes((parcels || []).map((p) => ({ width: toStr(p.width), height: toStr(p.height), depth: toStr(p.depth), weight: toStr(p.weight) })));
    }, [parcels, editing]);

    const startEdit = (d) => {
        setEditing(d.id);
        setShipper({ ...emptyShipper, ...d.shipper });
        setCustomerId(d.customer_id);
        setDate(d.issued_on);
        const key = Object.keys(IMPORT_REASONS).find((k) => IMPORT_REASONS[k] === d.reason);
        setReason(key || 'other');
        setReasonText(key ? '' : d.reason || '');
        setReturned(d.returned !== false);
        setNotes(d.notes || '');
        setItems((d.items || []).map((it) => ({ ...emptyItem(), ...Object.fromEntries(Object.entries(it).map(([k, v]) => [k, toStr(v)])) })));
        setBoxes((d.parcels || []).map((p) => ({ width: toStr(p.width), height: toStr(p.height), depth: toStr(p.depth), weight: toStr(p.weight), name: p.name })));
    };
    const startNew = () => {
        setEditing(null);
        setItems([emptyItem()]);
        setNotes('');
        setReason('warranty');
        setReasonText('');
        setReturned(true);
        setDate(todayRome());
    };

    const setBox = (i, field, value) => setBoxes((l) => l.map((x, j) => (j === i ? { ...x, [field]: value } : x)));

    const cleanItems = toCleanItems(items);
    const cleanBoxes = boxes
        .filter((b) => [b.width, b.height, b.depth, b.weight].every((v) => num(v) > 0))
        .map((b) => ({ width: num(b.width), height: num(b.height), depth: num(b.depth), weight: num(b.weight), ...(b.name ? { name: b.name } : {}) }));
    const reasonValue = reason === 'other' ? reasonText.trim() : IMPORT_REASONS[reason];
    const addressMissing = !editing && customer && !addressChoice;
    const ready = shipper.name.trim() && shipper.country && cleanItems.length > 0 && reasonValue && date && !addressMissing;
    const nextLabel = editing ? docs.find((d) => d.id === editing)?.code : null;

    const issue = async () => {
        setError('');
        setBusy(true);
        const newAddress = !editing && customerId && addressChoice === NEW_ADDRESS ? addressToSave(shipper, addresses) : null;
        try {
            const row = await issueImportDoc({
                id: editing || undefined,
                shipment_id: shipmentId,
                customer_id: customerId,
                issued_on: date,
                shipper: Object.fromEntries(Object.entries(shipper).map(([k, v]) => [k, String(v).trim()])),
                items: cleanItems,
                parcels: cleanBoxes,
                reason: reasonValue,
                notes: notes.trim(),
                returned,
            });
            if (newAddress) {
                await addCustomerAddress(customerId, newAddress).catch((err) => {
                    console.error('Customer address error:', err);
                    setError(t('imp.addressNotSaved'));
                });
            }
            await downloadImportDoc(row);
            setEditing(row.id);
            reload();
        } catch (err) {
            console.error('Import doc error:', err);
            setError(err.message || t('exp.err.build'));
        } finally {
            setBusy(false);
        }
    };

    const field = (label, key, props = {}) => (
        <Input label={label} value={shipper[key]} onChange={(e) => setShipper({ ...shipper, [key]: e.target.value })} {...props} />
    );
    const small = 'h-9 w-full rounded-md border border-input bg-card px-2 text-sm';
    const eyebrow = 'mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground';

    return (
        <Card>
            <CardHeader>
                <CardTitle className="flex items-center"><FileText className="mr-2 h-5 w-5" />{t('imp.title')}</CardTitle>
                <p className="text-sm text-muted-foreground">{t('imp.intro')}</p>
            </CardHeader>
            <CardContent className="space-y-5">
                {!shipmentId ? (
                    <p className="text-sm">{t('imp.saveFirst')}</p>
                ) : (
                    <>
                        {docs.length > 0 && (
                            <div className="space-y-2">
                                <span className={eyebrow}>{t('imp.issued')}</span>
                                {docs.map((d) => (
                                    <div key={d.id} className={`flex items-center gap-2 rounded-md border px-3 py-2 text-sm ${editing === d.id ? 'border-foreground' : 'border-border'} ${d.cancelled ? 'opacity-50 line-through' : ''}`}>
                                        <span className="font-semibold tabular-nums">{d.code}</span>
                                        <span className="text-muted-foreground tabular-nums">€ {money(d.total_value)}</span>
                                        <span className="ml-auto flex gap-1">
                                            <button type="button" title={t('imp.edit')} aria-label={t('imp.edit')} className="p-1.5 text-muted-foreground hover:text-foreground" onClick={() => startEdit(d)}><Pencil className="h-4 w-4" /></button>
                                            <button type="button" title={t('imp.download')} aria-label={t('imp.download')} className="p-1.5 text-muted-foreground hover:text-foreground" onClick={() => downloadImportDoc(d)}><Download className="h-4 w-4" /></button>
                                        </span>
                                    </div>
                                ))}
                                {editing && (
                                    <button type="button" className="text-sm underline" onClick={startNew}>{t('imp.new')}</button>
                                )}
                            </div>
                        )}

                        <div className="space-y-3">
                            <span className={eyebrow}>{t('imp.shipper')}</span>
                            {!editing && lookupDone && customer && !changingCustomer && (
                                <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2 text-sm">
                                    <span className="min-w-0 break-words">{t('imp.fromCustomer')} <strong className="font-semibold">{customer.name}</strong></span>
                                    <button type="button" className="tap-target shrink-0 underline" onClick={() => setChangingCustomer(true)}>{t('imp.changeCustomer')}</button>
                                </div>
                            )}
                            {!editing && lookupDone && customer && customerName?.trim() && customerName.trim().toLowerCase() !== customer.name.trim().toLowerCase() && (
                                <p className="text-xs text-error">{t('imp.nameDiffers', { name: customerName.trim() })}</p>
                            )}
                            {!editing && lookupDone && (!customer || changingCustomer) && (
                                <div className="space-y-1">
                                    <CustomerSearch value={customerSearch} onChange={setCustomerSearch} onSelect={pickCustomer} />
                                    {!customer && <p className="text-xs text-muted-foreground">{t('imp.noCustomer')}</p>}
                                </div>
                            )}
                            {!editing && customer && addresses.length > 0 && (
                                <div>
                                    <label htmlFor="imp-address" className={eyebrow}>{t('imp.pickupAddress')}</label>
                                    <select id="imp-address" className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm" value={addressChoice} onChange={(e) => chooseAddress(e.target.value)}>
                                        {!addressChoice && <option value="">{t('imp.chooseAddress')}</option>}
                                        {addresses.map((o) => <option key={o.key} value={o.key}>{o.label}</option>)}
                                        <option value={NEW_ADDRESS}>{t('imp.newAddress')}</option>
                                    </select>
                                </div>
                            )}
                            {!editing && customer && addressChoice === NEW_ADDRESS && (
                                <p className="text-xs text-muted-foreground">{t('imp.newAddressHint')}</p>
                            )}
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
                            <div className="grid grid-cols-2 gap-3">
                                {field(t('imp.phone'), 'phone')}
                                {field('E-mail', 'email')}
                            </div>
                            {field(t('imp.contact'), 'contact')}
                        </div>

                        <div className="space-y-3">
                            <div className="grid grid-cols-2 gap-3">
                                <Input label={t('imp.date')} type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                                <div>
                                    <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t('imp.reason')}</label>
                                    <select className="flex h-10 w-full rounded-md border border-input bg-card px-3 text-sm" value={reason} onChange={(e) => setReason(e.target.value)}>
                                        {Object.keys(IMPORT_REASONS).map((k) => <option key={k} value={k}>{t(`imp.reason.${k}`)}</option>)}
                                        <option value="other">{t('imp.reason.other')}</option>
                                    </select>
                                </div>
                            </div>
                            {reason === 'other' && <Input label={t('imp.reasonText')} value={reasonText} onChange={(e) => setReasonText(e.target.value)} placeholder="Return of goods for..." />}
                            <label className="flex items-start gap-2 text-sm cursor-pointer">
                                <input type="checkbox" className="mt-1 accent-primary" checked={returned} onChange={(e) => setReturned(e.target.checked)} />
                                <span>{t('imp.returned')}</span>
                            </label>
                        </div>

                        <ItemsEditor items={items} setItems={setItems} catalog={catalog} withProductId />

                        <div className="space-y-2">
                            <span className={eyebrow}>{t('imp.packing')}</span>
                            {boxes.map((b, i) => (
                                <div key={i} className="grid grid-cols-[repeat(4,minmax(0,1fr))_auto] gap-2 items-center">
                                    {['width', 'height', 'depth', 'weight'].map((k) => (
                                        <input key={k} className={small} inputMode="decimal" aria-label={t(`imp.box.${k}`)} placeholder={t(`imp.box.${k}`)} value={b[k]} onChange={(e) => setBox(i, k, e.target.value)} />
                                    ))}
                                    <button type="button" aria-label={t('imp.remove')} className="p-2 text-muted-foreground hover:text-error" onClick={() => setBoxes((l) => l.filter((_, j) => j !== i))}><Trash2 className="h-4 w-4" /></button>
                                </div>
                            ))}
                            <div className="flex items-center justify-between">
                                <Button type="button" variant="outlined" size="sm" onClick={() => setBoxes((l) => [...l, { width: '', height: '', depth: '', weight: '' }])}><Plus className="mr-1 h-4 w-4" />{t('imp.addBox')}</Button>
                                {cleanBoxes.length > 0 && <span className="text-sm tabular-nums">{cleanBoxes.length} · {kg(parcelsWeight(cleanBoxes))} kg</span>}
                            </div>
                            {boxes.length === 0 && <p className="text-xs text-muted-foreground">{t('imp.noBoxes')}</p>}
                        </div>

                        <Input label={t('imp.notes')} value={notes} onChange={(e) => setNotes(e.target.value)} />

                        {error && <p className="text-sm text-error">{error}</p>}
                        <Button type="button" className="w-full" disabled={!ready || busy} onClick={issue}>
                            <Download className="mr-2 h-4 w-4" />
                            {busy ? t('Generating...') : editing ? t('imp.saveDownload', { code: nextLabel }) : t('imp.issue')}
                        </Button>
                        {!ready && <p className="text-xs text-muted-foreground">{t(addressMissing ? 'imp.addressMissing' : 'imp.missing')}</p>}
                        <Link to="/shipments/import-docs" className="block text-center text-xs text-muted-foreground underline">{t('imp.register')}</Link>
                    </>
                )}
            </CardContent>
        </Card>
    );
}

