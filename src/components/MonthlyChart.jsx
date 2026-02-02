import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Cell, CartesianGrid } from 'recharts';
import { useTranslation } from 'react-i18next';

export default function MonthlyChart({ data }) {
    const { t } = useTranslation();

    return (
        <div className="h-80 w-full bg-white p-6 rounded-xl shadow-sm border border-gray-200 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E5E7EB" />
                    <XAxis
                        dataKey="name"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#6B7280', fontSize: 12 }}
                        dy={10}
                    />
                    <YAxis
                        axisLine={false}
                        tickLine={false}
                        tick={{ fill: '#6B7280', fontSize: 12 }}
                        tickFormatter={(value) => `€${value}`}
                    />
                    <Tooltip
                        cursor={{ fill: '#F3F4F6' }}
                        contentStyle={{ borderRadius: '8px', border: '1px solid #E5E7EB', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        labelStyle={{ fontWeight: 'bold', color: '#111827', marginBottom: '4px' }}
                        content={({ active, payload, label }) => {
                            if (active && payload && payload.length) {
                                const data = payload[0].payload;
                                return (
                                    <div className="bg-white p-3 border border-gray-200 rounded-lg shadow-lg">
                                        <p className="font-bold text-gray-900 mb-2">{label}</p>
                                        <div className="space-y-1 text-sm">
                                            <p className="text-gray-600 flex items-center">
                                                <span className="inline-block w-3 h-3 rounded-sm bg-blue-200 mr-2"></span>
                                                {t("Savings")}: <span className="font-medium ml-1">€ {data.savings.toFixed(2)}</span>
                                            </p>
                                            <p className="text-gray-600 flex items-center">
                                                <span className={`inline-block w-3 h-3 rounded-sm mr-2 ${data.profit >= 0 ? 'bg-blue-700' : 'bg-red-500'}`}></span>
                                                {t("Profit")}: <span className={`font-medium ml-1 ${data.profit >= 0 ? 'text-green-600' : 'text-red-600'}`}>€ {data.profit.toFixed(2)}</span>
                                            </p>
                                            <div className="my-2 border-t border-gray-100"></div>
                                            <p className="text-gray-700 font-medium">📦 {t("Total Shipments")}: {data.totalCount}</p>
                                            {Object.entries(data.types || {}).length > 0 && (
                                                <div className="mt-1 pl-2 border-l-2 border-gray-100">
                                                    {Object.entries(data.types).map(([type, count]) => (
                                                        <p key={type} className="text-xs text-gray-500">
                                                            {t(type)}: {count}
                                                        </p>
                                                    ))}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                );
                            }
                            return null;
                        }}
                    />
                    <Legend
                        verticalAlign="top"
                        align="left"
                        iconType="square"
                        iconSize={12}
                        wrapperStyle={{ paddingBottom: '20px', paddingLeft: '0px' }}
                    />

                    {/* Background Bar: Savings - Light Blue */}
                    <Bar
                        dataKey="savings"
                        name={t("Savings")}
                        fill="#BFDBFE" // blue-200
                        radius={[2, 2, 0, 0]}
                        barSize={40}
                    />

                    {/* Foreground Bar: Profit - Dark Blue (or Red for loss) */}
                    <Bar
                        dataKey="profit"
                        name={t("Profit")}
                        radius={[2, 2, 0, 0]}
                        barSize={40}
                        barGap={-40} // Completely overlap
                    >
                        {data.map((entry, index) => (
                            <Cell
                                key={`cell-${index}`}
                                fill={entry.profit >= 0 ? '#1D4ED8' : '#EF4444'} // blue-700 or red-500
                                fillOpacity={0.9}
                            />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
