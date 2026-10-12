import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import {
  ArrowDownLeft,
  ArrowUpRight,
  ChevronRight,
  TrendingUp,
  CalendarClock,
  Info,
  PiggyBank,
  Receipt,
  Scale,
  Wallet,
} from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getCategories, getDashboard, getProfile } from "@/services/finance";
import { getObligations } from "@/services/obligations";
import { getProjection, getReservedTotal } from "@/services/planning";
import { unreservedAvailable } from "@/lib/finance/planning";
import { ObligationList } from "@/components/obligations/obligation-list";
import { formatMoney, money, sumMoney } from "@/lib/money";
import { percentOf } from "@/lib/finance/rules";
import { monthLabel, parseYearMonth } from "@/lib/dates";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { MonthPicker } from "@/components/dashboard/month-picker";
import { CashflowChart } from "@/components/dashboard/cashflow-chart";
import { QuickActions } from "@/components/dashboard/quick-actions";
import { TransactionList } from "@/components/transactions/transaction-list";
import { cn } from "@/lib/utils";

export const metadata = { title: "Inicio" };

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ y?: string; m?: string }>;
}) {
  const sp = await searchParams;
  const period = parseYearMonth(sp.y, sp.m);
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [profile, ob, categories, reserved, projection] = await Promise.all([
    getProfile(supabase),
    getObligations(supabase, 30),
    getCategories(supabase),
    getReservedTotal(supabase),
    getProjection(supabase),
  ]);
  const data = await getDashboard(supabase, period, [ob.debts]);
  const cardDebt = sumMoney(ob.cards.map((c) => (money(c.debt).isNegative() ? "0" : c.debt))).toFixed(2);
  const loanDebt = sumMoney(ob.loans.map((l) => l.outstanding)).toFixed(2);
  const dueSoon = sumMoney(ob.obligations.filter((o) => o.direction === "out").map((o) => o.amount)).toFixed(2);
  const dueCount = ob.obligations.filter((o) => o.direction === "out").length;

  if (profile && !profile.onboarding_completed && data.accounts.length === 0) redirect("/bienvenida");

  const firstName = profile?.full_name?.split(" ")[0];
  const savings = sumMoney(data.accounts.filter((a) => a.account_type === "savings").map((a) => a.balance));
  const unreserved = unreservedAvailable(data.available, reserved);
  const net = money(data.monthlyNet);
  const totalExpense = money(data.expense);
  const hasDemo = data.accounts.some((a) => a.is_demo);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{firstName ? `Hola, ${firstName}` : "Hola"} 👋</p>
          <h1 className="text-2xl font-semibold tracking-tight md:text-3xl">Resumen financiero</h1>
        </div>
        <Suspense>
          <MonthPicker value={period} />
        </Suspense>
      </div>

      {hasDemo && (
        <div className="flex items-start gap-2 rounded-2xl border border-info/30 bg-info-soft px-4 py-3 text-sm text-info">
          <Info className="mt-0.5 size-4 shrink-0" />
          <p>
            Estás viendo datos de demostración (marcados como <b>Demo</b>). Puedes borrarlos desde{" "}
            <Link href="/configuracion" className="font-medium underline">
              Configuración
            </Link>
            .
          </p>
        </div>
      )}

      {/* ------------------------------ Hero: dinero disponible ------------------------------ */}
      <section className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-violet-600 via-purple-600 to-indigo-700 p-6 text-white shadow-lg shadow-primary/20 md:p-8">
        <div aria-hidden className="absolute -right-16 -top-16 size-56 rounded-full bg-white/10 blur-2xl" />
        <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
          <div>
            <p className="flex items-center gap-2 text-sm text-white/80">
              <Wallet className="size-4" /> Dinero disponible hoy
            </p>
            <p className="tabular mt-1 text-4xl font-semibold tracking-tight md:text-5xl">
              {formatMoney(data.available)}
            </p>
            <p className="mt-1 text-xs text-white/70">
              Suma de {data.accounts.length} {data.accounts.length === 1 ? "cuenta activa" : "cuentas activas"}. No
              incluye cupo de tarjetas ni movimientos pendientes.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-3 md:min-w-80">
            <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-white/75">Patrimonio neto estimado</p>
              <p className="tabular text-lg font-semibold">{formatMoney(data.netWorth)}</p>
            </div>
            <div className="rounded-2xl bg-white/10 px-4 py-3 backdrop-blur-sm">
              <p className="text-xs text-white/75">Deudas registradas</p>
              <p className="tabular text-lg font-semibold">{formatMoney(data.debts)}</p>
            </div>
          </div>
        </div>
      </section>

      <QuickActions />

      <Link
        href="/reportes"
        className="group flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40 sm:flex-row sm:items-center"
      >
        <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <TrendingUp className="size-5" />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm text-muted-foreground">
            Al cierre de {monthLabel(projection.monthLabel).toLowerCase()} te quedarían
          </span>
          <span
            className={cn(
              "tabular block text-xl font-semibold",
              money(projection.result).isNegative() ? "text-destructive" : "text-foreground",
            )}
          >
            {formatMoney(projection.result)}
            {projection.hasEstimates && <span className="ml-2 text-xs font-normal text-muted-foreground">estimado</span>}
          </span>
        </span>
        <span className="text-sm text-muted-foreground">
          Sin reservar hoy <b className="tabular text-foreground">{formatMoney(unreserved)}</b>
          <ChevronRight className="ml-1 inline size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </Link>

      {/* ------------------------------ KPIs del período ------------------------------ */}
      <section aria-label={`Indicadores de ${monthLabel(period)}`} className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <Kpi
          label="Ingresos del mes"
          value={formatMoney(data.income)}
          icon={<ArrowDownLeft />}
          tone="income"
          foot={money(data.pendingIncome).isZero() ? undefined : `+ ${formatMoney(data.pendingIncome)} por recibir`}
        />
        <Kpi
          label="Gastos del mes"
          value={formatMoney(data.expense)}
          icon={<ArrowUpRight />}
          tone="expense"
          foot={money(data.pendingExpense).isZero() ? undefined : `+ ${formatMoney(data.pendingExpense)} pendientes`}
        />
        <Kpi
          label="Balance mensual"
          value={formatMoney(data.monthlyNet, { signed: true })}
          icon={<Scale />}
          tone={net.isNegative() ? "expense" : "primary"}
          foot="Ingresos − gastos confirmados"
        />
        <Kpi
          label="Pagos próximos (30 días)"
          value={formatMoney(dueSoon)}
          icon={<CalendarClock />}
          tone="info"
          foot={dueCount === 0 ? "Sin obligaciones próximas" : `${dueCount} obligaciones · incluye vencidas`}
        />
        <Kpi
          label="Reservado en metas"
          value={formatMoney(reserved)}
          icon={<PiggyBank />}
          tone="primary"
          foot={`En cuentas de ahorro ${formatMoney(savings.toFixed(2))}`}
        />
        <Kpi
          label="Deudas pendientes"
          value={formatMoney(data.debts)}
          icon={<Receipt />}
          tone="neutral"
          foot={`Tarjetas ${formatMoney(cardDebt)} · préstamos ${formatMoney(loanDebt)}`}
        />
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader>
            <CardTitle>Ingresos vs. gastos</CardTitle>
            <CardDescription>Últimos 6 meses hasta {monthLabel(period).toLowerCase()} · solo confirmados</CardDescription>
          </CardHeader>
          <CardContent>
            <CashflowChart data={data.cashflow} />
            <div className="mt-3 flex gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-income" /> Ingresos
              </span>
              <span className="flex items-center gap-1.5">
                <span className="size-2.5 rounded-full bg-expense" /> Gastos
              </span>
            </div>
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Gastos por categoría</CardTitle>
            <CardDescription>{monthLabel(period)}</CardDescription>
          </CardHeader>
          <CardContent>
            {data.byCategory.length === 0 ? (
              <p className="py-10 text-center text-sm text-muted-foreground">Sin gastos confirmados este mes.</p>
            ) : (
              <ul className="space-y-3">
                {data.byCategory.slice(0, 7).map((c) => {
                  const pct = percentOf(c.total, totalExpense);
                  return (
                    <li key={c.category_id}>
                      <div className="mb-1 flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: c.color }} />
                          <span className="truncate">{c.name}</span>
                        </span>
                        <span className="tabular shrink-0 font-medium">
                          {formatMoney(c.total)} <span className="text-xs text-muted-foreground">· {pct}%</span>
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
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader className="flex-row items-center justify-between">
            <div>
              <CardTitle>Últimos movimientos</CardTitle>
              <CardDescription>{monthLabel(period)}</CardDescription>
            </div>
            <Button asChild variant="ghost" size="sm">
              <Link href={`/movimientos?y=${period.year}&m=${period.month}`}>Ver todos</Link>
            </Button>
          </CardHeader>
          <CardContent>
            {data.recent.length === 0 ? (
              <EmptyState
                icon={<Receipt />}
                title="Sin movimientos este mes"
                description="Registra tu primer ingreso o gasto con el botón +."
              />
            ) : (
              <TransactionList transactions={data.recent} accounts={data.accounts} categories={categories} cards={ob.cards} />
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Próximas obligaciones</CardTitle>
            <CardDescription>Próximos 30 días y vencidos</CardDescription>
          </CardHeader>
          <CardContent>
            {ob.obligations.length === 0 ? (
              <p className="py-8 text-center text-sm text-muted-foreground">
                No tienes pagos ni ingresos esperados en los próximos 30 días.
              </p>
            ) : (
              <ObligationList items={ob.obligations} limit={7} />
            )}
            <p className="mt-4 text-xs text-muted-foreground">
              Tarjetas (pago del período estimado), cuotas de préstamos, recurrentes y movimientos pendientes. Cada
              obligación aparece una sola vez.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

const toneMap = {
  income: "bg-income-soft text-income",
  expense: "bg-expense-soft text-expense",
  primary: "bg-primary-soft text-primary",
  info: "bg-info-soft text-info",
  neutral: "bg-muted text-muted-foreground",
} as const;

function Kpi({
  label,
  value,
  icon,
  tone,
  foot,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
  tone: keyof typeof toneMap;
  foot?: string;
}) {
  return (
    <Card className="p-4">
      <div className="flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
        <span className={cn("flex size-8 items-center justify-center rounded-lg [&_svg]:size-4", toneMap[tone])}>
          {icon}
        </span>
      </div>
      <p className="tabular mt-2 truncate text-lg font-semibold tracking-tight md:text-xl">{value}</p>
      {foot && <p className="mt-0.5 truncate text-[11px] text-muted-foreground">{foot}</p>}
    </Card>
  );
}
