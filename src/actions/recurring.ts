"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { recurringSchema, registerRecurringSchema } from "@/lib/validation/schemas";
import { dayOf } from "@/lib/dates";
import type { ActionResult } from "@/lib/types";
import { dbError, requireUser, runAction, validationError } from "./_helpers";

function revalidateFinance() {
  revalidatePath("/", "layout");
}

const idSchema = z.object({ id: z.uuid() });

export async function saveRecurring(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = recurringSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const { id, ...v } = parsed.data;

    const row = {
      kind: v.kind,
      name: v.name,
      amount: v.amount,
      category_id: v.category_id,
      frequency: v.frequency,
      next_date: v.next_date,
      anchor_day: dayOf(v.next_date),
      account_id: v.account_id,
      credit_card_id: v.kind === "income" ? null : v.credit_card_id,
      is_subscription: v.is_subscription,
      notes: v.notes,
    };

    const { error } = id
      ? await supabase.from("recurring_rules").update(row).eq("id", id)
      : await supabase.from("recurring_rules").insert(row);
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: id ? "Recurrente actualizado" : "Recurrente creado" };
  });
}

/** Crea el movimiento real de la ocurrencia actual y avanza la próxima fecha. */
export async function registerRecurring(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = registerRecurringSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const v = parsed.data;

    const { error } = await supabase.rpc("register_recurring", {
      p_rule_id: v.rule_id,
      p_date: v.occurred_on,
      p_amount: v.amount,
      p_account_id: v.account_id,
      p_credit_card_id: v.credit_card_id,
      p_status: v.status,
    });
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: v.status === "pending" ? "Registrado como pendiente" : "Movimiento registrado" };
  });
}

export async function skipRecurring(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();

    const { error } = await supabase.rpc("skip_recurring", { p_rule_id: parsed.data.id });
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: "Ocurrencia omitida" };
  });
}

export async function setRecurringActive(input: unknown, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();

    const { error } = await supabase.from("recurring_rules").update({ is_active: active }).eq("id", parsed.data.id);
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: active ? "Reanudado" : "Pausado" };
  });
}

export async function deleteRecurring(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();

    // Los movimientos ya registrados se conservan (recurring_rule_id → null).
    const { error } = await supabase.from("recurring_rules").delete().eq("id", parsed.data.id);
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: "Recurrente eliminado" };
  });
}
