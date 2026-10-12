import { Suspense } from "react";
import { redirect } from "next/navigation";
import { PiggyBank } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getCategories } from "@/services/finance";
import { getBudgets } from "@/services/planning";
import { budgetState } from "@/lib/finance/planning";
import { monthLabel, monthRange, parseYearMonth, shiftMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { MonthPicker } from "@/components/dashboard/month-picker";
import { BudgetList, CopyBudgetsButton, NewBudgetButton } from "@/components/planning/budget-components";
import { cn } from "@/lib/utils";

export const metadata = { title: "Presupuestos" };

export default async function BudgetsPage({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const sp = await searchParams;
  const period = parseYearMonth(sp.y, sp.m);
  const month = monthRange(period).from;
  const prev = monthRange(shiftMonth(period, -1)).from;
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [data, categories] = await Promise.all([getBudgets(supabase, period), getCategories(supabase)]);
  const available = categories.filter((c) => c.kind === "expense" && !data.rows.some((r) => r.category_id === c.id));
  const total = budgetState(data.totalBudget, data.totalSpent);

  return (
    <>
      <PageHeader
        title="Presupuestos"
        description="Límite mensual por categoría. Cuentan los gastos confirmados, también los hechos con tarjeta."
        actions={
          <>
            <Suspense>
              <MonthPicker value={period} allowFuture />
            </Suspense>
            <NewBudgetButton month={month} categories={available} />
          </>
        }
      />

      {data.rows.length === 0 ? (
        <Card>
          <EmptyState
            icon={<PiggyBank />}
            title={`Sin presupuestos para ${monthLabel(period).toLowerCase()}`}
            description="Asigna un límite a las categorías donde más gastas, por ejemplo alimentación o entretenimiento."
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {data.previousMonthHasBudgets && <CopyBudgetsButton from={prev} to={month} />}
                <NewBudgetButton month={month} categories={available} />
              </div>
            }
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="p-5">
            <div className="grid grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Asignado</p>
                <p className="tabular truncate text-lg font-semibold">{formatMoney(data.totalBudget)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Consumido</p>
                <p className="tabular truncate text-lg font-semibold text-expense">{formatMoney(data.totalSpent)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Restante</p>
                <p className={cn("tabular truncate text-lg font-semibold", total.level === "over" ? "text-destructive" : "text-income")}>
                  {formatMoney(data.totalRemaining)}
                </p>
              </div>
            </div>
            <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-muted">
              <div
                className={cn(
                  "h-full rounded-full",
                  total.level === "over" ? "bg-destructive" : total.level === "warning" ? "bg-amber-500" : "bg-primary",
                )}
                style={{ width: `${Math.min(total.pct, 100)}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">{total.pct}% del total presupuestado</p>
          </Card>

          <BudgetList rows={data.rows} month={month} />

          {data.unbudgeted.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>Gastos sin presupuesto</CardTitle>
                <CardDescription>{formatMoney(data.unbudgetedTotal)} en categorías sin límite este mes</CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="divide-y">
                  {data.unbudgeted.map((u) => (
                    <li key={u.category_id} className="flex items-center justify-between py-2 text-sm">
                      <span className="flex items-center gap-2">
                        <span className="size-2.5 rounded-full" style={{ backgroundColor: u.color }} />
                        {u.name}
                      </span>
                      <span className="tabular font-medium">{formatMoney(u.total)}</span>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </>
  );
}
