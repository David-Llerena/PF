import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CalendarClock, ChevronLeft, ChevronRight, History, Layers } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAccountsWithBalances, getCategories, getInstitutions } from "@/services/finance";
import { getCard, getCardPurchases, getCardTransactions } from "@/services/obligations";
import { cutOnOrAfter, cycleFor, dueDateForCut, nextCut, previousCut } from "@/lib/finance/cards";
import { periodCashFlow } from "@/lib/finance/rules";
import { Badge, Card, CardContent, CardDescription, CardHeader, CardTitle, EmptyState } from "@/components/ui/primitives";
import { CardVisual } from "@/components/cards/card-forms";
import { CardActions } from "@/components/cards/card-actions";
import { UtilizationBar } from "@/components/cards/utilization-bar";
import { TransactionList } from "@/components/transactions/transaction-list";
import { formatMoney, money, sumMoney } from "@/lib/money";
import { formatDate, isISODate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function CardDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ corte?: string }>;
}) {
  const { id } = await params;
  const { corte } = await searchParams;
  if (!UUID_RE.test(id)) notFound();

  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const card = await getCard(supabase, id);
  if (!card) notFound();

  const today = todayISO();
  const currentCut = cutOnOrAfter(today, card.statement_day);
  const cut = corte && isISODate(corte) ? cutOnOrAfter(corte, card.statement_day) : currentCut;
  const cycle = cycleFor(cut, card.statement_day);

  const [accounts, categories, institutions, purchases, cycleTx, openingTx] = await Promise.all([
    getAccountsWithBalances(supabase),
    getCategories(supabase),
    getInstitutions(supabase),
    getCardPurchases(supabase, id),
    getCardTransactions(supabase, id, { from: cycle.start, to: cycle.end }),
    supabase
      .from("financial_transactions")
      .select("amount:amount::text, occurred_on")
      .eq("credit_card_id", id)
      .eq("kind", "card_opening")
      .is("card_purchase_id", null)
      .neq("status", "void")
      .maybeSingle(),
  ]);

  const opening = openingTx.data ? { amount: openingTx.data.amount as string, date: openingTx.data.occurred_on as string } : null;
  const flow = periodCashFlow(cycleTx);
  const payments = sumMoney(cycleTx.filter((t) => t.kind === "card_payment" && t.status === "confirmed").map((t) => t.amount));

  const upcomingInstallments = purchases
    .flatMap((p) => p.schedule.filter((s) => s.due_date > today).map((s) => ({ ...s, purchase: p })))
    .sort((a, b) => a.due_date.localeCompare(b.due_date));
  const deferredPending = sumMoney(upcomingInstallments.map((i) => i.amount)).toFixed(2);

  return (
    <div className="flex flex-col gap-5">
      <Link href="/tarjetas" className="flex items-center gap-1 self-start text-sm text-muted-foreground hover:text-foreground">
        <ChevronLeft className="size-4" /> Tarjetas
      </Link>

      <Card className="overflow-hidden">
        <div className="grid grid-cols-1 gap-5 p-5 md:grid-cols-[18rem_1fr]">
          <CardVisual card={card} className="mx-auto max-w-[18rem] md:max-w-none" />
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold tracking-tight">{card.name}</h1>
                <p className="text-sm text-muted-foreground">
                  Corte día {card.statement_day} · pago día {card.due_day}
                </p>
              </div>
              <div className="flex gap-1">
                {!card.is_active && <Badge>Inactiva</Badge>}
                {card.is_demo && <Badge tone="info">Demo</Badge>}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              <Stat label="Deuda total" value={formatMoney(card.debt)} tone="text-expense" />
              <Stat label="Cupo disponible" value={formatMoney(card.available)} tone="text-income" />
              <Stat label="Cupo total" value={formatMoney(card.credit_limit)} />
            </div>
            <UtilizationBar value={card.utilization} />
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 border-t bg-muted/30 p-5 sm:grid-cols-2">
          <div className="rounded-xl border bg-card p-4">
            <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <CalendarClock className="size-3.5" /> Próximo pago · {formatDate(card.statement.due, "long")}
            </p>
            <p className="tabular mt-1 text-2xl font-semibold">{formatMoney(card.statement.remaining)}</p>
            <p className="text-xs text-muted-foreground">
              Pago del período estimado: consumos {formatMoney(card.statement.current)} + cuotas{" "}
              {formatMoney(card.statement.installments)}
              {money(card.statement.paid).gt(0) && ` − pagado ${formatMoney(card.statement.paid)}`}. Corte{" "}
              {formatDate(card.statement.cut)} {card.statement.isClosed ? "(cerrado)" : "(en curso)"}.
            </p>
          </div>
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs font-medium text-muted-foreground">Pago total para quedar en cero</p>
            <p className="tabular mt-1 text-2xl font-semibold">{formatMoney(money(card.debt).isNegative() ? "0" : card.debt)}</p>
            <p className="text-xs text-muted-foreground">
              Incluye {formatMoney(deferredPending)} de cuotas diferidas futuras. El pago mínimo lo define tu banco:
              consúltalo en tu estado de cuenta.
            </p>
          </div>
        </div>

        <div className="border-t px-5 py-4">
          <CardActions card={card} institutions={institutions} opening={opening} />
        </div>
      </Card>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Card className="min-w-0 lg:col-span-3">
          <CardHeader className="gap-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitle>Consumos del período</CardTitle>
              <div className="flex items-center gap-1 rounded-xl border p-1">
                <Link
                  href={`/tarjetas/${id}?corte=${previousCut(cut, card.statement_day)}`}
                  className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                  aria-label="Período anterior"
                >
                  <ChevronLeft className="size-4" />
                </Link>
                <span className="px-1 text-xs font-medium">
                  {formatDate(cycle.start)} – {formatDate(cycle.end)}
                </span>
                {cut < currentCut ? (
                  <Link
                    href={`/tarjetas/${id}?corte=${nextCut(cut, card.statement_day)}`}
                    className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                    aria-label="Período siguiente"
                  >
                    <ChevronRight className="size-4" />
                  </Link>
                ) : (
                  <span className="flex size-8 items-center justify-center opacity-30" aria-hidden>
                    <ChevronRight className="size-4" />
                  </span>
                )}
              </div>
            </div>
            <CardDescription>
              Vence el {formatDate(dueDateForCut(cut, card.due_day), "long")} · consumos {formatMoney(flow.expense.toFixed(2))} ·
              pagos {formatMoney(payments.toFixed(2))}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {cycleTx.length === 0 ? (
              <EmptyState icon={<History />} title="Sin movimientos en este período" />
            ) : (
              <TransactionList
                transactions={cycleTx}
                accounts={accounts}
                categories={categories}
                cards={[card]}
                perspectiveCardId={id}
              />
            )}
          </CardContent>
        </Card>

        <Card className="min-w-0 lg:col-span-2">
          <CardHeader>
            <CardTitle>Diferidos activos</CardTitle>
            <CardDescription>Cuotas pendientes: {formatMoney(deferredPending)}</CardDescription>
          </CardHeader>
          <CardContent>
            {purchases.length === 0 ? (
              <EmptyState
                icon={<Layers />}
                title="Sin compras diferidas"
                description="Al registrar un consumo con tarjeta activa “Diferir en cuotas”."
              />
            ) : (
              <ul className="space-y-3">
                {purchases.map((p) => {
                  const paid = p.schedule.filter((s) => s.due_date <= today).length;
                  const next = p.schedule.find((s) => s.due_date > today);
                  const pct = Math.round((paid / p.schedule.length) * 100);
                  return (
                    <li key={p.id} className="rounded-xl border p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium">{p.description}</p>
                          <p className="text-xs text-muted-foreground">
                            {formatDate(p.purchase_date)} · {formatMoney(p.principal)}
                            {money(p.total_interest).gt(0) && ` + ${formatMoney(p.total_interest)} interés`}
                          </p>
                        </div>
                        {p.is_prior && <Badge>Previo</Badge>}
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-muted">
                        <div className="h-full rounded-full bg-primary" style={{ width: `${pct}%` }} />
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {paid} de {p.schedule.length} cuotas vencidas
                        {next && ` · próxima ${formatDate(next.due_date)} por ${formatMoney(next.amount)}`}
                      </p>
                    </li>
                  );
                })}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>
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
