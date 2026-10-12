import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, History, Star } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAccount, getAccountsWithBalances, getCategories, getInstitutions, getTransactions } from "@/services/finance";
import { runningBalances } from "@/lib/finance/rules";
import { Badge, Card, CardContent, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { AccountActions } from "@/components/accounts/account-dialogs";
import { AccountIcon } from "@/components/accounts/account-icon";
import { TransactionList } from "@/components/transactions/transaction-list";
import { ACCOUNT_TYPE_LABEL } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function AccountDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_RE.test(id)) notFound();

  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [account, accounts, categories, institutions, history] = await Promise.all([
    getAccount(supabase, id),
    getAccountsWithBalances(supabase),
    getCategories(supabase),
    getInstitutions(supabase),
    getTransactions(supabase, { accountId: id, limit: 500 }),
  ]);
  if (!account) notFound();

  const opening = history.find((t) => t.kind === "opening" && t.status === "confirmed");
  const openingBalance = opening
    ? { amount: opening.direction === -1 ? `-${opening.amount}` : opening.amount, date: opening.occurred_on }
    : null;

  // El saldo corrido solo es exacto si tenemos el historial completo.
  const complete = history.length < 500;
  const rows = runningBalances(history, id, account.balance).map((r) => ({
    ...r,
    balanceAfter: complete && r.balanceAfter ? r.balanceAfter.toFixed(2) : null,
  }));

  return (
    <div className="flex flex-col gap-5">
      <Link href="/cuentas" className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Cuentas
      </Link>

      <Card className="overflow-hidden">
        <div className="h-1.5" style={{ backgroundColor: account.color }} />
        <div className="flex flex-col gap-5 p-5 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-4">
            <AccountIcon type={account.account_type} color={account.color} className="size-12" />
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h1 className="truncate text-xl font-semibold tracking-tight">{account.name}</h1>
                {account.is_default && <Star className="size-4 fill-amber-400 text-amber-400" aria-label="Predeterminada" />}
              </div>
              <p className="text-sm text-muted-foreground">
                {[ACCOUNT_TYPE_LABEL[account.account_type], account.institution?.name, account.currency]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
              <div className="mt-1 flex gap-1">
                {!account.is_active && <Badge>Inactiva</Badge>}
                {account.is_demo && <Badge tone="info">Demo</Badge>}
              </div>
            </div>
          </div>
          <div className="md:text-right">
            <p className="text-sm text-muted-foreground">Saldo actual</p>
            <p className="tabular text-3xl font-semibold tracking-tight">{formatMoney(account.balance)}</p>
            {openingBalance && (
              <p className="text-xs text-muted-foreground">
                Saldo inicial {formatMoney(openingBalance.amount)} al {formatDate(openingBalance.date, "long")}
              </p>
            )}
          </div>
        </div>
        <div className="border-t px-5 py-4">
          <AccountActions account={account} institutions={institutions} openingBalance={openingBalance} />
        </div>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Historial</CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <EmptyState icon={<History />} title="Sin movimientos" description="Los movimientos de esta cuenta aparecerán aquí." />
          ) : (
            <TransactionList
              transactions={rows}
              accounts={accounts}
              categories={categories}
              perspectiveAccountId={id}
              showBalance
            />
          )}
          {!complete && (
            <p className="mt-3 text-xs text-muted-foreground">
              Se muestran los 500 movimientos más recientes. Usa Movimientos para filtrar por fecha.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
