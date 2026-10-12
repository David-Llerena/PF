"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { budgetSchema, goalAllocationSchema, goalSchema } from "@/lib/validation/schemas";
import { isISODate } from "@/lib/dates";
import type { ActionResult } from "@/lib/types";
import { dbError, requireUser, runAction, validationError } from "./_helpers";

function revalidateFinance() {
  revalidatePath("/", "layout");
}

const idSchema = z.object({ id: z.uuid() });

// ---------------------------------------------------------------------
// Presupuestos
// ---------------------------------------------------------------------
export async function saveBudget(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = budgetSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const { id, ...v } = parsed.data;

    const { error } = id
      ? await supabase.from("budgets").update({ amount: v.amount }).eq("id", id)
      : await supabase.from("budgets").insert(v);
    if (error) {
      if (error.code === "23505") return { ok: false, error: "Esa categoría ya tiene presupuesto este mes." };
      return dbError(error);
    }
    revalidateFinance();
    return { ok: true, message: id ? "Presupuesto actualizado" : "Presupuesto creado" };
  });
}

export async function deleteBudget(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const { error } = await supabase.from("budgets").delete().eq("id", parsed.data.id);
    if (error) return dbError(error);
    revalidateFinance();
    return { ok: true, message: "Presupuesto eliminado" };
  });
}

export async function copyBudgets(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = z
      .object({ from: z.string().refine(isISODate), to: z.string().refine(isISODate) })
      .safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const { data, error } = await supabase.rpc("copy_budgets", { p_from: parsed.data.from, p_to: parsed.data.to });
    if (error) return dbError(error);
    revalidateFinance();
    return { ok: true, message: Number(data) > 0 ? `Se copiaron ${data} presupuestos` : "No había presupuestos nuevos para copiar" };
  });
}

// ---------------------------------------------------------------------
// Metas
// ---------------------------------------------------------------------
export async function saveGoal(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = goalSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const { id, ...v } = parsed.data;
    const { error } = id
      ? await supabase.from("savings_goals").update(v).eq("id", id)
      : await supabase.from("savings_goals").insert(v);
    if (error) return dbError(error);
    revalidateFinance();
    return { ok: true, message: id ? "Meta actualizada" : "Meta creada" };
  });
}

/** Reservar o liberar dinero para una meta. No mueve dinero entre cuentas. */
export async function allocateGoal(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = goalAllocationSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const v = parsed.data;
    const amount = v.direction === "release" ? `-${v.amount}` : v.amount;
    const { error } = await supabase.rpc("allocate_to_goal", {
      p_goal_id: v.goal_id,
      p_amount: amount,
      p_date: v.occurred_on,
      p_note: v.note ?? "",
    });
    if (error) return dbError(error);
    revalidateFinance();
    return { ok: true, message: v.direction === "release" ? "Reserva liberada" : "Dinero reservado para la meta" };
  });
}

export async function archiveGoal(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("archive_goal", { p_goal_id: parsed.data.id });
    if (error) return dbError(error);
    revalidateFinance();
    return { ok: true, message: "Meta archivada y reserva liberada" };
  });
}
