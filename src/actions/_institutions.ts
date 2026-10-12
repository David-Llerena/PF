import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActionResult } from "@/lib/types";
import { dbError } from "./_helpers";

/**
 * Usa una institución existente (catálogo o propia) o crea una nueva del
 * usuario. No es una Server Action: solo se llama desde acciones validadas.
 */
export async function resolveInstitution(
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

