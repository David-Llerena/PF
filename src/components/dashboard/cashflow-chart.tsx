"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { formatMoney, money } from "@/lib/money";
import { monthLabel } from "@/lib/dates";

type Point = { month: string; income: string; expense: string };

/**
 * Los valores se convierten a number solo para dibujar (ya vienen
 * calculados con precisión exacta desde PostgreSQL).
 */
export function CashflowChart({ data }: { data: Point[] }) {
  const rows = data.map((d) => {
    const [y, m] = d.month.split("-").map(Number);
    return {
      label: monthLabel({ year: y, month: m }, true).split(" ")[0],
      fullLabel: monthLabel({ year: y, month: m }),
      income: money(d.income).toNumber(),
      expense: money(d.expense).toNumber(),
    };
  });

  const hasData = rows.some((r) => r.income > 0 || r.expense > 0);
  if (!hasData) {
    return (
      <div className="flex h-56 items-center justify-center rounded-xl bg-muted/50 text-sm text-muted-foreground">
        Aún no hay ingresos ni gastos confirmados en este período.
      </div>
    );
  }

  return (
    <div className="h-56 w-full" role="img" aria-label="Gráfico de ingresos frente a gastos de los últimos 6 meses">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={rows} barGap={4} margin={{ top: 8, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={56}
            stroke="var(--muted-foreground)"
            tickFormatter={(v: number) => `$${Intl.NumberFormat("es-EC", { notation: "compact" }).format(v)}`}
          />
          <Tooltip
            cursor={{ fill: "var(--muted)", opacity: 0.6 }}
            contentStyle={{
              background: "var(--popover)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              fontSize: 12,
              color: "var(--foreground)",
            }}
            labelFormatter={(_, payload) => payload?.[0]?.payload?.fullLabel ?? ""}
            formatter={(value, name) => [formatMoney(String(value)), name === "income" ? "Ingresos" : "Gastos"]}
          />
          <Bar dataKey="income" fill="var(--income)" radius={[6, 6, 0, 0]} maxBarSize={28} />
          <Bar dataKey="expense" fill="var(--expense)" radius={[6, 6, 0, 0]} maxBarSize={28} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
