import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Receipt } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAccountsWithBalances, getCategories, getTransactions, type TransactionFilters } from "@/services/finance";
import { getCards } from "@/services/obligations";
import { periodCashFlow } from "@/lib/finance/rules";
import { monthLabel, monthRange, parseYearMonth } from "@/lib/dates";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, EmptyState } from "@/components/ui/primitives";
import { MonthPicker } from "@/components/dashboard/month-picker";
import { TransactionFilters as Filters } from "@/components/transactions/filters";
import { TransactionList } from "@/components/transactions/transaction-list";
import { NewMovementButton } from "@/components/transactions/new-movement-button";

export const metadata = { title: "Movimientos" };

type SP = Record<string, string | undefined>;

const KINDS = [
  "income", "expense", "transfer", "adjustment", "opening",
  "card_payment", "card_opening", "loan_payment", "loan_disbursement",
] as const;
const STATUSES = ["pending", "confirmed", "void"] as const;

function pick<T extends readonly string[]>(list: T, v?: string): T[number] | undefined {
  return v && (list as readonly string[]).includes(v) ? (v as T[number]) : undefined;
}

function amountParam(v?: string) {
  if (!v) return undefined;
  const d = parseMoneyInput(v);
  return d && d.gte(0) ? d.toFixed(2) : undefined;
}

export default async function TransactionsPage({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const period = parseYearMonth(sp.y, sp.m);
  const { from, to } = monthRange(period);
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const status = pick(STATUSES, sp.estado);
  const filters: TransactionFilters = {
    from,
    to,
    kind: pick(KINDS, sp.tipo),
    status,
    includeVoid: status === "void",
    accountId: sp.cuenta,
    categoryId: sp.categoria,
    paymentMethod: pick(["cash", "debit", "transfer", "card", "other"] as const, sp.medio),
    minAmount: amountParam(sp.min),
    maxAmount: amountParam(sp.max),
    q: sp.q?.slice(0, 60),
    limit: 500,
  };

  const [transactions, accounts, allAccounts, categories, cards] = await Promise.all([
    getTransactions(supabase, filters),
    getAccountsWithBalances(supabase),
    getAccountsWithBalances(supabase, { includeInactive: true }),
    getCategories(supabase, { includeInactive: true }),
    getCards(supabase),
  ]);

  const flow = periodCashFlow(transactions);

  return (
    <>
      <PageHeader
        title="Movimientos"
        description="Historial de ingresos, gastos, transferencias y ajustes."
        actions={
          <>
            <Suspense>
              <MonthPicker value={period} />
            </Suspense>
            <NewMovementButton />
          </>
        }
      />

      <div className="flex flex-col gap-4">
        <Suspense>
          <Filters accounts={allAccounts} categories={categories} />
        </Suspense>

        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Ingresos</p>
            <p className="tabular truncate font-semibold text-income">{formatMoney(flow.income.toFixed(2))}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Gastos</p>
            <p className="tabular truncate font-semibold text-expense">{formatMoney(flow.expense.toFixed(2))}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Balance</p>
            <p className="tabular truncate font-semibold">{formatMoney(flow.net.toFixed(2), { signed: true })}</p>
          </Card>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          Totales de {monthLabel(period).toLowerCase()} según los filtros, solo movimientos confirmados. Transferencias y
          ajustes no suman como ingreso ni gasto.
        </p>

        <Card>
          <CardContent className="pt-2">
            {transactions.length === 0 ? (
              <EmptyState
                icon={<Receipt />}
                title="No hay movimientos"
                description="Prueba con otro mes o ajusta los filtros."
              />
            ) : (
              <TransactionList transactions={transactions} accounts={accounts} categories={categories} cards={cards} />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
