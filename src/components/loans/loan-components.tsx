"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { useQuickAdd } from "@/components/forms/quick-add";
import { loanCreateSchema } from "@/lib/validation/schemas";
import { createLoan } from "@/actions/loans";
import { buildSchedule, scheduleTotals, type Frequency } from "@/lib/finance/schedule";
import { LOAN_FREQUENCY_LABEL } from "@/lib/constants";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import { addMonthsAnchored, isISODate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AccountWithBalance, LoanFrequency, LoanInstallment } from "@/lib/types";

type Values = z.input<typeof loanCreateSchema>;

export function LoanForm({ accounts, onDone }: { accounts: AccountWithBalance[]; onDone?: () => void }) {
  const active = accounts.filter((a) => a.is_active);
  const {
    register,
    handleSubmit,
    watch,
    setValue,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values, unknown, z.output<typeof loanCreateSchema>>({
    resolver: zodResolver(loanCreateSchema),
    defaultValues: {
      lender: "",
      name: "",
      loan_type: "amortized",
      original_principal: "",
      outstanding: "",
      annual_rate: "",
      frequency: "monthly",
      remaining_installments: 12,
      start_date: todayISO(),
      first_due_date: addMonthsAnchored(todayISO(), 1),
      account_id: "",
      disburse: false,
      notes: "",
    },
  });

  const type = watch("loan_type");
  const disburse = watch("disburse");
  const outstanding = watch("outstanding");
  const rate = watch("annual_rate");
  const n = watch("remaining_installments");
  const firstDue = watch("first_due_date");
  const frequency = watch("frequency");

  const preview = useMemo(() => {
    if (type !== "amortized") return null;
    const p = parseMoneyInput(outstanding ?? "");
    const count = Number(n);
    if (!p || p.lte(0) || !Number.isInteger(count) || count < 1 || count > 600 || !firstDue || !isISODate(firstDue)) return null;
    try {
      const rows = buildSchedule({
        principal: p.toFixed(2),
        annualRatePct: (rate || "0").replace(",", "."),
        installments: count,
        firstDueDate: firstDue,
        frequency: frequency as Frequency,
      });
      return { first: rows[0], last: rows.at(-1)!, totals: scheduleTotals(rows) };
    } catch {
      return null;
    }
  }, [type, outstanding, rate, n, firstDue, frequency]);

  const onSubmit = handleSubmit(async (values) => {
    const res = await createLoan(values);
    if (!res.ok) {
      for (const [k, msgs] of Object.entries(res.fieldErrors ?? {})) {
        if (msgs?.[0] && k in values) setError(k as keyof Values, { message: msgs[0] });
      }
      return void toast.error(res.error);
    }
    toast.success(res.message ?? "Guardado");
    onDone?.();
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-1 rounded-2xl bg-muted p-1" role="radiogroup">
        {(
          [
            ["amortized", "Con cuotas e interés"],
            ["simple", "Deuda simple"],
          ] as const
        ).map(([k, label]) => (
          <button
            key={k}
            type="button"
            role="radio"
            aria-checked={type === k}
            onClick={() => setValue("loan_type", k)}
            className={cn(
              "h-10 rounded-xl text-sm font-medium text-muted-foreground",
              type === k && "bg-card text-foreground shadow-sm",
            )}
          >
            {label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label={type === "simple" ? "A quién le debes" : "Entidad"} htmlFor="ln-lender" error={errors.lender?.message}>
          <Input id="ln-lender" placeholder={type === "simple" ? "Ej. Mi hermano" : "Ej. Banco Pichincha"} {...register("lender")} />
        </Field>
        <Field label="Nombre" htmlFor="ln-name" error={errors.name?.message}>
          <Input id="ln-name" placeholder="Ej. Préstamo auto" {...register("name")} />
        </Field>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Saldo pendiente hoy" htmlFor="ln-out" error={errors.outstanding?.message} hint="Capital que falta pagar">
          <Input id="ln-out" inputMode="decimal" className="tabular" placeholder="0.00" {...register("outstanding")} />
        </Field>
        <Field label="Capital inicial (opcional)" htmlFor="ln-orig" error={errors.original_principal?.message}>
          <Input id="ln-orig" inputMode="decimal" className="tabular" placeholder="0.00" {...register("original_principal")} />
        </Field>
      </div>

      {type === "amortized" && (
        <>
          <div className="grid grid-cols-3 gap-3">
            <Field label="Tasa anual %" htmlFor="ln-rate" error={errors.annual_rate?.message}>
              <Input id="ln-rate" inputMode="decimal" placeholder="0" {...register("annual_rate")} />
            </Field>
            <Field label="Cuotas que faltan" htmlFor="ln-n" error={errors.remaining_installments?.message}>
              <Input id="ln-n" inputMode="numeric" {...register("remaining_installments")} />
            </Field>
            <Field label="Frecuencia" htmlFor="ln-freq">
              <NativeSelect id="ln-freq" {...register("frequency")}>
                {(Object.keys(LOAN_FREQUENCY_LABEL) as LoanFrequency[]).map((f) => (
                  <option key={f} value={f}>
                    {LOAN_FREQUENCY_LABEL[f]}
                  </option>
                ))}
              </NativeSelect>
            </Field>
          </div>
          <Field label="Próximo vencimiento" htmlFor="ln-first" error={errors.first_due_date?.message}>
            <Input id="ln-first" type="date" {...register("first_due_date")} />
          </Field>
          {preview && (
            <p className="rounded-xl bg-primary-soft px-3 py-2 text-xs text-accent-foreground">
              Cuota estimada {formatMoney(preview.first.amount)}
              {preview.last.amount !== preview.first.amount && ` (última ${formatMoney(preview.last.amount)})`} · intereses
              totales {formatMoney(preview.totals.interest.toFixed(2))}. Método francés; verifica con la tabla de tu banco
              (puede incluir seguros u otros cargos que registras al pagar).
            </p>
          )}
        </>
      )}

      <div className="grid grid-cols-2 gap-3">
        <Field label="Fecha de inicio" htmlFor="ln-start" error={errors.start_date?.message}>
          <Input id="ln-start" type="date" {...register("start_date")} />
        </Field>
        <Field label="Cuenta asociada" htmlFor="ln-acc" error={errors.account_id?.message}>
          <NativeSelect id="ln-acc" {...register("account_id")}>
            <option value="">Ninguna</option>
            {active.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      <label className="flex items-start gap-3 rounded-xl border px-3 py-2.5 text-sm">
        <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" {...register("disburse")} />
        <span>
          Recibí este dinero ahora en la cuenta asociada
          <span className="block text-xs text-muted-foreground">
            {disburse
              ? "Se sumará al saldo de la cuenta como préstamo recibido (no como ingreso)."
              : "Déjalo desmarcado si es un préstamo que ya tenías antes de usar la app."}
          </span>
        </span>
      </label>

      <Field label="Observaciones" htmlFor="ln-notes" error={errors.notes?.message}>
        <Textarea id="ln-notes" rows={2} {...register("notes")} />
      </Field>

      <Button type="submit" size="lg" loading={isSubmitting}>
        Registrar préstamo
      </Button>
    </form>
  );
}

export function NewLoanButton({ accounts, label = "Nuevo préstamo" }: { accounts: AccountWithBalance[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      <DialogContent title="Nuevo préstamo o deuda">
        <LoanForm
          accounts={accounts}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function PayLoanButton({
  loanId,
  installment,
  label = "Pagar",
  size = "sm",
  variant = "default",
}: {
  loanId: string;
  installment?: LoanInstallment | null;
  label?: string;
  size?: "sm" | "default";
  variant?: "default" | "outline";
}) {
  const { payLoan } = useQuickAdd();
  return (
    <Button size={size} variant={variant} onClick={() => payLoan(loanId, installment)}>
      {label}
    </Button>
  );
}
