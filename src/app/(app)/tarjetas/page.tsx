import Link from "next/link";
import { redirect } from "next/navigation";
import { CreditCard } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getInstitutions } from "@/services/finance";
import { getCards } from "@/services/obligations";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Card, EmptyState } from "@/components/ui/primitives";
import { CardVisual } from "@/components/cards/card-forms";
import { NewCardButton } from "@/components/cards/card-actions";
import { UtilizationBar } from "@/components/cards/utilization-bar";
import { formatMoney, sumMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tarjetas" };

export default async function CardsPage() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [cards, institutions] = await Promise.all([getCards(supabase, { includeInactive: true }), getInstitutions(supabase)]);
  const active = cards.filter((c) => c.is_active);
  const totalDebt = sumMoney(cards.map((c) => c.debt)).toFixed(2);
  const totalLimit = sumMoney(active.map((c) => c.credit_limit)).toFixed(2);
  const totalAvailable = sumMoney(active.map((c) => c.available)).toFixed(2);

  return (
    <>
      <PageHeader
        title="Tarjetas de crédito"
        description="Deuda, cupo y pagos. El cupo disponible no es dinero tuyo y no se suma a tus saldos."
        actions={<NewCardButton institutions={institutions} />}
      />

      {cards.length === 0 ? (
        <Card>
          <EmptyState
            icon={<CreditCard />}
            title="Sin tarjetas registradas"
            description="Agrega tu tarjeta con su cupo, fechas de corte y pago, y la deuda que tienes hoy."
            action={<NewCardButton institutions={institutions} label="Agregar mi primera tarjeta" />}
          />
        </Card>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="grid grid-cols-3 gap-2">
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Deuda total</p>
              <p className="tabular truncate font-semibold text-expense">{formatMoney(totalDebt)}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Cupo total</p>
              <p className="tabular truncate font-semibold">{formatMoney(totalLimit)}</p>
            </Card>
            <Card className="p-3">
              <p className="text-xs text-muted-foreground">Disponible</p>
              <p className="tabular truncate font-semibold text-income">{formatMoney(totalAvailable)}</p>
            </Card>
          </div>

          <ul className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {cards.map((c) => (
              <li key={c.id}>
                <Link
                  href={`/tarjetas/${c.id}`}
                  className={cn(
                    "flex flex-col gap-4 rounded-2xl border bg-card p-4 shadow-card transition-colors hover:border-primary/40 sm:flex-row",
                    !c.is_active && "opacity-60",
                  )}
                >
                  <CardVisual card={c} className="sm:w-48 sm:shrink-0" />
                  <div className="flex min-w-0 flex-1 flex-col gap-2">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-xs text-muted-foreground">Deuda</p>
                        <p className="tabular text-xl font-semibold">{formatMoney(c.debt)}</p>
                      </div>
                      <div className="flex gap-1">
                        {!c.is_active && <Badge>Inactiva</Badge>}
                        {c.is_demo && <Badge tone="info">Demo</Badge>}
                      </div>
                    </div>
                    <UtilizationBar value={c.utilization} />
                    <p className="text-xs text-muted-foreground">
                      Disponible {formatMoney(c.available)} de {formatMoney(c.credit_limit)}
                    </p>
                    <div className="mt-auto rounded-xl bg-muted/60 px-3 py-2 text-xs">
                      <span className="text-muted-foreground">Próximo pago · {formatDate(c.statement.due, "long")}</span>
                      <p className="tabular text-sm font-semibold">
                        {formatMoney(c.statement.remaining)} <span className="font-normal text-muted-foreground">estimado</span>
                      </p>
                    </div>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
