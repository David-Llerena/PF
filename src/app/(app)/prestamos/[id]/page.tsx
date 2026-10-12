import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, History } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAccountsWithBalances, getCategories, getTransactions } from "@/services/finance";
import { getLoan } from "@/services/obligations";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { PayLoanButton } from "@/components/loans/loan-components";
import { TransactionList } from "@/components/transactions/transaction-list";
import { LOAN_FREQUENCY_LABEL } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LoanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [data, accounts, categories, payments] = await Promise.all([
    getLoan(supabase, id),
    getAccountsWithBalances(supabase),
    getCategories(supabase),
    getTransactions(supabase, { loanId: id, limit: 300 }),
  ]);
  if (!data) notFound();
  const { loan, installments } = data;
  const today = todayISO();
  const nextPending = installments.find((i) => i.status === "pending");

  return (
    <div className="flex flex-col gap-5">
      <Link href="/prestamos" className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Préstamos
      </Link>

      <Card>
        <div className="flex flex-col gap-5 p-5 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-semibold tracking-tight">{loan.name}</h1>
              {loan.status === "paid" && <Badge tone="income">Pagado</Badge>}
            </div>
            <p className="text-sm text-muted-foreground">
              {loan.lender}
              {loan.loan_type === "amortized"
                ? ` · ${Number(loan.annual_rate)}% anual · ${LOAN_FREQUENCY_LABEL[loan.frequency!]} · ${loan.installments_count} cuotas`
                : " · Deuda simple"}
            </p>
            {loan.notes && <p className="mt-1 text-sm italic text-muted-foreground">{loan.notes}</p>}
          </div>
          {loan.status === "active" && (
            <PayLoanButton
              loanId={loan.id}
              installment={nextPending}
              label={loan.loan_type === "simple" ? "Registrar abono" : nextPending ? `Pagar cuota ${nextPending.number}` : "Abonar"}
              size="default"
            />
          )}
        </div>
        <div className="grid grid-cols-2 gap-3 border-t p-5 sm:grid-cols-4">
          <Stat label="Saldo pendiente" value={formatMoney(loan.outstanding)} tone="text-expense" />
          <Stat label="Capital pagado" value={formatMoney(loan.principal_paid)} tone="text-income" />
          <Stat label="Intereses pagados" value={formatMoney(loan.interest_paid)} />
          <Stat
            label={loan.loan_type === "amortized" ? "Cuotas pagadas" : "Saldo inicial"}
            value={loan.loan_type === "amortized" ? `${loan.paid_count} / ${installments.length}` : formatMoney(loan.outstanding_start)}
          />
        </div>
      </Card>

      {loan.loan_type === "amortized" && (
        <Card>
          <CardHeader>
            <CardTitle>Cronograma de amortización</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="hidden grid-cols-[3rem_1fr_repeat(3,minmax(0,1fr))_7rem] gap-2 border-b pb-2 text-xs font-medium text-muted-foreground md:grid">
              <span>N.º</span>
              <span>Vence</span>
              <span className="text-right">Capital</span>
              <span className="text-right">Interés</span>
              <span className="text-right">Cuota</span>
              <span />
            </div>
            <ul className="divide-y">
              {installments.map((i) => {
                const overdue = i.status === "pending" && i.due_date < today;
                return (
                  <li
                    key={i.id}
                    className={cn(
                      "grid grid-cols-[2.5rem_1fr_auto] items-center gap-2 py-2.5 text-sm md:grid-cols-[3rem_1fr_repeat(3,minmax(0,1fr))_7rem]",
                      i.status === "paid" && "text-muted-foreground",
                    )}
                  >
                    <span className="tabular">{i.number}</span>
                    <span className="flex flex-col md:block">
                      {formatDate(i.due_date, "long")}
                      <span className="tabular text-xs text-muted-foreground md:hidden">
                        Capital {formatMoney(i.principal)} · interés {formatMoney(i.interest)}
                      </span>
                    </span>
                    <span className="tabular hidden text-right md:block">{formatMoney(i.principal)}</span>
                    <span className="tabular hidden text-right md:block">{formatMoney(i.interest)}</span>
                    <span className="tabular hidden text-right font-medium md:block">{formatMoney(i.amount)}</span>
                    <span className="flex flex-col items-end gap-1">
                      <span className="tabular font-medium md:hidden">{formatMoney(i.amount)}</span>
                      {i.status === "paid" ? (
                        <Badge tone="income">Pagada {i.paid_on ? formatDate(i.paid_on) : ""}</Badge>
                      ) : loan.status === "active" && i.id === nextPending?.id ? (
                        <PayLoanButton loanId={loan.id} installment={i} />
                      ) : overdue ? (
                        <Badge tone="expense">Vencida</Badge>
                      ) : (
                        <Badge>Pendiente</Badge>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">
              Cronograma estimado con método francés sobre el saldo registrado. Si tu banco cobra un valor distinto,
              ajústalo al pagar: el capital y el interés reales quedan registrados por separado.
            </p>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Pagos registrados</CardTitle>
        </CardHeader>
        <CardContent>
          {payments.length === 0 ? (
            <EmptyState icon={<History />} title="Aún no hay pagos" />
          ) : (
            <TransactionList transactions={payments} accounts={accounts} categories={categories} />
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: string; tone?: string }) {
  return (
    <div>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn("tabular truncate text-lg font-semibold", tone)}>{value}</p>
    </div>
  );
}
