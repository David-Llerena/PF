import { z } from "zod";
import { isISODate } from "@/lib/dates";
import { parseMoneyInput } from "@/lib/money";

const MAX_AMOUNT = "999999999999.99";

/** Importe positivo con máximo 2 decimales; se normaliza a "1234.56". */
export const positiveAmount = z
  .string({ error: "Ingresa un importe" })
  .trim()
  .min(1, "Ingresa un importe")
  .transform((raw, ctx) => {
    const d = parseMoneyInput(raw);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "Importe inválido (máximo 2 decimales)" });
      return z.NEVER;
    }
    if (d.lte(0)) {
      ctx.addIssue({ code: "custom", message: "El importe debe ser mayor que 0" });
      return z.NEVER;
    }
    if (d.gt(MAX_AMOUNT)) {
      ctx.addIssue({ code: "custom", message: "Importe demasiado grande" });
      return z.NEVER;
    }
    return d.toFixed(2);
  });

/** Importe que admite 0 y negativos (saldos iniciales). */
export const signedAmount = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    if (raw === "") return "0.00";
    const d = parseMoneyInput(raw);
    if (!d) {
      ctx.addIssue({ code: "custom", message: "Importe inválido (máximo 2 decimales)" });
      return z.NEVER;
    }
    if (d.abs().gt(MAX_AMOUNT)) {
      ctx.addIssue({ code: "custom", message: "Importe demasiado grande" });
      return z.NEVER;
    }
    return d.toFixed(2);
  });

/** Importe ≥ 0 (cupos, deudas iniciales, intereses). */
export const nonNegativeAmount = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    if (raw === "") return "0.00";
    const d = parseMoneyInput(raw);
    if (!d || d.isNegative()) {
      ctx.addIssue({ code: "custom", message: "Importe inválido (máximo 2 decimales)" });
      return z.NEVER;
    }
    if (d.gt(MAX_AMOUNT)) {
      ctx.addIssue({ code: "custom", message: "Importe demasiado grande" });
      return z.NEVER;
    }
    return d.toFixed(2);
  });

/** Tasa anual en % (0–100) con hasta 4 decimales. */
export const ratePct = z
  .string()
  .trim()
  .transform((raw, ctx) => {
    const s = raw.replace(",", ".").replace("%", "");
    if (s === "") return "0";
    if (!/^\d{1,3}(\.\d{1,4})?$/.test(s) || Number(s) > 100) {
      ctx.addIssue({ code: "custom", message: "Tasa inválida (0 a 100 %)" });
      return z.NEVER;
    }
    return s;
  });

export const isoDate = z
  .string({ error: "Selecciona una fecha" })
  .refine(isISODate, "Fecha inválida");

const uuid = z.uuid({ error: "Selección inválida" });
const optionalUuid = z
  .string()
  .nullish()
  .transform((v) => (v ? v : null))
  .pipe(z.uuid().nullable());

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Máximo ${max} caracteres`)
    .nullish()
    .transform((v) => (v ? v : null));

const hexColor = z.string().regex(/^#[0-9a-fA-F]{6}$/, "Color inválido");

// ---------------------------------------------------------------------
// Cuentas
// ---------------------------------------------------------------------
export const accountCreateSchema = z.object({
  name: z.string().trim().min(1, "Ingresa un nombre").max(60, "Máximo 60 caracteres"),
  account_type: z.enum(["checking", "savings", "cash", "wallet"], { error: "Selecciona un tipo" }),
  institution_id: optionalUuid,
  new_institution: optionalText(80),
  color: hexColor,
  icon: z.string().max(32).default("landmark"),
  is_default: z.boolean().default(false),
  opening_balance: signedAmount,
  opening_date: isoDate,
});
export type AccountCreateInput = z.input<typeof accountCreateSchema>;

export const accountUpdateSchema = z.object({
  id: uuid,
  name: z.string().trim().min(1, "Ingresa un nombre").max(60, "Máximo 60 caracteres"),
  account_type: z.enum(["checking", "savings", "cash", "wallet"]),
  institution_id: optionalUuid,
  new_institution: optionalText(80),
  color: hexColor,
});
export type AccountUpdateInput = z.input<typeof accountUpdateSchema>;

export const openingBalanceSchema = z.object({
  account_id: uuid,
  opening_balance: signedAmount,
  opening_date: isoDate,
});

// ---------------------------------------------------------------------
// Movimientos
// ---------------------------------------------------------------------
const statusSchema = z.enum(["pending", "confirmed"]);

export const incomeSchema = z.object({
  description: z.string().trim().min(1, "Ingresa un concepto").max(120),
  amount: positiveAmount,
  category_id: uuid,
  account_id: uuid,
  occurred_on: isoDate,
  status: statusSchema.default("confirmed"),
  notes: optionalText(500),
});
export type IncomeInput = z.input<typeof incomeSchema>;

export const expenseSchema = z
  .object({
    description: z.string().trim().min(1, "Ingresa un concepto").max(120),
    amount: positiveAmount,
    category_id: uuid,
    account_id: optionalUuid,
    credit_card_id: optionalUuid,
    occurred_on: isoDate,
    status: statusSchema.default("confirmed"),
    payment_method: z.enum(["cash", "debit", "transfer", "card", "other"], { error: "Selecciona un medio de pago" }),
    expense_type: z.enum(["fixed", "variable"]).default("variable"),
    notes: optionalText(500),
  })
  .superRefine((v, ctx) => {
    // Con tarjeta de crédito el consumo sube la deuda de la tarjeta; no toca cuentas.
    if (v.payment_method === "card") {
      if (!v.credit_card_id) ctx.addIssue({ code: "custom", message: "Selecciona la tarjeta", path: ["credit_card_id"] });
    } else if (!v.account_id) {
      ctx.addIssue({ code: "custom", message: "Selecciona la cuenta", path: ["account_id"] });
    }
  })
  .transform((v) =>
    v.payment_method === "card" ? { ...v, account_id: null } : { ...v, credit_card_id: null },
  );
export type ExpenseInput = z.input<typeof expenseSchema>;

export const transferSchema = z
  .object({
    account_id: uuid,
    counter_account_id: uuid,
    amount: positiveAmount,
    occurred_on: isoDate,
    description: z.string().trim().min(1, "Ingresa un concepto").max(120).default("Transferencia entre cuentas"),
    notes: optionalText(500),
  })
  .refine((v) => v.account_id !== v.counter_account_id, {
    message: "La cuenta destino debe ser distinta del origen",
    path: ["counter_account_id"],
  });
export type TransferInput = z.input<typeof transferSchema>;

export const adjustmentSchema = z.object({
  account_id: uuid,
  direction: z.enum(["increase", "decrease"]),
  amount: positiveAmount,
  occurred_on: isoDate,
  reason: z.string().trim().min(3, "Explica el motivo del ajuste").max(300),
});
export type AdjustmentInput = z.input<typeof adjustmentSchema>;

export const transactionIdSchema = z.object({ id: uuid });

// ---------------------------------------------------------------------
// Categorías y perfil
// ---------------------------------------------------------------------
export const categorySchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(1, "Ingresa un nombre").max(40),
  kind: z.enum(["income", "expense"]),
  color: hexColor,
});
export type CategoryInput = z.input<typeof categorySchema>;

export const profileSchema = z.object({
  full_name: z.string().trim().max(120).optional().transform((v) => (v ? v : null)),
});

// ---------------------------------------------------------------------
// Autenticación
// ---------------------------------------------------------------------
export const loginSchema = z.object({
  email: z.email("Correo inválido"),
  password: z.string().min(1, "Ingresa tu contraseña"),
});

export const passwordSchema = z
  .string()
  .min(8, "Mínimo 8 caracteres")
  .max(72, "Máximo 72 caracteres")
  .regex(/[A-Za-z]/, "Incluye al menos una letra")
  .regex(/\d/, "Incluye al menos un número");

export const registerSchema = z
  .object({
    full_name: z.string().trim().min(2, "Ingresa tu nombre").max(120),
    email: z.email("Correo inválido"),
    password: passwordSchema,
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden", path: ["confirm"] });

export const recoverSchema = z.object({ email: z.email("Correo inválido") });

export const newPasswordSchema = z
  .object({ password: passwordSchema, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Las contraseñas no coinciden", path: ["confirm"] });

// ---------------------------------------------------------------------
// Tarjetas de crédito
// ---------------------------------------------------------------------
const dayOfMonth = z.coerce.number({ error: "Día inválido" }).int().min(1, "Día 1 a 31").max(31, "Día 1 a 31");

const cardBase = {
  name: z.string().trim().min(1, "Ingresa un nombre").max(60),
  institution_id: optionalUuid,
  new_institution: optionalText(80),
  network: z.enum(["visa", "mastercard", "amex", "diners", "discover", "other"]),
  credit_limit: nonNegativeAmount,
  statement_day: dayOfMonth,
  due_day: dayOfMonth,
  // Solo los últimos 4 dígitos como identificador visual. Nunca el número completo, CVV ni PIN.
  last4: z
    .string()
    .trim()
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || /^\d{4}$/.test(v), "Solo los últimos 4 dígitos"),
  color: hexColor,
};

export const cardCreateSchema = z.object({
  ...cardBase,
  opening_debt: nonNegativeAmount,
  opening_date: isoDate,
});
export type CardCreateInput = z.input<typeof cardCreateSchema>;

export const cardUpdateSchema = z.object({ id: uuid, ...cardBase });

export const cardOpeningSchema = z.object({
  credit_card_id: uuid,
  opening_debt: nonNegativeAmount,
  opening_date: isoDate,
});

export const cardPurchaseSchema = z
  .object({
    credit_card_id: uuid,
    description: z.string().trim().min(1, "Ingresa un concepto").max(120),
    merchant: optionalText(80),
    category_id: optionalUuid,
    amount: positiveAmount,
    purchase_date: isoDate,
    installments: z.coerce.number().int().min(1, "Mínimo 1 cuota").max(72, "Máximo 72 cuotas"),
    annual_rate: ratePct,
    first_due_date: isoDate,
    is_prior: z.boolean().default(false),
    notes: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (!v.is_prior && !v.category_id) ctx.addIssue({ code: "custom", message: "Selecciona una categoría", path: ["category_id"] });
    if (!v.is_prior && v.installments < 2)
      ctx.addIssue({ code: "custom", message: "Un diferido tiene al menos 2 cuotas", path: ["installments"] });
    if (v.first_due_date < v.purchase_date)
      ctx.addIssue({ code: "custom", message: "La primera cuota no puede ser antes de la compra", path: ["first_due_date"] });
  });
export type CardPurchaseInput = z.input<typeof cardPurchaseSchema>;

export const cardPaymentSchema = z.object({
  credit_card_id: uuid,
  account_id: uuid,
  amount: positiveAmount,
  occurred_on: isoDate,
  payment_kind: z.enum(["minimum", "period", "total", "other"]).default("other"),
  notes: optionalText(500),
});
export type CardPaymentInput = z.input<typeof cardPaymentSchema>;

// ---------------------------------------------------------------------
// Préstamos
// ---------------------------------------------------------------------
export const loanCreateSchema = z
  .object({
    lender: z.string().trim().min(1, "Ingresa la entidad o persona").max(80),
    name: z.string().trim().min(1, "Ingresa un nombre").max(60),
    loan_type: z.enum(["amortized", "simple"]),
    original_principal: z
      .string()
      .trim()
      .nullish()
      .transform((v) => v ?? "")
      .pipe(nonNegativeAmount)
      .transform((v) => (v === "0.00" ? null : v)),
    outstanding: positiveAmount,
    annual_rate: ratePct,
    frequency: z.enum(["weekly", "biweekly", "monthly", "quarterly"]).default("monthly"),
    remaining_installments: z.coerce.number().int().min(1, "Mínimo 1 cuota").max(600).optional(),
    start_date: isoDate,
    first_due_date: z.string().nullish(),
    account_id: optionalUuid,
    disburse: z.boolean().default(false),
    notes: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.loan_type === "amortized") {
      if (!v.remaining_installments)
        ctx.addIssue({ code: "custom", message: "Indica las cuotas pendientes", path: ["remaining_installments"] });
      if (!v.first_due_date || !isISODate(v.first_due_date))
        ctx.addIssue({ code: "custom", message: "Indica el próximo vencimiento", path: ["first_due_date"] });
    }
    if (v.disburse && !v.account_id)
      ctx.addIssue({ code: "custom", message: "Indica la cuenta donde lo recibiste", path: ["account_id"] });
  });
export type LoanCreateInput = z.input<typeof loanCreateSchema>;

export const loanPaymentSchema = z
  .object({
    loan_id: uuid,
    installment_id: optionalUuid,
    account_id: uuid,
    occurred_on: isoDate,
    principal: nonNegativeAmount,
    interest: nonNegativeAmount,
    notes: optionalText(500),
  })
  .refine((v) => Number(v.principal) + Number(v.interest) > 0, {
    message: "El pago debe ser mayor que 0",
    path: ["principal"],
  });
export type LoanPaymentInput = z.input<typeof loanPaymentSchema>;

// ---------------------------------------------------------------------
// Recurrentes
// ---------------------------------------------------------------------
export const recurringSchema = z
  .object({
    id: optionalUuid,
    kind: z.enum(["income", "expense"]),
    name: z.string().trim().min(1, "Ingresa un nombre").max(80),
    amount: positiveAmount,
    category_id: uuid,
    frequency: z.enum(["weekly", "biweekly", "semimonthly", "monthly", "yearly"]),
    next_date: isoDate,
    account_id: optionalUuid,
    credit_card_id: optionalUuid,
    is_subscription: z.boolean().default(false),
    notes: optionalText(500),
  })
  .superRefine((v, ctx) => {
    if (v.account_id && v.credit_card_id)
      ctx.addIssue({ code: "custom", message: "Elige cuenta o tarjeta, no ambas", path: ["credit_card_id"] });
    if (v.kind === "income" && v.credit_card_id)
      ctx.addIssue({ code: "custom", message: "Un ingreso no puede ir a una tarjeta", path: ["credit_card_id"] });
  });
export type RecurringInput = z.input<typeof recurringSchema>;

export const registerRecurringSchema = z
  .object({
    rule_id: uuid,
    occurred_on: isoDate,
    amount: positiveAmount,
    account_id: optionalUuid,
    credit_card_id: optionalUuid,
    status: z.enum(["pending", "confirmed"]).default("confirmed"),
  })
  .refine((v) => !!v.account_id !== !!v.credit_card_id, {
    message: "Selecciona una cuenta o una tarjeta",
    path: ["account_id"],
  });
export type RegisterRecurringInput = z.input<typeof registerRecurringSchema>;

// ---------------------------------------------------------------------
// Presupuestos y metas
// ---------------------------------------------------------------------
const monthStart = z
  .string()
  .refine((v) => isISODate(v) && v.endsWith("-01"), "Mes inválido");

export const budgetSchema = z.object({
  id: optionalUuid,
  category_id: uuid,
  period_month: monthStart,
  amount: positiveAmount,
});
export type BudgetInput = z.input<typeof budgetSchema>;

export const goalSchema = z.object({
  id: optionalUuid,
  name: z.string().trim().min(1, "Ingresa un nombre").max(60),
  target_amount: positiveAmount,
  target_date: z
    .string()
    .nullish()
    .transform((v) => (v ? v : null))
    .refine((v) => v === null || isISODate(v), "Fecha inválida"),
  color: hexColor,
  notes: optionalText(500),
});
export type GoalInput = z.input<typeof goalSchema>;

export const goalAllocationSchema = z.object({
  goal_id: uuid,
  direction: z.enum(["reserve", "release"]),
  amount: positiveAmount,
  occurred_on: isoDate,
  note: optionalText(200),
});
export type GoalAllocationInput = z.input<typeof goalAllocationSchema>;
