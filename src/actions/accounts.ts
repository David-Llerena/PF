"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { accountCreateSchema, accountUpdateSchema, openingBalanceSchema } from "@/lib/validation/schemas";
import type { ActionResult } from "@/lib/types";
import type { SupabaseClient } from "@supabase/supabase-js";
import { dbError, requireUser, runAction, validationError } from "./_helpers";

async function resolveInstitution(
  supabase: SupabaseClient,
  userId: string,
  institutionId: string | null,
  newInstitution: string | null,
): Promise<{ id: string | null } | { error: ActionResult<never> }> {
  if (!newInstitution) return { id: institutionId };

  const name = newInstitution.trim();
  // Reutiliza una institución existente con el mismo nombre (catálogo o propia).
  const { data: existing } = await supabase
    .from("financial_institutions")
    .select("id")
    .ilike("name", name.replace(/[%_\\]/g, (c) => `\\${c}`))
    .limit(1)
    .maybeSingle();
  if (existing) return { id: existing.id };

  const { data, error } = await supabase
    .from("financial_institutions")
    .insert({ name, user_id: userId })
    .select("id")
    .single();
  if (error) return { error: dbError(error) };
  return { id: data.id };
}

function revalidateFinance() {
  revalidatePath("/", "layout");
}

export async function createAccount(input: unknown): Promise<ActionResult<{ id: string }>> {
  return runAction<{ id: string }>(async () => {
    const parsed = accountCreateSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase, user } = await requireUser();
    const v = parsed.data;

    const inst = await resolveInstitution(supabase, user.id, v.institution_id, v.new_institution);
    if ("error" in inst) return inst.error;

    const { data, error } = await supabase.rpc("create_account", {
      p_name: v.name,
      p_account_type: v.account_type,
      p_institution_id: inst.id,
      p_currency: "USD",
      p_color: v.color,
      p_icon: v.icon,
      p_is_default: v.is_default,
      p_opening_balance: v.opening_balance,
      p_opening_date: v.opening_date,
    });
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, data: { id: data as string }, message: "Cuenta creada" };
  });
}

export async function updateAccount(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = accountUpdateSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase, user } = await requireUser();
    const v = parsed.data;

    const inst = await resolveInstitution(supabase, user.id, v.institution_id, v.new_institution);
    if ("error" in inst) return inst.error;

    const { error } = await supabase
      .from("accounts")
      .update({ name: v.name, account_type: v.account_type, institution_id: inst.id, color: v.color })
      .eq("id", v.id);
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: "Cuenta actualizada" };
  });
}

export async function setOpeningBalance(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = openingBalanceSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();

    const { error } = await supabase.rpc("set_opening_balance", {
      p_account_id: parsed.data.account_id,
      p_amount: parsed.data.opening_balance,
      p_date: parsed.data.opening_date,
    });
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: "Saldo inicial actualizado" };
  });
}

const idSchema = z.object({ id: z.uuid() });

export async function setAccountActive(input: unknown, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();

    const patch = active ? { is_active: true } : { is_active: false, is_default: false };
    const { error } = await supabase.from("accounts").update(patch).eq("id", parsed.data.id);
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: active ? "Cuenta reactivada" : "Cuenta desactivada" };
  });
}

export async function setDefaultAccount(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = idSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();

    const { error } = await supabase.rpc("set_default_account", { p_account_id: parsed.data.id });
    if (error) return dbError(error);

    revalidateFinance();
    return { ok: true, message: "Cuenta predeterminada actualizada" };
  });
}
