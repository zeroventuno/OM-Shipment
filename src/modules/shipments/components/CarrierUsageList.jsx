/** Uso de portal/transportadora no celular: lista ordenada, legível sem tocar no gráfico. */
export default function CarrierUsageList({ data }) {
    const rows = [...data].sort((a, b) => b.value - a.value);
    const max = rows[0]?.value || 1;
    const total = rows.reduce((sum, row) => sum + row.value, 0) || 1;

    return (
        <ul className="flex flex-col gap-3">
            {rows.map((row) => (
                <li key={row.name}>
                    <div className="flex items-baseline justify-between gap-3 text-sm">
                        <span className="min-w-0 break-words">{row.name}</span>
                        <span className="shrink-0 tabular-nums">
                            <span className="font-semibold">{row.value}</span>
                            <span className="ml-1.5 text-xs text-muted-foreground">{Math.round((row.value / total) * 100)}%</span>
                        </span>
                    </div>
                    <div className="mt-1 h-1.5 rounded-full bg-secondary">
                        <div className="h-full rounded-full bg-foreground" style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }} />
                    </div>
                </li>
            ))}
        </ul>
    );
}
