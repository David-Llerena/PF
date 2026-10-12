"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@/components/ui/primitives";
import { loginSchema } from "@/lib/validation/schemas";
import { signIn } from "@/actions/auth";

type Values = z.infer<typeof loginSchema>;

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [serverError, setServerError] = useState<string | null>(
    linkError ? "El enlace no es válido o expiró. Solicita uno nuevo." : null,
  );
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const res = await signIn(values, next);
    if (res && !res.ok) setServerError(res.error);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Bienvenido de nuevo</CardTitle>
        <CardDescription>Ingresa para ver el estado de tus finanzas.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field label="Correo electrónico" htmlFor="email" error={errors.email?.message}>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              inputMode="email"
              aria-invalid={!!errors.email}
              {...register("email")}
            />
          </Field>
          <Field label="Contraseña" htmlFor="password" error={errors.password?.message}>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
          </Field>
          <div className="-mt-1 text-right">
            <Link href="/recuperar" className="text-sm text-primary hover:underline">
              ¿Olvidaste tu contraseña?
            </Link>
          </div>
          {serverError && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}
          <Button type="submit" size="lg" loading={isSubmitting}>
            Iniciar sesión
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ¿No tienes cuenta?{" "}
            <Link href="/registro" className="font-medium text-primary hover:underline">
              Regístrate
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
