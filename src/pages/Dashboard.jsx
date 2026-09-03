import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Package, DollarSign, ArrowRight, Truck, Pencil, Bike, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/Card';
import { Button } from '../components/ui/Button';
import { storageService } from '../services/storage';
import { trackingService } from '../services/trackingService';
import {
    BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis,
    CartesianGrid, Tooltip, Legend, ResponsiveContainer
} from 'recharts';

import { useTranslation } from 'react-i18next';
import { countryLabel } from '../data/countries';

const COLORS = ['#0088FE', '#00C49F', '#FFBB28', '#FF8042', '#8884d8', '#82ca9d', '#ffc658', '#4caf50'];

export default function Dashboard() {
    const { t, i18n } = useTranslation();
    const [stats, setStats] = useState({
        totalSavings: 0,
        totalShipments: 0,
        recentShipments: [],
        pendingShipments: 0,
        favoriteCarrier: '-',
        favoriteCarrierPercentage: 0,
        combinationData: [],
        monthlyData: [],
        totalBikes: 0,
        avgBikesPerMonth: 0
    });
    const [trackingUpdates, setTrackingUpdates] = useState({});
    const [error, setError] = useState('');

    useEffect(() => {
        const loadData = async () => {
            let data;
            try {
                data = await storageService.getStats();
            } catch (err) {
                console.error('Failed to load stats:', err);
                setError(err.message || 'Unexpected error');
                return;
            }
            setStats(data);

            // Consulta o rastreio dos envios recentes e grava a mudança de status,
            // senão o envio ficaria "Pending" para sempre no banco.
            data.recentShipments.forEach(async (shipment) => {
                if (!shipment.trackingCode || shipment.status === 'Delivered') return;

                const update = await trackingService.getTrackingStatus(shipment.trackingCode);
                setTrackingUpdates(prev => ({ ...prev, [shipment.id]: update }));

                if (update.status !== shipment.status) {
                    try {
                        await storageService.updateStatus(shipment.id, update.status);
                    } catch (err) {
                        console.error('Failed to persist tracking status:', err);
                    }
                }
            });
        };
        loadData();
    }, []);

    return (
        <div className="space-y-8 pb-8">
            <div className="flex justify-between items-center">
                <div>
                    <h1 className="text-3xl font-bold text-gray-900">{t('Dashboard')}</h1>
                    <p className="text-gray-500 mt-1">{t('Dashboard Overview')}</p>
                </div>
                <Link to="/new-shipment">
                    <Button className="shadow-lg">
                        {t('New Shipment')} <ArrowRight className="ml-2 h-4 w-4" />
                    </Button>
                </Link>
            </div>

            {error && (
                <div className="flex items-start gap-2 text-sm text-error bg-error/10 border border-error/20 rounded-md p-3">
                    <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
                    <span>{t('Could not load data')}: {t(error)}</span>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">{t('Total Savings')}</CardTitle>
                        <DollarSign className="h-6 w-6 text-emerald-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">€ {stats.totalSavings.toFixed(2)}</div>
                        <p className="text-xs text-secondary mt-1 font-medium">{t('Efficient shipping')}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">{t('Shipments')}</CardTitle>
                        <Package className="h-6 w-6 text-primary" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">{stats.totalShipments}</div>
                        <p className="text-xs text-gray-500 mt-1">{stats.pendingShipments} {t('Pending')}</p>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">{t('Total Bikes')}</CardTitle>
                        <Bike className="h-6 w-6 text-indigo-500" />
                    </CardHeader>
                    <CardContent className="flex flex-col">
                        <div className="text-2xl font-bold text-gray-900">{stats.totalBikes || 0}</div>
                        <div className="flex items-center text-xs text-gray-500 mt-1">
                            <span className="font-medium mr-1">{stats.avgBikesPerMonth?.toFixed(1) || 0}</span> {t('Bikes / month average')}
                        </div>
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                        <CardTitle className="text-sm font-medium text-gray-500">{t('Best Option')}</CardTitle>
                        <Truck className="h-6 w-6 text-blue-500" />
                    </CardHeader>
                    <CardContent>
                        <div className="text-2xl font-bold text-gray-900">{stats.favoriteCarrier}</div>
                        <p className="text-xs text-gray-500 mt-1">{stats.favoriteCarrierPercentage}% {t('usage')}</p>
                    </CardContent>
                </Card>
            </div>

            {/* Charts Section */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <Card className="min-h-[400px]">
                    <CardHeader>
                        <CardTitle>{t('Portal / Carrier Usage')}</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        {stats.combinationData && stats.combinationData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <PieChart>
                                    <Pie
                                        data={stats.combinationData}
                                        cx="40%"
                                        cy="50%"
                                        innerRadius={60}
                                        outerRadius={80}
                                        paddingAngle={5}
                                        dataKey="value"
                                    >
                                        {stats.combinationData.map((entry, index) => (
                                            <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                                        ))}
                                    </Pie>
                                    <Tooltip
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Legend
                                        layout="vertical"
                                        verticalAlign="middle"
                                        align="right"
                                        formatter={(value, entry) => (
                                            <span className="text-gray-700 text-sm">
                                                {value}: <span className="font-bold">{entry.payload.value}</span>
                                            </span>
                                        )}
                                    />
                                </PieChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                {t('No data available')}
                            </div>
                        )}
                    </CardContent>
                </Card>

                <Card className="min-h-[400px]">
                    <CardHeader>
                        <CardTitle>{t('Bikes Shipped by Month')}</CardTitle>
                    </CardHeader>
                    <CardContent className="h-[300px]">
                        {stats.monthlyData && stats.monthlyData.length > 0 ? (
                            <ResponsiveContainer width="100%" height="100%">
                                <BarChart data={stats.monthlyData}>
                                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                                    <XAxis
                                        dataKey="month"
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 12 }}
                                    />
                                    <YAxis
                                        axisLine={false}
                                        tickLine={false}
                                        tick={{ fontSize: 12 }}
                                    />
                                    <Tooltip
                                        cursor={{ fill: '#F3F4F6' }}
                                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                                    />
                                    <Bar
                                        dataKey="count"
                                        fill="#4F46E5"
                                        radius={[4, 4, 0, 0]}
                                        barSize={40}
                                    />
                                </BarChart>
                            </ResponsiveContainer>
                        ) : (
                            <div className="flex items-center justify-center h-full text-gray-500">
                                {t('No data available')}
                            </div>
                        )}
                    </CardContent>
                </Card>
            </div>

            {/* Recent Shipments */}
            <Card>
                <CardHeader>
                    <CardTitle>{t('Recent Shipments')}</CardTitle>
                </CardHeader>
                <CardContent>
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left">
                            <thead className="text-xs text-gray-700 uppercase bg-gray-50">
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
                            <tbody>
                                {stats.recentShipments.length > 0 ? (
                                    stats.recentShipments.map((shipment) => (
                                        <tr key={shipment.id} className="bg-white border-b hover:bg-gray-50">
                                            <td className="px-6 py-4 font-medium text-gray-900">{shipment.orderId}</td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{shipment.customerName || '-'}</span>
                                                    <span className="text-xs text-gray-500">{countryLabel(shipment.destinationCountry, i18n.language) || '-'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">
                                                <div className="flex flex-col">
                                                    <span className="font-medium">{shipment.selectedQuote?.portal || t('Customer Cost/Pickup')}</span>
                                                    <span className="text-xs text-gray-500">{shipment.selectedQuote?.carrier || '-'}</span>
                                                </div>
                                            </td>
                                            <td className="px-6 py-4">€ {shipment.selectedQuote ? parseFloat(shipment.selectedQuote.price).toFixed(2) : '0.00'}</td>
                                            <td className="px-6 py-4 text-green-600 font-medium">
                                                € {(shipment.savings || 0).toFixed(2)}
                                            </td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2 py-1 rounded-full text-xs font-medium ${trackingUpdates[shipment.id]?.status === 'Delivered'
                                                    ? 'bg-green-100 text-green-800'
                                                    : 'bg-yellow-100 text-yellow-800'
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
                                        <td colSpan="7" className="px-6 py-8 text-center text-gray-500">
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
