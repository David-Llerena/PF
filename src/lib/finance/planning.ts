import { Decimal, money, sumMoney, type MoneyInput } from "@/lib/money";
import { addDays, diffDays, monthRange, type YearMonth } from "@/lib/dates";
import { cutOnOrAfter, dueDateForCut, nextCut, previousCut } from "./cards";
import { occurrencesUntil, type RecurrenceFrequency } from "./recurrence";

/* ========================================================================== */
/* Presupuestos                                                               */
/* ========================================================================== */
export type BudgetLevel = "ok" | "warning" | "over";

/** Estado de un presupuesto: aviso desde el 80 %, excedido sobre el 100 %. */
export function budgetState(amount: MoneyInput, spent: MoneyInput) {
  const a = money(amount);
  const s = money(spent);
  const remaining = a.minus(s);
  const pct = a.isZero() ? 0 : s.div(a).times(100).toDecimalPlaces(1).toNumber();
  const level: BudgetLevel = s.gt(a) ? "over" : pct >= 80 ? "warning" : "ok";
  return { remaining: remaining.toFixed(2), pct, level };
}

/* ========================================================================== */
/* Metas de ahorro                                                            */
/* ========================================================================== */
export function goalProgress(params: {
  target: MoneyInput;
  allocated: MoneyInput;
  targetDate: string | null;
  today: string;
}) {
  const target = money(params.target);
  const allocated = money(params.allocated);
  const remaining = Decimal.max(target.minus(allocated), 0);
  const pct = target.isZero() ? 0 : Math.min(allocated.div(target).times(100).toDecimalPlaces(1).toNumber(), 100);
  let monthlyNeeded: string | null = null;
  let monthsLeft: number | null = null;
  if (params.targetDate && remaining.gt(0)) {
    const days = diffDays(params.targetDate, params.today);
    monthsLeft = Math.max(Math.ceil(days / 30.4375), 0);
    monthlyNeeded = monthsLeft > 0 ? remaining.div(monthsLeft).toDecimalPlaces(2, Decimal.ROUND_UP).toFixed(2) : remaining.toFixed(2);
  }
  return {
    remaining: remaining.toFixed(2),
    pct,
    achieved: allocated.gte(target),
    monthlyNeeded,
    monthsLeft,
    overdue: !!params.targetDate && params.targetDate < params.today && remaining.gt(0),
  };
}

/** Dinero disponible que no está reservado para metas (nunca se cuenta dos veces). */
export function unreservedAvailable(available: MoneyInput, reserved: MoneyInput): string {
  return money(available).minus(money(reserved)).toFixed(2);
}

/* ========================================================================== */
/* Proyección: ¿cuánto me quedará el próximo mes?                             */
/* ========================================================================== */
export type ProjectionEventSource = "income" | "loan" | "card" | "recurring" | "pending" | "variable";

export type ProjectionEvent = {
  date: string;
  title: string;
  amount: string; // positivo
  direction: "in" | "out";
  source: ProjectionEventSource;
  /** programado = dato registrado; estimado = calculado/aproximado */
  certainty: "scheduled" | "estimated";
};

export type ProjectionCardInput = {
  id: string;
  name: string;
  statement_day: number;
  due_day: number;
  /** Próximo pago ya estimado por el módulo de tarjetas */
  upcoming: { due: string; cut: string; remaining: MoneyInput };
  /** Cuotas de diferidos activos */
  installments: { due_date: string; amount: MoneyInput }[];
  /** Consumos corrientes confirmados (sin diferidos) con fecha posterior al corte del próximo pago */
  openCycleSpending: { occurred_on: string; amount: MoneyInput }[];
};

export type ProjectionRuleInput = {
  id: string;
  kind: "income" | "expense";
  name: string;
  amount: MoneyInput;
  frequency: RecurrenceFrequency;
  next_date: string;
  anchor_day: number;
  is_active: boolean;
  account_id: string | null;
  credit_card_id: string | null;
};

export function projectionHorizon(today: string): { end: string; label: YearMonth } {
  const [y, m] = today.split("-").map(Number);
  const next = m === 12 ? { year: y + 1, month: 1 } : { year: y, month: m + 1 };
  return { end: monthRange(next).to, label: next };
}

/**
 * Reúne los eventos de caja desde mañana hasta `horizon` sin duplicar:
 *  - Recurrentes con cuenta: salen de la cuenta en su fecha.
 *  - Recurrentes con tarjeta: salen de la cuenta cuando vence el pago de la tarjeta que los incluye.
 *  - Tarjetas: pago del período estimado + siguiente período (cuotas y consumos ya hechos).
 *  - Préstamos: cuotas pendientes (incluye vencidas, se asumen pagadas hoy).
 *  - Movimientos pendientes ya registrados (los vencidos se asumen hoy).
 */
export function collectProjectionEvents(params: {
  today: string;
  horizon: string;
  cards: ProjectionCardInput[];
  loanInstallments: { loan_name: string; number: number; due_date: string; amount: MoneyInput }[];
  rules: ProjectionRuleInput[];
  pending: { kind: "income" | "expense"; description: string; occurred_on: string; amount: MoneyInput; on_card: boolean }[];
}): ProjectionEvent[] {
  const { today, horizon } = params;
  const clampDate = (d: string) => (d < today ? today : d);
  const events: ProjectionEvent[] = [];

  for (const r of params.rules) {
    if (!r.is_active) continue;
    for (const d of occurrencesUntil(r.next_date, r.frequency, r.anchor_day, horizon, 120)) {
      if (r.kind === "income") {
        events.push({ date: clampDate(d), title: r.name, amount: money(r.amount).toFixed(2), direction: "in", source: "income", certainty: "scheduled" });
      } else if (r.credit_card_id) {
        const card = params.cards.find((c) => c.id === r.credit_card_id);
        if (!card) continue;
        const due = dueDateForCut(cutOnOrAfter(d, card.statement_day), card.due_day);
        if (due <= horizon && due > card.upcoming.due) {
          events.push({ date: due, title: `${r.name} (vía ${card.name})`, amount: money(r.amount).toFixed(2), direction: "out", source: "recurring", certainty: "scheduled" });
        }
      } else {
        events.push({ date: clampDate(d), title: r.name, amount: money(r.amount).toFixed(2), direction: "out", source: "recurring", certainty: "scheduled" });
      }
    }
  }

  for (const c of params.cards) {
    const first = money(c.upcoming.remaining);
    if (first.gt(0) && c.upcoming.due <= horizon) {
      events.push({ date: clampDate(c.upcoming.due), title: `Pago ${c.name}`, amount: first.toFixed(2), direction: "out", source: "card", certainty: "estimated" });
    }
    // Períodos siguientes dentro del horizonte
    let cut = nextCut(c.upcoming.cut, c.statement_day);
    let prevDue = c.upcoming.due;
    for (let i = 0; i < 3; i++) {
      const due = dueDateForCut(cut, c.due_day);
      if (due > horizon) break;
      const start = addDays(previousCut(cut, c.statement_day), 1);
      const spending = sumMoney(c.openCycleSpending.filter((s) => s.occurred_on >= start && s.occurred_on <= cut).map((s) => s.amount));
      const inst = sumMoney(c.installments.filter((x) => x.due_date > prevDue && x.due_date <= due).map((x) => x.amount));
      const total = spending.plus(inst);
      if (total.gt(0)) {
        events.push({ date: due, title: `Pago ${c.name} (siguiente período)`, amount: total.toFixed(2), direction: "out", source: "card", certainty: "estimated" });
      }
      prevDue = due;
      cut = nextCut(cut, c.statement_day);
    }
  }

  for (const i of params.loanInstallments) {
    if (i.due_date > horizon) continue;
    events.push({ date: clampDate(i.due_date), title: `${i.loan_name} · cuota ${i.number}`, amount: money(i.amount).toFixed(2), direction: "out", source: "loan", certainty: "scheduled" });
  }

  for (const p of params.pending) {
    if (p.occurred_on > horizon) continue;
    if (p.kind === "expense" && p.on_card) continue; // se pagará vía tarjeta; ya incluido en sus estimados futuros
    events.push({
      date: clampDate(p.occurred_on),
      title: p.description,
      amount: money(p.amount).toFixed(2),
      direction: p.kind === "income" ? "in" : "out",
      source: p.kind === "income" ? "income" : "pending",
      certainty: "scheduled",
    });
  }

  return events.sort((a, b) => a.date.localeCompare(b.date));
}

export type ProjectionResult = {
  horizon: string;
  start: string;
  reserved: string;
  lines: { key: string; label: string; amount: string; sign: 1 | -1; certainty: "confirmed" | "scheduled" | "estimated" }[];
  result: string;
  resultAfterReserves: string;
  lowestPoint: { date: string; balance: string };
  timeline: { date: string; balance: number }[];
  events: ProjectionEvent[];
  warnings: string[];
  hasEstimates: boolean;
};

export function buildProjection(params: {
  today: string;
  horizon: string;
  available: MoneyInput;
  reserved: MoneyInput;
  events: ProjectionEvent[];
  variableAvgMonthly: MoneyInput;
  variableMonthsWithData: number;
  hasIncomeRules: boolean;
  hasCards: boolean;
  unassignedRules: number;
}): ProjectionResult {
  const start = money(params.available);
  const days = Math.max(diffDays(params.horizon, params.today), 0);
  const variable = money(params.variableAvgMonthly).times(days).div(30.4375).toDecimalPlaces(2);

  const events = [...params.events];
  if (variable.gt(0)) {
    // Se reparte uniformemente por semana para la línea de tiempo.
    const weeks = Math.max(Math.ceil(days / 7), 1);
    const per = variable.div(weeks).toDecimalPlaces(2);
    let assigned = new Decimal(0);
    for (let w = 1; w <= weeks; w++) {
      const amt = w === weeks ? variable.minus(assigned) : per;
      assigned = assigned.plus(amt);
      events.push({
        date: w === weeks ? params.horizon : addDays(params.today, w * 7),
        title: "Gastos variables estimados",
        amount: amt.toFixed(2),
        direction: "out",
        source: "variable",
        certainty: "estimated",
      });
    }
  }
  events.sort((a, b) => a.date.localeCompare(b.date));

  const sumBy = (pred: (e: ProjectionEvent) => boolean) => sumMoney(events.filter(pred).map((e) => e.amount));
  const incomes = sumBy((e) => e.direction === "in");
  const loans = sumBy((e) => e.source === "loan");
  const cards = sumBy((e) => e.source === "card");
  const recurring = sumBy((e) => e.source === "recurring");
  const pending = sumBy((e) => e.source === "pending");

  const lines: ProjectionResult["lines"] = [
    { key: "start", label: "Dinero disponible hoy", amount: start.toFixed(2), sign: 1, certainty: "confirmed" },
    { key: "income", label: "Ingresos esperados", amount: incomes.toFixed(2), sign: 1, certainty: "scheduled" },
    { key: "loans", label: "Cuotas de préstamos", amount: loans.toFixed(2), sign: -1, certainty: "scheduled" },
    { key: "cards", label: "Pagos de tarjetas", amount: cards.toFixed(2), sign: -1, certainty: "estimated" },
    { key: "recurring", label: "Suscripciones y pagos fijos", amount: recurring.toFixed(2), sign: -1, certainty: "scheduled" },
    { key: "pending", label: "Gastos pendientes registrados", amount: pending.toFixed(2), sign: -1, certainty: "scheduled" },
    { key: "variable", label: "Gastos variables (promedio)", amount: variable.toFixed(2), sign: -1, certainty: "estimated" },
  ];
  const result = start.plus(incomes).minus(loans).minus(cards).minus(recurring).minus(pending).minus(variable);

  // Línea de tiempo diaria y punto más bajo.
  const timeline: ProjectionResult["timeline"] = [];
  let bal = start;
  let low = { date: params.today, balance: start };
  let idx = 0;
  for (let d = 0; d <= days; d++) {
    const date = addDays(params.today, d);
    while (idx < events.length && events[idx].date <= date) {
      const e = events[idx];
      bal = e.direction === "in" ? bal.plus(e.amount) : bal.minus(e.amount);
      idx++;
    }
    if (bal.lt(low.balance)) low = { date, balance: bal };
    timeline.push({ date, balance: bal.toNumber() });
  }

  const warnings: string[] = [];
  if (!params.hasIncomeRules && incomes.isZero())
    warnings.push("No tienes ingresos recurrentes configurados: la proyección no incluye tu sueldo. Agrégalo en Recurrentes.");
  if (params.variableMonthsWithData === 0)
    warnings.push("Sin historial suficiente: no se estimaron gastos variables del día a día.");
  else if (params.variableMonthsWithData < 3)
    warnings.push(`El promedio de gastos variables usa solo ${params.variableMonthsWithData} mes(es) de historial.`);
  if (params.hasCards)
    warnings.push("Los pagos de tarjeta son estimados con los consumos y cuotas registrados; no incluyen consumos con tarjeta que aún no hiciste.");
  if (params.unassignedRules > 0)
    warnings.push(`${params.unassignedRules} recurrente(s) sin cuenta asignada se restaron como pago desde tus cuentas.`);
  if (result.isNegative()) warnings.push("Con estas cifras terminarías el período en negativo.");
  else if (low.balance.isNegative())
    warnings.push(`Tu saldo podría quedar en negativo alrededor del ${low.date} aunque termines en positivo.`);

  return {
    horizon: params.horizon,
    start: start.toFixed(2),
    reserved: money(params.reserved).toFixed(2),
    lines,
    result: result.toFixed(2),
    resultAfterReserves: result.minus(money(params.reserved)).toFixed(2),
    lowestPoint: { date: low.date, balance: low.balance.toFixed(2) },
    timeline,
    events,
    warnings,
    hasEstimates: cards.gt(0) || variable.gt(0),
  };
}
