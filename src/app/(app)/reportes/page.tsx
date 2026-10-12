import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAccountsWithBalances, getCategories } from "@/services/finance";
import { getCards, getObligations } from "@/services/obligations";
import { getProjection, getReport } from "@/services/planning";
import { currentYearMonth, monthLabel, monthRange, shiftMonth, type YearMonth } from "@/lib/dates";
import { formatMoney, money } from "@/lib/money";
import { percentOf } from "@/lib/finance/rules";
import { PageHeader } from "@/components/layout/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input, NativeSelect } from "@/components/ui/primitives";
import { CashflowChart } from "@/components/dashboard/cashflow-chart";
import { MultiLineChart } from "@/components/charts/line-chart";
import { ObligationList } from "@/components/obligations/obligation-list";
import { ProjectionCard } from "@/components/planning/projection-card";
import { cn } from "@/lib/utils";

export const metadata = { title: "Reportes" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseMonth(v: string | undefined, fallback: YearMonth): YearMonth {
  if (!v || !/^\d{4}-\d{2}$/.test(v)) return fallback;
  const [year, month] = v.split("-").map(Number);
  if (year < 2000 || year > 2100 || month < 1 || month > 12) return fallback;
  return { year, month };
}
const ymValue = (p: YearMonth) => `${p.year}-${String(p.month).padStart(2, "0")}`;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ desde?: string; hasta?: string; cuenta?: string; categoria?: string }>;
}) {
  const sp = await searchParams;
  const now = currentYearMonth();
  let to = parseMonth(sp.hasta, now);
  let from = parseMonth(sp.desde, shiftMonth(to, -5));
  if (ymValue(from) > ymValue(to)) [from, to] = [to, from];
  // Máximo 24 meses por consulta
  if ((to.year - from.year) * 12 + (to.month - from.month) > 23) from = shiftMonth(to, -23);
  const accountId = sp.cuenta && UUID_RE.test(sp.cuenta) ? sp.cuenta : null;
  const categoryId = sp.categoria && UUID_RE.test(sp.categoria) ? sp.categoria : null;

  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [report, projection, ob, accounts, cards, categories] = await Promise.all([
    getReport(supabase, { from: monthRange(from).from, to: monthRange(to).to, accountId, categoryId }),
    getProjection(supabase),
    getObligations(supabase, 90, 12),
    getAccountsWithBalances(supabase, { includeInactive: true }),
    getCards(supabase, { includeInactive: true }),
    getCategories(supabase, { includeInactive: true }),
  ]);

  const savings = report.cashflow.map((c) => {
    const [y, m] = c.month.split("-").map(Number);
    return {
      label: monthLabel({ year: y, month: m }, true),
      ahorro: money(c.income).minus(c.expense).toNumber(),
    };
  });
  const position = report.position.map((p) => {
    const [y, m] = p.month_end.split("-").map(Number);
    const debt = money(p.card_debt).plus(p.loan_debt);
    return {
      label: monthLabel({ year: y, month: m }, true),
      saldo: money(p.assets).toNumber(),
      deuda: debt.toNumber(),
      patrimonio: money(p.assets).minus(debt).toNumber(),
    };
  });
  const topTotal = report.categories.reduce((acc, c) => acc.plus(c.total), money(0));
  const futureOut = ob.obligations.filter((o) => o.direction === "out");

  return (
    <>
      <PageHeader title="Reportes y proyecciones" description="Análisis de tus movimientos confirmados y proyección de tu dinero." />

      <div className="flex flex-col gap-5">
        <ProjectionCard projection={projection} monthLabel={projection.monthLabel} />

        <Card>
          <CardContent className="pt-5">
            <form method="get" className="grid grid-cols-2 items-end gap-3 md:grid-cols-5">
              <Field label="Desde" htmlFor="r-desde">
                <Input id="r-desde" name="desde" type="month" defaultValue={ymValue(from)} />
              </Field>
              <Field label="Hasta" htmlFor="r-hasta">
                <Input id="r-hasta" name="hasta" type="month" defaultValue={ymValue(to)} />
              </Field>
              <Field label="Cuenta o tarjeta" htmlFor="r-cuenta">
                <NativeSelect id="r-cuenta" name="cuenta" defaultValue={accountId ?? ""}>
                  <option value="">Todas</option>
                  <optgroup label="Cuentas">
                    {accounts.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </optgroup>
                  {cards.length > 0 && (
                    <optgroup label="Tarjetas">
                      {cards.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  )}
                </NativeSelect>
              </Field>
              <Field label="Categoría" htmlFor="r-cat">
                <NativeSelect id="r-cat" name="categoria" defaultValue={categoryId ?? ""}>
                  <option value="">Todas</option>
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.kind === "income" ? "(ingreso)" : ""}
                    </option>
                  ))}
                </NativeSelect>
              </Field>
              <Button type="submit" className="col-span-2 md:col-span-1">
                Aplicar filtros
              </Button>
            </form>
          </CardContent>
        </Card>

        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          <Kpi label="Ingresos" value={formatMoney(report.income)} tone="text-income" />
          <Kpi label="Gastos" value={formatMoney(report.expense)} tone="text-expense" />
          <Kpi label="Ahorro neto" value={formatMoney(report.net, { signed: true })} tone={money(report.net).isNegative() ? "text-destructive" : ""} />
          <Kpi
            label="Tasa de ahorro"
            value={report.savingsRate === null ? "—" : `${report.savingsRate}%`}
            foot={`Promedio mensual ${formatMoney(report.avgMonthlySavings)}`}
          />
        </div>
        <p className="-mt-3 text-xs text-muted-foreground">
          {monthLabel(from)} – {monthLabel(to)}. Transferencias, pagos de tarjeta, abonos a capital y saldos iniciales no son
          ingresos ni gastos.
        </p>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Ingresos vs. gastos</CardTitle>
            </CardHeader>
            <CardContent>
              <CashflowChart data={report.cashflow} />
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Ahorro mensual</CardTitle>
              <CardDescription>Ingresos menos gastos de cada mes</CardDescription>
            </CardHeader>
            <CardContent>
              <MultiLineChart
                data={savings}
                xKey="label"
                series={[{ key: "ahorro", label: "Ahorro", color: "var(--primary)" }]}
                ariaLabel="Ahorro mensual"
                height={224}
              />
            </CardContent>
          </Card>
          <Card className="min-w-0 lg:col-span-2">
            <CardHeader>
              <CardTitle>Evolución de saldo, deuda y patrimonio</CardTitle>
              <CardDescription>
                Al cierre de cada mes. Saldo de cuentas activas{accountId ? " (filtrado)" : ""}; deuda de tarjetas y préstamos.
              </CardDescription>
            </CardHeader>
            <CardContent>
              <MultiLineChart
                data={position}
                xKey="label"
                series={[
                  { key: "saldo", label: "Saldo en cuentas", color: "var(--info)" },
                  { key: "deuda", label: "Deudas", color: "var(--expense)" },
                  { key: "patrimonio", label: "Patrimonio neto", color: "var(--income)", dashed: true },
                ]}
                ariaLabel="Evolución de saldo, deuda y patrimonio"
                height={260}
              />
              <div className="mt-3 flex flex-wrap gap-4 text-xs text-muted-foreground">
                <Legend color="bg-info" label="Saldo en cuentas" />
                <Legend color="bg-expense" label="Deudas" />
                <Legend color="bg-income" label="Patrimonio neto" />
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Gastos principales</CardTitle>
              <CardDescription>Por categoría en el período</CardDescription>
            </CardHeader>
            <CardContent>
              {report.categories.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">Sin gastos en el período.</p>
              ) : (
                <ul className="space-y-3">
                  {report.categories.slice(0, 10).map((c) => {
                    const pct = percentOf(c.total, topTotal.toFixed(2));
                    return (
                      <li key={c.category_id}>
                        <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                          <span className="flex min-w-0 items-center gap-2">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                            <span className="truncate">{c.name}</span>
                            <span className="text-xs text-muted-foreground">· {c.count}</span>
                          </span>
                          <span className="tabular shrink-0 font-medium">
                            {formatMoney(c.total)} <span className="text-xs text-muted-foreground">{pct}%</span>
                          </span>
                        </div>
                        <div className="h-2 overflow-hidden rounded-full bg-muted">
                          <div className="h-full rounded-full" style={{ width: `${pct}%`, backgroundColor: c.color }} />
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </CardContent>
          </Card>
          <Card className="min-w-0">
            <CardHeader>
              <CardTitle>Obligaciones futuras</CardTitle>
              <CardDescription>
                Próximos 90 días: {formatMoney(futureOut.reduce((a, o) => a.plus(o.amount), money(0)).toFixed(2))} por pagar
              </CardDescription>
            </CardHeader>
            <CardContent>
              {ob.obligations.length === 0 ? (
                <p className="py-8 text-center text-sm text-muted-foreground">No hay obligaciones registradas.</p>
              ) : (
                <ObligationList items={ob.obligations} limit={10} />
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </>
  );
}

function Kpi({ label, value, tone, foot }: { label: string; value: string; tone?: string; foot?: string }) {
  return (
    <Card className="p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular mt-1 truncate text-xl font-semibold", tone)}>{value}</p>
      {foot && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{foot}</p>}
    </Card>
  );
}

function Legend({ color, label }: { color: string; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className={cn("size-2.5 rounded-full", color)} /> {label}
    </span>
  );
}
