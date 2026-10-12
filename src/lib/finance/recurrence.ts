import { Decimal, money, type MoneyInput } from "@/lib/money";
import { addDays, addMonthsAnchored, clampedDate, daysInMonth, dayOf } from "@/lib/dates";

/** Espejo de public.next_occurrence() en SQL. */
export type RecurrenceFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly" | "yearly";

export function nextOccurrence(date: string, frequency: RecurrenceFrequency, anchorDay: number): string {
  const [y, m] = date.split("-").map(Number);
  const d = dayOf(date);
  switch (frequency) {
    case "weekly":
      return addDays(date, 7);
    case "biweekly":
      return addDays(date, 14);
    case "semimonthly":
      if (d < 16) return clampedDate(y, m, Math.min(d + 15, daysInMonth(y, m)));
      return addMonthsAnchored(clampedDate(y, m, 1), 1, Math.min(anchorDay, 15));
    case "monthly":
      return addMonthsAnchored(clampedDate(y, m, 1), 1, anchorDay);
    case "yearly":
      return addMonthsAnchored(clampedDate(y, m, 1), 12, anchorDay);
  }
}

/** Ocurrencias desde `start` (incluida) hasta `to` (incluida). */
export function occurrencesUntil(
  start: string,
  frequency: RecurrenceFrequency,
  anchorDay: number,
  to: string,
  max = 60,
): string[] {
  const out: string[] = [];
  let cur = start;
  while (cur <= to && out.length < max) {
    out.push(cur);
    cur = nextOccurrence(cur, frequency, anchorDay);
  }
  return out;
}

/** Equivalente mensual de un importe periódico (para "compromisos por mes"). */
export function monthlyEquivalent(amount: MoneyInput, frequency: RecurrenceFrequency): Decimal {
  const a = money(amount);
  switch (frequency) {
    case "weekly":
      return a.times(52).div(12).toDecimalPlaces(2);
    case "biweekly":
      return a.times(26).div(12).toDecimalPlaces(2);
    case "semimonthly":
      return a.times(2);
    case "monthly":
      return a;
    case "yearly":
      return a.div(12).toDecimalPlaces(2);
  }
}

export const FREQUENCY_LABEL: Record<RecurrenceFrequency, string> = {
  weekly: "Semanal",
  biweekly: "Cada 2 semanas",
  semimonthly: "Quincenal",
  monthly: "Mensual",
  yearly: "Anual",
};
