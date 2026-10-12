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

export const expenseSchema = z.object({
  description: z.string().trim().min(1, "Ingresa un concepto").max(120),
  amount: positiveAmount,
  category_id: uuid,
  account_id: uuid,
  occurred_on: isoDate,
  status: statusSchema.default("confirmed"),
  // "card" (tarjeta de crédito) se habilita en Fase 2 junto con el
  // módulo de tarjetas: aquí descontaría de una cuenta bancaria.
  payment_method: z.enum(["cash", "debit", "transfer", "other"], { error: "Selecciona un medio de pago" }),
  expense_type: z.enum(["fixed", "variable"]).default("variable"),
  notes: optionalText(500),
});
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
