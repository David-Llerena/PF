import { AlertTriangle, Info } from "lucide-react";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { BalanceAreaChart } from "@/components/charts/line-chart";
import { formatMoney, money } from "@/lib/money";
import { formatDate, monthLabel, type YearMonth } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { ProjectionResult } from "@/lib/finance/planning";

const CERTAINTY = {
  confirmed: { label: "Confirmado", tone: "income" as const },
  scheduled: { label: "Programado", tone: "info" as const },
  estimated: { label: "Estimado", tone: "warning" as const },
};

export function ProjectionCard({ projection, monthLabel: label }: { projection: ProjectionResult; monthLabel: YearMonth }) {
  const negative = money(projection.result).isNegative();
  const timeline = projection.timeline.map((t) => ({ label: formatDate(t.date), balance: t.balance }));

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg">¿Cuánto te quedará al cierre de {monthLabel(label).toLowerCase()}?</CardTitle>
        <CardDescription>
          Desde hoy hasta el {formatDate(projection.horizon, "long")}, después de pagar tus obligaciones conocidas.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-5">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className={cn("rounded-2xl p-4 sm:col-span-1", negative ? "bg-destructive/10" : "bg-primary-soft")}>
            <p className="text-xs font-medium text-muted-foreground">Disponible proyectado</p>
            <p className={cn("tabular text-3xl font-semibold tracking-tight", negative ? "text-destructive" : "text-primary")}>
              {formatMoney(projection.result)}
            </p>
            {projection.hasEstimates && <p className="mt-1 text-[11px] text-muted-foreground">Incluye valores estimados</p>}
          </div>
          <div className="rounded-2xl border p-4">
            <p className="text-xs text-muted-foreground">Sin tocar tus metas</p>
            <p className="tabular text-xl font-semibold">{formatMoney(projection.resultAfterReserves)}</p>
            <p className="text-[11px] text-muted-foreground">Descontando {formatMoney(projection.reserved)} reservados</p>
          </div>
          <div className="rounded-2xl border p-4">
            <p className="text-xs text-muted-foreground">Punto más bajo</p>
            <p className={cn("tabular text-xl font-semibold", money(projection.lowestPoint.balance).isNegative() && "text-destructive")}>
              {formatMoney(projection.lowestPoint.balance)}
            </p>
            <p className="text-[11px] text-muted-foreground">Alrededor del {formatDate(projection.lowestPoint.date, "long")}</p>
          </div>
        </div>

        <ul className="divide-y rounded-2xl border">
          {projection.lines.map((l) => (
            <li key={l.key} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
              <span className="flex min-w-0 items-center gap-2">
                <span className="truncate">{l.label}</span>
                <Badge tone={CERTAINTY[l.certainty].tone}>{CERTAINTY[l.certainty].label}</Badge>
              </span>
              <span className={cn("tabular shrink-0 font-medium", l.sign === -1 && money(l.amount).gt(0) && "text-expense")}>
                {l.key === "start" ? "" : l.sign === 1 ? "+ " : "− "}
                {formatMoney(l.amount)}
              </span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 bg-muted/40 px-4 py-3 text-sm font-semibold">
            <span>Resultado</span>
            <span className={cn("tabular", negative ? "text-destructive" : "")}>{formatMoney(projection.result)}</span>
          </li>
        </ul>

        {projection.warnings.length > 0 && (
          <ul className="space-y-2">
            {projection.warnings.map((w) => (
              <li
                key={w}
                className={cn(
                  "flex items-start gap-2 rounded-xl px-3 py-2 text-xs",
                  /negativo/.test(w) ? "bg-destructive/10 text-destructive" : "bg-amber-50 text-amber-800 dark:bg-amber-950/50 dark:text-amber-300",
                )}
              >
                {/negativo/.test(w) ? <AlertTriangle className="mt-0.5 size-3.5 shrink-0" /> : <Info className="mt-0.5 size-3.5 shrink-0" />}
                {w}
              </li>
            ))}
          </ul>
        )}

        <div>
          <p className="mb-2 text-sm font-medium">Saldo proyectado día a día</p>
          <BalanceAreaChart data={timeline} />
        </div>

        <details>
          <summary className="cursor-pointer text-sm text-muted-foreground">
            Ver los {projection.events.length} movimientos considerados
          </summary>
          <ul className="mt-2 divide-y text-sm">
            {projection.events.map((e, i) => (
              <li key={`${e.date}-${e.title}-${i}`} className="flex items-center justify-between gap-3 py-2">
                <span className="min-w-0">
                  <span className="block truncate">{e.title}</span>
                  <span className="text-xs text-muted-foreground">
                    {formatDate(e.date, "long")} · {e.certainty === "estimated" ? "estimado" : "programado"}
                  </span>
                </span>
                <span className={cn("tabular shrink-0", e.direction === "in" ? "text-income" : "text-expense")}>
                  {e.direction === "in" ? "+" : "−"}
                  {formatMoney(e.amount)}
                </span>
              </li>
            ))}
          </ul>
        </details>
      </CardContent>
    </Card>
  );
}
