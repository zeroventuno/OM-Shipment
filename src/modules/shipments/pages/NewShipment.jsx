import { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Plus, Trash2, Save, TrendingDown, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { PhotoUpload } from '../components/shipments/PhotoUpload';
import { PodUpload } from '../components/shipments/PodUpload';
import { ExportDocsCard } from '../components/shipments/ExportDocsCard';
import { ImportDocsCard } from '../components/shipments/ImportDocsCard';
import { CustomerSearch } from '../components/shipments/CustomerSearch';
import { isExtraEu } from '../services/exportDocs';
import { storageService } from '../services/storage';
import { useTranslation } from 'react-i18next';
import { COUNTRIES, countryLabel } from '../data/countries';
import { analyzeQuotes, calculateProfit } from '../utils/quotes';
import { resolveStatus } from '../utils/shipmentStatus';
import { listTickets } from '@/modules/assistance/api';
import { listWarranties } from '@/modules/warranties/api';
import { getRequest, boxSummary, totalWeight, formatAddress, formatMoney } from '@/modules/requests/api';

// Pallet/caminhão e tarifas spot são cotados por e-mail: entram como "portal"
// para poderem ser comparados com os outros.
const PORTALS = ['MBE', 'My Parcel', 'My DHL', 'BRT', 'Pallet / Truck', 'Spot / Last minute'];
const ALL_CARRIERS = ['TNT', 'Fedex', 'DHL', 'BRT', 'SDA', 'UPS'];
const ORDER_TYPES = ['Bicycle', 'Frame Kit', 'Components', 'Warranty', 'Clothing/Accessories', 'Gift', 'Rental', 'Other'];

export default function NewShipment() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { id } = useParams();
    const isEditing = !!id;
    const [searchParams] = useSearchParams();
    const requestParam = searchParams.get('request');
    // Pedido de envio de origem (feito pela equipe no formulário aberto)
    const [request, setRequest] = useState(null);

    const [formData, setFormData] = useState({
        orderId: '',
        orderType: '',
        customerName: '',
        quantity: 1,
        destinationCountry: '',
        customerPayment: '',
        trackingCode: '',
        photoUrls: [],
        customerCostPickup: false,
        // Ritiro: a mercadoria vem do cliente para a OM (envio ao contrário)
        isPickup: false,
        podFiles: [],
        // Carregado junto com o envio: sem isso, salvar uma edição gravaria
        // status undefined, que vira NULL no banco e apagaria um 'Delivered'.
        status: undefined,
        // Envio de venda (só número da ordem) ou ligado a uma assistência/garantia
        linkType: 'order',
        ticketId: null,
        warrantyId: null,
        serviceLevel: 'standard',
        agent: '',
        requestId: null,
        parcels: null
    });

    const [processes, setProcesses] = useState({ tickets: [], warranties: [] });
    const [agents, setAgents] = useState([]);


    const [quotes, setQuotes] = useState([
        { id: 1, portal: PORTALS[0], carrier: ALL_CARRIERS[0], price: '' }, // MBE - TNT
        { id: 2, portal: PORTALS[1], carrier: ALL_CARRIERS[0], price: '' }, // My Parcel - TNT
        { id: 3, portal: PORTALS[2], carrier: 'DHL', price: '' },           // My DHL - DHL
        { id: 4, portal: PORTALS[3], carrier: 'BRT', price: '' }            // BRT - BRT
    ]);

    const [suggestedPortal, setSuggestedPortal] = useState(null);

    const [selectedQuoteId, setSelectedQuoteId] = useState(null);

    const [isLoading, setIsLoading] = useState(false);

    const [loadError, setLoadError] = useState('');

    // Nomes dos países no idioma atual, em ordem alfabética desse idioma.
    const localizedCountries = useMemo(() => {
        const lang = i18n.language || 'pt';
        return COUNTRIES
            .map(c => ({ ...c, label: countryLabel(c.code, lang) }))
            .sort((a, b) => a.label.localeCompare(b.label, lang));
    }, [i18n.language]);

    // Load data for editing
    useEffect(() => {
        const loadData = async () => {
            try {
                if (id) {
                    const shipment = await storageService.getShipment(id);
                    if (shipment) {
                        setFormData({
                            orderId: shipment.orderId,
                            orderType: shipment.orderType || '',
                            customerName: shipment.customerName || '',
                            quantity: shipment.quantity || 1,
                            destinationCountry: shipment.destinationCountry || '',
                            customerPayment: shipment.customerPayment,
                            trackingCode: shipment.trackingCode || '',
                            photoUrls: shipment.photoUrls || [],
                            customerCostPickup: shipment.customerCostPickup || false,
                            isPickup: shipment.isPickup || false,
                            podFiles: shipment.podFiles || [],
                            status: shipment.status,
                            linkType: shipment.ticketId ? 'ticket' : shipment.warrantyId ? 'warranty' : 'order',
                            ticketId: shipment.ticketId,
                            warrantyId: shipment.warrantyId,
                            serviceLevel: shipment.serviceLevel || 'standard',
                            agent: shipment.agent || '',
                            requestId: shipment.requestId,
                            parcels: shipment.parcels
                        });
                        setQuotes(shipment.allQuotes || []);
                        if (shipment.selectedQuote) {
                            setSelectedQuoteId(shipment.selectedQuote.id);
                        }
                    }
                }

                // Novo envio a partir de um pedido: preenche cliente, país, caixas e serviço.
                if (!id && requestParam) {
                    const req = await getRequest(requestParam);
                    setRequest(req);
                    setFormData((f) => ({
                        ...f,
                        requestId: req.id,
                        parcels: req.boxes?.length ? req.boxes : f.parcels,
                        customerName: req.customer?.name || f.customerName,
                        destinationCountry: req.address?.country || req.customer?.country || f.destinationCountry,
                        serviceLevel: req.service_level,
                        orderId: req.order_ref || f.orderId,
                        quantity: req.boxes?.length || f.quantity,
                        // agente = quem fez o pedido no formulário
                        agent: f.agent || req.requested_by || ''
                    }));
                }

                // Assistências, garantias e agentes para o vínculo. Opcional: se
                // falhar, o formulário continua funcionando como antes.
                try {
                    const [tickets, warranties, agentList] = await Promise.all([
                        listTickets(), listWarranties(), storageService.getAgents()
                    ]);
                    setProcesses({ tickets, warranties });
                    setAgents(agentList);
                } catch (err) {
                    console.error('Failed to load assistance/warranties:', err);
                }
            } catch (err) {
                console.error('Failed to load shipment data:', err);
                setLoadError(err.message || 'Unexpected error');
            }
        };
        loadData();
    }, [id, requestParam]);

    // Smart suggestion logic
    useEffect(() => {
        const checkSuggestion = async () => {
            if (!formData.destinationCountry || id) return;
            try {
                const suggestion = await storageService.getSuggestedPortal(formData.destinationCountry);
                setSuggestedPortal(suggestion);
            } catch (err) {
                // Sugestão é opcional: falhar aqui não deve travar o formulário.
                console.error('Failed to load portal suggestion:', err);
            }
        };
        checkSuggestion();
    }, [formData.destinationCountry, id]);

    const handleAddQuote = () => {
        setQuotes([...quotes, { id: Date.now(), portal: PORTALS[0], carrier: ALL_CARRIERS[0], price: '' }]);
    };

    const handleRemoveQuote = (quoteId) => {
        setQuotes(quotes.filter(q => q.id !== quoteId));
        if (selectedQuoteId === quoteId) setSelectedQuoteId(null);
    };

    const handleQuoteChange = (quoteId, field, value) => {
        setQuotes(quotes.map(q => {
            if (q.id !== quoteId) return q;

            const updates = { [field]: value };

            // Reset carrier if portal changes and current carrier is not valid for new portal
            if (field === 'portal') {
                const allowedCarriers = getAllowedCarriers(value);
                if (!allowedCarriers.includes(q.carrier)) {
                    updates.carrier = allowedCarriers[0];
                }
            }

            return { ...q, ...updates };
        }));
    };

    const getAllowedCarriers = (portal) => {
        if (portal === 'My DHL') return ['DHL'];
        if (portal === 'BRT') return ['BRT'];
        if (portal === 'Pallet / Truck' || portal === 'Spot / Last minute') return [...ALL_CARRIERS, 'Other'];
        return ALL_CARRIERS;
    };

    // Opções do vínculo: abertas primeiro, depois as concluídas.
    const linkOptions = useMemo(() => {
        const open = (done) => (done ? 1 : 0);
        const tickets = [...processes.tickets]
            .sort((a, b) => open(a.phase === 'Completato') - open(b.phase === 'Completato'))
            .map((tk) => ({
                id: tk.id,
                // Referência do envio = nosso código interno; o protocolo do fabricante vai como 2ª referência.
                code: tk.code || `#${tk.id.slice(0, 8)}`,
                producerProtocol: tk.protocolNumber || null,
                label: `${tk.code ? tk.code + ' · ' : ''}${tk.clientName} · ${tk.component}${tk.protocolNumber ? ` · ${t('Manufacturer prot.')} ${tk.protocolNumber}` : ''}`,
                customer: tk.clientName,
            }));
        const warranties = [...processes.warranties]
            .sort((a, b) => open(a.status === 'Completato') - open(b.status === 'Completato'))
            .map((w) => ({
                id: w.id,
                code: w.protocolNumber || w.id.slice(0, 8),
                label: `${w.protocolNumber} · ${w.customerName} · ${w.bikeModel}`,
                customer: w.customerName,
            }));
        return { ticket: tickets, warranty: warranties };
    }, [processes, t]);

    const setLinkType = (linkType) => {
        setFormData({ ...formData, linkType, ticketId: null, warrantyId: null });
    };

    // Escolher a assistência/garantia preenche ordem, cliente e tipo.
    const pickProcess = (processId) => {
        const option = linkOptions[formData.linkType]?.find((o) => o.id === processId);
        if (!option) {
            setFormData({ ...formData, ticketId: null, warrantyId: null });
            return;
        }
        setFormData({
            ...formData,
            ticketId: formData.linkType === 'ticket' ? option.id : null,
            warrantyId: formData.linkType === 'warranty' ? option.id : null,
            orderId: option.code,
            customerName: formData.customerName || option.customer,
            orderType: formData.orderType || (formData.linkType === 'warranty' ? 'Warranty' : 'Components'),
        });
    };

    const analysis = useMemo(
        () => analyzeQuotes(quotes, selectedQuoteId),
        [quotes, selectedQuoteId]
    );

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();

        console.log('handleSubmit called', { isEditing, hasAnalysis: !!analysis });

        // Validate required fields
        if (formData.linkType !== 'order' && !formData.ticketId && !formData.warrantyId) {
            alert(t('Select the assistance or warranty this shipment carries'));
            return;
        }

        if (!formData.orderId || formData.orderId.trim() === '') {
            alert(t('Please enter an Order Number'));
            return;
        }

        if (!formData.customerName || formData.customerName.trim() === '') {
            alert(t('Please enter a Customer Name'));
            return;
        }

        if (!formData.destinationCountry) {
            alert(t('Please select a Destination Country'));
            return;
        }

        // Customer payment validation (skip if customer cost pickup is checked)
        if (!formData.customerCostPickup) {
            if (formData.customerPayment === '' || formData.customerPayment === null || formData.customerPayment === undefined || parseFloat(formData.customerPayment) < 0 || isNaN(parseFloat(formData.customerPayment))) {
                alert(t('Please enter a valid Customer Payment amount'));
                return;
            }
        }

        // When creating new shipment, analysis is required (unless customer cost pickup)
        if (!isEditing && !analysis && !formData.customerCostPickup) {
            alert(t('Please add at least one quote'));
            return;
        }

        setIsLoading(true);

        try {
            let shipmentData;

            // Comprovante anexado é prova de entrega; sem ele, preserva o
            // status que já estava gravado. Ver resolveStatus.
            const status = resolveStatus(formData);

            if (isEditing && !analysis) {
                // Editing without changing quotes - keep existing data but recalculate profit
                console.log('Editing without analysis, loading existing shipment...');
                const existingShipment = await storageService.getShipment(id);
                console.log('Existing shipment:', existingShipment);

                if (!existingShipment) {
                    alert('Erro: Envio não encontrado');
                    setIsLoading(false);
                    return;
                }

                // Recalculate profit based on new customer payment
                const selectedQuotePrice = parseFloat(existingShipment.selectedQuote?.price || 0);
                const newProfit = calculateProfit(formData.customerPayment, existingShipment.selectedQuote);

                // Recalculate savings (difference between selected and worst quote)
                let newSavings = existingShipment.savings || 0;

                // Only recalculate savings if allQuotes exists
                if (existingShipment.allQuotes && Array.isArray(existingShipment.allQuotes) && existingShipment.allQuotes.length > 0) {
                    const allPrices = existingShipment.allQuotes
                        .map(q => parseFloat(q.price))
                        .filter(p => !isNaN(p) && p > 0);
                    if (allPrices.length > 0) {
                        const worstPrice = Math.max(...allPrices);
                        newSavings = worstPrice - selectedQuotePrice;
                    }
                }

                shipmentData = {
                    ...existingShipment,
                    ...formData, // Update form fields
                    customerPayment: parseFloat(formData.customerPayment) || 0,
                    profit: newProfit,
                    savings: newSavings,
                    status: resolveStatus(formData, existingShipment.status)
                };
                console.log('Updated shipment data with recalculated profit:', shipmentData);
            } else {
                // New shipment or editing with new quotes
                console.log('Creating new or updating with new quotes');

                // If customer cost pickup, set costs to zero
                if (formData.customerCostPickup) {
                    shipmentData = {
                        ...formData,
                        customerPayment: parseFloat(formData.customerPayment) || 0,
                        selectedQuote: null,
                        profit: 0,
                        savings: 0,
                        allQuotes: [],
                        status
                    };
                } else {
                    shipmentData = {
                        ...formData,
                        customerPayment: parseFloat(formData.customerPayment) || 0,
                        selectedQuote: analysis.selected,
                        profit: calculateProfit(formData.customerPayment, analysis.selected),
                        savings: analysis.savings,
                        allQuotes: quotes,
                        status
                    };
                }
            }

            if (id) {
                console.log('Updating shipment with id:', id);
                await storageService.updateShipment({ ...shipmentData, id });
                alert(t('Shipment updated successfully!'));
            } else {
                console.log('Saving new shipment');
                await storageService.saveShipment(shipmentData);
                alert(t('Shipment registered successfully!'));
            }

            console.log('Navigating to dashboard...');
            navigate('/shipments');
        } catch (error) {
            console.error('Error submitting form:', error);
            alert(`Erro ao salvar: ${error.message}`);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="page-title">
                        {isEditing ? t('Edit Shipment') : t('New Shipment Quote')}
                    </h1>
                    <p className="text-muted-foreground mt-2">
                        {isEditing ? t('Update Shipment Data') : t('Compare Prices')}
                    </p>
                </div>
            </div>

            {request && (
                <div className="bg-card border border-foreground rounded-lg p-4 flex flex-col gap-1.5 text-sm">
                    <span className="text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">
                        {t('From shipment request')} · {request.requested_by}
                    </span>
                    <p className="font-semibold text-base">{request.customer?.name}</p>
                    <p>{formatAddress(request.address || request.customer || {}) || t('No address registered')}</p>
                    {request.address && [request.address.contact_name, request.address.phone].some(Boolean) && (
                        <p className="text-muted-foreground">{[request.address.contact_name, request.address.phone].filter(Boolean).join(' · ')}</p>
                    )}
                    <p>{request.boxes.length ? `${request.boxes.map(boxSummary).join(' · ')} — ${t('Total')} ${totalWeight(request.boxes)} kg` : t('Packaging to be defined')}</p>
                    {request.invoice_value != null && (
                        <p>
                            {t('Invoiced')}: {formatMoney(request.invoice_value, i18n.language)} ·{' '}
                            {request.insured_value
                                ? <strong>{t('Insured')}: {formatMoney(request.insured_value, i18n.language)}</strong>
                                : <span className="text-muted-foreground">{t('No insurance')}</span>}
                        </p>
                    )}
                    {request.notes && <p className="text-muted-foreground whitespace-pre-line">{request.notes}</p>}
                </div>
            )}

            {loadError && (
                <div className="flex items-start gap-2 text-sm text-error bg-error/10 border border-error/20 rounded-md p-3">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{t('Could not load data')}: {t(loadError)}</span>
                </div>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Left Column: Form */}
                <div className="lg:col-span-2 space-y-6">
                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>{t('Order Data')}</CardTitle>
                            {isEditing && (
                                <Button
                                    onClick={handleSubmit}
                                    variant="outlined"
                                    size="sm"
                                    type="button"
                                >
                                    <Save className="h-4 w-4 mr-2" /> {t('Save')}
                                </Button>
                            )}
                        </CardHeader>
                        <CardContent className="space-y-4">
                            <div className="space-y-3 pb-4 border-b border-border">
                                <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground">{t('This shipment is for')}</span>
                                <div role="radiogroup" aria-label={t('This shipment is for')} className="flex flex-wrap gap-2">
                                    {[['order', t('Sales order')], ['ticket', t('Assistance ticket')], ['warranty', t('Warranty')]].map(([value, label]) => (
                                        <button
                                            key={value}
                                            type="button"
                                            role="radio"
                                            aria-checked={formData.linkType === value}
                                            onClick={() => setLinkType(value)}
                                            className={`h-10 px-4 rounded-full border text-[11px] font-semibold uppercase tracking-[0.1em] ${formData.linkType === value ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:border-foreground'}`}
                                        >
                                            {label}
                                        </button>
                                    ))}
                                </div>
                                <label className="flex items-start gap-2.5 text-sm cursor-pointer w-fit">
                                    <input
                                        type="checkbox"
                                        className="mt-0.5 h-4 w-4 accent-primary"
                                        checked={formData.isPickup}
                                        onChange={(e) => setFormData({ ...formData, isPickup: e.target.checked })}
                                    />
                                    <span>
                                        <span className="font-semibold">{t('imp.pickup')}</span>
                                        <span className="block text-muted-foreground">{t('imp.pickupHint')}</span>
                                    </span>
                                </label>
                                {formData.linkType !== 'order' && (
                                    <div>
                                        <label htmlFor="link-process" className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">
                                            {formData.linkType === 'ticket' ? t('Assistance ticket') : t('Warranty process')}
                                        </label>
                                        <select
                                            id="link-process"
                                            className="flex h-11 w-full rounded-md border border-input bg-card px-3 py-2 text-sm focus:ring-2 focus:ring-ring focus:outline-none"
                                            value={(formData.linkType === 'ticket' ? formData.ticketId : formData.warrantyId) || ''}
                                            onChange={(e) => pickProcess(e.target.value)}
                                        >
                                            <option value="">{t('Select...')}</option>
                                            {(linkOptions[formData.linkType] || []).map((o) => (
                                                <option key={o.id} value={o.id}>{o.label}</option>
                                            ))}
                                        </select>
                                        {(() => {
                                            const sel = formData.linkType === 'ticket' && linkOptions.ticket.find((o) => o.id === formData.ticketId);
                                            return sel?.producerProtocol ? (
                                                <p className="mt-2 text-sm">
                                                    {t('Manufacturer protocol')}: <strong>{sel.producerProtocol}</strong> — {t('add it on the portal as the second reference / on the label.')}
                                                </p>
                                            ) : null;
                                        })()}
                                        <p className="mt-2 text-xs text-muted-foreground">
                                            {t('When saved, the date, carrier, tracking and cost are recorded in the linked process.')}
                                        </p>
                                    </div>
                                )}
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    label={formData.linkType === 'order' ? t('Order Number') : t('Reference')}
                                    placeholder="Ex: ORD-2024-001"
                                    value={formData.orderId}
                                    onChange={(e) => setFormData({ ...formData, orderId: e.target.value })}
                                />
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('Order Type')}</label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                        value={formData.orderType}
                                        onChange={(e) => setFormData({ ...formData, orderType: e.target.value })}
                                    >
                                        <option value="">{t('Select...')}</option>
                                        {ORDER_TYPES.map(type => (
                                            <option key={type} value={type}>{t(type)}</option>
                                        ))}
                                    </select>
                                </div>
                                <CustomerSearch
                                    value={formData.customerName}
                                    onChange={(name) => setFormData((f) => ({ ...f, customerName: name }))}
                                    // país do cadastro, se ainda não foi escolhido
                                    onSelect={(c) => setFormData((f) => ({ ...f, destinationCountry: f.destinationCountry || c.country || '' }))}
                                />
                                <div>
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('Quantity (Bicycles/Frames)')}</label>
                                    <input
                                        type="number"
                                        min="1"
                                        max="20"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                        value={formData.quantity}
                                        onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value) || 1 })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{formData.isPickup ? t('imp.pickupCountry') : t('Destination Country')}</label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        value={formData.destinationCountry}
                                        onChange={(e) => setFormData({ ...formData, destinationCountry: e.target.value })}
                                    >
                                        <option value="">{t('Select Country')}</option>
                                        {localizedCountries.map(country => (
                                            <option key={country.code} value={country.value}>{country.label}</option>
                                        ))}
                                    </select>
                                    {suggestedPortal && (
                                        <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 p-2 rounded-md">
                                            <AlertCircle className="h-3 w-3" />
                                            <span>{t('Suggestion')}: <strong>{suggestedPortal}</strong> {t('is popular')}</span>
                                        </div>
                                    )}
                                </div>
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{`${t('Customer Payment')} (€)`}</label>
                                    <input
                                        type="number"
                                        placeholder="0.00"
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        value={formData.customerPayment}
                                        onChange={(e) => setFormData({ ...formData, customerPayment: e.target.value })}
                                    />
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    label={`${t('Tracking Code')} (Opcional)`}
                                    placeholder={t('Tracking Code')}
                                    value={formData.trackingCode}
                                    onChange={(e) => setFormData({ ...formData, trackingCode: e.target.value })}
                                />
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('Shipment/Pickup')}</label>
                                    <label className="flex items-center h-10 px-3 py-2 border border-gray-300 rounded-md bg-gray-50 cursor-pointer hover:bg-gray-100 transition-colors">
                                        <input
                                            type="checkbox"
                                            checked={formData.customerCostPickup}
                                            onChange={(e) => setFormData({ ...formData, customerCostPickup: e.target.checked })}
                                            className="mr-2 h-4 w-4 rounded border-gray-300 text-primary focus:ring-primary"
                                        />
                                        <span className="text-sm text-gray-700 truncate">{t('Customer Cost/Pickup')}</span>
                                    </label>
                                </div>
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <span className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-muted-foreground mb-2">{t('Service')}</span>
                                    <div role="radiogroup" aria-label={t('Service')} className="flex gap-2">
                                        {[['standard', t('Standard')], ['express', t('Express')]].map(([value, label]) => (
                                            <button
                                                key={value}
                                                type="button"
                                                role="radio"
                                                aria-checked={formData.serviceLevel === value}
                                                onClick={() => setFormData({ ...formData, serviceLevel: value })}
                                                className={`flex-1 h-11 rounded-full border text-[11px] font-semibold uppercase tracking-[0.1em] ${formData.serviceLevel === value ? 'bg-primary text-primary-foreground border-primary' : 'border-border bg-card hover:border-foreground'}`}
                                            >
                                                {label}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                                <div>
                                    <Input
                                        label={t('Sales agent')}
                                        placeholder={t('Agent name')}
                                        value={formData.agent}
                                        onChange={(e) => setFormData({ ...formData, agent: e.target.value })}
                                        list="agents"
                                    />
                                    <datalist id="agents">
                                        {agents.map((a) => <option key={a} value={a} />)}
                                    </datalist>
                                </div>
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">{t('Photos')}</label>
                                <PhotoUpload
                                    photos={formData.photoUrls || []}
                                    onPhotosChange={(urls) => setFormData({ ...formData, photoUrls: urls })}
                                />
                            </div>
                            <div className="space-y-2">
                                <label className="block text-sm font-medium text-gray-700">{t('Proof of delivery')}</label>
                                <PodUpload
                                    files={formData.podFiles || []}
                                    onFilesChange={(paths) => setFormData({ ...formData, podFiles: paths })}
                                />
                            </div>
                        </CardContent>
                    </Card>

                    <Card>
                        <CardHeader className="flex flex-row items-center justify-between">
                            <CardTitle>{t('Quotes')}</CardTitle>
                            <Button variant="outlined" size="sm" onClick={handleAddQuote} type="button">
                                <Plus className="h-4 w-4 mr-2" /> {t('Add Quote')}
                            </Button>
                        </CardHeader>
                        <CardContent className="space-y-4">
                            {quotes.map((quote) => (
                                <div key={quote.id} className="flex items-end gap-3 p-4 bg-gray-50 rounded-lg border border-gray-100">
                                    <div className="flex-1">
                                        <label className="text-xs font-medium text-gray-500 mb-1 block">{t('Portal')}</label>
                                        <select
                                            className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm focus:ring-2 focus:ring-primary"
                                            value={quote.portal}
                                            onChange={(e) => handleQuoteChange(quote.id, 'portal', e.target.value)}
                                        >
                                            {PORTALS.map(p => <option key={p} value={p}>{p}</option>)}
                                        </select>
                                    </div>
                                    <div className="flex-1">
                                        <label className="text-xs font-medium text-gray-500 mb-1 block">{t('Carrier')}</label>
                                        <select
                                            className="w-full h-10 rounded-md border border-gray-300 bg-white px-3 text-sm focus:ring-2 focus:ring-primary"
                                            value={quote.carrier}
                                            onChange={(e) => handleQuoteChange(quote.id, 'carrier', e.target.value)}
                                        >
                                            {getAllowedCarriers(quote.portal).map(c => <option key={c} value={c}>{c}</option>)}
                                        </select>
                                    </div>
                                    <div className="w-32">
                                        <label className="text-xs font-medium text-gray-500 mb-1 block">{t('Price')} (€)</label>
                                        <Input
                                            type="number"
                                            placeholder="0.00"
                                            step="0.01"
                                            value={quote.price}
                                            onChange={(e) => handleQuoteChange(quote.id, 'price', e.target.value)}
                                            className="bg-white"
                                        />
                                    </div>
                                    <Button
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => handleRemoveQuote(quote.id)}
                                        className="text-gray-400 hover:text-error"
                                        type="button"
                                    >
                                        <Trash2 className="h-5 w-5" />
                                    </Button>
                                </div>
                            ))}
                        </CardContent>
                    </Card>
                </div>

                {/* Right Column: Summary */}
                <div className="space-y-6">
                    <Card className="bg-primary text-white border-none ">
                        <CardHeader>
                            <CardTitle className="text-white flex items-center">
                                <TrendingDown className="mr-2 h-6 w-6" />
                                {t('Analysis')}
                            </CardTitle>
                        </CardHeader>
                        <CardContent>
                            {analysis ? (
                                <div className="space-y-6">
                                    <div>
                                        <label className="text-white/70 text-xs font-medium mb-1 block">{t('Chosen Carrier')}</label>
                                        <select
                                            className="w-full bg-white/10 border border-white/20 text-white rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-white/50 focus:outline-none [&>option]:text-gray-900"
                                            value={analysis.selected.id}
                                            onChange={(e) => setSelectedQuoteId(parseInt(e.target.value))}
                                        >
                                            {quotes.filter(q => q.price).map(q => (
                                                <option key={q.id} value={q.id}>
                                                    {q.portal} - {q.carrier} (€ {q.price})
                                                </option>
                                            ))}
                                        </select>
                                    </div>

                                    <div>
                                        <p className="text-white/70 text-sm">{t('Selected Option')}</p>
                                        <div className="flex justify-between items-end">
                                            <span className="text-2xl font-bold">{analysis.selected.portal}</span>
                                            <span className="text-3xl font-bold">€ {parseFloat(analysis.selected.price).toFixed(2)}</span>
                                        </div>
                                        <p className="text-sm text-white/70 mt-1">{t('Via')} {analysis.selected.carrier}</p>
                                    </div>

                                    <div className="pt-4 border-t border-white/20">
                                        <p className="text-white/70 text-sm">{t('Estimated Savings')}</p>
                                        <p className="text-4xl font-bold text-white mt-1">
                                            € {analysis.savings.toFixed(2)}
                                        </p>
                                        <p className="text-xs text-white/70 mt-2">
                                            {t('Compared to worst')} (€ {parseFloat(analysis.worst.price).toFixed(2)})
                                        </p>
                                    </div>

                                    <Button
                                        onClick={handleSubmit}
                                        className="w-full bg-white text-primary hover:bg-gray-100 mt-4 font-bold shadow-lg"
                                        size="lg"
                                        disabled={isLoading}
                                    >
                                        <Save className="mr-2 h-5 w-5" />
                                        {isLoading ? t('Saving...') : (isEditing ? t('Update Shipment') : t('Register Shipment'))}
                                    </Button>
                                </div>
                            ) : formData.customerCostPickup ? (
                                <div className="space-y-6">
                                    <div className="text-center py-4">
                                        <p className="text-white/70 text-sm mb-2">{t('Customer Cost/Pickup Mode')}</p>
                                        <p className="text-white text-lg font-semibold">{t('No portal costs required')}</p>
                                        <p className="text-white/70 text-xs mt-2">{t('Only quantity will be tracked')}</p>
                                    </div>

                                    <Button
                                        onClick={handleSubmit}
                                        className="w-full bg-white text-primary hover:bg-gray-100 mt-4 font-bold shadow-lg"
                                        size="lg"
                                        disabled={isLoading}
                                    >
                                        <Save className="mr-2 h-5 w-5" />
                                        {isLoading ? t('Saving...') : (isEditing ? t('Update Shipment') : t('Register Shipment'))}
                                    </Button>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-white/70">
                                    {t('Add quotes to see analysis')}
                                </div>
                            )}
                        </CardContent>
                    </Card>

                    {isExtraEu(formData.destinationCountry) && formData.isPickup && (
                        <ImportDocsCard
                            shipmentId={id}
                            customerName={formData.customerName}
                            country={formData.destinationCountry}
                            parcels={formData.parcels}
                        />
                    )}
                    {isExtraEu(formData.destinationCountry) && !formData.isPickup && (
                        <ExportDocsCard
                            customerName={formData.customerName}
                            invoiceValue={request?.invoice_value}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}
