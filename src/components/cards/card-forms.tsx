"use client";

import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/primitives";
import { cardCreateSchema, cardOpeningSchema, cardPurchaseSchema } from "@/lib/validation/schemas";
import { createCard, createCardPurchase, setCardOpeningDebt, updateCard } from "@/actions/cards";
import { ACCOUNT_COLORS, CARD_NETWORK_LABEL } from "@/lib/constants";
import { buildSchedule, scheduleTotals } from "@/lib/finance/schedule";
import { firstInstallmentDue } from "@/lib/finance/cards";
import { formatMoney, parseMoneyInput } from "@/lib/money";
import { isISODate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { CardNetwork, CreditCard, Institution } from "@/lib/types";

const OTHER = "__other__";
const DAYS = Array.from({ length: 31 }, (_, i) => i + 1);
const CARD_COLORS = ["#1e1b4b", "#4f46e5", "#7c3aed", "#0f766e", "#0369a1", "#b45309", "#be123c", "#334155", ...ACCOUNT_COLORS.slice(0, 3)];

type CardValues = z.input<typeof cardCreateSchema>;

export function CardForm({
  institutions,
  card,
  onDone,
}: {
  institutions: Institution[];
  card?: CreditCard;
  onDone?: (id?: string) => void;
}) {
  const [institutionChoice, setInstitutionChoice] = useState<string>(card?.institution_id ?? "");
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<CardValues, unknown, z.output<typeof cardCreateSchema>>({
    resolver: zodResolver(cardCreateSchema),
    defaultValues: {
      name: card?.name ?? "",
      institution_id: card?.institution_id ?? "",
      new_institution: "",
      network: card?.network ?? "visa",
      credit_limit: card?.credit_limit ?? "",
      statement_day: card?.statement_day ?? 20,
      due_day: card?.due_day ?? 5,
      last4: card?.last4 ?? "",
      color: card?.color ?? CARD_COLORS[0],
      opening_debt: "",
      opening_date: todayISO(),
    },
  });
  const color = watch("color");

  const onSubmit = handleSubmit(async (values) => {
    const base = {
      ...values,
      institution_id: institutionChoice && institutionChoice !== OTHER ? institutionChoice : null,
      new_institution: institutionChoice === OTHER ? values.new_institution : null,
    };
    const res = card ? await updateCard({ ...base, id: card.id }) : await createCard(base);
    if (!res.ok) {
      for (const [k, msgs] of Object.entries(res.fieldErrors ?? {})) {
        if (msgs?.[0] && k in values) setError(k as keyof CardValues, { message: msgs[0] });
      }
      return void toast.error(res.error);
    }
    toast.success(res.message ?? "Guardado");
    onDone?.(res.data && "id" in res.data ? (res.data as { id: string }).id : card?.id);
  });

  const systemInst = institutions.filter((i) => !i.user_id);
  const ownInst = institutions.filter((i) => i.user_id);

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Banco emisor" htmlFor="card-inst">
          <NativeSelect id="card-inst" value={institutionChoice} onChange={(e) => setInstitutionChoice(e.target.value)}>
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
            <option value={OTHER}>Otra…</option>
          </NativeSelect>
        </Field>
        <Field label="Red" htmlFor="card-network">
          <NativeSelect id="card-network" {...register("network")}>
            {(Object.keys(CARD_NETWORK_LABEL) as CardNetwork[]).map((n) => (
              <option key={n} value={n}>
                {CARD_NETWORK_LABEL[n]}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>
      {institutionChoice === OTHER && (
        <Field label="Nombre del banco" htmlFor="card-newinst" error={errors.new_institution?.message}>
          <Input id="card-newinst" {...register("new_institution")} />
        </Field>
      )}

      <div className="grid grid-cols-[1fr_auto] gap-3">
        <Field label="Nombre de la tarjeta" htmlFor="card-name" error={errors.name?.message}>
          <Input id="card-name" placeholder="Ej. Visa Pichincha" aria-invalid={!!errors.name} {...register("name")} />
        </Field>
        <Field label="Últimos 4" htmlFor="card-last4" error={errors.last4?.message}>
          <Input
            id="card-last4"
            inputMode="numeric"
            maxLength={4}
            placeholder="1234"
            className="w-24 tabular"
            autoComplete="off"
            {...register("last4")}
          />
        </Field>
      </div>
      <p className="-mt-2 text-xs text-muted-foreground">
        Por seguridad solo guardamos los últimos 4 dígitos. Nunca ingreses el número completo, CVV ni PIN.
      </p>

      <div className="grid grid-cols-3 gap-3">
        <Field label="Cupo total" htmlFor="card-limit" error={errors.credit_limit?.message}>
          <Input id="card-limit" inputMode="decimal" placeholder="0.00" className="tabular" {...register("credit_limit")} />
        </Field>
        <Field label="Día de corte" htmlFor="card-cut" error={errors.statement_day?.message}>
          <NativeSelect id="card-cut" {...register("statement_day")}>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Día de pago" htmlFor="card-due" error={errors.due_day?.message}>
          <NativeSelect id="card-due" {...register("due_day")}>
            {DAYS.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </NativeSelect>
        </Field>
      </div>

      {!card && (
        <>
          <div className="grid grid-cols-2 gap-3">
            <Field
              label="Deuda corriente actual"
              htmlFor="card-debt"
              error={errors.opening_debt?.message}
              hint="Consumos no diferidos que ya debes"
            >
              <Input id="card-debt" inputMode="decimal" placeholder="0.00" className="tabular" {...register("opening_debt")} />
            </Field>
            <Field label="A la fecha" htmlFor="card-debt-date" error={errors.opening_date?.message}>
              <Input id="card-debt-date" type="date" {...register("opening_date")} />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">
            Se registra como <b>deuda inicial</b>, no como gasto. Los diferidos que ya tenías los agregas después desde
            la tarjeta con sus cuotas restantes.
          </p>
        </>
      )}

      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Color</legend>
        <div className="flex flex-wrap gap-2">
          {CARD_COLORS.map((c) => (
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

      <Button type="submit" size="lg" loading={isSubmitting}>
        {card ? "Guardar cambios" : "Crear tarjeta"}
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Deuda inicial                                                              */
/* -------------------------------------------------------------------------- */
type OpeningValues = z.input<typeof cardOpeningSchema>;

export function CardOpeningForm({
  cardId,
  current,
  onDone,
}: {
  cardId: string;
  current: { amount: string; date: string } | null;
  onDone?: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OpeningValues, unknown, z.output<typeof cardOpeningSchema>>({
    resolver: zodResolver(cardOpeningSchema),
    defaultValues: { credit_card_id: cardId, opening_debt: current?.amount ?? "", opening_date: current?.date ?? todayISO() },
  });
  const onSubmit = handleSubmit(async (values) => {
    const res = await setCardOpeningDebt(values);
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.message ?? "Actualizado");
    onDone?.();
  });
  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Deuda corriente inicial" htmlFor="co-amount" error={errors.opening_debt?.message}>
          <Input id="co-amount" inputMode="decimal" className="tabular" {...register("opening_debt")} />
        </Field>
        <Field label="Fecha" htmlFor="co-date" error={errors.opening_date?.message}>
          <Input id="co-date" type="date" {...register("opening_date")} />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        La anterior queda anulada en la auditoría y la deuda se recalcula. Déjala en 0 para eliminarla.
      </p>
      <Button type="submit" size="lg" loading={isSubmitting}>
        Guardar
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Diferido previo a la app                                                   */
/* -------------------------------------------------------------------------- */
export function PriorDeferredForm({ card, onDone }: { card: CreditCard; onDone?: () => void }) {
  const [description, setDescription] = useState("");
  const [remaining, setRemaining] = useState("");
  const [installments, setInstallments] = useState("6");
  const [rate, setRate] = useState("0");
  const [firstDue, setFirstDue] = useState(
    firstInstallmentDue(todayISO(), { statementDay: card.statement_day, dueDay: card.due_day }),
  );
  const [pending, setPending] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const preview = useMemo(() => {
    const p = parseMoneyInput(remaining);
    const n = Number(installments);
    if (!p || p.lte(0) || !Number.isInteger(n) || n < 1 || n > 72 || !isISODate(firstDue)) return null;
    const rows = buildSchedule({ principal: p.toFixed(2), annualRatePct: rate || 0, installments: n, firstDueDate: firstDue });
    return { rows, totals: scheduleTotals(rows) };
  }, [remaining, installments, rate, firstDue]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      credit_card_id: card.id,
      description,
      category_id: null,
      amount: remaining,
      purchase_date: todayISO(),
      installments,
      annual_rate: rate,
      first_due_date: firstDue,
      is_prior: true,
      notes: null,
    };
    const parsed = cardPurchaseSchema.safeParse(payload);
    if (!parsed.success) {
      setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
      return;
    }
    setErrors({});
    setPending(true);
    const res = await createCardPurchase(payload);
    setPending(false);
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.message ?? "Registrado");
    onDone?.();
  }

  return (
    <form onSubmit={submit} className="flex flex-col gap-4" noValidate>
      <Field label="Descripción" htmlFor="pd-desc" error={errors.description}>
        <Input id="pd-desc" placeholder="Ej. Televisor diferido" value={description} onChange={(e) => setDescription(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Capital que falta pagar" htmlFor="pd-amount" error={errors.amount} hint="Según tu estado de cuenta">
          <Input id="pd-amount" inputMode="decimal" className="tabular" value={remaining} onChange={(e) => setRemaining(e.target.value)} />
        </Field>
        <Field label="Cuotas que faltan" htmlFor="pd-n" error={errors.installments}>
          <Input id="pd-n" inputMode="numeric" value={installments} onChange={(e) => setInstallments(e.target.value)} />
        </Field>
        <Field label="Interés anual %" htmlFor="pd-rate" error={errors.annual_rate}>
          <Input id="pd-rate" inputMode="decimal" value={rate} onChange={(e) => setRate(e.target.value)} />
        </Field>
        <Field label="Próxima cuota" htmlFor="pd-first" error={errors.first_due_date}>
          <Input id="pd-first" type="date" value={firstDue} onChange={(e) => setFirstDue(e.target.value)} />
        </Field>
      </div>
      {preview && (
        <p className="rounded-xl bg-primary-soft px-3 py-2 text-xs text-accent-foreground">
          {preview.rows.length} cuotas de {formatMoney(preview.rows[0].amount)} · intereses{" "}
          {formatMoney(preview.totals.interest.toFixed(2))} · total {formatMoney(preview.totals.amount.toFixed(2))}
        </p>
      )}
      <p className="text-xs text-muted-foreground">
        Entra a tu deuda como saldo inicial: <b>no</b> se cuenta como gasto de este mes porque lo consumiste antes de usar
        la app.
      </p>
      <Button type="submit" size="lg" loading={pending}>
        Agregar diferido
      </Button>
    </form>
  );
}

export function CardVisual({ card, className }: { card: Pick<CreditCard, "name" | "color" | "network" | "last4"> & { institution?: { name: string } | null }; className?: string }) {
  return (
    <div
      className={cn(
        "relative flex aspect-[1.586] w-full flex-col justify-between overflow-hidden rounded-2xl p-4 text-white shadow-lg",
        className,
      )}
      style={{ background: `linear-gradient(135deg, ${card.color}, color-mix(in srgb, ${card.color} 55%, #000))` }}
      aria-hidden
    >
      <div className="absolute -right-10 -top-10 size-40 rounded-full bg-white/10" />
      <div className="relative flex items-start justify-between">
        <span className="text-xs font-medium text-white/80">{card.institution?.name ?? "Tarjeta de crédito"}</span>
        <span className="text-xs font-semibold uppercase tracking-wider">{CARD_NETWORK_LABEL[card.network]}</span>
      </div>
      <div className="relative">
        <p className="tabular text-sm tracking-[0.2em] text-white/90">•••• •••• •••• {card.last4 ?? "••••"}</p>
        <p className="mt-1 truncate text-sm font-semibold">{card.name}</p>
      </div>
    </div>
  );
}
