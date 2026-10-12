import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getCalendar, type CalendarItem } from "@/services/planning";
import { daysInMonth, formatDate, monthLabel, parseYearMonth } from "@/lib/dates";
import { formatMoney } from "@/lib/money";
import { PageHeader } from "@/components/layout/page-header";
import { Badge, Card, CardContent, EmptyState } from "@/components/ui/primitives";
import { MonthPicker } from "@/components/dashboard/month-picker";
import { cn } from "@/lib/utils";

export const metadata = { title: "Calendario" };

const WEEKDAYS = ["Lun", "Mar", "Mié", "Jue", "Vie", "Sáb", "Dom"];

function statusOf(item: CalendarItem, today: string) {
  if (item.paid) return { label: item.direction === "in" ? "Recibido" : "Pagado", tone: "income" as const, dot: "bg-income" };
  if (item.date < today) return { label: "Vencido", tone: "expense" as const, dot: "bg-destructive" };
  if (item.status === "upcoming") return { label: "Próximo", tone: "warning" as const, dot: "bg-amber-500" };
  return { label: "Pendiente", tone: "neutral" as const, dot: "bg-muted-foreground" };
}

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ y?: string; m?: string }> }) {
  const sp = await searchParams;
  const period = parseYearMonth(sp.y, sp.m);
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const { items, totals, today } = await getCalendar(supabase, period);
  const mm = String(period.month).padStart(2, "0");
  const days = daysInMonth(period.year, period.month);
  const firstWeekday = (new Date(Date.UTC(period.year, period.month - 1, 1)).getUTCDay() + 6) % 7; // lunes = 0

  const byDate = new Map<string, CalendarItem[]>();
  for (const it of items) {
    // Los vencidos de meses anteriores se muestran en la agenda, no en la cuadrícula
    byDate.set(it.date, [...(byDate.get(it.date) ?? []), it]);
  }
  const overdueBefore = items.filter((i) => !i.paid && i.date < `${period.year}-${mm}-01`);
  const agendaDates = [...byDate.keys()].sort();

  return (
    <>
      <PageHeader
        title="Calendario de pagos"
        description="Tarjetas, cuotas, recurrentes, ingresos esperados y pendientes, desde sus módulos y sin duplicar."
        actions={
          <Suspense>
            <MonthPicker value={period} allowFuture />
          </Suspense>
        }
      />

      <div className="flex flex-col gap-4">
        <div className="grid grid-cols-3 gap-2">
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Por pagar</p>
            <p className="tabular truncate font-semibold text-expense">{formatMoney(totals.toPay)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Por recibir</p>
            <p className="tabular truncate font-semibold text-income">{formatMoney(totals.toReceive)}</p>
          </Card>
          <Card className="p-3">
            <p className="text-xs text-muted-foreground">Ya pagado</p>
            <p className="tabular truncate font-semibold">{formatMoney(totals.paid)}</p>
          </Card>
        </div>

        <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
          {[
            ["bg-income", "Pagado / recibido"],
            ["bg-amber-500", "Próximos 7 días"],
            ["bg-muted-foreground", "Pendiente"],
            ["bg-destructive", "Vencido"],
          ].map(([c, l]) => (
            <span key={l} className="flex items-center gap-1.5">
              <span className={cn("size-2.5 rounded-full", c)} /> {l}
            </span>
          ))}
        </div>

        {/* Cuadrícula mensual (tablet y escritorio) */}
        <Card className="hidden overflow-hidden md:block">
          <div className="grid grid-cols-7 border-b bg-muted/40 text-center text-xs font-medium text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: firstWeekday }).map((_, i) => (
              <div key={`e${i}`} className="min-h-28 border-b border-r bg-muted/20" />
            ))}
            {Array.from({ length: days }).map((_, i) => {
              const date = `${period.year}-${mm}-${String(i + 1).padStart(2, "0")}`;
              const list = byDate.get(date) ?? [];
              const isToday = date === today;
              return (
                <div key={date} className={cn("min-h-28 border-b border-r p-1.5", isToday && "bg-primary-soft/60")}>
                  <p className={cn("mb-1 text-xs font-medium", isToday ? "text-primary" : "text-muted-foreground")}>{i + 1}</p>
                  <ul className="space-y-1">
                    {list.slice(0, 3).map((it) => {
                      const st = statusOf(it, today);
                      return (
                        <li key={it.id} title={`${it.title} · ${formatMoney(it.amount)}`}>
                          <Link
                            href={it.href ?? "#"}
                            className="flex items-center gap-1 rounded-md bg-muted/60 px-1.5 py-0.5 text-[11px] hover:bg-muted"
                          >
                            <span className={cn("size-1.5 shrink-0 rounded-full", st.dot)} />
                            <span className="min-w-0 flex-1 truncate">{it.title}</span>
                            <span className={cn("tabular shrink-0", it.direction === "in" && "text-income")}>
                              {formatMoney(it.amount).replace(/,00$/, "")}
                            </span>
                          </Link>
                        </li>
                      );
                    })}
                    {list.length > 3 && <li className="px-1.5 text-[11px] text-muted-foreground">+{list.length - 3} más</li>}
                  </ul>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Agenda (móvil, y detalle completo en escritorio) */}
        <Card>
          <CardContent className="pt-5">
            <h2 className="mb-3 text-sm font-semibold">Agenda de {monthLabel(period).toLowerCase()}</h2>
            {items.length === 0 ? (
              <EmptyState icon={<CalendarDays />} title="Nada programado este mes" description="Agrega recurrentes, tarjetas o préstamos para verlos aquí." />
            ) : (
              <div className="space-y-4">
                {overdueBefore.length > 0 && (
                  <p className="rounded-xl bg-destructive/10 px-3 py-2 text-xs text-destructive">
                    Tienes {overdueBefore.length} obligación(es) vencida(s) de meses anteriores; aparecen al inicio de la agenda.
                  </p>
                )}
                {agendaDates.map((date) => (
                  <section key={date}>
                    <h3 className={cn("mb-1.5 text-xs font-semibold uppercase tracking-wider", date === today ? "text-primary" : "text-muted-foreground")}>
                      {date === today ? "Hoy · " : ""}
                      {formatDate(date, "long")}
                    </h3>
                    <ul className="divide-y rounded-xl border">
                      {byDate.get(date)!.map((it) => {
                        const st = statusOf(it, today);
                        return (
                          <li key={it.id}>
                            <Link href={it.href ?? "#"} className="flex items-center gap-3 px-3 py-2.5 hover:bg-muted/50">
                              <span className={cn("size-2.5 shrink-0 rounded-full", st.dot)} />
                              <div className="min-w-0 flex-1">
                                <p className="truncate text-sm font-medium">{it.title}</p>
                                <p className="truncate text-xs text-muted-foreground">{it.subtitle}</p>
                              </div>
                              <div className="flex shrink-0 flex-col items-end gap-0.5">
                                <span className={cn("tabular text-sm font-semibold", it.direction === "in" ? "text-income" : "")}>
                                  {it.direction === "in" ? "+" : "−"}
                                  {formatMoney(it.amount)}
                                </span>
                                <span className="flex gap-1">
                                  {it.estimated && !it.paid && <Badge tone="warning">Estimado</Badge>}
                                  <Badge tone={st.tone}>{st.label}</Badge>
                                </span>
                              </div>
                            </Link>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </>
  );
}
