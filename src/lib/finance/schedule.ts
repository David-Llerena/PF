import { Decimal, money, type MoneyInput } from "@/lib/money";
import { addDays, addMonthsAnchored, dayOf } from "@/lib/dates";

/**
 * Cronogramas de cuotas (préstamos y compras diferidas).
 * Método francés (cuota fija) cuando hay tasa; cuotas iguales de capital si
 * la tasa es 0. La última cuota absorbe el redondeo para que la suma de
 * capital sea exactamente el saldo.
 */

export type Frequency = "weekly" | "biweekly" | "monthly" | "quarterly";

export const PERIODS_PER_YEAR: Record<Frequency, number> = {
  weekly: 52,
  biweekly: 26,
  monthly: 12,
  quarterly: 4,
};

export type ScheduleRow = {
  number: number;
  due_date: string;
  principal: string;
  interest: string;
  amount: string;
};

export function nextDueDate(prev: string, frequency: Frequency, anchorDay: number): string {
  switch (frequency) {
    case "weekly":
      return addDays(prev, 7);
    case "biweekly":
      return addDays(prev, 14);
    case "monthly":
      return addMonthsAnchored(prev, 1, anchorDay);
    case "quarterly":
      return addMonthsAnchored(prev, 3, anchorDay);
  }
}

export function dueDates(firstDue: string, count: number, frequency: Frequency): string[] {
  const anchor = dayOf(firstDue);
  const dates = [firstDue];
  for (let i = 1; i < count; i++) dates.push(nextDueDate(dates[i - 1], frequency, anchor));
  return dates;
}

/** Cuota fija del método francés, sin redondear. */
export function frenchPayment(principal: Decimal, periodRate: Decimal, n: number): Decimal {
  if (periodRate.isZero()) return principal.div(n);
  const factor = periodRate.plus(1).pow(-n);
  return principal.times(periodRate).div(new Decimal(1).minus(factor));
}

export function buildSchedule(params: {
  principal: MoneyInput;
  annualRatePct: MoneyInput; // 15 = 15 % anual
  installments: number;
  firstDueDate: string;
  frequency?: Frequency;
}): ScheduleRow[] {
  const principal = money(params.principal);
  const n = params.installments;
  if (!Number.isInteger(n) || n < 1) throw new Error("Número de cuotas inválido");
  if (principal.lte(0)) throw new Error("El capital debe ser mayor que 0");

  const frequency = params.frequency ?? "monthly";
  const rate = new Decimal(params.annualRatePct ?? 0).div(100).div(PERIODS_PER_YEAR[frequency]);
  const payment = frenchPayment(principal, rate, n).toDecimalPlaces(2);
  const dates = dueDates(params.firstDueDate, n, frequency);

  const rows: ScheduleRow[] = [];
  let balance = principal;
  for (let i = 0; i < n; i++) {
    const interest = balance.times(rate).toDecimalPlaces(2);
    let capital = rate.isZero() ? principal.div(n).toDecimalPlaces(2, Decimal.ROUND_DOWN) : payment.minus(interest);
    if (i === n - 1 || capital.gt(balance)) capital = balance; // la última cuota cierra el saldo exacto
    if (capital.isNegative()) capital = new Decimal(0);
    balance = balance.minus(capital);
    rows.push({
      number: i + 1,
      due_date: dates[i],
      principal: capital.toFixed(2),
      interest: interest.toFixed(2),
      amount: capital.plus(interest).toFixed(2),
    });
  }
  return rows;
}

export function scheduleTotals(rows: Pick<ScheduleRow, "principal" | "interest" | "amount">[]) {
  return rows.reduce(
    (acc, r) => ({
      principal: acc.principal.plus(r.principal),
      interest: acc.interest.plus(r.interest),
      amount: acc.amount.plus(r.amount),
    }),
    { principal: new Decimal(0), interest: new Decimal(0), amount: new Decimal(0) },
  );
}
