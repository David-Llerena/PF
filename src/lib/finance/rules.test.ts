import { describe, expect, it } from "vitest";
import {
  accountBalance,
  directionFor,
  effectOnAccount,
  financialPosition,
  percentOf,
  periodCashFlow,
  runningBalances,
  type LedgerEntry,
} from "./rules";
import { formatMoney, money, parseMoneyInput, sumMoney } from "@/lib/money";
import { monthRange, parseYearMonth, shiftMonth, todayISO } from "@/lib/dates";
import { adjustmentSchema, expenseSchema, positiveAmount, transferSchema } from "@/lib/validation/schemas";

const A = "acc-a";
const B = "acc-b";

const e = (p: Partial<LedgerEntry> & Pick<LedgerEntry, "kind" | "amount" | "direction">): LedgerEntry => ({
  status: "confirmed",
  account_id: A,
  counter_account_id: null,
  ...p,
});

describe("precisión monetaria (regla 10)", () => {
  it("0.1 + 0.2 = 0.30 exacto", () => {
    expect(sumMoney(["0.1", "0.2"]).toFixed(2)).toBe("0.30");
  });
  it("suma muchos centavos sin deriva", () => {
    const values = Array.from({ length: 1000 }, () => "0.01");
    expect(sumMoney(values).toFixed(2)).toBe("10.00");
  });
  it("redondeo half-up a 2 decimales", () => {
    expect(money("1.005").toFixed(2)).toBe("1.01");
  });
  it("interpreta formatos de entrada comunes", () => {
    expect(parseMoneyInput("1.234,56")?.toFixed(2)).toBe("1234.56");
    expect(parseMoneyInput("1,234.56")?.toFixed(2)).toBe("1234.56");
    expect(parseMoneyInput("$ 25,5")?.toFixed(2)).toBe("25.50");
    expect(parseMoneyInput("10")?.toFixed(2)).toBe("10.00");
    expect(parseMoneyInput("1.234")).not.toBeNull(); // 1.234 → miles con un solo separador
    expect(parseMoneyInput("abc")).toBeNull();
    expect(parseMoneyInput("1.999")?.toFixed(2)).toBe("1999.00");
  });
  it("formatea en USD con dos decimales", () => {
    expect(formatMoney("1234.5")).toMatch(/1[.,\s ]?234,50|1,234\.50/);
    expect(formatMoney("-3")).toMatch(/^-/);
  });
});

describe("saldos y flujo (reglas 2, 7, 8)", () => {
  const ledger: LedgerEntry[] = [
    e({ kind: "opening", amount: "1000.00", direction: 1 }),
    e({ kind: "income", amount: "500.00", direction: 1 }),
    e({ kind: "expense", amount: "120.40", direction: -1 }),
    e({ kind: "transfer", amount: "200.00", direction: -1, counter_account_id: B }),
    e({ kind: "expense", amount: "50.00", direction: -1, status: "pending" }),
    e({ kind: "expense", amount: "70.00", direction: -1, status: "void" }),
    e({ kind: "adjustment", amount: "0.60", direction: 1 }),
  ];

  it("saldo de la cuenta origen", () => {
    expect(accountBalance(ledger, A).toFixed(2)).toBe("1180.20");
  });
  it("la transferencia entra en la cuenta destino", () => {
    expect(accountBalance(ledger, B).toFixed(2)).toBe("200.00");
  });
  it("la transferencia no cambia el total de activos", () => {
    const total = accountBalance(ledger, A).plus(accountBalance(ledger, B));
    expect(total.toFixed(2)).toBe("1380.20");
  });
  it("pendientes y anulados no afectan saldo", () => {
    expect(effectOnAccount(ledger[4], A).toFixed(2)).toBe("0.00");
    expect(effectOnAccount(ledger[5], A).toFixed(2)).toBe("0.00");
  });
  it("saldo inicial, transferencias y ajustes no son ingreso ni gasto", () => {
    const flow = periodCashFlow(ledger);
    expect(flow.income.toFixed(2)).toBe("500.00");
    expect(flow.expense.toFixed(2)).toBe("120.40");
    expect(flow.net.toFixed(2)).toBe("379.60");
  });
  it("saldo corrido coincide con el saldo actual", () => {
    const desc = [...ledger].reverse();
    const rows = runningBalances(desc, A, accountBalance(ledger, A));
    expect(rows[0].balanceAfter?.toFixed(2)).toBe("1180.20");
    expect(rows.at(-1)?.balanceAfter?.toFixed(2)).toBe("1000.00");
    expect(rows[1].balanceAfter).toBeNull(); // anulado
  });
});

describe("posición financiera (reglas 5 y 6)", () => {
  it("patrimonio = activos − deudas; el cupo no suma", () => {
    const pos = financialPosition({ accountBalances: ["800.00", "-50.00", "200.10"], debts: ["300.00"] });
    expect(pos.available.toFixed(2)).toBe("950.10");
    expect(pos.netWorth.toFixed(2)).toBe("650.10");
  });
  it("direcciones por tipo", () => {
    expect(directionFor("income")).toBe(1);
    expect(directionFor("expense")).toBe(-1);
    expect(directionFor("transfer")).toBe(-1);
    expect(directionFor("adjustment", -1)).toBe(-1);
  });
  it("porcentaje seguro ante cero", () => {
    expect(percentOf("50", "0")).toBe(0);
    expect(percentOf("1", "3")).toBe(33.3);
  });
});

describe("fechas en Ecuador (regla 11)", () => {
  it("las 23:30 de Guayaquil siguen siendo el mismo día aunque en UTC ya sea mañana", () => {
    // 2026-10-13T04:30Z = 2026-10-12 23:30 en Guayaquil (UTC−5)
    expect(todayISO(new Date("2026-10-13T04:30:00Z"))).toBe("2026-10-12");
  });
  it("rango de febrero bisiesto", () => {
    expect(monthRange({ year: 2028, month: 2 })).toEqual({ from: "2028-02-01", to: "2028-02-29" });
  });
  it("desplazamiento de meses cruza años", () => {
    expect(shiftMonth({ year: 2026, month: 1 }, -1)).toEqual({ year: 2025, month: 12 });
    expect(shiftMonth({ year: 2026, month: 12 }, 1)).toEqual({ year: 2027, month: 1 });
  });
  it("parámetros inválidos usan el mes actual", () => {
    const r = parseYearMonth("abc", "13");
    expect(r.month).toBeGreaterThanOrEqual(1);
  });
});

describe("validaciones", () => {
  it("importe positivo con 2 decimales", () => {
    expect(positiveAmount.parse("12,5")).toBe("12.50");
    expect(positiveAmount.safeParse("0").success).toBe(false);
    expect(positiveAmount.safeParse("1.999,999").success).toBe(false);
  });
  it("transferencia a la misma cuenta es inválida", () => {
    const id = "6f1c2c1e-2b8e-4f6a-9d3a-0e7c1b2a3d4e";
    const r = transferSchema.safeParse({ account_id: id, counter_account_id: id, amount: "10", occurred_on: "2026-10-01" });
    expect(r.success).toBe(false);
  });
  it("ajuste requiere motivo", () => {
    const r = adjustmentSchema.safeParse({
      account_id: "6f1c2c1e-2b8e-4f6a-9d3a-0e7c1b2a3d4e",
      direction: "decrease",
      amount: "5",
      occurred_on: "2026-10-01",
      reason: "",
    });
    expect(r.success).toBe(false);
  });
  it("gasto con tarjeta de crédito no se acepta en Fase 1", () => {
    const r = expenseSchema.safeParse({
      description: "Cena",
      amount: "20",
      category_id: "6f1c2c1e-2b8e-4f6a-9d3a-0e7c1b2a3d4e",
      account_id: "6f1c2c1e-2b8e-4f6a-9d3a-0e7c1b2a3d4e",
      occurred_on: "2026-10-01",
      payment_method: "card",
    });
    expect(r.success).toBe(false);
  });
});
