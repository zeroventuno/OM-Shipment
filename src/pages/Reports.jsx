import React, { useEffect, useState, useMemo } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { Input } from '../components/ui/Input';
import { Pencil, Trash2, Search, DollarSign, TrendingUp, TrendingDown, User, FileDown, Printer, Camera, X, Truck, Wrench, Menu } from 'lucide-react';
import MonthlyChart from '../components/MonthlyChart';
import { storageService } from '../services/storage';
import { useTranslation } from 'react-i18next';
import * as XLSX from 'xlsx';

export default function Reports() {
    const { t, i18n } = useTranslation();
    const [shipments, setShipments] = useState([]);
    const [searchTerm, setSearchTerm] = useState('');
    const [customerFilter, setCustomerFilter] = useState('all');
    const [selectedCustomer, setSelectedCustomer] = useState('');
    const [selectedItems, setSelectedItems] = useState([]);
    const [isPhotoModalOpen, setIsPhotoModalOpen] = useState(false);
    const [currentPhotos, setCurrentPhotos] = useState([]);

    useEffect(() => {
        loadShipments();

        // 17track script integration
        const scriptId = '17track-script';
        if (!document.getElementById(scriptId)) {
            const script = document.createElement('script');
            script.id = scriptId;
            script.src = 'https://www.17track.net/externalcall.js';
            script.async = true;
            document.body.appendChild(script);
        }

        const handleTrackingClick = (e) => {
            const trigger = e.target.closest('.tracking-trigger');
            if (trigger) {
                e.preventDefault();
                const num = trigger.getAttribute('data-num');
                const elementId = trigger.id;

                if (window.YQV5) {
                    window.YQV5.trackSingleF1({
                        YQ_ElementId: elementId,
                        YQ_Num: num,
                        YQ_Fc: "0",
                        YQ_Lang: "it",
                        YQ_Height: 560
                    });
                }
            }
        };

        document.addEventListener('click', handleTrackingClick);

        return () => {
            document.removeEventListener('click', handleTrackingClick);
        };
    }, []);

    const loadShipments = async () => {
        const data = await storageService.getShipments();
        setShipments(data);
    };

    // Get unique customers
    const customers = useMemo(() => {
        const uniqueCustomers = [...new Set(shipments.map(s => s.customerName).filter(Boolean))];
        return uniqueCustomers.sort();
    }, [shipments]);

    // Calculate customer profits for ranking
    const customerProfits = useMemo(() => {
        const profits = {};
        shipments.forEach(s => {
            const customer = s.customerName || 'Unknown';
            if (!profits[customer]) profits[customer] = 0;
            profits[customer] += (s.profit || 0);
        });
        return Object.entries(profits).sort((a, b) => b[1] - a[1]);
    }, [shipments]);

    // Filter shipments based on selected filter
    const filteredShipments = useMemo(() => {
        let filtered = shipments;

        // Apply customer filter
        if (customerFilter === 'specific' && selectedCustomer) {
            filtered = filtered.filter(s => s.customerName === selectedCustomer);
        } else if (customerFilter === 'top5') {
            const top5Customers = customerProfits.slice(0, 5).map(([name]) => name);
            filtered = filtered.filter(s => top5Customers.includes(s.customerName || 'Unknown'));
        } else if (customerFilter === 'bottom5') {
            const bottom5Customers = customerProfits.slice(-5).map(([name]) => name);
            filtered = filtered.filter(s => bottom5Customers.includes(s.customerName || 'Unknown'));
        }

        // Apply search filter
        if (searchTerm) {
            const search = searchTerm.toLowerCase();
            filtered = filtered.filter(shipment =>
                shipment.orderId?.toLowerCase().includes(search) ||
                shipment.customerName?.toLowerCase().includes(search) ||
                shipment.trackingCode?.toLowerCase().includes(search)
            );
        }

        return filtered;
    }, [shipments, customerFilter, selectedCustomer, searchTerm, customerProfits]);

    // Calculate stats based on filtered data
    const stats = useMemo(() => {
        const now = new Date();
        const currentMonth = now.getMonth();
        const currentYear = now.getFullYear();

        let totalSavings = 0;
        let totalProfit = 0;
        let monthSavings = 0;
        let monthProfit = 0;
        const customerProfitsMap = {};

        filteredShipments.forEach(s => {
            const sDate = new Date(s.createdAt);
            const profit = s.profit || 0;
            const savings = s.savings || 0;

            totalSavings += savings;
            totalProfit += profit;

            if (sDate.getMonth() === currentMonth && sDate.getFullYear() === currentYear) {
                monthSavings += savings;
                monthProfit += profit;
            }

            const customer = s.customerName || 'Unknown';
            if (!customerProfitsMap[customer]) customerProfitsMap[customer] = 0;
            customerProfitsMap[customer] += profit;
        });

        let bestCustomer = '-';
        let worstCustomer = '-';
        let maxProfit = -Infinity;
        let minProfit = Infinity;

        Object.entries(customerProfitsMap).forEach(([customer, profit]) => {
            if (profit > maxProfit) {
                maxProfit = profit;
                bestCustomer = customer;
            }
            if (profit < minProfit) {
                minProfit = profit;
                worstCustomer = customer;
            }
        });

        if (Object.keys(customerProfitsMap).length === 0) {
            bestCustomer = '-';
            worstCustomer = '-';
        }

        return {
            totalSavings,
            totalProfit,
            monthSavings,
            monthProfit,
            bestCustomer: bestCustomer !== '-' ? `${bestCustomer} (€ ${maxProfit.toFixed(2)})` : '-',
            worstCustomer: worstCustomer !== '-' ? `${worstCustomer} (€ ${minProfit.toFixed(2)})` : '-'
        };
    }, [filteredShipments]);

    // Calculate monthly data for chart
    const monthlyChartData = useMemo(() => {
        const data = Array.from({ length: 12 }, (_, i) => {
            const date = new Date(new Date().getFullYear(), i, 1);
            // Capitalize first letter of month
            const monthName = date.toLocaleDateString(i18n.language, { month: 'short' });
            return {
                name: monthName.charAt(0).toUpperCase() + monthName.slice(1),
                savings: 0,
                profit: 0,
                totalCount: 0,
                types: {}
            };
        });

        const currentYear = new Date().getFullYear();
        filteredShipments.forEach(s => {
            const d = new Date(s.createdAt);
            if (d.getFullYear() === currentYear) {
                const mIndex = d.getMonth();
                if (data[mIndex]) {
                    data[mIndex].savings += (s.savings || 0);
                    data[mIndex].profit += (s.profit || 0);

                    const quantity = (s.orderType === 'Bicycle' || s.orderType === 'Frame Kit')
                        ? (s.quantity || 1)
                        : 1;

                    data[mIndex].totalCount += quantity;

                    const type = s.orderType || 'Other';
                    data[mIndex].types[type] = (data[mIndex].types[type] || 0) + quantity;
                }
            }
        });
        return data;
    }, [filteredShipments, i18n.language]);

    const handleNormalizeCustomers = async () => {
        if (!window.confirm(t('Normalize customer names? This will unify case variations.'))) return;

        const grouped = {};
        // Use current shipments or fetch fresh? Use current filtered or all. Better check all.
        // We'll use the latest loaded shipments to be safe, or re-fetch.
        // Since we are updating, let's just use what we have in state if it's all of them.
        // But shipments might be filtered? No, `shipments` state has all.

        let updates = 0;
        shipments.forEach(s => {
            if (!s.customerName) return;
            const key = s.customerName.toLowerCase().trim();
            if (!grouped[key]) grouped[key] = [];
            grouped[key].push(s);
        });

        for (const key in grouped) {
            const group = grouped[key];
            const uniqueNames = [...new Set(group.map(s => s.customerName))];

            if (uniqueNames.length > 1) {
                // Find best name (most frequent)
                const counts = {};
                group.forEach(s => counts[s.customerName] = (counts[s.customerName] || 0) + 1);
                const bestName = Object.keys(counts).reduce((a, b) => counts[a] > counts[b] ? a : b);

                // Update others
                for (const s of group) {
                    if (s.customerName !== bestName) {
                        const updated = { ...s, customerName: bestName };
                        await storageService.updateShipment(updated);
                        updates++;
                    }
                }
            }
        }

        if (updates > 0) {
            alert(`${updates} shipments updated.`);
            loadShipments();
        } else {
            alert(t('No duplicate customer names found.'));
        }
    };

    const handleDelete = async (id) => {
        if (window.confirm(t('Confirm Delete'))) {
            await storageService.deleteShipment(id);
            loadShipments();
        }
    };

    const handleSelectAll = (e) => {
        if (e.target.checked) {
            setSelectedItems(filteredShipments.map(s => s.id));
        } else {
            setSelectedItems([]);
        }
    };

    const handleSelectItem = (id) => {
        setSelectedItems(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const exportToExcel = () => {
        const dataToExport = selectedItems.length > 0
            ? filteredShipments.filter(s => selectedItems.includes(s.id))
            : filteredShipments;

        const excelData = dataToExport.map(s => ({
            [t('Order')]: s.orderId,
            [t('Tracking')]: s.trackingCode,
            [t('Customer')]: s.customerName,
            [t('Country')]: s.destinationCountry,
            [t('Portal/Carrier')]: `${s.selectedQuote?.portal} / ${s.selectedQuote?.carrier}`,
            [t('Cost')]: `€ ${s.selectedQuote?.price}`,
            [t('Customer Payment')]: `€ ${s.customerPayment}`,
            [t('Profit')]: `€ ${s.profit?.toFixed(2)}`,
            [t('Savings')]: `€ ${s.savings?.toFixed(2)}`,
            [t('Date')]: new Date(s.createdAt).toLocaleDateString()
        }));

        const ws = XLSX.utils.json_to_sheet(excelData);
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, 'Envios');
        XLSX.writeFile(wb, `relatorio-envios-${new Date().toISOString().split('T')[0]}.xlsx`);
    };

    const handlePrint = () => {
        const dataToExport = selectedItems.length > 0
            ? filteredShipments.filter(s => selectedItems.includes(s.id))
            : filteredShipments;

        const printWindow = window.open('', '', 'height=600,width=800');
        printWindow.document.write('<html><head><title>Relatório de Envios</title>');
        printWindow.document.write('<style>body{font-family:Arial,sans-serif;} table{width:100%;border-collapse:collapse;} th,td{border:1px solid #ddd;padding:8px;text-align:left;} th{background-color:#f2f2f2;}</style>');
        printWindow.document.write('</head><body>');
        printWindow.document.write('<h1>Relatório de Envios - Officine Mattio</h1>');
        printWindow.document.write('<table><thead><tr>');
        printWindow.document.write(`<th>${t('Order')}</th><th>${t('Tracking')}</th><th>${t('Customer')}</th><th>${t('Portal/Carrier')}</th><th>${t('Cost')}</th><th>${t('Profit')}</th><th>${t('Savings')}</th></tr></thead><tbody>`);

        dataToExport.forEach(s => {
            printWindow.document.write('<tr>');
            printWindow.document.write(`<td>${s.orderId}</td>`);
            printWindow.document.write(`<td>${s.trackingCode || '-'}</td>`);
            printWindow.document.write(`<td>${s.customerName}</td>`);
            printWindow.document.write(`<td>${s.selectedQuote?.portal} / ${s.selectedQuote?.carrier}</td>`);
            printWindow.document.write(`<td>€ ${s.selectedQuote?.price}</td>`);
            printWindow.document.write(`<td>€ ${s.profit?.toFixed(2)}</td>`);
            printWindow.document.write(`<td>€ ${s.savings?.toFixed(2)}</td>`);
            printWindow.document.write('</tr>');
        });

        printWindow.document.write('</tbody></table>');
        printWindow.document.write('</body></html>');
        printWindow.document.close();
        printWindow.print();
    };

    return (
        <div className="space-y-4">
            <div className="flex justify-between items-center animate-in fade-in slide-in-from-top-4 duration-500">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{t('Reports')}</h1>
                    <p className="text-gray-500 mt-1">{t('Complete History')}</p>
                </div>
                <Button variant="ghost" onClick={handleNormalizeCustomers} title={t("Normalize Customers")}>
                    <Wrench className="h-4 w-4 mr-2" />
                    {t("Fix Names")}
                </Button>
            </div>

            {/* Monthly Chart */}
            <MonthlyChart data={monthlyChartData} />

            {/* Customer Filter */}
            <div className="bg-white/60 backdrop-blur-sm border border-gray-200 rounded-lg p-4 shadow-sm">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 items-end">
                    <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1.5">
                            {t('Filter Type')}
                        </label>
                        <select
                            className="w-full h-9 rounded-md border border-gray-300 bg-white px-2.5 text-sm focus:ring-2 focus:ring-primary"
                            value={customerFilter}
                            onChange={(e) => {
                                setCustomerFilter(e.target.value);
                                if (e.target.value !== 'specific') setSelectedCustomer('');
                            }}
                        >
                            <option value="all">{t('All Customers')}</option>
                            <option value="specific">{t('Specific Customer')}</option>
                            <option value="top5">{t('Top 5 Most Profitable')}</option>
                            <option value="bottom5">{t('Bottom 5 Least Profitable')}</option>
                        </select>
                    </div>

                    {customerFilter === 'specific' && (
                        <div>
                            <label className="block text-xs font-medium text-gray-600 mb-1.5">
                                {t('Select Customer')}
                            </label>
                            <select
                                className="w-full h-9 rounded-md border border-gray-300 bg-white px-2.5 text-sm focus:ring-2 focus:ring-primary"
                                value={selectedCustomer}
                                onChange={(e) => setSelectedCustomer(e.target.value)}
                            >
                                <option value="">{t('Choose a customer')}</option>
                                {customers.map(customer => (
                                    <option key={customer} value={customer}>{customer}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </div>
            </div>

            {/* KPI Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 animate-in fade-in slide-in-from-bottom-8 duration-700 delay-100">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">{t('Total Savings')}</CardTitle>
                        <DollarSign className="h-6 w-6 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">€ {stats.totalSavings.toFixed(2)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">{t('Total Profit')}</CardTitle>
                        <TrendingUp className="h-6 w-6 text-blue-500" />
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
                        <User className="h-6 w-6 text-purple-600" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg font-bold truncate text-purple-900" title={stats.bestCustomer}>{stats.bestCustomer}</div>
                    </CardContent>
                </Card>

                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">{t('Current Month Savings')}</CardTitle>
                        <DollarSign className="h-6 w-6 text-green-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold">€ {stats.monthSavings.toFixed(2)}</div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">{t('Current Month Profit')}</CardTitle>
                        <TrendingUp className="h-6 w-6 text-blue-500" />
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
                        <TrendingDown className="h-6 w-6 text-red-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-lg font-bold truncate text-purple-900" title={stats.worstCustomer}>{stats.worstCustomer}</div>
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="flex flex-row items-center justify-between">
                    <CardTitle>{t('All Shipments')} ({filteredShipments.length})</CardTitle>
                    <div className="flex gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                            <Input
                                placeholder={t('Search...')}
                                value={searchTerm}
                                onChange={(e) => setSearchTerm(e.target.value)}
                                className="pl-10 w-64"
                            />
                        </div>
                        <Button
                            variant="outlined"
                            onClick={exportToExcel}
                            disabled={filteredShipments.length === 0}
                        >
                            <FileDown className="h-4 w-4 mr-2" />
                            {selectedItems.length > 0 ? `${t('Export')} (${selectedItems.length})` : t('Export Excel')}
                        </Button>
                        <Button
                            variant="outlined"
                            onClick={handlePrint}
                            disabled={filteredShipments.length === 0}
                        >
                            <Printer className="h-4 w-4 mr-2" />
                            {t('Print')}
                        </Button>
                    </div>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-center">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
                                <tr>
                                    <th className="px-3 py-3">
                                        <input
                                            type="checkbox"
                                            checked={selectedItems.length === filteredShipments.length && filteredShipments.length > 0}
                                            onChange={handleSelectAll}
                                            className="rounded border-gray-300"
                                        />
                                    </th>
                                    <th className="px-2 py-2">{t('Order')}</th>
                                    <th className="px-2 py-2 w-10 text-center">{t('Tracking')}</th>
                                    <th className="px-2 py-2 w-10 text-center">{t('Photos')}</th>
                                    <th className="px-2 py-2 w-10 text-center">{t('Order Type')}</th>
                                    <th className="px-2 py-2">{t('Customer')}</th>
                                    <th className="px-2 py-2">{t('Country')}</th>
                                    <th className="px-2 py-2">{t('Portal/Carrier')}</th>
                                    <th className="px-2 py-2">{t('Cost')}</th>
                                    <th className="px-2 py-2">{t('Customer Payment')}</th>
                                    <th className="px-2 py-2">{t('Profit')}</th>
                                    <th className="px-2 py-2">{t('Savings')}</th>
                                    <th className="px-2 py-2">{t('Date')}</th>
                                    <th className="px-2 py-2">{t('Actions')}</th>
                                </tr>
                            </thead>
                            <tbody>
                                {filteredShipments.map((shipment) => (
                                    <tr key={shipment.id} className="bg-white border-b hover:bg-gray-50 uppercase text-[11px] transition-colors duration-150">
                                        <td className="px-2 py-2">
                                            <input
                                                type="checkbox"
                                                checked={selectedItems.includes(shipment.id)}
                                                onChange={() => handleSelectItem(shipment.id)}
                                                className="rounded border-gray-300"
                                            />
                                        </td>
                                        <td className="px-2 py-2 font-medium text-gray-900">{shipment.orderId}</td>
                                        <td className="px-2 py-2">
                                            <div className="flex justify-center">
                                                {shipment.trackingCode ? (
                                                    <button
                                                        id={`track-${shipment.id}`}
                                                        className="tracking-trigger text-blue-600 hover:text-blue-800 transition-colors p-1"
                                                        data-num={shipment.trackingCode}
                                                        title={shipment.trackingCode}
                                                    >
                                                        <Truck className="h-4 w-4" />
                                                    </button>
                                                ) : (
                                                    <Truck className="h-4 w-4 text-gray-200" title={t('No tracking')} />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-2 py-2">
                                            <div className="flex justify-center">
                                                {shipment.photoUrls && shipment.photoUrls.length > 0 ? (
                                                    <button
                                                        onClick={() => {
                                                            setCurrentPhotos(shipment.photoUrls);
                                                            setIsPhotoModalOpen(true);
                                                        }}
                                                        title={`${shipment.photoUrls.length} ${t('Photos')}`}
                                                        className="text-gray-700 hover:text-primary transition-colors p-1"
                                                    >
                                                        <Camera className="h-4 w-4" />
                                                    </button>
                                                ) : (
                                                    <Camera className="h-4 w-4 text-gray-200" title={t('No photos')} />
                                                )}
                                            </div>
                                        </td>
                                        <td className="px-2 py-2">
                                            <div className="flex justify-center">
                                                <Link to={`/new-shipment/${shipment.id}`}>
                                                    <div
                                                        className={`p-1 rounded-full border transition-colors ${shipment.orderType
                                                            ? 'border-blue-200 bg-blue-50 text-blue-600 hover:bg-blue-100 hover:border-blue-300'
                                                            : 'border-gray-200 bg-gray-50 text-gray-300 hover:bg-gray-100 hover:border-gray-300'
                                                            }`}
                                                        title={shipment.orderType ? t(shipment.orderType) : t('Uncategorized')}
                                                    >
                                                        <Menu className="h-3 w-3" />
                                                    </div>
                                                </Link>
                                            </div>
                                        </td>
                                        <td className="px-2 py-2">{shipment.customerName}</td>
                                        <td className="px-2 py-2">{shipment.destinationCountry}</td>
                                        <td className="px-2 py-2">{shipment.selectedQuote?.portal} / {shipment.selectedQuote?.carrier}</td>
                                        <td className="px-2 py-2">€ {shipment.selectedQuote?.price}</td>
                                        <td className="px-2 py-2">€ {shipment.customerPayment}</td>
                                        <td className={`px-2 py-2 font-semibold ${shipment.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                                            € {shipment.profit?.toFixed(2)}
                                        </td>
                                        <td className="px-2 py-2 text-green-600 font-semibold">€ {shipment.savings?.toFixed(2)}</td>
                                        <td className="px-2 py-2 text-nowrap">{new Date(shipment.createdAt).toLocaleDateString()}</td>
                                        <td className="px-2 py-2">
                                            <div className="flex gap-2">
                                                <Link to={`/new-shipment/${shipment.id}`}>
                                                    <Button variant="ghost" size="icon" className="h-7 w-7">
                                                        <Pencil className="h-3.5 w-3.5" />
                                                    </Button>
                                                </Link>
                                                <Button
                                                    variant="ghost"
                                                    size="icon"
                                                    onClick={() => handleDelete(shipment.id)}
                                                    className="text-red-500 hover:text-red-700 h-7 w-7"
                                                >
                                                    <Trash2 className="h-3.5 w-3.5" />
                                                </Button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                        {filteredShipments.length === 0 && (
                            <div className="text-center py-8 text-gray-500">
                                {t('No shipments found')}
                            </div>
                        )}
                    </div>
                </CardContent>
            </Card>

            {/* Photo Gallery Modal */}
            {isPhotoModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm">
                    <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
                        <div className="p-4 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
                            <h3 className="font-bold text-gray-900 text-lg flex items-center gap-2">
                                <Camera className="h-5 w-5 text-primary" />
                                {t('Photos')} ({currentPhotos.length})
                            </h3>
                            <button
                                onClick={() => setIsPhotoModalOpen(false)}
                                className="p-2 hover:bg-gray-200 rounded-full transition-colors text-gray-500"
                            >
                                <X className="h-6 w-6" />
                            </button>
                        </div>
                        <div className="p-6 overflow-y-auto bg-white">
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                                {currentPhotos.map((url, index) => (
                                    <a
                                        key={index}
                                        href={url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="group relative aspect-square rounded-lg overflow-hidden border border-gray-200 hover:ring-2 hover:ring-primary transition-all shadow-sm"
                                    >
                                        <img
                                            src={url}
                                            alt={`${t('Photo')} ${index + 1}`}
                                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                        />
                                        <div className="absolute inset-0 bg-black/0 group-hover:bg-black/20 flex items-center justify-center transition-colors">
                                            <Search className="text-white opacity-0 group-hover:opacity-100 h-8 w-8" />
                                        </div>
                                    </a>
                                ))}
                            </div>
                        </div>
                        <div className="p-4 border-t border-gray-100 bg-gray-50 flex justify-end">
                            <Button onClick={() => setIsPhotoModalOpen(false)}>
                                {t('Close')}
                            </Button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
