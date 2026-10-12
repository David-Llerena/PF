"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight } from "lucide-react";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { expenseSchema, incomeSchema, transferSchema } from "@/lib/validation/schemas";
import { createExpense, createIncome, createTransfer, updateTransaction } from "@/actions/transactions";
import { createCardPurchase } from "@/actions/cards";
import { buildSchedule, scheduleTotals } from "@/lib/finance/schedule";
import { firstInstallmentDue } from "@/lib/finance/cards";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import { isISODate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AccountWithBalance, CardSummary, Category, Transaction } from "@/lib/types";

export type MovementKind = "expense" | "income" | "transfer";

type Props = {
  kind: MovementKind;
  accounts: AccountWithBalance[];
  categories: Category[];
  cards?: CardSummary[];
  /** Si se pasa, el formulario edita ese movimiento. */
  transaction?: Transaction;
  defaultAccountId?: string;
  defaultCardId?: string;
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
  cards = [],
  transaction,
  defaultAccountId,
  defaultCardId,
  onDone,
}: Props & { kind: "expense" | "income" }) {
  const schema = kind === "expense" ? expenseSchema : incomeSchema;
  const activeAccounts = accounts.filter((a) => a.is_active);
  const activeCards = cards.filter((c) => c.is_active || c.id === transaction?.credit_card_id);
  const cats = categories.filter((c) => c.kind === kind && (c.is_active || c.id === transaction?.category_id));
  const fallbackAccount =
    defaultAccountId ?? activeAccounts.find((a) => a.is_default)?.id ?? activeAccounts[0]?.id ?? "";
  const fallbackCard = defaultCardId ?? activeCards[0]?.id ?? "";

  const {
    register,
    handleSubmit,
    setError,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<FlowValues, unknown, z.output<typeof expenseSchema>>({
    // El esquema de ingreso es un subconjunto del de gasto; se valida con el del tipo actual.
    resolver: zodResolver(schema as unknown as typeof expenseSchema),
    defaultValues: transaction
      ? {
          description: transaction.description,
          amount: transaction.amount,
          category_id: transaction.category_id ?? "",
          account_id: transaction.account_id ?? fallbackAccount,
          credit_card_id: transaction.credit_card_id ?? fallbackCard,
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
          credit_card_id: fallbackCard,
          occurred_on: todayISO(),
          status: "confirmed",
          payment_method: defaultCardId || (activeAccounts.length === 0 && activeCards.length > 0) ? "card" : "debit",
          expense_type: "variable",
          notes: "",
        },
  });

  const status = watch("status");
  const occurredOn = watch("occurred_on");
  const paymentMethod = watch("payment_method");
  const cardId = watch("credit_card_id");
  const amount = watch("amount");
  const isCard = kind === "expense" && paymentMethod === "card";
  const isFuture = occurredOn > todayISO();
  const selectedCard = activeCards.find((c) => c.id === cardId);

  // Diferido (solo al crear un consumo con tarjeta)
  const [deferred, setDeferred] = useState(false);
  const [installments, setInstallments] = useState("3");
  const [rate, setRate] = useState("0");
  const [firstDueEdited, setFirstDueEdited] = useState<string | null>(null);
  const suggestedFirstDue =
    selectedCard && isISODate(occurredOn)
      ? firstInstallmentDue(occurredOn, { statementDay: selectedCard.statement_day, dueDay: selectedCard.due_day })
      : todayISO();
  const firstDue = firstDueEdited ?? suggestedFirstDue;
  const canDefer = isCard && !transaction;
  const isDeferred = canDefer && deferred;

  const preview = useMemo(() => {
    if (!isDeferred) return null;
    const principal = parseMoneyInput(amount ?? "");
    const n = Number(installments);
    if (!principal || principal.lte(0) || !Number.isInteger(n) || n < 2 || n > 72 || !isISODate(firstDue)) return null;
    try {
      const rows = buildSchedule({ principal: principal.toFixed(2), annualRatePct: rate || 0, installments: n, firstDueDate: firstDue });
      const t = scheduleTotals(rows);
      return { first: rows[0], last: rows.at(-1)!, interest: t.interest.toFixed(2), total: t.amount.toFixed(2), n };
    } catch {
      return null;
    }
  }, [isDeferred, amount, installments, rate, firstDue]);

  const onSubmit = handleSubmit(async (values) => {
    let res;
    if (isDeferred) {
      res = await createCardPurchase({
        credit_card_id: values.credit_card_id,
        description: values.description,
        category_id: values.category_id,
        amount: values.amount,
        purchase_date: values.occurred_on,
        installments: installments,
        annual_rate: rate,
        first_due_date: firstDue,
        is_prior: false,
        notes: values.notes,
      });
    } else {
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
      res = transaction
        ? await updateTransaction(transaction.id, kind, payload)
        : kind === "expense"
          ? await createExpense(payload)
          : await createIncome(payload);
    }

    if (!res.ok) {
      if (res.fieldErrors) {
        for (const [k, msgs] of Object.entries(res.fieldErrors)) {
          if (msgs?.[0] && k in values) setError(k as keyof FlowValues, { message: msgs[0] });
        }
      }
      toast.error(res.error);
      return;
    }
    toast.success(res.message ?? "Guardado");
    onDone?.();
  });

  if (activeAccounts.length === 0 && (kind === "income" || activeCards.length === 0)) return <NoAccountsNotice />;

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

      {kind === "expense" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Medio de pago" htmlFor="payment_method" error={errors.payment_method?.message}>
            <NativeSelect id="payment_method" {...register("payment_method")}>
              {(["debit", "cash", "transfer", "card", "other"] as const)
                .filter((m) => m !== "card" || activeCards.length > 0)
                .map((m) => (
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

      {isCard ? (
        <Field
          label="Tarjeta"
          htmlFor="credit_card_id"
          error={errors.credit_card_id?.message}
          hint={selectedCard ? `Cupo disponible: ${formatMoney(selectedCard.available)}` : undefined}
        >
          <NativeSelect id="credit_card_id" aria-invalid={!!errors.credit_card_id} {...register("credit_card_id")}>
            {activeCards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
                {c.last4 ? ` ··${c.last4}` : ""}
              </option>
            ))}
          </NativeSelect>
        </Field>
      ) : (
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
      )}

      {canDefer && (
        <div className="rounded-2xl border p-3">
          <label className="flex items-center justify-between gap-3 text-sm font-medium">
            Diferir en cuotas
            <input
              type="checkbox"
              className="size-5 accent-[var(--primary)]"
              checked={deferred}
              onChange={(e) => setDeferred(e.target.checked)}
            />
          </label>
          {deferred && (
            <div className="mt-3 flex flex-col gap-3">
              <div className="grid grid-cols-3 gap-2">
                <Field label="Cuotas" htmlFor="installments">
                  <NativeSelect id="installments" value={installments} onChange={(e) => setInstallments(e.target.value)}>
                    {[2, 3, 6, 9, 12, 18, 24, 36, 48].map((n) => (
                      <option key={n} value={n}>
                        {n}
                      </option>
                    ))}
                  </NativeSelect>
                </Field>
                <Field label="Interés anual %" htmlFor="rate">
                  <Input id="rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
                </Field>
                <Field label="1.ª cuota" htmlFor="first_due">
                  <Input
                    id="first_due"
                    type="date"
                    value={firstDue}
                    onChange={(e) => setFirstDueEdited(e.target.value)}
                  />
                </Field>
              </div>
              {preview ? (
                <p className="rounded-xl bg-primary-soft px-3 py-2 text-xs text-accent-foreground">
                  {preview.n} cuotas de {formatMoney(preview.first.amount)}
                  {preview.last.amount !== preview.first.amount && ` (última ${formatMoney(preview.last.amount)})`}
                  {" · "}intereses {formatMoney(preview.interest)} · total {formatMoney(preview.total)}. El gasto se
                  registra una sola vez hoy; las cuotas solo son tu calendario de pago.
                </p>
              ) : (
                <p className="text-xs text-muted-foreground">Ingresa el importe para ver el cronograma.</p>
              )}
            </div>
          )}
        </div>
      )}

      {!isDeferred && (
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
            <option value="confirmed">{kind === "expense" ? (isCard ? "Consumido" : "Pagado") : "Recibido"}</option>
            <option value="pending">Pendiente</option>
          </NativeSelect>
        </Field>
      )}

      <Field label="Descripción (opcional)" htmlFor="notes" error={errors.notes?.message}>
        <Textarea id="notes" rows={2} {...register("notes")} />
      </Field>

      {isCard && (
        <p className="rounded-xl bg-muted px-3 py-2 text-xs text-muted-foreground">
          El consumo sube la deuda de la tarjeta y no toca tus cuentas. Cuando pagues la tarjeta, ese pago no se
          vuelve a contar como gasto.
        </p>
      )}

      <Button type="submit" size="lg" loading={isSubmitting} className="mt-1">
        {transaction
          ? "Guardar cambios"
          : isDeferred
            ? "Registrar compra diferida"
            : kind === "expense"
              ? "Registrar gasto"
              : "Registrar ingreso"}
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
          account_id: transaction.account_id ?? "",
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
