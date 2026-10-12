import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, HandCoins } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAccountsWithBalances } from "@/services/finance";
import { getLoans } from "@/services/obligations";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { NewLoanButton } from "@/components/loans/loan-components";
import { formatMoney, money, sumMoney } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/dates";
import { percentOf } from "@/lib/finance/rules";
import { cn } from "@/lib/utils";

export const metadata = { title: "Préstamos" };

export default async function LoansPage() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [loans, accounts] = await Promise.all([getLoans(supabase, { includeClosed: true }), getAccountsWithBalances(supabase)]);
  const active = loans.filter((l) => l.status === "active");
  const total = sumMoney(active.map((l) => l.outstanding)).toFixed(2);
  const today = todayISO();

  return (
    <>
      <PageHeader
        title="Préstamos y deudas"
        description="Cuotas, capital e intereses por separado: el abono a capital no es gasto, el interés sí."
        actions={<NewLoanButton accounts={accounts} />}
      />

      {loans.length === 0 ? (
        <Card>
          <EmptyState
            icon={<HandCoins />}
            title="Sin préstamos registrados"
            description="Registra préstamos bancarios con su tabla de cuotas o deudas simples con familiares y amigos."
            action={<NewLoanButton accounts={accounts} label="Registrar un préstamo" />}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="flex items-center justify-between p-5">
            <div>
              <p className="text-sm text-muted-foreground">Saldo pendiente total</p>
              <p className="tabular text-2xl font-semibold text-expense">{formatMoney(total)}</p>
            </div>
            <Badge tone="primary">{active.length} activos</Badge>
          </Card>

          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {loans.map((l) => {
              const base = l.original_principal ?? l.outstanding_start;
              const paidPct = percentOf(money(base).minus(l.outstanding).toFixed(2), base);
              const next = l.next_installment;
              return (
                <li key={l.id}>
                  <Link
                    href={`/prestamos/${l.id}`}
                    className={cn(
                      "group flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40",
                      l.status !== "active" && "opacity-60",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate font-medium">{l.name}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {l.lender} · {l.loan_type === "simple" ? "Deuda simple" : `${Number(l.annual_rate)}% anual`}
                        </p>
                      </div>
                      <div className="flex items-center gap-1">
                        {l.status === "paid" && <Badge tone="income">Pagado</Badge>}
                        {l.is_demo && <Badge tone="info">Demo</Badge>}
                        <ChevronRight className="size-4 text-muted-foreground" />
                      </div>
                    </div>
                    <div className="flex items-end justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Saldo pendiente</p>
                        <p className="tabular text-xl font-semibold">{formatMoney(l.outstanding)}</p>
                      </div>
                      {next && (
                        <div className="text-right">
                          <p className={cn("text-xs", next.due_date < today ? "text-destructive" : "text-muted-foreground")}>
                            {next.due_date < today ? "Vencida" : "Próxima"} · {formatDate(next.due_date)}
                          </p>
                          <p className="tabular text-sm font-semibold">{formatMoney(next.amount)}</p>
                        </div>
                      )}
                    </div>
                    <div className="h-1.5 overflow-hidden rounded-full bg-muted">
                      <div className="h-full rounded-full bg-income" style={{ width: `${Math.min(paidPct, 100)}%` }} />
                    </div>
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </>
  );
}
