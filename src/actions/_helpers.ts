import "server-only";
import type { PostgrestError } from "@supabase/supabase-js";
import type { ZodError } from "zod";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import type { ActionResult } from "@/lib/types";

export class UnauthorizedError extends Error {}

/** Autorización en servidor: toda Server Action valida la sesión con getUser(). */
export async function requireUser() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) throw new UnauthorizedError("Sesión expirada");
  return { supabase, user };
}

export function validationError(error: ZodError): ActionResult<never> {
  const fieldErrors: Record<string, string[]> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "_form";
    (fieldErrors[key] ??= []).push(issue.message);
  }
  return { ok: false, error: "Revisa los campos marcados", fieldErrors };
}

/** Traduce errores de PostgreSQL/PostgREST a mensajes claros sin filtrar detalles internos. */
export function dbError(error: PostgrestError | { code?: string; message: string }): ActionResult<never> {
  switch (error.code) {
    case "23505":
      return { ok: false, error: error.message.includes("ya están cargados") ? error.message : "Ya existe un registro con ese nombre." };
    case "23503":
      return { ok: false, error: error.message.includes("demo") ? error.message : "El registro está en uso por otros movimientos." };
    case "23514":
      return { ok: false, error: "Los datos no cumplen las reglas financieras requeridas." };
    case "42501":
      return { ok: false, error: "No tienes permiso para esta operación." };
    case "22023":
    case "P0002":
      return { ok: false, error: error.message };
    default:
      console.error("[db]", error.code, error.message);
      return { ok: false, error: "No se pudo guardar. Intenta nuevamente." };
  }
}

export async function runAction<T>(fn: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> {
  try {
    return await fn();
  } catch (e) {
    if (e instanceof UnauthorizedError) return { ok: false, error: "Tu sesión expiró. Vuelve a iniciar sesión." };
    console.error("[action]", e);
    return { ok: false, error: "Ocurrió un error inesperado." };
  }
}
