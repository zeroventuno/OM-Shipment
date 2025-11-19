import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { TrendingUp, Package, DollarSign, ArrowRight, Truck, Pencil } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { storageService } from '../services/storage';
import { trackingService } from '../services/trackingService';


import { useTranslation } from 'react-i18next';

export default function Dashboard() {
    const { t } = useTranslation();
    const [stats, setStats] = useState({
        totalSavings: 0,
        totalShipments: 0,
        recentShipments: [],
        pendingShipments: 0,
        favoriteCarrier: '-',
        favoriteCarrierPercentage: 0
    });
    const [trackingUpdates, setTrackingUpdates] = useState({});

    useEffect(() => {
        const loadData = async () => {
            const data = await storageService.getStats();
            setStats(data);

            // Simulate checking tracking for recent shipments
            data.recentShipments.forEach(async (shipment) => {
                if (shipment.trackingCode && shipment.status !== 'Delivered') {
                    const update = await trackingService.getTrackingStatus(shipment.trackingCode);
                    setTrackingUpdates(prev => ({ ...prev, [shipment.id]: update }));
                }
            });
        };
        loadData();
    }, []);

    return (
        <div className="space-y-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900 dark:text-white">{t('Dashboard')}</h1>
                    <p className="text-gray-500 dark:text-gray-400 mt-1">{t('Dashboard Overview')}</p>
                </div>
                <Link to="/new-shipment">
                    <Button className="shadow-lg">
                        {t('New Shipment')} <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </Link>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('Total Savings')}</CardTitle>
                        <DollarSign className="h-4 w-4 text-secondary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">€ {stats.totalSavings.toFixed(2)}</div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">+12% {t('vs last month')}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('Shipments Made')}</CardTitle>
                        <Package className="h-4 w-4 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.totalShipments}</div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{stats.pendingShipments} {t('Pending Shipments')}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500 dark:text-gray-400">{t('Favorite Carrier')}</CardTitle>
                        <Truck className="h-4 w-4 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.favoriteCarrier}</div>
                        <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">{t('Used in')} {stats.favoriteCarrierPercentage}% {t('of shipments')}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Recent Shipments */}
            <Card className="col-span-3">
                <CardHeader>
                    <CardTitle>{t('Recent Shipments')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50 dark:bg-gray-800 dark:text-gray-300">
                                <tr>
                                    <th className="px-6 py-3">{t('Order')}</th>
                                    <th className="px-6 py-3">{t('Customer')}</th>
                                    <th className="px-6 py-3">{t('Portal/Carrier')}</th>
                                    <th className="px-6 py-3">{t('Cost')}</th>
                                    <th className="px-6 py-3">{t('Savings')}</th>
                                    <th className="px-6 py-3">{t('Status')}</th>
                                    <th className="px-6 py-3">{t('Actions')}</th>
                                </tr>
                            </thead>
                            <tbody className="dark:text-gray-300">
                                {stats.recentShipments.length > 0 ? (
                                    stats.recentShipments.map((shipment) => (
                                        <tr key={shipment.id} className="bg-white border-b hover:bg-gray-50 dark:bg-gray-900 dark:border-gray-800 dark:hover:bg-gray-800">
                                            <td className="px-6 py-4 font-medium text-gray-900 dark:text-white">{shipment.orderId}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{shipment.customerName || '-'}</span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">{shipment.destinationCountry || '-'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{shipment.selectedQuote.portal}</span>
                                                    <span className="text-xs text-gray-500 dark:text-gray-400">{shipment.selectedQuote.carrier}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">€ {parseFloat(shipment.selectedQuote.price).toFixed(2)}</td>
                                            <td className="px-6 py-4 text-green-600 font-medium">
                                                € {shipment.savings.toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${trackingUpdates[shipment.id]?.status === 'Delivered'
                                                    ? 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200'
                                                    : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200'
                                                    }`}>
                                                    {trackingUpdates[shipment.id]?.status || shipment.status}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4">
                                                <Link to={`/new-shipment/${shipment.id}`}>
                                                    <Button variant="ghost" size="icon" className="h-8 w-8">
                                                        <Pencil className="h-4 w-4" />
                                                    </Button>
                                                </Link>
                                            </td>
                                        </tr>
                                    ))
                                ) : (
                                    <tr>
                                        <td colSpan="7" className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
                                            {t('No shipments')}
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
