"use server";

import { revalidatePath } from "next/cache";
import {
  adjustmentSchema,
  expenseSchema,
  incomeSchema,
  transactionIdSchema,
  transferSchema,
} from "@/lib/validation/schemas";
import { directionFor } from "@/lib/finance/rules";
import type { ActionResult } from "@/lib/types";
import { dbError, requireUser, runAction, validationError } from "./_helpers";

/**
 * Todas las escrituras de movimientos pasan por aquí. Los saldos no se
 * actualizan manualmente: se derivan en la base de datos, por lo que
 * crear, editar, confirmar o anular mantiene la consistencia.
 */

function revalidateFinance() {
  revalidatePath("/", "layout");
}

export async function createIncome(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = incomeSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const v = parsed.data;

    const { error } = await supabase.from("financial_transactions").insert({
      kind: "income",
      direction: directionFor("income"),
      status: v.status,
      account_id: v.account_id,
      category_id: v.category_id,
      amount: v.amount,
      occurred_on: v.occurred_on,
      description: v.description,
      notes: v.notes,
    });
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: v.status === "pending" ? "Ingreso programado" : "Ingreso registrado" };
  });
}

export async function createExpense(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = expenseSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const v = parsed.data;

    const { error } = await supabase.from("financial_transactions").insert({
      kind: "expense",
      direction: directionFor("expense"),
      status: v.status,
      account_id: v.account_id,
      category_id: v.category_id,
      amount: v.amount,
      occurred_on: v.occurred_on,
      description: v.description,
      notes: v.notes,
      payment_method: v.payment_method,
      expense_type: v.expense_type,
    });
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: v.status === "pending" ? "Gasto programado" : "Gasto registrado" };
  });
}

export async function createTransfer(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = transferSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const v = parsed.data;

    // Una sola fila: origen (direction -1) y destino (counter_account_id).
    // No tiene categoría ni cuenta como ingreso o gasto.
    const { error } = await supabase.from("financial_transactions").insert({
      kind: "transfer",
      direction: directionFor("transfer"),
      status: "confirmed",
      account_id: v.account_id,
      counter_account_id: v.counter_account_id,
      amount: v.amount,
      occurred_on: v.occurred_on,
      description: v.description,
      notes: v.notes,
    });
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: "Transferencia registrada" };
  });
}

export async function createAdjustment(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = adjustmentSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const v = parsed.data;

    const { error } = await supabase.from("financial_transactions").insert({
      kind: "adjustment",
      direction: directionFor("adjustment", v.direction === "increase" ? 1 : -1),
      status: "confirmed",
      account_id: v.account_id,
      amount: v.amount,
      occurred_on: v.occurred_on,
      description: v.direction === "increase" ? "Ajuste de saldo (+)" : "Ajuste de saldo (−)",
      reason: v.reason,
    });
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: "Ajuste registrado" };
  });
}

/** Edición: el tipo (kind) no cambia; se valida con el esquema correspondiente. */
export async function updateTransaction(
  id: string,
  kind: "income" | "expense" | "transfer",
  input: unknown,
): Promise<ActionResult> {
  return runAction(async () => {
    const idParsed = transactionIdSchema.safeParse({ id });
    if (!idParsed.success) return validationError(idParsed.error);
    const { supabase } = await requireUser();

    let patch: Record<string, unknown>;
    if (kind === "income") {
      const p = incomeSchema.safeParse(input);
      if (!p.success) return validationError(p.error);
      const v = p.data;
      patch = {
        status: v.status, account_id: v.account_id, category_id: v.category_id, amount: v.amount,
        occurred_on: v.occurred_on, description: v.description, notes: v.notes,
      };
    } else if (kind === "expense") {
      const p = expenseSchema.safeParse(input);
      if (!p.success) return validationError(p.error);
      const v = p.data;
      patch = {
        status: v.status, account_id: v.account_id, category_id: v.category_id, amount: v.amount,
        occurred_on: v.occurred_on, description: v.description, notes: v.notes,
        payment_method: v.payment_method, expense_type: v.expense_type,
      };
    } else {
      const p = transferSchema.safeParse(input);
      if (!p.success) return validationError(p.error);
      const v = p.data;
      patch = {
        account_id: v.account_id, counter_account_id: v.counter_account_id, amount: v.amount,
        occurred_on: v.occurred_on, description: v.description, notes: v.notes,
      };
    }

    const { data, error } = await supabase
      .from("financial_transactions")
      .update(patch)
      .eq("id", idParsed.data.id)
      .eq("kind", kind)
      .neq("status", "void")
      .select("id");
    if (error) return dbError(error);
    if (!data?.length) return { ok: false, error: "El movimiento no existe o está anulado." };

    revalidateFinance();
    return { ok: true, message: "Movimiento actualizado" };
  });
}

/** Confirma un movimiento pendiente (a partir de aquí afecta el saldo real). */
export async function confirmTransaction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = transactionIdSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();

    const { data, error } = await supabase
      .from("financial_transactions")
      .update({ status: "confirmed" })
      .eq("id", parsed.data.id)
      .eq("status", "pending")
      .select("id");
    if (error) return dbError(error);
    if (!data?.length) return { ok: false, error: "El movimiento ya no está pendiente." };

    revalidateFinance();
    return { ok: true, message: "Movimiento confirmado" };
  });
}

/**
 * Anula un movimiento. No se borra físicamente: queda en el historial y
 * en la auditoría, y deja de afectar saldos y reportes.
 */
export async function voidTransaction(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = transactionIdSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();

    const { data, error } = await supabase
      .from("financial_transactions")
      .update({ status: "void" })
      .eq("id", parsed.data.id)
      .neq("status", "void")
      .neq("kind", "opening") // el saldo inicial se cambia desde la cuenta
      .select("id");
    if (error) return dbError(error);
    if (!data?.length) return { ok: false, error: "No se pudo anular este movimiento." };

    revalidateFinance();
    return { ok: true, message: "Movimiento anulado" };
  });
}
