"use client";

import { useMemo } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { expenseSchema, incomeSchema, transferSchema } from "@/lib/validation/schemas";
import { createExpense, createIncome, createTransfer, updateTransaction } from "@/actions/transactions";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AccountWithBalance, Category, Transaction } from "@/lib/types";

export type MovementKind = "expense" | "income" | "transfer";

type Props = {
  kind: MovementKind;
  accounts: AccountWithBalance[];
  categories: Category[];
  /** Si se pasa, el formulario edita ese movimiento. */
  transaction?: Transaction;
  defaultAccountId?: string;
  onDone?: () => void;
};

export function MovementKindTabs({
  value,
  onChange,
  disabled,
}: {
  value: MovementKind;
  onChange: (k: MovementKind) => void;
  disabled?: boolean;
}) {
  const tabs: { k: MovementKind; label: string; icon: React.ReactNode; active: string }[] = [
    { k: "expense", label: "Gasto", icon: <ArrowUpRight />, active: "bg-expense-soft text-expense" },
    { k: "income", label: "Ingreso", icon: <ArrowDownLeft />, active: "bg-income-soft text-income" },
    { k: "transfer", label: "Transferir", icon: <ArrowLeftRight />, active: "bg-info-soft text-info" },
  ];
  return (
    <div role="tablist" aria-label="Tipo de movimiento" className="grid grid-cols-3 gap-1 rounded-2xl bg-muted p-1">
      {tabs.map((t) => (
        <button
          key={t.k}
          type="button"
          role="tab"
          aria-selected={value === t.k}
          disabled={disabled && value !== t.k}
          onClick={() => onChange(t.k)}
          className={cn(
            "flex h-10 items-center justify-center gap-1.5 rounded-xl text-sm font-medium text-muted-foreground transition-colors disabled:opacity-40 [&_svg]:size-4",
            value === t.k && cn("shadow-sm", t.active),
          )}
        >
          {t.icon}
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function MovementForm(props: Props) {
  if (props.kind === "transfer") return <TransferForm {...props} />;
  return <FlowForm {...props} kind={props.kind} />;
}

/* -------------------------------------------------------------------------- */
/* Ingreso / Gasto                                                            */
/* -------------------------------------------------------------------------- */
type FlowValues = z.input<typeof expenseSchema>;

function FlowForm({
  kind,
  accounts,
  categories,
  transaction,
  defaultAccountId,
  onDone,
}: Props & { kind: "expense" | "income" }) {
  const schema = kind === "expense" ? expenseSchema : incomeSchema;
  const activeAccounts = accounts.filter((a) => a.is_active);
  const cats = categories.filter((c) => c.kind === kind && (c.is_active || c.id === transaction?.category_id));
  const fallbackAccount =
    defaultAccountId ?? activeAccounts.find((a) => a.is_default)?.id ?? activeAccounts[0]?.id ?? "";

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FlowValues, unknown, z.output<typeof expenseSchema>>({
    // El esquema de ingreso es un subconjunto del de gasto; se valida con el del tipo actual.
    resolver: zodResolver(schema as typeof expenseSchema),
    defaultValues: transaction
      ? {
          description: transaction.description,
          amount: transaction.amount,
          category_id: transaction.category_id ?? "",
          account_id: transaction.account_id,
          occurred_on: transaction.occurred_on,
          status: transaction.status === "pending" ? "pending" : "confirmed",
          payment_method: (transaction.payment_method as FlowValues["payment_method"]) ?? "debit",
          expense_type: transaction.expense_type ?? "variable",
          notes: transaction.notes ?? "",
        }
      : {
          description: "",
          amount: "",
          category_id: "",
          account_id: fallbackAccount,
          occurred_on: todayISO(),
          status: "confirmed",
          payment_method: "debit",
          expense_type: "variable",
          notes: "",
        },
  });

  const status = watch("status");
  const occurredOn = watch("occurred_on");
  const isFuture = occurredOn > todayISO();

  const onSubmit = handleSubmit(async (values) => {
    const payload =
      kind === "income"
        ? {
            description: values.description,
            amount: values.amount,
            category_id: values.category_id,
            account_id: values.account_id,
            occurred_on: values.occurred_on,
            status: values.status,
            notes: values.notes,
          }
        : values;

    const res = transaction
      ? await updateTransaction(transaction.id, kind, payload)
      : kind === "expense"
        ? await createExpense(payload)
        : await createIncome(payload);

    if (!res.ok) {
      if (res.fieldErrors) {
        for (const [k, msgs] of Object.entries(res.fieldErrors)) {
          if (msgs?.[0]) setError(k as keyof FlowValues, { message: msgs[0] });
        }
      }
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? "Guardado");
    onDone?.();
  });

  if (activeAccounts.length === 0) return <NoAccountsNotice />;

  const tone = kind === "expense" ? "text-expense" : "text-income";

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Importe (USD)" htmlFor="amount" error={errors.amount?.message}>
        <div className="relative">
          <span className={cn("pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl font-semibold", tone)}>
            $
          </span>
          <Input
            id="amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            autoFocus={!transaction}
            aria-invalid={!!errors.amount}
            className={cn("tabular h-14 pl-8 text-2xl font-semibold md:h-14 md:text-2xl", tone)}
            {...register("amount")}
          />
        </div>
      </Field>

      <Field label="Concepto" htmlFor="description" error={errors.description?.message}>
        <Input
          id="description"
          placeholder={kind === "expense" ? "Ej. Supermercado" : "Ej. Sueldo de octubre"}
          aria-invalid={!!errors.description}
          {...register("description")}
        />
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Categoría" htmlFor="category_id" error={errors.category_id?.message}>
          <NativeSelect id="category_id" aria-invalid={!!errors.category_id} {...register("category_id")}>
            <option value="" disabled>
              Selecciona
            </option>
            {cats.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Fecha" htmlFor="occurred_on" error={errors.occurred_on?.message}>
          <Input id="occurred_on" type="date" aria-invalid={!!errors.occurred_on} {...register("occurred_on")} />
        </Field>
      </div>

      <Field
        label={kind === "expense" ? "Cuenta de origen" : "Cuenta de destino"}
        htmlFor="account_id"
        error={errors.account_id?.message}
      >
        <NativeSelect id="account_id" aria-invalid={!!errors.account_id} {...register("account_id")}>
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name} · {formatMoney(a.balance)}
            </option>
          ))}
        </NativeSelect>
      </Field>

      {kind === "expense" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Medio de pago" htmlFor="payment_method" error={errors.payment_method?.message}>
            <NativeSelect id="payment_method" {...register("payment_method")}>
              {(["debit", "cash", "transfer", "other"] as const).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Tipo" htmlFor="expense_type">
            <NativeSelect id="expense_type" {...register("expense_type")}>
              <option value="variable">Variable</option>
              <option value="fixed">Fijo</option>
            </NativeSelect>
          </Field>
        </div>
      )}

      <Field
        label="Estado"
        htmlFor="status"
        hint={
          status === "pending"
            ? "Pendiente: no afecta tu saldo hasta que lo confirmes."
            : isFuture
              ? "Fecha futura: considera marcarlo como pendiente."
              : undefined
        }
      >
        <NativeSelect id="status" {...register("status")}>
          <option value="confirmed">{kind === "expense" ? "Pagado" : "Recibido"}</option>
          <option value="pending">Pendiente</option>
        </NativeSelect>
      </Field>

      <Field label="Descripción (opcional)" htmlFor="notes" error={errors.notes?.message}>
        <Textarea id="notes" rows={2} {...register("notes")} />
      </Field>

      {kind === "expense" && !transaction && (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          Los consumos con tarjeta de crédito se registrarán desde el módulo de tarjetas (Fase 2), para no descontarlos
          de una cuenta bancaria ni duplicarlos al pagar la tarjeta.
        </p>
      )}

      <Button type="submit" size="lg" loading={isSubmitting} className="mt-1">
        {transaction ? "Guardar cambios" : kind === "expense" ? "Registrar gasto" : "Registrar ingreso"}
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Transferencia                                                              */
/* -------------------------------------------------------------------------- */
type TransferValues = z.input<typeof transferSchema>;

function TransferForm({ accounts, transaction, defaultAccountId, onDone }: Props) {
  const activeAccounts = accounts.filter((a) => a.is_active);
  const first = defaultAccountId ?? activeAccounts.find((a) => a.is_default)?.id ?? activeAccounts[0]?.id ?? "";
  const second = activeAccounts.find((a) => a.id !== first)?.id ?? "";

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<TransferValues, unknown, z.output<typeof transferSchema>>({
    resolver: zodResolver(transferSchema),
    defaultValues: transaction
      ? {
          account_id: transaction.account_id,
          counter_account_id: transaction.counter_account_id ?? "",
          amount: transaction.amount,
          occurred_on: transaction.occurred_on,
          description: transaction.description,
          notes: transaction.notes ?? "",
        }
      : {
          account_id: first,
          counter_account_id: second,
          amount: "",
          occurred_on: todayISO(),
          description: "Transferencia entre cuentas",
          notes: "",
        },
  });

  const fromId = watch("account_id");
  const from = useMemo(() => activeAccounts.find((a) => a.id === fromId), [activeAccounts, fromId]);

  const onSubmit = handleSubmit(async (values) => {
    const res = transaction
      ? await updateTransaction(transaction.id, "transfer", values)
      : await createTransfer(values);
    if (!res.ok) {
      if (res.fieldErrors) {
        for (const [k, msgs] of Object.entries(res.fieldErrors)) {
          if (msgs?.[0]) setError(k as keyof TransferValues, { message: msgs[0] });
        }
      }
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? "Guardado");
    onDone?.();
  });

  if (activeAccounts.length < 2) {
    return (
      <p className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
        Necesitas al menos dos cuentas activas para transferir dinero entre ellas.
      </p>
    );
  }

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label="Importe (USD)" htmlFor="t-amount" error={errors.amount?.message}>
        <div className="relative">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xl font-semibold text-info">
            $
          </span>
          <Input
            id="t-amount"
            inputMode="decimal"
            autoComplete="off"
            placeholder="0.00"
            autoFocus={!transaction}
            aria-invalid={!!errors.amount}
            className="tabular h-14 pl-8 text-2xl font-semibold text-info md:h-14 md:text-2xl"
            {...register("amount")}
          />
        </div>
      </Field>
      <Field
        label="Desde"
        htmlFor="t-from"
        error={errors.account_id?.message}
        hint={from ? `Saldo actual: ${formatMoney(from.balance)}` : undefined}
      >
        <NativeSelect id="t-from" {...register("account_id")}>
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <Field label="Hacia" htmlFor="t-to" error={errors.counter_account_id?.message}>
        <NativeSelect id="t-to" aria-invalid={!!errors.counter_account_id} {...register("counter_account_id")}>
          {activeAccounts.map((a) => (
            <option key={a.id} value={a.id}>
              {a.name}
            </option>
          ))}
        </NativeSelect>
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha" htmlFor="t-date" error={errors.occurred_on?.message}>
          <Input id="t-date" type="date" {...register("occurred_on")} />
        </Field>
        <Field label="Concepto" htmlFor="t-desc" error={errors.description?.message}>
          <Input id="t-desc" {...register("description")} />
        </Field>
      </div>
      <p className="rounded-xl bg-info-soft px-3 py-2 text-xs text-info">
        Las transferencias entre tus cuentas no cuentan como ingreso ni como gasto.
      </p>
      <Button type="submit" size="lg" loading={isSubmitting}>
        {transaction ? "Guardar cambios" : "Transferir"}
      </Button>
    </form>
  );
}

function NoAccountsNotice() {
  return (
    <div className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
      Primero crea una cuenta (banco, efectivo o billetera) para registrar movimientos.
    </div>
  );
}
