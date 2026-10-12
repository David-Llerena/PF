"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/primitives";
import { accountCreateSchema } from "@/lib/validation/schemas";
import { createAccount, updateAccount } from "@/actions/accounts";
import { ACCOUNT_COLORS, ACCOUNT_TYPE_LABEL } from "@/lib/constants";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Account, AccountType, Institution } from "@/lib/types";

const OTHER = "__other__";

const ICON_BY_TYPE: Record<AccountType, string> = {
  checking: "landmark",
  savings: "piggy-bank",
  cash: "banknote",
  wallet: "smartphone",
};

type CreateValues = z.input<typeof accountCreateSchema>;

export function AccountForm({
  institutions,
  account,
  isFirst,
  onDone,
}: {
  institutions: Institution[];
  account?: Account;
  isFirst?: boolean;
  onDone?: (id?: string) => void;
}) {
  const [institutionChoice, setInstitutionChoice] = useState<string>(account?.institution_id ?? "");

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CreateValues, unknown, z.output<typeof accountCreateSchema>>({
    // En edición los campos de saldo inicial no se muestran; sus valores por
    // defecto son válidos y el servidor valida con accountUpdateSchema.
    resolver: zodResolver(accountCreateSchema),
    defaultValues: {
      name: account?.name ?? "",
      account_type: account?.account_type ?? "savings",
      institution_id: account?.institution_id ?? "",
      new_institution: "",
      color: account?.color ?? ACCOUNT_COLORS[0],
      icon: account?.icon ?? "piggy-bank",
      is_default: isFirst ?? false,
      opening_balance: "",
      opening_date: todayISO(),
    },
  });

  const color = watch("color");
  const type = watch("account_type");

  const onSubmit = handleSubmit(async (values) => {
    const base = {
      ...values,
      institution_id: institutionChoice && institutionChoice !== OTHER ? institutionChoice : null,
      new_institution: institutionChoice === OTHER ? values.new_institution : null,
      icon: ICON_BY_TYPE[values.account_type],
    };

    const res = account ? await updateAccount({ ...base, id: account.id }) : await createAccount(base);
    if (!res.ok) {
      if (res.fieldErrors) {
        for (const [k, msgs] of Object.entries(res.fieldErrors)) {
          if (msgs?.[0]) setError(k as keyof CreateValues, { message: msgs[0] });
        }
      }
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? "Guardado");
    onDone?.(res.data && "id" in res.data ? (res.data as { id: string }).id : account?.id);
  });

  const systemInst = institutions.filter((i) => !i.user_id);
  const ownInst = institutions.filter((i) => i.user_id);
  const needsInstitution = type === "checking" || type === "savings";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Tipo de cuenta" htmlFor="account_type" error={errors.account_type?.message}>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {(Object.keys(ACCOUNT_TYPE_LABEL) as AccountType[]).map((t) => (
            <label
              key={t}
              className={cn(
                "flex h-11 cursor-pointer items-center justify-center rounded-xl border text-sm font-medium transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring",
                type === t ? "border-primary bg-primary-soft text-accent-foreground" : "hover:bg-muted",
              )}
            >
              <input type="radio" value={t} className="sr-only" {...register("account_type")} />
              {ACCOUNT_TYPE_LABEL[t]}
            </label>
          ))}
        </div>
      </Field>

      {needsInstitution && (
        <Field label="Banco o institución" htmlFor="institution">
          <NativeSelect
            id="institution"
            value={institutionChoice}
            onChange={(e) => setInstitutionChoice(e.target.value)}
          >
            <option value="">Sin especificar</option>
            {ownInst.length > 0 && (
              <optgroup label="Mis instituciones">
                {ownInst.map((i) => (
                  <option key={i.id} value={i.id}>
                    {i.name}
                  </option>
                ))}
              </optgroup>
            )}
            <optgroup label="Ecuador">
              {systemInst.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </optgroup>
            <option value={OTHER}>Otra institución…</option>
          </NativeSelect>
        </Field>
      )}

      {needsInstitution && institutionChoice === OTHER && (
        <Field label="Nombre de la institución" htmlFor="new_institution" error={errors.new_institution?.message}>
          <Input id="new_institution" placeholder="Ej. Cooperativa 29 de Octubre" {...register("new_institution")} />
        </Field>
      )}

      <Field label="Nombre de la cuenta" htmlFor="name" error={errors.name?.message}>
        <Input
          id="name"
          placeholder={type === "cash" ? "Ej. Efectivo" : "Ej. Ahorros Pichincha"}
          aria-invalid={!!errors.name}
          {...register("name")}
        />
      </Field>

      {!account && (
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Saldo actual"
            htmlFor="opening_balance"
            error={errors.opening_balance?.message}
            hint="Lo que tienes hoy"
          >
            <Input
              id="opening_balance"
              inputMode="decimal"
              placeholder="0.00"
              className="tabular"
              aria-invalid={!!errors.opening_balance}
              {...register("opening_balance")}
            />
          </Field>
          <Field label="A la fecha" htmlFor="opening_date" error={errors.opening_date?.message}>
            <Input id="opening_date" type="date" {...register("opening_date")} />
          </Field>
        </div>
      )}
      {!account && (
        <p className="-mt-2 text-xs text-muted-foreground">
          Se registra como <b>saldo inicial</b>: no cuenta como ingreso del mes ni crea movimientos históricos.
        </p>
      )}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Color</legend>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setValue("color", c)}
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              className="flex size-8 items-center justify-center rounded-full ring-offset-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              style={{ backgroundColor: c }}
            >
              {color === c && <Check className="size-4 text-white" />}
            </button>
          ))}
        </div>
      </fieldset>

      {!account && (
        <label className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("is_default")} />
          Usar como cuenta predeterminada para nuevos movimientos
        </label>
      )}

      <Button type="submit" size="lg" loading={isSubmitting}>
        {account ? "Guardar cambios" : "Crear cuenta"}
      </Button>
    </form>
  );
}
