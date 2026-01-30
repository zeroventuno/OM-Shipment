import React from 'react';
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Cell, CartesianGrid } from 'recharts';
import { useTranslation } from 'react-i18next';

export default function MonthlyChart({ data }) {
    const { t } = useTranslation();

    // Data expected: [{ name: 'Jan', savings: 100, profit: 50 }, ...]

    return (
        <div className="h-64 w-full bg-white p-4 rounded-xl shadow-sm border border-gray-100 animate-in fade-in slide-in-from-bottom-4 duration-700">
            <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data} margin={{ top: 20, right: 30, left: 20, bottom: 5 }}>
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
                        cursor={{ fill: 'transparent' }}
                        contentStyle={{ borderRadius: '8px', border: 'none', boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)' }}
                        formatter={(value, name) => [`€ ${Number(value).toFixed(2)}`, t(name)]}
                    />
                    <Legend iconType="circle" wrapperStyle={{ paddingTop: '20px' }} />

                    {/* Background Bar: Savings */}
                    <Bar
                        dataKey="savings"
                        name={t("Savings")}
                        fill="#E5E7EB"
                        radius={[4, 4, 0, 0]}
                        barSize={32}
                    />

                    {/* Foreground Bar: Profit (Overlapping) */}
                    {/* To make it overlap, we can use a negative barGap to pull them together if they are side-by-side by default. 
                        However, Recharts groups bars by category. 
                        If we want strictly overlapping, using the same xAxisId usually works if we don't stack.
                        Actually, Recharts places them side-by-side in a group.
                        To overlap, we can use a ComposedChart or simply manipulate the barGap. 
                        Let's try barGap={-32} to pull the second bar over the first.
                    */}
                    <Bar
                        dataKey="profit"
                        name={t("Profit")}
                        radius={[4, 4, 0, 0]}
                        barSize={12}
                        barGap={-22} // Pull back to center (32/2 + 12/2 = 22)
                    >
                        {data.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.profit >= 0 ? '#10B981' : '#EF4444'} />
                        ))}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}
