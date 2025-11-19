import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Pencil, Trash2, Search, DollarSign, TrendingUp, TrendingDown, User } from 'lucide-react';
import { storageService } from '../services/storage';
import { useTranslation } from 'react-i18next';

export default function Reports() {
    const { t } = useTranslation();
    const [shipments, setShipments] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [stats, setStats] = useState({
        totalSavings: 0,
        totalProfit: 0,
        monthSavings: 0,
        monthProfit: 0,
        bestCustomer: '-',
        worstCustomer: '-'
    });

    useEffect(() => {
        loadShipments();
    }, []);

    useEffect(() => {
        loadShipments();
    }, []);

    const loadShipments = async () => {
        const data = await storageService.getShipments();
        setShipments(data);
        calculateStats(data);
    };

    const calculateStats = (data) => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        let totalSavings = 0;
        let totalProfit = 0;
        let monthSavings = 0;
        let monthProfit = 0;
        const customerProfits = {};

        data.forEach(s => {
            const sDate = new Date(s.createdAt);
            const profit = s.profit || 0;
            const savings = s.savings || 0;

            totalSavings += savings;
            totalProfit += profit;

            if (sDate.getMonth() === currentMonth && sDate.getFullYear() === currentYear) {
                monthSavings += savings;
                monthProfit += profit;
            }

            // Group by customer
            const customer = s.customerName || 'Unknown';
            if (!customerProfits[customer]) customerProfits[customer] = 0;
            customerProfits[customer] += profit;
        });

        // Find best and worst customer
        let bestCustomer = '-';
        let worstCustomer = '-';
        let maxProfit = -Infinity;
        let minProfit = Infinity;

        Object.entries(customerProfits).forEach(([customer, profit]) => {
            if (profit > maxProfit) {
                maxProfit = profit;
                bestCustomer = customer;
            }
            if (profit < minProfit) {
                minProfit = profit;
                worstCustomer = customer;
            }
        });

        if (Object.keys(customerProfits).length === 0) {
            bestCustomer = '-';
            worstCustomer = '-';
        }

        setStats({
            totalSavings,
            totalProfit,
            monthSavings,
            monthProfit,
            bestCustomer: bestCustomer !== '-' ? `${bestCustomer} (€ ${maxProfit.toFixed(2)})` : '-',
            worstCustomer: worstCustomer !== '-' ? `${worstCustomer} (€ ${minProfit.toFixed(2)})` : '-'
        });
    };

    const handleDelete = async (id) => {
        if (window.confirm(t('Confirm Delete'))) {
            await storageService.deleteShipment(id);
            loadShipments();
        }
    };

    const filteredShipments = shipments.filter(shipment => {
        const search = searchTerm.toLowerCase();
        return (
            shipment.orderId?.toLowerCase().includes(search) ||
            shipment.customerName?.toLowerCase().includes(search) ||
            shipment.trackingCode?.toLowerCase().includes(search)
        );
    });

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{t('Reports')}</h1>
                    <p className="text-gray-500 mt-1">{t('Complete History')}</p>
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {/* Row 1 */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">{t('Total Savings')}</CardTitle>
                        <DollarSign className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">€ {stats.totalSavings.toFixed(2)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">{t('Total Profit')}</CardTitle>
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${stats.totalProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            € {stats.totalProfit.toFixed(2)}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-purple-50 border-purple-100">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-700">{t('Best Customer (Profit)')}</CardTitle>
                        <User className="h-4 w-4 text-purple-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg font-bold truncate text-purple-900" title={stats.bestCustomer}>{stats.bestCustomer}</div>
                    </CardContent>
                </Card>

                {/* Row 2 */}
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">{t('Current Month Savings')}</CardTitle>
                        <DollarSign className="h-4 w-4 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">€ {stats.monthSavings.toFixed(2)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">{t('Current Month Profit')}</CardTitle>
                        <TrendingUp className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className={`text-2xl font-bold ${stats.monthProfit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                            € {stats.monthProfit.toFixed(2)}
                        </div>
                    </CardContent>
                </Card>
                <Card className="bg-purple-50 border-purple-100">
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-700">{t('Worst Customer (Loss)')}</CardTitle>
                        <TrendingDown className="h-4 w-4 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg font-bold truncate text-purple-900" title={stats.worstCustomer}>{stats.worstCustomer}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{t('All Shipments')}</CardTitle>
                    <div className="w-72 relative">
                        <Search className="absolute left-2 top-2.5 h-4 w-4 text-gray-500" />
                        <Input
                            placeholder={t('Search...')}
                            className="pl-8"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr>
                                    <th className="px-6 py-3">{t('Date')}</th>
                                    <th className="px-6 py-3">{t('Order')}</th>
                                    <th className="px-6 py-3">{t('Customer')}</th>
                                    <th className="px-6 py-3">{t('Country')}</th>
                                    <th className="px-6 py-3">{t('Portal')}</th>
                                    <th className="px-6 py-3">{t('Carrier')}</th>
                                    <th className="px-6 py-3">{t('Paid')}</th>
                                    <th className="px-6 py-3">{t('Cost')}</th>
                                    <th className="px-6 py-3">{t('Profit')}</th>
                                    <th className="px-6 py-3">{t('Savings')}</th>
                                    <th className="px-6 py-3">{t('Actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredShipments.map((shipment) => (
                                    <tr key={shipment.id} className="bg-white border-b hover:bg-gray-50">
                                        <td className="px-6 py-4 text-gray-500">
                                            {new Date(shipment.createdAt).toLocaleDateString()}
                                        </td>
                                        <td className="px-6 py-4 font-medium text-gray-900">{shipment.orderId}</td>
                                        <td className="px-6 py-4">{shipment.customerName || '-'}</td>
                                        <td className="px-6 py-4">{shipment.destinationCountry || '-'}</td>
                                        <td className="px-6 py-4">{shipment.selectedQuote.portal}</td>
                                        <td className="px-6 py-4">{shipment.selectedQuote.carrier}</td>
                                        <td className="px-6 py-4">€ {shipment.customerPayment.toFixed(2)}</td>
                                        <td className="px-6 py-4 text-red-600">€ {parseFloat(shipment.selectedQuote.price).toFixed(2)}</td>
                                        <td className="px-6 py-4 font-bold text-green-600">
                                            € {shipment.profit.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 text-blue-600">
                                            € {shipment.savings.toFixed(2)}
                                        </td>
                                        <td className="px-6 py-4 flex gap-2">
                                            <Link to={`/new-shipment/${shipment.id}`}>
                                                <Button variant="ghost" size="icon" className="h-8 w-8 text-blue-500 hover:text-blue-700">
                                                    <Pencil className="h-4 w-4" />
                                                </Button>
                                            </Link>
                                            <Button
                                                variant="ghost"
                                                size="icon"
                                                className="h-8 w-8 text-red-500 hover:text-red-700"
                                                onClick={() => handleDelete(shipment.id)}
                                            >
                                                <Trash2 className="h-4 w-4" />
                                            </Button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
