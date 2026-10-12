import { redirect } from "next/navigation";
import { Target } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAccountsWithBalances } from "@/services/finance";
import { getGoals } from "@/services/planning";
import { unreservedAvailable } from "@/lib/finance/planning";
import { formatMoney, sumMoney } from "@/lib/money";
import { PageHeader } from "@/components/layout/page-header";
import { Card, EmptyState } from "@/components/ui/primitives";
import { GoalCard, NewGoalButton } from "@/components/planning/goal-components";

export const metadata = { title: "Metas de ahorro" };

export default async function GoalsPage() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [{ goals, reserved }, accounts] = await Promise.all([getGoals(supabase), getAccountsWithBalances(supabase)]);
  const available = sumMoney(accounts.map((a) => a.balance)).toFixed(2);
  const unreserved = unreservedAvailable(available, reserved);
  const active = goals.filter((g) => g.status === "active");
  const archived = goals.filter((g) => g.status === "archived");

  return (
    <>
      <PageHeader
        title="Metas de ahorro"
        description="Reserva parte de tu saldo para cada meta. Es el mismo dinero de tus cuentas: no se cuenta dos veces."
        actions={<NewGoalButton />}
      />
      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Disponible</p>
            <p className="tabular truncate font-semibold">{formatMoney(available)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Reservado</p>
            <p className="tabular truncate font-semibold text-primary">{formatMoney(reserved)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Sin reservar</p>
            <p className="tabular truncate font-semibold text-income">{formatMoney(unreserved)}</p>
          </Card>
        </div>

        {active.length === 0 ? (
          <Card>
            <EmptyState
              icon={<Target />}
              title="Sin metas activas"
              description="Crea metas como fondo de emergencia, viaje o compra de vehículo y ve cuánto te falta."
              action={<NewGoalButton label="Crear mi primera meta" />}
            />
          </Card>
        ) : (
          <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
            {active.map((g) => (
              <GoalCard key={g.id} goal={g} unreserved={unreserved} />
            ))}
          </ul>
        )}

        {archived.length > 0 && (
          <details>
            <summary className="cursor-pointer text-sm text-muted-foreground">{archived.length} meta(s) archivada(s)</summary>
            <ul className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
              {archived.map((g) => (
                <GoalCard key={g.id} goal={g} unreserved={unreserved} />
              ))}
            </ul>
          </details>
        )}
      </div>
    </>
  );
}
