"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { categorySchema, profileSchema } from "@/lib/validation/schemas";
import type { ActionResult } from "@/lib/types";
import { dbError, requireUser, runAction, validationError } from "./_helpers";

export async function updateProfile(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = profileSchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase, user } = await requireUser();

    const { error } = await supabase.from("profiles").update({ full_name: parsed.data.full_name }).eq("id", user.id);
    if (error) return dbError(error);
    revalidatePath("/", "layout");
    return { ok: true, message: "Perfil actualizado" };
  });
}

export async function completeOnboarding(): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase, user } = await requireUser();
    const { error } = await supabase.from("profiles").update({ onboarding_completed: true }).eq("id", user.id);
    if (error) return dbError(error);
    revalidatePath("/", "layout");
    return { ok: true };
  });
}

export async function saveCategory(input: unknown): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = categorySchema.safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();
    const { id, name, kind, color } = parsed.data;

    const { error } = id
      ? await supabase.from("transaction_categories").update({ name, color }).eq("id", id)
      : await supabase.from("transaction_categories").insert({ name, kind, color });
    if (error) return dbError(error);

    revalidatePath("/", "layout");
    return { ok: true, message: id ? "Categoría actualizada" : "Categoría creada" };
  });
}

export async function setCategoryActive(input: unknown, active: boolean): Promise<ActionResult> {
  return runAction(async () => {
    const parsed = z.object({ id: z.uuid() }).safeParse(input);
    if (!parsed.success) return validationError(parsed.error);
    const { supabase } = await requireUser();

    const { error } = await supabase.from("transaction_categories").update({ is_active: active }).eq("id", parsed.data.id);
    if (error) return dbError(error);
    revalidatePath("/", "layout");
    return { ok: true, message: active ? "Categoría activada" : "Categoría desactivada" };
  });
}

export async function loadDemoData(): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("load_demo_data");
    if (error) return dbError(error);
    revalidatePath("/", "layout");
    return { ok: true, message: "Datos de demostración cargados" };
  });
}

export async function clearDemoData(): Promise<ActionResult> {
  return runAction(async () => {
    const { supabase } = await requireUser();
    const { error } = await supabase.rpc("clear_demo_data");
    if (error) return dbError(error);
    revalidatePath("/", "layout");
    return { ok: true, message: "Datos de demostración eliminados" };
  });
}
