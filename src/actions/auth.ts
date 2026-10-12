"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getSiteUrl } from "@/lib/env";
import { loginSchema, newPasswordSchema, recoverSchema, registerSchema } from "@/lib/validation/schemas";
import type { ActionResult } from "@/lib/types";

function safeNext(next: unknown): string {
  // Evita redirecciones abiertas: solo rutas internas.
  return typeof next === "string" && next.startsWith("/") && !next.startsWith("//") ? next : "/";
}

function translateAuthError(message: string): string {
  const m = message.toLowerCase();
  if (m.includes("invalid login credentials")) return "Correo o contraseña incorrectos.";
  if (m.includes("email not confirmed")) return "Confirma tu correo antes de iniciar sesión.";
  if (m.includes("already registered") || m.includes("already been registered"))
    return "Ya existe una cuenta con ese correo.";
  if (m.includes("rate limit") || m.includes("too many")) return "Demasiados intentos. Espera unos minutos.";
  if (m.includes("weak") || m.includes("password")) return "La contraseña no cumple los requisitos de seguridad.";
  return "No se pudo completar la operación. Intenta nuevamente.";
}

export async function signIn(input: unknown, next?: string): Promise<ActionResult> {
  const parsed = loginSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) return { ok: false, error: translateAuthError(error.message) };

  redirect(safeNext(next));
}

export async function signUp(input: unknown): Promise<ActionResult> {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Datos inválidos" };

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.full_name },
      emailRedirectTo: `${getSiteUrl()}/auth/callback?next=/bienvenida`,
    },
  });
  if (error) return { ok: false, error: translateAuthError(error.message) };

  if (data.session) redirect("/bienvenida");
  return { ok: true, message: "Te enviamos un correo para confirmar tu cuenta." };
}

export async function requestPasswordReset(input: unknown): Promise<ActionResult> {
  const parsed = recoverSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Correo inválido" };

  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${getSiteUrl()}/auth/callback?next=/recuperar/nueva`,
  });
  // Respuesta idéntica exista o no la cuenta (evita enumeración de usuarios).
  return { ok: true, message: "Si el correo está registrado, recibirás un enlace para restablecer tu contraseña." };
}

export async function updatePassword(input: unknown): Promise<ActionResult> {
  const parsed = newPasswordSchema.safeParse(input);
  if (!parsed.success) return { ok: false, error: "Contraseña inválida" };

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "El enlace expiró. Solicita uno nuevo." };

  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, error: translateAuthError(error.message) };

  redirect("/");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
