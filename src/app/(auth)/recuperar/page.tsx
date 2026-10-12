"use client";

import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@/components/ui/primitives";
import { recoverSchema } from "@/lib/validation/schemas";
import { requestPasswordReset } from "@/actions/auth";

type Values = z.infer<typeof recoverSchema>;

export default function RecoverPage() {
  const [message, setMessage] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(recoverSchema) });

  const onSubmit = handleSubmit(async (values) => {
    const res = await requestPasswordReset(values);
    setMessage(res.ok ? (res.message ?? null) : res.error);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Recuperar contraseña</CardTitle>
        <CardDescription>Te enviaremos un enlace para crear una nueva contraseña.</CardDescription>
      </CardHeader>
      <CardContent>
        {message ? (
          <div className="space-y-4">
            <p className="rounded-xl bg-info-soft px-3 py-2 text-sm text-info">{message}</p>
            <Button asChild variant="outline" className="w-full">
              <Link href="/login">Volver al inicio de sesión</Link>
            </Button>
          </div>
        ) : (
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
            <Button type="submit" size="lg" loading={isSubmitting}>
              Enviar enlace
            </Button>
            <Link href="/login" className="text-center text-sm text-primary hover:underline">
              Volver
            </Link>
          </form>
        )}
      </CardContent>
    </Card>
  );
}
