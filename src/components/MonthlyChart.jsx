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
                        formatter={(value, name) => [`€ ${Number(value).toFixed(2)}`, t(name)]}
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
