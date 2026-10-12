import { describe, expect, it } from "vitest";
import {
  budgetState,
  buildProjection,
  collectProjectionEvents,
  goalProgress,
  projectionHorizon,
  unreservedAvailable,
} from "./planning";

describe("presupuestos", () => {
  it("niveles: normal, aviso desde 80 %, excedido", () => {
    expect(budgetState("150", "60")).toMatchObject({ remaining: "90.00", pct: 40, level: "ok" });
    expect(budgetState("150", "120")).toMatchObject({ pct: 80, level: "warning" });
    expect(budgetState("150", "150")).toMatchObject({ remaining: "0.00", level: "warning" });
    expect(budgetState("150", "150.01")).toMatchObject({ remaining: "-0.01", level: "over" });
  });
});

describe("metas de ahorro", () => {
  it("progreso y aporte mensual necesario", () => {
    const g = goalProgress({ target: "1200", allocated: "300", targetDate: "2027-04-12", today: "2026-10-12" });
    expect(g.pct).toBe(25);
    expect(g.remaining).toBe("900.00");
    expect(g.monthsLeft).toBe(6);
    expect(g.monthlyNeeded).toBe("150.00");
    expect(g.achieved).toBe(false);
  });
  it("meta cumplida y sin fecha", () => {
    const g = goalProgress({ target: "100", allocated: "120", targetDate: null, today: "2026-10-12" });
    expect(g).toMatchObject({ pct: 100, achieved: true, remaining: "0.00", monthlyNeeded: null });
  });
  it("reservas no se cuentan dos veces", () => {
    expect(unreservedAvailable("1000.50", "400")).toBe("600.50");
  });
});

describe("proyección del próximo mes", () => {
  const today = "2026-10-12";
  const { end: horizon } = projectionHorizon(today);

  it("horizonte = fin del mes siguiente", () => {
    expect(horizon).toBe("2026-11-30");
    expect(projectionHorizon("2026-12-03").end).toBe("2027-01-31");
  });

  const events = collectProjectionEvents({
    today,
    horizon,
    cards: [
      {
        id: "c1",
        name: "Visa",
        statement_day: 20,
        due_day: 5,
        upcoming: { due: "2026-11-05", cut: "2026-10-20", remaining: "200.00" },
        installments: [
          { due_date: "2026-11-05", amount: "100" }, // ya incluido en el estimado del próximo pago
          { due_date: "2026-12-05", amount: "100" }, // fuera del horizonte
        ],
        openCycleSpending: [],
      },
    ],
    loanInstallments: [
      { loan_name: "Auto", number: 2, due_date: "2026-10-01", amount: "205.40" }, // vencida → hoy
      { loan_name: "Auto", number: 3, due_date: "2026-11-01", amount: "203.10" },
      { loan_name: "Auto", number: 4, due_date: "2026-12-01", amount: "200.80" }, // fuera
    ],
    rules: [
      { id: "r1", kind: "income", name: "Sueldo", amount: "625", frequency: "semimonthly", next_date: "2026-10-15", anchor_day: 15, is_active: true, account_id: "a", credit_card_id: null },
      { id: "r2", kind: "expense", name: "Internet", amount: "28", frequency: "monthly", next_date: "2026-10-10", anchor_day: 10, is_active: true, account_id: "a", credit_card_id: null },
      { id: "r3", kind: "expense", name: "Netflix", amount: "10.99", frequency: "monthly", next_date: "2026-10-18", anchor_day: 18, is_active: true, account_id: null, credit_card_id: "c1" },
      { id: "r4", kind: "expense", name: "Pausado", amount: "999", frequency: "monthly", next_date: "2026-10-20", anchor_day: 20, is_active: false, account_id: "a", credit_card_id: null },
    ],
    pending: [
      { kind: "expense", description: "Luz", occurred_on: "2026-10-20", amount: "32.90", on_card: false },
      { kind: "expense", description: "Compra con tarjeta pendiente", occurred_on: "2026-10-21", amount: "50", on_card: true },
    ],
  });

  it("reúne eventos sin duplicar ni salir del horizonte", () => {
    const titles = events.map((e) => `${e.date} ${e.title} ${e.amount}`);
    // Sueldo quincenal: 15 y 30 oct, 15 y 30 nov
    expect(events.filter((e) => e.title === "Sueldo").map((e) => e.date)).toEqual(["2026-10-15", "2026-10-30", "2026-11-15", "2026-11-30"]);
    // Internet vencido el 10 → se asume hoy, y el 10 nov
    expect(events.filter((e) => e.title === "Internet").map((e) => e.date)).toEqual(["2026-10-12", "2026-11-10"]);
    // Netflix con tarjeta: el del 18 oct entra al corte 20 oct (pago 5 nov) que ya está en el estimado → no se duplica;
    // el del 18 nov entra al corte 20 nov (pago 5 dic) → fuera del horizonte.
    expect(events.some((e) => e.title.startsWith("Netflix"))).toBe(false);
    expect(titles).toContain("2026-11-05 Pago Visa 200.00");
    expect(events.filter((e) => e.source === "loan").map((e) => e.date)).toEqual(["2026-10-12", "2026-11-01"]);
    expect(events.some((e) => e.title === "Pausado")).toBe(false);
    expect(events.some((e) => e.title === "Compra con tarjeta pendiente")).toBe(false);
  });

  it("calcula el disponible proyectado separando programado de estimado", () => {
    const p = buildProjection({
      today,
      horizon,
      available: "1000",
      reserved: "300",
      events,
      variableAvgMonthly: "304.38",
      variableMonthsWithData: 3,
      hasIncomeRules: true,
      hasCards: true,
      unassignedRules: 0,
    });
    const line = (k: string) => p.lines.find((l) => l.key === k)!;
    expect(line("income").amount).toBe("2500.00");
    expect(line("loans").amount).toBe("408.50");
    expect(line("cards").amount).toBe("200.00");
    expect(line("cards").certainty).toBe("estimated");
    expect(line("recurring").amount).toBe("56.00");
    expect(line("pending").amount).toBe("32.90");
    // 49 días ≈ 1.61 meses × 304.38
    expect(line("variable").amount).toBe("490.01");
    expect(p.result).toBe("2312.59");
    expect(p.resultAfterReserves).toBe("2012.59");
    expect(p.timeline.at(-1)!.balance).toBeCloseTo(2312.59, 2);
    expect(p.hasEstimates).toBe(true);
  });

  it("advierte cuando falta información y no inventa ingresos", () => {
    const p = buildProjection({
      today,
      horizon,
      available: "100",
      reserved: "0",
      events: [{ date: "2026-10-20", title: "Arriendo", amount: "350", direction: "out", source: "recurring", certainty: "scheduled" }],
      variableAvgMonthly: "0",
      variableMonthsWithData: 0,
      hasIncomeRules: false,
      hasCards: false,
      unassignedRules: 1,
    });
    expect(p.result).toBe("-250.00");
    expect(p.warnings.join(" ")).toMatch(/no incluye tu sueldo/);
    expect(p.warnings.join(" ")).toMatch(/Sin historial/);
    expect(p.warnings.join(" ")).toMatch(/negativo/);
    expect(p.lowestPoint).toEqual({ date: "2026-10-20", balance: "-250.00" });
  });
});
