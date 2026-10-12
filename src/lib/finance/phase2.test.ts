import { describe, expect, it } from "vitest";
import { buildSchedule, dueDates, scheduleTotals } from "./schedule";
import {
  availableCredit,
  cutOnOrAfter,
  cycleFor,
  dueDateForCut,
  firstInstallmentDue,
  statementEstimate,
  upcomingStatement,
  utilization,
} from "./cards";
import { monthlyEquivalent, nextOccurrence, occurrencesUntil } from "./recurrence";
import { addMonthsAnchored } from "@/lib/dates";

describe("cronogramas", () => {
  it("$600 a 6 meses sin intereses = 6 cuotas de $100", () => {
    const rows = buildSchedule({ principal: "600", annualRatePct: 0, installments: 6, firstDueDate: "2026-11-05" });
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.amount === "100.00" && r.interest === "0.00")).toBe(true);
    expect(rows.map((r) => r.due_date)).toEqual([
      "2026-11-05", "2026-12-05", "2027-01-05", "2027-02-05", "2027-03-05", "2027-04-05",
    ]);
  });

  it("sin intereses con división inexacta: la última cuota absorbe el centavo", () => {
    const rows = buildSchedule({ principal: "100", annualRatePct: 0, installments: 3, firstDueDate: "2026-11-05" });
    expect(rows.map((r) => r.principal)).toEqual(["33.33", "33.33", "33.34"]);
    expect(scheduleTotals(rows).principal.toFixed(2)).toBe("100.00");
  });

  it("método francés: capital suma exacto y cuotas casi iguales", () => {
    const rows = buildSchedule({ principal: "10000", annualRatePct: 15, installments: 36, firstDueDate: "2026-11-30" });
    const t = scheduleTotals(rows);
    expect(t.principal.toFixed(2)).toBe("10000.00");
    // Cuota teórica 346.65 para 10 000 al 15 % anual en 36 meses
    expect(rows[0].amount).toBe("346.65");
    expect(rows[0].interest).toBe("125.00");
    const amounts = rows.slice(0, -1).map((r) => r.amount);
    expect(new Set(amounts).size).toBe(1);
    expect(Math.abs(Number(rows.at(-1)!.amount) - 346.65)).toBeLessThan(0.5); // ajuste de redondeo en la última cuota
  });

  it("fechas mensuales conservan el día ancla (31)", () => {
    expect(dueDates("2026-01-31", 4, "monthly")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31", "2026-04-30"]);
    expect(addMonthsAnchored("2026-02-28", 1, 31)).toBe("2026-03-31");
  });

  it("frecuencia quincenal (cada 2 semanas) y trimestral", () => {
    expect(dueDates("2026-10-01", 3, "biweekly")).toEqual(["2026-10-01", "2026-10-15", "2026-10-29"]);
    expect(dueDates("2026-01-15", 3, "quarterly")).toEqual(["2026-01-15", "2026-04-15", "2026-07-15"]);
  });

  it("rechaza datos inválidos", () => {
    expect(() => buildSchedule({ principal: "0", annualRatePct: 0, installments: 3, firstDueDate: "2026-11-05" })).toThrow();
    expect(() => buildSchedule({ principal: "10", annualRatePct: 0, installments: 0, firstDueDate: "2026-11-05" })).toThrow();
  });
});

describe("ciclos de tarjeta", () => {
  const days = { statementDay: 20, dueDay: 5 };

  it("corte igual o posterior", () => {
    expect(cutOnOrAfter("2026-10-12", 20)).toBe("2026-10-20");
    expect(cutOnOrAfter("2026-10-20", 20)).toBe("2026-10-20");
    expect(cutOnOrAfter("2026-10-21", 20)).toBe("2026-11-20");
    expect(cutOnOrAfter("2026-02-10", 31)).toBe("2026-02-28");
  });

  it("período de consumos y vencimiento", () => {
    expect(cycleFor("2026-10-20", 20)).toEqual({ start: "2026-09-21", end: "2026-10-20" });
    expect(dueDateForCut("2026-10-20", 5)).toBe("2026-11-05");
    expect(dueDateForCut("2026-10-05", 25)).toBe("2026-10-25");
  });

  it("próximo pago: antes del vencimiento del último corte se paga ese corte", () => {
    // Hoy 12 oct: último corte 20 sep, vence 5 oct (ya pasó) → corte 20 oct, vence 5 nov
    const a = upcomingStatement("2026-10-12", days);
    expect(a.cut).toBe("2026-10-20");
    expect(a.due).toBe("2026-11-05");
    expect(a.isClosed).toBe(false);
    // Hoy 25 oct: corte 20 oct ya cerró y vence 5 nov
    const b = upcomingStatement("2026-10-25", days);
    expect(b.cut).toBe("2026-10-20");
    expect(b.isClosed).toBe(true);
    expect(b.prevDue).toBe("2026-10-05");
  });

  it("estimado del período: corrientes + cuotas que vencen − pagos", () => {
    const est = statementEstimate({
      cut: "2026-10-20",
      due: "2026-11-05",
      prevDue: "2026-10-05",
      cycle: { start: "2026-09-21", end: "2026-10-20" },
      movements: [
        { kind: "expense", status: "confirmed", amount: "80.25", direction: -1, occurred_on: "2026-10-02", card_purchase_id: null },
        { kind: "expense", status: "confirmed", amount: "600.00", direction: -1, occurred_on: "2026-10-03", card_purchase_id: "p1" },
        { kind: "expense", status: "pending", amount: "50.00", direction: -1, occurred_on: "2026-10-04", card_purchase_id: null },
        { kind: "expense", status: "confirmed", amount: "30.00", direction: -1, occurred_on: "2026-10-25", card_purchase_id: null },
        { kind: "adjustment", status: "confirmed", amount: "5.00", direction: 1, occurred_on: "2026-10-10", card_purchase_id: null },
      ],
      installments: [
        { due_date: "2026-11-05", amount: "100.00" },
        { due_date: "2026-12-05", amount: "100.00" },
      ],
      paymentsSinceCut: ["50.00"],
    });
    // 80.25 − 5 (reembolso) + 100 (cuota de nov); el diferido de 600 no entra completo
    expect(est.current).toBe("75.25");
    expect(est.installments).toBe("100.00");
    expect(est.gross).toBe("175.25");
    expect(est.remaining).toBe("125.25");
  });

  it("cupo disponible y utilización; el cupo no es dinero (regla 6)", () => {
    expect(availableCredit("3000", "1000.50")).toBe("1999.50");
    expect(availableCredit("1000", "1200")).toBe("0.00");
    expect(utilization("3000", "750")).toBe(25);
    expect(utilization("0", "10")).toBe(0);
  });

  it("primera cuota sugerida = vencimiento del corte de la compra", () => {
    expect(firstInstallmentDue("2026-10-03", days)).toBe("2026-11-05");
    expect(firstInstallmentDue("2026-10-22", days)).toBe("2026-12-05");
  });
});

describe("recurrencias (espejo de SQL)", () => {
  it("coincide con next_occurrence de la base", () => {
    expect(nextOccurrence("2026-01-31", "monthly", 31)).toBe("2026-02-28");
    expect(nextOccurrence("2026-02-28", "monthly", 31)).toBe("2026-03-31");
    expect(nextOccurrence("2026-10-05", "semimonthly", 5)).toBe("2026-10-20");
    expect(nextOccurrence("2026-10-20", "semimonthly", 5)).toBe("2026-11-05");
    expect(nextOccurrence("2026-10-15", "semimonthly", 15)).toBe("2026-10-30");
    expect(nextOccurrence("2026-02-15", "semimonthly", 15)).toBe("2026-02-28");
    expect(nextOccurrence("2028-02-29", "yearly", 29)).toBe("2029-02-28");
    expect(nextOccurrence("2026-10-01", "weekly", 1)).toBe("2026-10-08");
  });

  it("ocurrencias en un rango", () => {
    expect(occurrencesUntil("2026-10-15", "monthly", 15, "2027-01-14")).toEqual(["2026-10-15", "2026-11-15", "2026-12-15"]);
  });

  it("equivalente mensual", () => {
    expect(monthlyEquivalent("10.99", "monthly").toFixed(2)).toBe("10.99");
    expect(monthlyEquivalent("400", "semimonthly").toFixed(2)).toBe("800.00");
    expect(monthlyEquivalent("120", "yearly").toFixed(2)).toBe("10.00");
    expect(monthlyEquivalent("100", "weekly").toFixed(2)).toBe("433.33");
  });
});
