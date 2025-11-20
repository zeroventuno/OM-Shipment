import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, Save, ArrowRight, TrendingDown, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { storageService } from '../services/storage';
import { cn } from '../utils/cn';
import { useTranslation } from 'react-i18next';

const PORTALS = ['MBE', 'My Parcel', 'My DHL', 'BRT'];
const ALL_CARRIERS = ['TNT', 'Fedex', 'DHL', 'BRT', 'SDA', 'UPS'];
const COUNTRIES = [
    "Alemanha", "Argentina", "Austrália", "Áustria", "Bélgica", "Brasil", "Canadá", "Chile", "China",
    "Colômbia", "Coreia do Sul", "Dinamarca", "Espanha", "Estados Unidos", "Finlândia", "França",
    "Grécia", "Holanda", "Índia", "Irlanda", "Israel", "Itália", "Japão", "México", "Noruega",
    "Nova Zelândia", "Peru", "Polônia", "Portugal", "Reino Unido", "Rússia", "Suécia", "Suíça",
    "Turquia", "Uruguai"
];

export default function NewShipment() {
    const { t } = useTranslation();
    const navigate = useNavigate();
    const { id } = useParams();
    const isEditing = !!id;

    const [formData, setFormData] = useState({
        orderId: '',
        customerName: '',
        destinationCountry: '',
        customerPayment: '',
        trackingCode: ''
    });

    const [quotes, setQuotes] = useState([
        { id: 1, portal: PORTALS[0], carrier: ALL_CARRIERS[0], price: '' },
        { id: 2, portal: PORTALS[1], carrier: ALL_CARRIERS[0], price: '' },
        { id: 3, portal: PORTALS[2], carrier: ALL_CARRIERS[0], price: '' }
    ]);

    const [suggestedPortal, setSuggestedPortal] = useState(null);

    const [selectedQuoteId, setSelectedQuoteId] = useState(null);

    // Load data for editing
    useEffect(() => {
        const loadData = async () => {
            if (id) {
                const shipment = await storageService.getShipment(id);
                if (shipment) {
                    setFormData({
                        orderId: shipment.orderId,
                        customerName: shipment.customerName || '',
                        destinationCountry: shipment.destinationCountry || '',
                        customerPayment: shipment.customerPayment,
                        trackingCode: shipment.trackingCode || ''
                    });
                    setQuotes(shipment.allQuotes || []);
                    if (shipment.selectedQuote) {
                        setSelectedQuoteId(shipment.selectedQuote.id);
                    }
                }
            }
        };
        loadData();
    }, [id]);

    // Smart suggestion logic
    useEffect(() => {
        const checkSuggestion = async () => {
            if (formData.destinationCountry && !id) {
                const suggestion = await storageService.getSuggestedPortal(formData.destinationCountry);
                setSuggestedPortal(suggestion);
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
        return ALL_CARRIERS;
    };

    const analysis = useMemo(() => {
        const validQuotes = quotes.filter(q => q.price && !isNaN(parseFloat(q.price)));
        if (validQuotes.length === 0) return null;

        const sorted = [...validQuotes].sort((a, b) => parseFloat(a.price) - parseFloat(b.price));
        const bestPriceQuote = sorted[0];
        const worstPriceQuote = sorted[sorted.length - 1];

        // Use selected quote or default to best price
        const selected = selectedQuoteId ? validQuotes.find(q => q.id === selectedQuoteId) || bestPriceQuote : bestPriceQuote;

        const savings = parseFloat(worstPriceQuote.price) - parseFloat(selected.price);

        return { best: bestPriceQuote, worst: worstPriceQuote, selected, savings };
    }, [quotes, selectedQuoteId]);

    const handleSubmit = async (e) => {
        if (e) e.preventDefault();

        console.log('handleSubmit called', { isEditing, hasAnalysis: !!analysis });

        // When creating new shipment, analysis is required
        if (!isEditing && !analysis) {
            alert(t('Please add at least one quote'));
            return;
        }

        let shipmentData;

        if (isEditing && !analysis) {
            // Editing without changing quotes - keep existing data but recalculate profit
            console.log('Editing without analysis, loading existing shipment...');
            try {
                const existingShipment = await storageService.getShipment(id);
                console.log('Existing shipment:', existingShipment);

                if (!existingShipment) {
                    alert('Erro: Envio não encontrado');
                    return;
                }

                // Recalculate profit based on new customer payment
                const selectedQuotePrice = parseFloat(existingShipment.selectedQuote?.price || 0);
                const customerPayment = parseFloat(formData.customerPayment || 0);
                const newProfit = customerPayment - selectedQuotePrice;

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
                    profit: newProfit,
                    savings: newSavings
                };
                console.log('Updated shipment data with recalculated profit:', shipmentData);
            } catch (error) {
                console.error('Error loading existing shipment:', error);
                alert('Erro ao carregar dados do envio: ' + error.message);
                return;
            }
        } else {
            // New shipment or editing with new quotes
            console.log('Creating new or updating with new quotes');
            shipmentData = {
                ...formData,
                selectedQuote: analysis.selected,
                profit: parseFloat(formData.customerPayment) - parseFloat(analysis.selected.price),
                savings: analysis.savings,
                allQuotes: quotes
            };
        }

        if (id) {
            console.log('Updating shipment with id:', id);
            await storageService.updateShipment({ ...shipmentData, id });
        } else {
            console.log('Saving new shipment');
            await storageService.saveShipment(shipmentData);
        }

        console.log('Navigating to dashboard...');
        navigate('/dashboard');
    };

    return (
        <div className="space-y-6 max-w-5xl mx-auto">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">
                        {isEditing ? t('Edit Shipment') : t('New Shipment Quote')}
                    </h1>
                    <p className="text-gray-500 mt-1">
                        {isEditing ? t('Update Shipment Data') : t('Compare Prices')}
                    </p>
                </div>
            </div>

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
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <Input
                                    label={t('Order Number')}
                                    placeholder="Ex: ORD-2024-001"
                                    value={formData.orderId}
                                    onChange={(e) => setFormData({ ...formData, orderId: e.target.value })}
                                />
                                <Input
                                    label={t('Customer')}
                                    placeholder={t('Customer')}
                                    value={formData.customerName}
                                    onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <label className="block text-sm font-medium text-gray-700 mb-1">{t('Destination Country')}</label>
                                    <select
                                        className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-gray-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                                        value={formData.destinationCountry}
                                        onChange={(e) => setFormData({ ...formData, destinationCountry: e.target.value })}
                                    >
                                        <option value="">{t('Select Country')}</option>
                                        {COUNTRIES.map(country => (
                                            <option key={country} value={country}>{country}</option>
                                        ))}
                                    </select>
                                    {suggestedPortal && (
                                        <div className="flex items-center gap-2 text-xs text-primary bg-primary/10 p-2 rounded-md">
                                            <AlertCircle className="h-3 w-3" />
                                            <span>{t('Suggestion')}: <strong>{suggestedPortal}</strong> {t('is popular')}</span>
                                        </div>
                                    )}
                                </div>
                                <Input
                                    label={`${t('Customer Payment')} (€)`}
                                    type="number"
                                    placeholder="0.00"
                                    value={formData.customerPayment}
                                    onChange={(e) => setFormData({ ...formData, customerPayment: e.target.value })}
                                />
                            </div>
                            <Input
                                label={`${t('Tracking Code')} (Opcional)`}
                                placeholder={t('Tracking Code')}
                                value={formData.trackingCode}
                                onChange={(e) => setFormData({ ...formData, trackingCode: e.target.value })}
                            />
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
                    <Card className="bg-primary text-white border-none shadow-xl">
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
                                        <label className="text-primary-100 text-xs font-medium mb-1 block">{t('Chosen Carrier')}</label>
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
                                        <p className="text-primary-100 text-sm">{t('Selected Option')}</p>
                                        <div className="flex justify-between items-end">
                                            <span className="text-2xl font-bold">{analysis.selected.portal}</span>
                                            <span className="text-3xl font-bold">€ {parseFloat(analysis.selected.price).toFixed(2)}</span>
                                        </div>
                                        <p className="text-sm text-primary-100 mt-1">{t('Via')} {analysis.selected.carrier}</p>
                                    </div>

                                    <div className="pt-4 border-t border-white/20">
                                        <p className="text-primary-100 text-sm">{t('Estimated Savings')}</p>
                                        <p className="text-4xl font-bold text-secondary mt-1">
                                            € {analysis.savings.toFixed(2)}
                                        </p>
                                        <p className="text-xs text-primary-100 mt-2">
                                            {t('Compared to worst')} (€ {parseFloat(analysis.worst.price).toFixed(2)})
                                        </p>
                                    </div>

                                    <Button
                                        onClick={handleSubmit}
                                        className="w-full bg-white text-primary hover:bg-gray-100 mt-4 font-bold shadow-lg"
                                        size="lg"
                                    >
                                        <Save className="mr-2 h-5 w-5" /> {isEditing ? t('Update Shipment') : t('Register Shipment')}
                                    </Button>
                                </div>
                            ) : (
                                <div className="text-center py-8 text-primary-100">
                                    {t('Add quotes to see analysis')}
                                </div>
                            )}
                        </CardContent>
                    </Card>
                </div>
            </div>
        </div>
    );
}
