import { Decimal, money, sumMoney, type MoneyInput } from "@/lib/money";
import { addDays, addMonthsAnchored, clampedDate, dayOf } from "@/lib/dates";

/**
 * Ciclos de facturación de tarjetas de crédito.
 *  - Fecha de corte (statementDay): cierra el período de consumos.
 *  - Fecha máxima de pago (dueDay): vence el pago de ese corte.
 * Si el mes no tiene ese día (p. ej. 31), se usa el último día del mes.
 */

export type CardDays = { statementDay: number; dueDay: number };

/** Fecha de corte igual o posterior a `date`. */
export function cutOnOrAfter(date: string, statementDay: number): string {
  const [y, m] = date.split("-").map(Number);
  const candidate = clampedDate(y, m, statementDay);
  if (date <= candidate) return candidate;
  return addMonthsAnchored(candidate, 1, statementDay);
}

export function previousCut(cut: string, statementDay: number): string {
  return addMonthsAnchored(cut, -1, statementDay);
}

export function nextCut(cut: string, statementDay: number): string {
  return addMonthsAnchored(cut, 1, statementDay);
}

/** Período de consumos que cierra en `cut`: (corte anterior, cut]. */
export function cycleFor(cut: string, statementDay: number): { start: string; end: string } {
  return { start: addDays(previousCut(cut, statementDay), 1), end: cut };
}

/** Fecha máxima de pago del corte `cut`. */
export function dueDateForCut(cut: string, dueDay: number): string {
  const [y, m] = cut.split("-").map(Number);
  const sameMonth = clampedDate(y, m, dueDay);
  if (dueDay > dayOf(cut) && sameMonth > cut) return sameMonth;
  return addMonthsAnchored(clampedDate(y, m, 1), 1, dueDay);
}

/**
 * Próximo pago a realizar a partir de `today`: si el último corte aún no
 * vence, ese es el pago pendiente; si ya venció, el del corte en curso.
 */
export function upcomingStatement(today: string, days: CardDays) {
  const currentCut = cutOnOrAfter(today, days.statementDay);
  const lastCut = currentCut === today ? currentCut : previousCut(currentCut, days.statementDay);
  const lastDue = dueDateForCut(lastCut, days.dueDay);
  const cut = lastDue >= today ? lastCut : nextCut(lastCut, days.statementDay);
  const due = dueDateForCut(cut, days.dueDay);
  const prevDue = dueDateForCut(previousCut(cut, days.statementDay), days.dueDay);
  return { cut, due, prevDue, cycle: cycleFor(cut, days.statementDay), isClosed: cut <= today };
}

export type CardMovement = {
  kind: string;
  status: string;
  amount: MoneyInput;
  direction: 1 | -1;
  occurred_on: string;
  card_purchase_id: string | null;
};

export type Installment = { due_date: string; amount: MoneyInput };

/**
 * Pago del período (estimado):
 *   consumos corrientes del ciclo (no diferidos)
 * + cuotas de diferidos que vencen en (vencimiento anterior, vencimiento]
 * − pagos hechos después del corte.
 */
export function statementEstimate(params: {
  cut: string;
  due: string;
  prevDue: string;
  cycle: { start: string; end: string };
  movements: CardMovement[];
  installments: Installment[];
  /** Pagos hechos después del vencimiento anterior (abonan a este período). */
  paymentsSinceCut: MoneyInput[];
}) {
  const confirmed = params.movements.filter((m) => m.status === "confirmed");
  const inCycle = confirmed.filter((m) => m.occurred_on >= params.cycle.start && m.occurred_on <= params.cycle.end);

  const current = sumMoney(
    inCycle
      .filter((m) => !m.card_purchase_id && (m.kind === "expense" || m.kind === "card_opening" || m.kind === "adjustment"))
      .map((m) => money(m.amount).times(-m.direction)),
  );
  const installments = sumMoney(
    params.installments.filter((i) => i.due_date > params.prevDue && i.due_date <= params.due).map((i) => i.amount),
  );
  const gross = Decimal.max(current.plus(installments), 0);
  const paid = sumMoney(params.paymentsSinceCut);
  return {
    current: current.toFixed(2),
    installments: installments.toFixed(2),
    gross: gross.toFixed(2),
    paid: paid.toFixed(2),
    remaining: Decimal.max(gross.minus(paid), 0).toFixed(2),
  };
}

export function availableCredit(limit: MoneyInput, debt: MoneyInput): string {
  return Decimal.max(money(limit).minus(money(debt)), 0).toFixed(2);
}

/** Utilización del cupo en % (0–100+), 1 decimal. */
export function utilization(limit: MoneyInput, debt: MoneyInput): number {
  const l = money(limit);
  if (l.isZero()) return 0;
  return Decimal.max(money(debt), 0).div(l).times(100).toDecimalPlaces(1).toNumber();
}

/** Primera fecha de cuota sugerida para una compra: el vencimiento del corte que la incluye. */
export function firstInstallmentDue(purchaseDate: string, days: CardDays): string {
  return dueDateForCut(cutOnOrAfter(purchaseDate, days.statementDay), days.dueDay);
}
