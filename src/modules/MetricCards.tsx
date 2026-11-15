import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

export interface Metric {
  id: string;
  title: string;
  value: number;
  color: string;
}

/** Linha de cartões com contadores, usada em Assistências e Garantias. */
export default function MetricCards({ metrics }: { metrics: Metric[] }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      {metrics.map((metric) => (
        <Card key={metric.id} data-testid={`card-metric-${metric.id}`}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{metric.title}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-3xl font-bold ${metric.color}`} data-testid={`text-count-${metric.id}`}>
              {metric.value}
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
