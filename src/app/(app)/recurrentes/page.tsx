import Link from "next/link";
import { redirect } from "next/navigation";
import { Repeat } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAccountsWithBalances, getCategories } from "@/services/finance";
import { getCards, getRecurringRules } from "@/services/obligations";
import { monthlyEquivalent } from "@/lib/finance/recurrence";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, EmptyState } from "@/components/ui/primitives";
import { NewRecurringButton, RecurringList } from "@/components/recurring/recurring-components";
import { formatMoney, sumMoney } from "@/lib/money";
import { cn } from "@/lib/utils";

export const metadata = { title: "Recurrentes" };

export default async function RecurringPage({ searchParams }: { searchParams: Promise<{ tipo?: string }> }) {
  const { tipo } = await searchParams;
  const kind = tipo === "ingresos" ? "income" : "expense";
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [rules, accounts, cards, categories] = await Promise.all([
    getRecurringRules(supabase),
    getAccountsWithBalances(supabase),
    getCards(supabase),
    getCategories(supabase, { includeInactive: true }),
  ]);
  const sources = { accounts, cards, categories };

  const active = rules.filter((r) => r.is_active);
  const monthlyOut = sumMoney(
    active.filter((r) => r.kind === "expense").map((r) => monthlyEquivalent(r.amount, r.frequency).toFixed(2)),
  ).toFixed(2);
  const monthlySubs = sumMoney(
    active.filter((r) => r.is_subscription).map((r) => monthlyEquivalent(r.amount, r.frequency).toFixed(2)),
  ).toFixed(2);
  const monthlyIn = sumMoney(
    active.filter((r) => r.kind === "income").map((r) => monthlyEquivalent(r.amount, r.frequency).toFixed(2)),
  ).toFixed(2);
  const list = rules.filter((r) => r.kind === kind);

  return (
    <>
      <PageHeader
        title="Recurrentes"
        description="Suscripciones, servicios e ingresos periódicos. No mueven dinero hasta que los registras."
        actions={
          <NewRecurringButton
            kind={kind}
            label={kind === "expense" ? "Nuevo pago recurrente" : "Nuevo ingreso recurrente"}
            {...sources}
          />
        }
      />

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Compromisos / mes</p>
            <p className="tabular truncate font-semibold text-expense">{formatMoney(monthlyOut)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Suscripciones / mes</p>
            <p className="tabular truncate font-semibold">{formatMoney(monthlySubs)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Ingresos / mes</p>
            <p className="tabular truncate font-semibold text-income">{formatMoney(monthlyIn)}</p>
          </Card>
        </div>
        <p className="-mt-2 text-xs text-muted-foreground">
          Equivalente mensual de las reglas activas (semanal × 52/12, quincenal × 2, anual ÷ 12).
        </p>

        <div className="flex gap-1.5">
          {(
            [
              ["expense", "Pagos", "/recurrentes"],
              ["income", "Ingresos", "/recurrentes?tipo=ingresos"],
            ] as const
          ).map(([k, label, href]) => (
            <Link
              key={k}
              href={href}
              className={cn(
                "h-9 rounded-full border px-4 text-sm font-medium leading-9 transition-colors",
                kind === k ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {label}
            </Link>
          ))}
        </div>

        <Card>
          <CardContent className="pt-2">
            {list.length === 0 ? (
              <EmptyState
                icon={<Repeat />}
                title={kind === "expense" ? "Sin pagos recurrentes" : "Sin ingresos recurrentes"}
                description={
                  kind === "expense"
                    ? "Agrega Netflix, Spotify, internet, teléfono, gimnasio o seguros para ver tus compromisos del mes."
                    : "Agrega tu sueldo u otros ingresos periódicos para planificar tus próximos meses."
                }
                action={
                  <NewRecurringButton
                    kind={kind}
                    variant="outline"
                    label={kind === "expense" ? "Agregar pago" : "Agregar ingreso"}
                    {...sources}
                  />
                }
              />
            ) : (
              <RecurringList rules={list} {...sources} />
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
