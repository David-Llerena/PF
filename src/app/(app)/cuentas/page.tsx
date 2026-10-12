import Link from "next/link";
import { redirect } from "next/navigation";
import { ChevronRight, Star, Wallet } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAccountsWithBalances, getInstitutions } from "@/services/finance";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { NewAccountButton } from "@/components/accounts/account-dialogs";
import { AccountIcon } from "@/components/accounts/account-icon";
import { ACCOUNT_TYPE_LABEL } from "@/lib/constants";
import { formatMoney, sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata = { title: "Cuentas" };

export default async function AccountsPage({ searchParams }: { searchParams: Promise<{ inactivas?: string }> }) {
  const { inactivas } = await searchParams;
  const showInactive = inactivas === "1";
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [accounts, institutions] = await Promise.all([
    getAccountsWithBalances(supabase, { includeInactive: true }),
    getInstitutions(supabase),
  ]);

  const active = accounts.filter((a) => a.is_active);
  const inactive = accounts.filter((a) => !a.is_active);
  const total = sumMoney(active.map((a) => a.balance));
  const list = showInactive ? accounts : active;

  return (
    <>
      <PageHeader
        title="Cuentas"
        description="Bancos, efectivo y billeteras. Los saldos se calculan a partir de tus movimientos confirmados."
        actions={<NewAccountButton institutions={institutions} isFirst={active.length === 0} />}
      />

      {accounts.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Wallet />}
            title="Aún no tienes cuentas"
            description="Crea tu primera cuenta con el saldo que tienes hoy. No necesitas registrar movimientos pasados."
            action={<NewAccountButton institutions={institutions} isFirst label="Crear mi primera cuenta" />}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <Card className="flex items-center justify-between gap-4 p-5">
            <div>
              <p className="text-sm text-muted-foreground">Total en cuentas activas</p>
              <p className="tabular text-2xl font-semibold tracking-tight">{formatMoney(total.toFixed(2))}</p>
            </div>
            <Badge tone="primary">{active.length} activas</Badge>
          </Card>

          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {list.map((a) => (
              <li key={a.id}>
                <Link
                  href={`/cuentas/${a.id}`}
                  className={cn(
                    "group flex items-center gap-3 rounded-2xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40",
                    !a.is_active && "opacity-60",
                  )}
                >
                  <AccountIcon type={a.account_type} color={a.color} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-1.5">
                      <p className="truncate font-medium">{a.name}</p>
                      {a.is_default && <Star className="size-3.5 shrink-0 fill-amber-400 text-amber-400" aria-label="Predeterminada" />}
                    </div>
                    <p className="truncate text-xs text-muted-foreground">
                      {[ACCOUNT_TYPE_LABEL[a.account_type], a.institution?.name].filter(Boolean).join(" · ")}
                    </p>
                    <div className="mt-1 flex gap-1">
                      {!a.is_active && <Badge>Inactiva</Badge>}
                      {a.is_demo && <Badge tone="info">Demo</Badge>}
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={cn("tabular font-semibold", a.balance.startsWith("-") && "text-destructive")}>
                      {formatMoney(a.balance)}
                    </p>
                  </div>
                  <ChevronRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            ))}
          </ul>

          {inactive.length > 0 && (
            <Link
              href={showInactive ? "/cuentas" : "/cuentas?inactivas=1"}
              className="self-start text-sm text-primary hover:underline"
            >
              {showInactive ? "Ocultar cuentas inactivas" : `Mostrar ${inactive.length} cuenta(s) inactiva(s)`}
            </Link>
          )}
        </div>
      )}
    </>
  );
}
