"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@/components/ui/primitives";
import { registerSchema } from "@/lib/validation/schemas";
import { signUp } from "@/actions/auth";

type Values = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(registerSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const res = await signUp(values);
    if (!res) return;
    if (res.ok) setSent(res.message ?? "Revisa tu correo.");
    else setServerError(res.error);
  });

  if (sent) {
    return (
      <Card>
        <CardContent className="flex flex-col items-center gap-3 pt-8 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-income-soft text-income">
            <MailCheck className="size-6" />
          </span>
          <p className="font-semibold">Confirma tu correo</p>
          <p className="text-sm text-muted-foreground">{sent}</p>
          <Button asChild variant="outline" className="mt-2">
            <Link href="/login">Volver al inicio de sesión</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Crea tu cuenta</CardTitle>
        <CardDescription>Empieza con una base vacía; tú decides qué registrar.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field label="Nombre" htmlFor="full_name" error={errors.full_name?.message}>
            <Input id="full_name" autoComplete="name" aria-invalid={!!errors.full_name} {...register("full_name")} />
          </Field>
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
          <Field
            label="Contraseña"
            htmlFor="password"
            error={errors.password?.message}
            hint="Mínimo 8 caracteres, con letras y números."
          >
            <Input
              id="password"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.password}
              {...register("password")}
            />
          </Field>
          <Field label="Confirmar contraseña" htmlFor="confirm" error={errors.confirm?.message}>
            <Input
              id="confirm"
              type="password"
              autoComplete="new-password"
              aria-invalid={!!errors.confirm}
              {...register("confirm")}
            />
          </Field>
          {serverError && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}
          <Button type="submit" size="lg" loading={isSubmitting}>
            Crear cuenta
          </Button>
          <p className="text-center text-sm text-muted-foreground">
            ¿Ya tienes cuenta?{" "}
            <Link href="/login" className="font-medium text-primary hover:underline">
              Inicia sesión
            </Link>
          </p>
        </form>
      </CardContent>
    </Card>
  );
}
