import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Pencil, Trash2, Search, Bike, Plus, FileDown, Printer, Shield } from 'lucide-react';
import { storageService } from '../services/storage';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';

export default function Warranties() {
    const { t, i18n } = useTranslation();
    const [warranties, setWarranties] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');

    useEffect(() => {
        const loadWarranties = async () => {
            try {
                const data = await storageService.getWarranties();
                setWarranties(data);
            } catch (error) {
                console.error('Error loading warranties:', error);
            } finally {
                setLoading(false);
            }
        };
        loadWarranties();
    }, []);

    const filteredWarranties = useMemo(() => {
        return warranties.filter(w =>
            w.protocolNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            w.customerName?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            w.serialNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
            w.bikeModel?.toLowerCase().includes(searchTerm.toLowerCase())
        );
    }, [warranties, searchTerm]);

    const handleDelete = async (id) => {
        if (window.confirm(i18n.language === 'it' ? 'Sei sicuro di voler eliminare questo processo?' : 'Tem certeza que deseja excluir este processo?')) {
            try {
                await storageService.deleteWarranty(id);
                setWarranties(warranties.filter(w => w.id !== id));
            } catch (error) {
                alert('Error deleting warranty');
            }
        }
    };

    const exportToExcel = () => {
        const worksheet = XLSX.utils.json_to_sheet(filteredWarranties.map(w => ({
            [t('Protocol')]: w.protocolNumber,
            [t('Start Date')]: w.startDate,
            [t('Customer')]: w.customerName,
            [t('Email')]: w.customerEmail,
            [t('Agent')]: w.agent,
            [t('Serial Number')]: w.serialNumber,
            [t('Bike Model')]: w.bikeModel,
            [t('Bike Size')]: w.bikeSize,
            [t('Problem')]: w.problemDescription,
            [t('Status')]: t(w.status?.charAt(0).toUpperCase() + w.status?.slice(1)),
            [t('Solution')]: t(w.solution),
            [t('Producer')]: w.producer,
            [t('New Serial Number')]: w.newSerialNumber
        })));
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, "Warranties");
        XLSX.writeFile(workbook, `Warranties_${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center p-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <h1 className="text-2xl font-bold text-gray-900">{t('Gestione Garanzie')}</h1>
                <div className="flex flex-wrap gap-2">
                    <Button variant="outlined" onClick={exportToExcel} className="flex items-center gap-2">
                        <FileDown className="h-4 w-4" /> {t('Export Excel')}
                    </Button>
                    <Link to="/new-warranty">
                        <Button className="flex items-center gap-2">
                            <Plus className="h-4 w-4" /> {t('New Warranty')}
                        </Button>
                    </Link>
                </div>
            </div>

            <Card>
                <CardHeader>
                    <div className="relative">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
                        <Input
                            placeholder={t('Search...')}
                            className="pl-10"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-gray-500">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3">{t('Protocollo')}</th>
                                    <th className="px-6 py-3">{t('Start Date')}</th>
                                    <th className="px-6 py-3">{t('Customer')}</th>
                                    <th className="px-6 py-3">{t('Serial Number')}</th>
                                    <th className="px-6 py-3">{t('Bike Model')}</th>
                                    <th className="px-6 py-3">{t('Status')}</th>
                                    <th className="px-6 py-3">{t('Solution')}</th>
                                    <th className="px-6 py-3">{t('Producer')}</th>
                                    <th className="px-6 py-3 text-right">{t('Actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredWarranties.map((w) => (
                                    <tr key={w.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 font-bold text-primary">{w.protocolNumber}</td>
                                        <td className="px-6 py-4">{new Date(w.startDate).toLocaleDateString()}</td>
                                        <td className="px-6 py-4 font-medium text-gray-900">{w.customerName}</td>
                                        <td className="px-6 py-4">{w.serialNumber}</td>
                                        <td className="px-6 py-4">{w.bikeModel}</td>
                                        <td className="px-6 py-4">
                                            <span className={`px-2 py-1 rounded-full text-xs font-semibold ${w.status === 'chiuso' ? 'bg-green-100 text-green-800' :
                                                    w.status === 'in corso' ? 'bg-blue-100 text-blue-800' :
                                                        'bg-yellow-100 text-yellow-800'
                                                }`}>
                                                {t(w.status?.charAt(0).toUpperCase() + w.status?.slice(1))}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">{w.solution ? t(w.solution) : '-'}</td>
                                        <td className="px-6 py-4">{w.producer || '-'}</td>
                                        <td className="px-6 py-4 text-right">
                                            <div className="flex justify-end gap-2">
                                                <Link to={`/edit-warranty/${w.id}`}>
                                                    <Button variant="ghost" size="sm">
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                </Link>
                                                <Button
                                                    variant="ghost"
                                                    size="sm"
                                                    className="text-red-600 hover:bg-red-50"
                                                    onClick={() => handleDelete(w.id)}
                                                >
                                                    <Trash2 className="h-4 w-4" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredWarranties.length === 0 && (
                                    <tr>
                                        <td colSpan="9" className="px-6 py-8 text-center text-gray-500">
                                            {t('No records found')}
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
