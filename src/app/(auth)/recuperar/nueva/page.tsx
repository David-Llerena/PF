"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, Field, Input } from "@/components/ui/primitives";
import { newPasswordSchema } from "@/lib/validation/schemas";
import { updatePassword } from "@/actions/auth";

type Values = z.infer<typeof newPasswordSchema>;

export default function NewPasswordPage() {
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(newPasswordSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setServerError(null);
    const res = await updatePassword(values);
    if (res && !res.ok) setServerError(res.error);
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-xl">Nueva contraseña</CardTitle>
        <CardDescription>Elige una contraseña segura que no uses en otros sitios.</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
          <Field label="Nueva contraseña" htmlFor="password" error={errors.password?.message}>
            <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
          </Field>
          <Field label="Confirmar contraseña" htmlFor="confirm" error={errors.confirm?.message}>
            <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
          </Field>
          {serverError && (
            <p role="alert" className="rounded-xl bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {serverError}
            </p>
          )}
          <Button type="submit" size="lg" loading={isSubmitting}>
            Guardar contraseña
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
