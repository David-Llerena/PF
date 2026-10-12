"use client";

import {
  Area,
  AreaChart,
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMoney } from "@/lib/money";

export type Series = { key: string; label: string; color: string; dashed?: boolean };

const tooltipStyle = {
  background: "var(--popover)",
  border: "1px solid var(--border)",
  borderRadius: 12,
  fontSize: 12,
  color: "var(--foreground)",
};

const compact = (v: number) => `$${Intl.NumberFormat("es-EC", { notation: "compact" }).format(v)}`;

/** Líneas múltiples. Los valores llegan ya calculados con precisión exacta; number solo para dibujar. */
export function MultiLineChart({
  data,
  series,
  xKey,
  height = 240,
  ariaLabel,
}: {
  data: Record<string, string | number>[];
  series: Series[];
  xKey: string;
  height?: number;
  ariaLabel: string;
}) {
  return (
    <div style={{ height }} className="w-full" role="img" aria-label={ariaLabel}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey={xKey} tickLine={false} axisLine={false} fontSize={12} stroke="var(--muted-foreground)" />
          <YAxis tickLine={false} axisLine={false} fontSize={11} width={58} stroke="var(--muted-foreground)" tickFormatter={compact} />
          <ReferenceLine y={0} stroke="var(--border)" />
          <Tooltip
            contentStyle={tooltipStyle}
            formatter={(value, name) => [formatMoney(String(value)), series.find((s) => s.key === name)?.label ?? name]}
          />
          {series.map((s) => (
            <Line
              key={s.key}
              type="monotone"
              dataKey={s.key}
              stroke={s.color}
              strokeWidth={2.25}
              strokeDasharray={s.dashed ? "5 4" : undefined}
              dot={{ r: 2.5 }}
              activeDot={{ r: 4 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

/** Saldo proyectado día a día (área). */
export function BalanceAreaChart({
  data,
  height = 220,
}: {
  data: { label: string; balance: number }[];
  height?: number;
}) {
  const min = Math.min(...data.map((d) => d.balance), 0);
  return (
    <div style={{ height }} className="w-full" role="img" aria-label="Saldo proyectado día a día">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 8, right: 8, bottom: 0, left: 4 }}>
          <defs>
            <linearGradient id="proj-fill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="var(--primary)" stopOpacity={0.3} />
              <stop offset="100%" stopColor="var(--primary)" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--border)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={11} stroke="var(--muted-foreground)" minTickGap={24} />
          <YAxis
            tickLine={false}
            axisLine={false}
            fontSize={11}
            width={58}
            stroke="var(--muted-foreground)"
            tickFormatter={compact}
            domain={[min < 0 ? "dataMin" : 0, "auto"]}
          />
          <ReferenceLine y={0} stroke="var(--destructive)" strokeDasharray="4 4" />
          <Tooltip contentStyle={tooltipStyle} formatter={(value) => [formatMoney(String(value)), "Saldo"]} />
          <Area type="stepAfter" dataKey="balance" stroke="var(--primary)" strokeWidth={2} fill="url(#proj-fill)" />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
