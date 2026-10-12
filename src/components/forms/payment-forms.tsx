"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { cardPaymentSchema, loanPaymentSchema } from "@/lib/validation/schemas";
import { payCard } from "@/actions/cards";
import { payLoan } from "@/actions/loans";
import { formatMoney, money } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AccountWithBalance, CardSummary, LoanSummary, LoanInstallment } from "@/lib/types";

function NoAccounts() {
  return (
    <p className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
      Necesitas una cuenta activa (banco o efectivo) desde donde pagar.
    </p>
  );
}

/* -------------------------------------------------------------------------- */
/* Pago de tarjeta                                                            */
/* -------------------------------------------------------------------------- */
type CardPayValues = z.input<typeof cardPaymentSchema>;

export function CardPaymentForm({
  card,
  accounts,
  onDone,
}: {
  card: CardSummary;
  accounts: AccountWithBalance[];
  onDone?: () => void;
}) {
  const active = accounts.filter((a) => a.is_active);
  const period = card.statement.remaining;
  const total = money(card.debt).isNegative() ? "0.00" : card.debt;

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<CardPayValues, unknown, z.output<typeof cardPaymentSchema>>({
    resolver: zodResolver(cardPaymentSchema),
    defaultValues: {
      credit_card_id: card.id,
      account_id: active.find((a) => a.is_default)?.id ?? active[0]?.id ?? "",
      amount: money(period).gt(0) ? period : "",
      occurred_on: todayISO(),
      payment_kind: money(period).gt(0) ? "period" : "other",
      notes: "",
    },
  });
  const kind = watch("payment_kind");
  const accountId = watch("account_id");
  const account = active.find((a) => a.id === accountId);

  const onSubmit = handleSubmit(async (values) => {
    const res = await payCard(values);
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.message ?? "Pago registrado");
    onDone?.();
  });

  if (active.length === 0) return <NoAccounts />;

  const options: { k: CardPayValues["payment_kind"]; label: string; value: string | null }[] = [
    { k: "period", label: "Pago del período", value: money(period).gt(0) ? period : null },
    { k: "total", label: "Pago total", value: money(total).gt(0) ? total : null },
    { k: "other", label: "Otro valor", value: null },
  ];

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Tipo de pago">
        {options.map((o) => (
          <button
            key={o.k}
            type="button"
            role="radio"
            aria-checked={kind === o.k}
            disabled={o.k !== "other" && !o.value}
            onClick={() => {
              setValue("payment_kind", o.k);
              if (o.value) setValue("amount", o.value);
            }}
            className={cn(
              "flex flex-col items-start gap-0.5 rounded-xl border px-3 py-2 text-left text-xs transition-colors disabled:opacity-40",
              kind === o.k ? "border-primary bg-primary-soft" : "hover:bg-muted",
            )}
          >
            <span className="font-medium">{o.label}</span>
            <span className="tabular text-muted-foreground">{o.value ? formatMoney(o.value) : "—"}</span>
          </button>
        ))}
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        El pago del período es un <b>estimado</b> (consumos del ciclo + cuotas que vencen). Verifícalo con el estado de
        cuenta de tu banco; el pago mínimo depende del banco, regístralo con “Otro valor”.
      </p>

      <Field label="Importe" htmlFor="cp-amount" error={errors.amount?.message}>
        <Input
          id="cp-amount"
          inputMode="decimal"
          className="tabular h-12 text-lg font-semibold"
          {...register("amount", { onChange: () => setValue("payment_kind", "other") })}
        />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Desde la cuenta"
          htmlFor="cp-account"
          error={errors.account_id?.message}
          hint={account ? `Saldo: ${formatMoney(account.balance)}` : undefined}
        >
          <NativeSelect id="cp-account" {...register("account_id")}>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Fecha" htmlFor="cp-date" error={errors.occurred_on?.message}>
          <Input id="cp-date" type="date" {...register("occurred_on")} />
        </Field>
      </div>
      <Field label="Nota (opcional)" htmlFor="cp-notes">
        <Textarea id="cp-notes" rows={2} {...register("notes")} />
      </Field>
      <p className="rounded-xl bg-info-soft px-3 py-2 text-xs text-info">
        Este pago baja tu cuenta y la deuda de la tarjeta. No es un gasto nuevo: los consumos ya se contaron cuando los
        registraste.
      </p>
      <Button type="submit" size="lg" loading={isSubmitting}>
        Registrar pago
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Pago de préstamo                                                           */
/* -------------------------------------------------------------------------- */
type LoanPayValues = z.input<typeof loanPaymentSchema>;

export function LoanPaymentForm({
  loan,
  installment,
  accounts,
  onDone,
}: {
  loan: LoanSummary;
  installment?: LoanInstallment | null;
  accounts: AccountWithBalance[];
  onDone?: () => void;
}) {
  const active = accounts.filter((a) => a.is_active);
  const inst = installment ?? (loan.loan_type === "amortized" ? loan.next_installment : null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors, isSubmitting },
  } = useForm<LoanPayValues, unknown, z.output<typeof loanPaymentSchema>>({
    resolver: zodResolver(loanPaymentSchema),
    defaultValues: {
      loan_id: loan.id,
      installment_id: inst?.id ?? "",
      account_id: loan.account_id ?? active.find((a) => a.is_default)?.id ?? active[0]?.id ?? "",
      occurred_on: todayISO(),
      principal: inst?.principal ?? "",
      interest: inst?.interest ?? "0.00",
      notes: "",
    },
  });
  const principal = watch("principal");
  const interest = watch("interest");
  const total = (() => {
    try {
      return money(principal || 0).plus(money(interest || 0)).toFixed(2);
    } catch {
      return null;
    }
  })();

  const onSubmit = handleSubmit(async (values) => {
    const res = await payLoan(values);
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.message ?? "Pago registrado");
    onDone?.();
  });

  if (active.length === 0) return <NoAccounts />;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      {inst ? (
        <div className="rounded-xl bg-muted px-3 py-2 text-sm">
          Cuota {inst.number} · vence {formatDate(inst.due_date, "long")} ·{" "}
          <span className="tabular font-semibold">{formatMoney(inst.amount)}</span>
        </div>
      ) : (
        <div className="rounded-xl bg-muted px-3 py-2 text-sm">
          Saldo pendiente: <span className="tabular font-semibold">{formatMoney(loan.outstanding)}</span>
        </div>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field
          label="Abono a capital"
          htmlFor="lp-principal"
          error={errors.principal?.message}
          hint="Reduce la deuda. No es gasto."
        >
          <Input id="lp-principal" inputMode="decimal" className="tabular" {...register("principal")} />
        </Field>
        <Field
          label="Intereses y cargos"
          htmlFor="lp-interest"
          error={errors.interest?.message}
          hint="Esto sí cuenta como gasto."
        >
          <Input id="lp-interest" inputMode="decimal" className="tabular" {...register("interest")} />
        </Field>
      </div>
      {total && (
        <p className="text-sm">
          Total a pagar: <span className="tabular font-semibold">{formatMoney(total)}</span>
        </p>
      )}
      <div className="grid grid-cols-2 gap-3">
        <Field label="Desde la cuenta" htmlFor="lp-account" error={errors.account_id?.message}>
          <NativeSelect id="lp-account" {...register("account_id")}>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} · {formatMoney(a.balance)}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Fecha" htmlFor="lp-date" error={errors.occurred_on?.message}>
          <Input id="lp-date" type="date" {...register("occurred_on")} />
        </Field>
      </div>
      <Field label="Nota (opcional)" htmlFor="lp-notes">
        <Textarea id="lp-notes" rows={2} {...register("notes")} />
      </Field>
      <Button type="submit" size="lg" loading={isSubmitting}>
        Registrar pago
      </Button>
    </form>
  );
}
