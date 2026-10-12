import { Decimal, money, sumMoney, type MoneyInput } from "@/lib/money";
import type { TransactionKind, TransactionStatus } from "@/lib/types";

/**
 * Reglas financieras centralizadas (espejo de la lógica SQL).
 * La base de datos es la fuente de verdad para saldos y totales; estas
 * funciones se usan para presentación (saldo corrido, KPIs) y están
 * cubiertas por pruebas automatizadas.
 */

export type LedgerEntry = {
  kind: TransactionKind;
  status: TransactionStatus;
  amount: MoneyInput;
  direction: 1 | -1;
  account_id: string;
  counter_account_id: string | null;
};

/** Regla 8: solo los movimientos confirmados afectan saldos. */
export function affectsBalance(entry: Pick<LedgerEntry, "status">): boolean {
  return entry.status === "confirmed";
}

/**
 * Efecto de un movimiento sobre una cuenta concreta.
 * Una transferencia resta en el origen y suma en el destino (regla 2).
 */
export function effectOnAccount(entry: LedgerEntry, accountId: string): Decimal {
  if (!affectsBalance(entry)) return new Decimal(0);
  const amount = money(entry.amount);
  if (entry.account_id === accountId) return amount.times(entry.direction);
  if (entry.kind === "transfer" && entry.counter_account_id === accountId) return amount;
  return new Decimal(0);
}

export function accountBalance(entries: LedgerEntry[], accountId: string): Decimal {
  return entries.reduce((acc, e) => acc.plus(effectOnAccount(e, accountId)), new Decimal(0));
}

/**
 * Regla 2 y 7: solo income/expense son flujo del período. Saldos
 * iniciales, transferencias y ajustes no son ingresos ni gastos.
 */
export function isCashFlow(kind: TransactionKind): kind is "income" | "expense" {
  return kind === "income" || kind === "expense";
}

export function periodCashFlow(entries: Pick<LedgerEntry, "kind" | "status" | "amount">[]) {
  const confirmed = entries.filter((e) => affectsBalance(e) && isCashFlow(e.kind));
  const income = sumMoney(confirmed.filter((e) => e.kind === "income").map((e) => e.amount));
  const expense = sumMoney(confirmed.filter((e) => e.kind === "expense").map((e) => e.amount));
  return { income, expense, net: income.minus(expense) };
}

export type FinancialPosition = {
  /** Dinero disponible: suma de saldos de cuentas activas (no incluye cupo de tarjetas, regla 6). */
  available: Decimal;
  /** Deudas pendientes (tarjetas y préstamos; Fase 2). */
  debts: Decimal;
  /** Patrimonio neto estimado = activos − deudas (regla 5). */
  netWorth: Decimal;
};

export function financialPosition(params: {
  accountBalances: MoneyInput[];
  debts?: MoneyInput[];
}): FinancialPosition {
  const available = sumMoney(params.accountBalances);
  const debts = sumMoney(params.debts ?? []);
  return { available, debts, netWorth: available.minus(debts) };
}

/** Dirección que corresponde a cada tipo de movimiento al crearlo. */
export function directionFor(kind: TransactionKind, adjustmentSign: 1 | -1 = 1): 1 | -1 {
  switch (kind) {
    case "income":
      return 1;
    case "expense":
    case "transfer":
      return -1;
    case "opening":
    case "adjustment":
      return adjustmentSign;
  }
}

/**
 * Saldo corrido para el historial de una cuenta. Recibe movimientos en
 * orden descendente (más reciente primero) y el saldo actual; devuelve el
 * saldo resultante después de cada movimiento.
 */
export function runningBalances<T extends LedgerEntry>(
  entriesDesc: T[],
  accountId: string,
  currentBalance: MoneyInput,
): (T & { balanceAfter: Decimal | null })[] {
  let cursor = money(currentBalance);
  return entriesDesc.map((e) => {
    if (!affectsBalance(e)) return { ...e, balanceAfter: null };
    const after = cursor;
    cursor = cursor.minus(effectOnAccount(e, accountId));
    return { ...e, balanceAfter: after };
  });
}

/** Porcentaje (0–100) con 1 decimal, seguro ante división por cero. */
export function percentOf(part: MoneyInput, total: MoneyInput): number {
  const t = money(total);
  if (t.isZero()) return 0;
  return money(part).div(t).times(100).toDecimalPlaces(1).toNumber();
}
