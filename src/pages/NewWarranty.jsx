import React, { useState, useEffect } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Input } from '../components/ui/Input';
import { Button } from '../components/ui/Button';
import { ArrowLeft, Save, Shield, AlertCircle, Loader2 } from 'lucide-react';
import { storageService } from '../services/storage';
import { useTranslation } from 'react-i18next';

export default function NewWarranty() {
    const { t, i18n } = useTranslation();
    const navigate = useNavigate();
    const { id } = useParams();
    const [loading, setLoading] = useState(false);
    const [saving, setSaving] = useState(false);

    const [formData, setFormData] = useState({
        protocolNumber: '',
        startDate: new Date().toISOString().split('T')[0],
        customerName: '',
        customerEmail: '',
        agent: '',
        serialNumber: '',
        bikeModel: '',
        bikeSize: '',
        problemDescription: '',
        notes: '',
        paintDetails: '',
        componentsDetails: '',
        status: 'aperto',
        solution: '',
        producer: '',
        newSerialNumber: ''
    });

    useEffect(() => {
        const init = async () => {
            if (id) {
                setLoading(true);
                try {
                    const data = await storageService.getWarranty(id);
                    if (data) setFormData(data);
                } catch (error) {
                    console.error('Error loading warranty:', error);
                } finally {
                    setLoading(false);
                }
            } else {
                // Get next protocol number
                const nextProtocol = await storageService.getNextProtocolNumber();
                setFormData(prev => ({ ...prev, protocolNumber: nextProtocol }));
            }
        };
        init();
    }, [id]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setSaving(true);
        try {
            if (id) {
                await storageService.updateWarranty({ ...formData, id });
                alert(i18n.language === 'it' ? 'Processo aggiornato con successo!' : 'Processo atualizado com sucesso!');
            } else {
                await storageService.saveWarranty(formData);
                alert(i18n.language === 'it' ? 'Processo registrato con successo!' : 'Processo registrado com sucesso!');
            }
            navigate('/warranties');
        } catch (error) {
            console.error('Error saving warranty:', error);
            alert('Error saving data');
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto space-y-6 pb-12">
            <div className="flex items-center justify-between">
                <Link to="/warranties" className="flex items-center text-sm text-gray-500 hover:text-gray-900 transition-colors">
                    <ArrowLeft className="h-4 w-4 mr-1" /> {t('Back')}
                </Link>
                <h1 className="text-2xl font-bold text-gray-900">
                    {id ? t('Edit Warranty') : t('New Warranty')}
                </h1>
            </div>

            <form onSubmit={handleSubmit} className="space-y-6">
                {/* Process Info */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold flex items-center gap-2">
                            <Shield className="h-5 w-5 text-primary" /> {t('Dettagli Processo')}
                        </CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">{t('Protocollo')}</label>
                            <Input
                                value={formData.protocolNumber}
                                disabled
                                className="bg-gray-50 font-mono font-bold text-primary"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">{t('Start Date')}</label>
                            <Input
                                type="date"
                                value={formData.startDate}
                                onChange={(e) => setFormData({ ...formData, startDate: e.target.value })}
                                required
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">Status</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                            >
                                <option value="aperto">{t('Aperto')}</option>
                                <option value="in corso">{t('In Corso')}</option>
                                <option value="chiuso">{t('Chiuso')}</option>
                            </select>
                        </div>
                    </CardContent>
                </Card>

                {/* Customer Info */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold">{t('Dettagli Cliente')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <Input
                            label={t('Customer')}
                            value={formData.customerName}
                            onChange={(e) => setFormData({ ...formData, customerName: e.target.value })}
                            required
                        />
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <Input
                                label="Email"
                                type="email"
                                value={formData.customerEmail}
                                onChange={(e) => setFormData({ ...formData, customerEmail: e.target.value })}
                            />
                            <Input
                                label={t('Agent')}
                                value={formData.agent}
                                onChange={(e) => setFormData({ ...formData, agent: e.target.value })}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Bike Info */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold">{t('Dettagli Bicicletta')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <Input
                                label={t('Serial Number')}
                                value={formData.serialNumber}
                                onChange={(e) => setFormData({ ...formData, serialNumber: e.target.value })}
                                required
                            />
                            <Input
                                label={t('Bike Model')}
                                value={formData.bikeModel}
                                onChange={(e) => setFormData({ ...formData, bikeModel: e.target.value })}
                            />
                            <Input
                                label={t('Bike Size')}
                                value={formData.bikeSize}
                                onChange={(e) => setFormData({ ...formData, bikeSize: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">{t('Problem')}</label>
                            <textarea
                                className="w-full min-h-[100px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                value={formData.problemDescription}
                                onChange={(e) => setFormData({ ...formData, problemDescription: e.target.value })}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Technical Info */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold">{t('Dettagli Tecnici')}</CardTitle>
                    </CardHeader>
                    <CardContent className="space-y-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">{t('Paint Details')}</label>
                            <textarea
                                className="w-full min-h-[80px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                value={formData.paintDetails}
                                onChange={(e) => setFormData({ ...formData, paintDetails: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">{t('Components')}</label>
                            <textarea
                                className="w-full min-h-[80px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                value={formData.componentsDetails}
                                onChange={(e) => setFormData({ ...formData, componentsDetails: e.target.value })}
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">{t('Notes')}</label>
                            <textarea
                                className="w-full min-h-[80px] rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            />
                        </div>
                    </CardContent>
                </Card>

                {/* Resolution */}
                <Card>
                    <CardHeader>
                        <CardTitle className="text-lg font-semibold">{t('Aggiornamento Processo')}</CardTitle>
                    </CardHeader>
                    <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">{t('Solution')}</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                value={formData.solution}
                                onChange={(e) => setFormData({ ...formData, solution: e.target.value })}
                            >
                                <option value="">- {t('Select Solution')} -</option>
                                <option value="Verniciatura">{t('Verniciatura')}</option>
                                <option value="Riparazione + Verniciatura">{t('Riparazione + Verniciatura')}</option>
                                <option value="Sostituzione">{t('Sostituzione')}</option>
                            </select>
                        </div>
                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-gray-700">{t('Producer')}</label>
                            <select
                                className="flex h-10 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:outline-none"
                                value={formData.producer}
                                onChange={(e) => setFormData({ ...formData, producer: e.target.value })}
                            >
                                <option value="">- {t('Select Producer')} -</option>
                                <option value="Barra">Barra</option>
                                <option value="Pedemonte">Pedemonte</option>
                                <option value="Barra + Pedemonte">Barra + Pedemonte</option>
                                <option value="Univer">Univer</option>
                                <option value="Univer + Barra">Univer + Barra</option>
                            </select>
                        </div>

                        {formData.solution === 'Sostituzione' && (
                            <div className="md:col-span-2 mt-4 p-4 bg-primary/5 border border-primary/20 rounded-lg animate-in fade-in slide-in-from-top-2">
                                <Input
                                    label={t('New Serial Number')}
                                    placeholder="OM-XXXXX"
                                    value={formData.newSerialNumber}
                                    onChange={(e) => setFormData({ ...formData, newSerialNumber: e.target.value })}
                                    required={formData.solution === 'Sostituzione'}
                                />
                            </div>
                        )}
                    </CardContent>
                </Card>

                <div className="flex justify-end gap-3">
                    <Link to="/warranties">
                        <Button variant="outlined" type="button" disabled={saving}>
                            {t('Cancel')}
                        </Button>
                    </Link>
                    <Button type="submit" disabled={saving} className="flex items-center gap-2">
                        {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                        {t('Save')}
                    </Button>
                </div>
            </form>
        </div>
    );
}
