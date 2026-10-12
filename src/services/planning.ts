import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { money, sumMoney } from "@/lib/money";
import { addDays, diffDays, monthRange, todayISO, type YearMonth } from "@/lib/dates";
import { dueDateForCut, nextCut } from "@/lib/finance/cards";
import { budgetState, buildProjection, collectProjectionEvents, goalProgress, projectionHorizon } from "@/lib/finance/planning";
import type { Obligation, Transaction } from "@/lib/types";
import { getAccountsWithBalances, TX_SELECT } from "./finance";
import { getObligations } from "./obligations";

/* -------------------------------------------------------------------------- */
/* Presupuestos                                                               */
/* -------------------------------------------------------------------------- */
export type BudgetRow = {
  budget_id: string;
  category_id: string;
  name: string;
  color: string;
  amount: string;
  spent: string;
  remaining: string;
  pct: number;
  level: "ok" | "warning" | "over";
};

export async function getBudgets(supabase: SupabaseClient, period: YearMonth) {
  const { from, to } = monthRange(period);
  const [statusRes, totalsRes, prevRes] = await Promise.all([
    supabase.rpc("budget_status", { p_month: from }),
    supabase.rpc("expenses_by_category", { p_from: from, p_to: to }),
    supabase
      .from("budgets")
      .select("id", { count: "exact", head: true })
      .eq("period_month", monthRange(period.month === 1 ? { year: period.year - 1, month: 12 } : { year: period.year, month: period.month - 1 }).from),
  ]);
  if (statusRes.error) throw new Error(statusRes.error.message);
  if (totalsRes.error) throw new Error(totalsRes.error.message);

  const rows: BudgetRow[] = ((statusRes.data ?? []) as Omit<BudgetRow, "remaining" | "pct" | "level">[]).map((r) => ({
    ...r,
    ...budgetState(r.amount, r.spent),
  }));
  const budgeted = new Set(rows.map((r) => r.category_id));
  const allSpending = (totalsRes.data ?? []) as { category_id: string; name: string; color: string; total: string }[];
  const unbudgeted = allSpending.filter((c) => !budgeted.has(c.category_id));

  const totalBudget = sumMoney(rows.map((r) => r.amount));
  const totalSpent = sumMoney(rows.map((r) => r.spent));
  return {
    rows,
    unbudgeted,
    totalBudget: totalBudget.toFixed(2),
    totalSpent: totalSpent.toFixed(2),
    totalRemaining: totalBudget.minus(totalSpent).toFixed(2),
    unbudgetedTotal: sumMoney(unbudgeted.map((u) => u.total)).toFixed(2),
    previousMonthHasBudgets: (prevRes.count ?? 0) > 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Metas                                                                      */
/* -------------------------------------------------------------------------- */
export type GoalSummary = {
  id: string;
  name: string;
  target_amount: string;
  target_date: string | null;
  color: string;
  status: "active" | "archived";
  notes: string | null;
  is_demo: boolean;
  allocated: string;
  progress: ReturnType<typeof goalProgress>;
  movements: { id: string; amount: string; occurred_on: string; note: string | null }[];
};

export async function getGoals(supabase: SupabaseClient) {
  const today = todayISO();
  const [goalsRes, balRes, movRes] = await Promise.all([
    supabase
      .from("savings_goals")
      .select("id, name, target_amount:target_amount::text, target_date, color, status, notes, is_demo")
      .order("status")
      .order("created_at"),
    supabase.from("goal_balances").select("goal_id, allocated:allocated::text"),
    supabase
      .from("savings_goal_movements")
      .select("id, goal_id, amount:amount::text, occurred_on, note")
      .order("occurred_on", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(200),
  ]);
  for (const r of [goalsRes, balRes, movRes]) if (r.error) throw new Error(r.error.message);

  const bal = new Map((balRes.data ?? []).map((b) => [b.goal_id as string, b.allocated as string]));
  const movs = (movRes.data ?? []) as { id: string; goal_id: string; amount: string; occurred_on: string; note: string | null }[];

  const goals: GoalSummary[] = ((goalsRes.data ?? []) as Omit<GoalSummary, "allocated" | "progress" | "movements">[]).map((g) => {
    const allocated = money(bal.get(g.id) ?? "0").toFixed(2);
    return {
      ...g,
      allocated,
      progress: goalProgress({ target: g.target_amount, allocated, targetDate: g.target_date, today }),
      movements: movs.filter((m) => m.goal_id === g.id).slice(0, 5),
    };
  });
  const reserved = sumMoney(goals.filter((g) => g.status === "active").map((g) => g.allocated)).toFixed(2);
  return { goals, reserved };
}

export async function getReservedTotal(supabase: SupabaseClient): Promise<string> {
  // goal_balances es una vista: PostgREST no puede embeber savings_goals desde ella,
  // así que se consultan por separado y se cruzan aquí.
  const [goalsRes, balRes] = await Promise.all([
    supabase.from("savings_goals").select("id").eq("status", "active"),
    supabase.from("goal_balances").select("goal_id, allocated:allocated::text"),
  ]);
  if (goalsRes.error) throw new Error(goalsRes.error.message);
  if (balRes.error) throw new Error(balRes.error.message);
  const active = new Set((goalsRes.data ?? []).map((g) => g.id as string));
  return sumMoney(
    (balRes.data ?? []).filter((b) => active.has(b.goal_id as string)).map((b) => b.allocated as string),
  ).toFixed(2);
}

/* -------------------------------------------------------------------------- */
/* Reportes                                                                   */
/* -------------------------------------------------------------------------- */
export async function getReport(
  supabase: SupabaseClient,
  params: { from: string; to: string; accountId?: string | null; categoryId?: string | null },
) {
  const account = params.accountId ?? null;
  const [flowRes, catRes, posRes] = await Promise.all([
    supabase.rpc("report_cashflow", { p_from: params.from, p_to: params.to, p_account: account, p_category: params.categoryId ?? null }),
    supabase.rpc("report_categories", { p_from: params.from, p_to: params.to, p_account: account }),
    supabase.rpc("report_position", { p_from: params.from, p_to: params.to, p_account: account }),
  ]);
  for (const r of [flowRes, catRes, posRes]) if (r.error) throw new Error(r.error.message);

  const cashflow = (flowRes.data ?? []) as { month: string; income: string; expense: string }[];
  const categories = (catRes.data ?? []) as { category_id: string; name: string; color: string; total: string; count: number }[];
  const position = (posRes.data ?? []) as { month_end: string; assets: string; card_debt: string; loan_debt: string }[];

  const income = sumMoney(cashflow.map((c) => c.income));
  const expense = sumMoney(cashflow.map((c) => c.expense));
  const net = income.minus(expense);
  return {
    cashflow,
    categories,
    position,
    income: income.toFixed(2),
    expense: expense.toFixed(2),
    net: net.toFixed(2),
    savingsRate: income.isZero() ? null : net.div(income).times(100).toDecimalPlaces(1).toNumber(),
    avgMonthlySavings: cashflow.length ? net.div(cashflow.length).toDecimalPlaces(2).toFixed(2) : "0.00",
  };
}

/* -------------------------------------------------------------------------- */
/* Proyección                                                                 */
/* -------------------------------------------------------------------------- */
export async function getProjection(supabase: SupabaseClient) {
  const today = todayISO();
  const { end: horizon, label } = projectionHorizon(today);

  const [ob, accounts, reserved, avgRes] = await Promise.all([
    getObligations(supabase, diffDays(horizon, today), 120),
    getAccountsWithBalances(supabase),
    getReservedTotal(supabase),
    supabase.rpc("avg_variable_spending", { p_months: 3 }).single(),
  ]);
  if (avgRes.error) throw new Error(avgRes.error.message);
  const avg = avgRes.data as { avg_amount: string; months_with_data: number };

  // Datos adicionales de tarjetas: cuotas activas y consumos corrientes posteriores al corte del próximo pago.
  const cardIds = ob.cards.map((c) => c.id);
  const minCut = ob.cards.reduce((m, c) => (c.statement.cut < m ? c.statement.cut : m), today);
  const [instRes, spendRes] = await Promise.all([
    cardIds.length
      ? supabase
          .from("installment_schedules")
          .select("due_date, amount:amount::text, purchase:credit_card_purchases!inner(credit_card_id, status)")
          .eq("purchase.status", "active")
          .gt("due_date", today)
          .lte("due_date", addDays(horizon, 40))
      : Promise.resolve({ data: [], error: null }),
    cardIds.length
      ? supabase
          .from("financial_transactions")
          .select("credit_card_id, occurred_on, amount:amount::text")
          .eq("kind", "expense")
          .eq("status", "confirmed")
          .is("card_purchase_id", null)
          .not("credit_card_id", "is", null)
          .gt("occurred_on", minCut)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (instRes.error) throw new Error(instRes.error.message);
  if (spendRes.error) throw new Error(spendRes.error.message);
  type Inst = { due_date: string; amount: string; purchase: { credit_card_id: string } };
  const inst = (instRes.data ?? []) as unknown as Inst[];
  const spend = (spendRes.data ?? []) as { credit_card_id: string; occurred_on: string; amount: string }[];

  const loanNames = new Map(ob.loans.map((l) => [l.id, l.name]));
  const events = collectProjectionEvents({
    today,
    horizon,
    cards: ob.cards.map((c) => ({
      id: c.id,
      name: c.name,
      statement_day: c.statement_day,
      due_day: c.due_day,
      upcoming: { due: c.statement.due, cut: c.statement.cut, remaining: c.statement.remaining },
      installments: inst.filter((i) => i.purchase.credit_card_id === c.id),
      openCycleSpending: spend.filter((s) => s.credit_card_id === c.id && s.occurred_on > c.statement.cut),
    })),
    loanInstallments: ob.pendingInstallments
      .filter((i) => loanNames.has(i.loan_id))
      .map((i) => ({ loan_name: loanNames.get(i.loan_id)!, number: i.number, due_date: i.due_date, amount: i.amount })),
    rules: ob.rules,
    pending: ob.pendingTransactions
      .filter((t) => t.kind === "income" || t.kind === "expense")
      .map((t) => ({
        kind: t.kind as "income" | "expense",
        description: t.description,
        occurred_on: t.occurred_on,
        amount: t.amount,
        on_card: !!t.credit_card_id,
      })),
  });

  const projection = buildProjection({
    today,
    horizon,
    available: sumMoney(accounts.map((a) => a.balance)).toFixed(2),
    reserved,
    events,
    variableAvgMonthly: avg.avg_amount,
    variableMonthsWithData: avg.months_with_data,
    hasIncomeRules: ob.rules.some((r) => r.kind === "income" && r.is_active),
    hasCards: ob.cards.length > 0,
    unassignedRules: ob.rules.filter((r) => r.is_active && r.kind === "expense" && !r.account_id && !r.credit_card_id).length,
  });
  return { ...projection, monthLabel: label, today };
}

/* -------------------------------------------------------------------------- */
/* Calendario                                                                 */
/* -------------------------------------------------------------------------- */
export type CalendarItem = Obligation & { paid?: boolean };

export async function getCalendar(supabase: SupabaseClient, period: YearMonth) {
  const today = todayISO();
  const { from, to } = monthRange(period);
  const horizonDays = Math.max(diffDays(to, today), 0);

  const [ob, paidRes, instRes] = await Promise.all([
    getObligations(supabase, horizonDays, 120),
    supabase
      .from("financial_transactions")
      .select(TX_SELECT)
      .eq("status", "confirmed")
      .gte("occurred_on", from)
      .lte("occurred_on", to)
      .or("kind.eq.card_payment,kind.eq.loan_payment,recurring_rule_id.not.is.null,loan_installment_id.not.is.null")
      .order("occurred_on"),
    supabase
      .from("installment_schedules")
      .select("due_date, amount:amount::text, purchase:credit_card_purchases!inner(credit_card_id, status)")
      .eq("purchase.status", "active")
      .gt("due_date", today)
      .lte("due_date", addDays(to, 1)),
  ]);
  if (paidRes.error) throw new Error(paidRes.error.message);
  if (instRes.error) throw new Error(instRes.error.message);
  type Inst = { due_date: string; amount: string; purchase: { credit_card_id: string } };
  const installments = (instRes.data ?? []) as unknown as Inst[];

  // Futuras/pendientes del mes (las vencidas solo se muestran en el mes actual)
  const upcoming: CalendarItem[] = ob.obligations.filter(
    (o) => (o.date >= from && o.date <= to) || (o.status === "overdue" && to >= today && from <= today),
  );

  // Vencimientos de tarjeta posteriores al próximo pago: solo cuotas diferidas ya conocidas
  for (const c of ob.cards) {
    let cut = nextCut(c.statement.cut, c.statement_day);
    let prevDue = c.statement.due;
    for (let i = 0; i < 24; i++) {
      const due = dueDateForCut(cut, c.due_day);
      if (due > to) break;
      const known = sumMoney(
        installments
          .filter((x) => x.purchase.credit_card_id === c.id && x.due_date > prevDue && x.due_date <= due)
          .map((x) => x.amount),
      );
      if (due >= from && known.gt(0)) {
        upcoming.push({
          id: `card-${c.id}-${due}`,
          source: "card",
          direction: "out",
          title: `Pago ${c.name}`,
          subtitle: "Cuotas diferidas conocidas (más consumos futuros)",
          date: due,
          amount: known.toFixed(2),
          estimated: true,
          status: "later",
          href: `/tarjetas/${c.id}`,
        });
      }
      prevDue = due;
      cut = nextCut(cut, c.statement_day);
    }
  }

  // Pagados del mes (agrupando capital + intereses de un mismo pago)
  const paidTx = (paidRes.data ?? []) as unknown as (Transaction & { loan_installment_id?: string | null })[];
  const groups = new Map<string, Transaction[]>();
  for (const t of paidTx) {
    const key = t.payment_group_id ?? t.id;
    groups.set(key, [...(groups.get(key) ?? []), t]);
  }
  const paid: CalendarItem[] = [...groups.entries()].map(([key, txs]) => {
    const main = txs.find((t) => t.kind !== "expense") ?? txs[0];
    const amount = sumMoney(txs.map((t) => t.amount)).toFixed(2);
    const isIncome = main.kind === "income";
    return {
      id: `paid-${key}`,
      source: main.kind === "card_payment" ? "card" : main.loan_id ? "loan" : "recurring",
      direction: isIncome ? "in" : "out",
      title: main.kind === "card_payment" ? `Pago ${main.credit_card?.name ?? "tarjeta"}` : main.description,
      subtitle: isIncome ? "Recibido" : "Pagado",
      date: main.occurred_on,
      amount,
      estimated: false,
      status: "later",
      paid: true,
    };
  });

  const items = [...upcoming, ...paid].sort(
    (a, b) => a.date.localeCompare(b.date) || Number(!!a.paid) - Number(!!b.paid),
  );

  const outPending = sumMoney(items.filter((i) => !i.paid && i.direction === "out").map((i) => i.amount));
  const inPending = sumMoney(items.filter((i) => !i.paid && i.direction === "in").map((i) => i.amount));
  const paidOut = sumMoney(items.filter((i) => i.paid && i.direction === "out").map((i) => i.amount));
  return {
    today,
    items,
    totals: { toPay: outPending.toFixed(2), toReceive: inPending.toFixed(2), paid: paidOut.toFixed(2) },
  };
}
