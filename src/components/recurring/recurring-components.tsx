"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { Check, MoreHorizontal, Pause, Pencil, Play, Plus, SkipForward, Trash2 } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { recurringSchema, registerRecurringSchema } from "@/lib/validation/schemas";
import {
  deleteRecurring,
  registerRecurring,
  saveRecurring,
  setRecurringActive,
  skipRecurring,
} from "@/actions/recurring";
import { FREQUENCY_LABEL } from "@/lib/finance/recurrence";
import { formatMoney } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AccountWithBalance, ActionResult, CardSummary, Category, RecurringFrequency, RecurringRule } from "@/lib/types";

type Sources = { accounts: AccountWithBalance[]; cards: CardSummary[]; categories: Category[] };

/* -------------------------------------------------------------------------- */
/* Formulario de regla                                                        */
/* -------------------------------------------------------------------------- */
type RuleValues = z.input<typeof recurringSchema>;

export function RecurringForm({
  rule,
  kind,
  accounts,
  cards,
  categories,
  onDone,
}: Sources & { rule?: RecurringRule; kind: "income" | "expense"; onDone?: () => void }) {
  const [source, setSource] = useState<string>(
    rule?.credit_card_id ? `card:${rule.credit_card_id}` : rule?.account_id ? `acc:${rule.account_id}` : "",
  );
  const k = rule?.kind ?? kind;
  const cats = categories.filter((c) => c.kind === k && (c.is_active || c.id === rule?.category_id));
  const subsCat = cats.find((c) => c.name === "Suscripciones")?.id;
  const salaryCat = cats.find((c) => c.name === "Sueldo")?.id;

  const {
    register,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<RuleValues, unknown, z.output<typeof recurringSchema>>({
    resolver: zodResolver(recurringSchema),
    defaultValues: {
      id: rule?.id ?? "",
      kind: k,
      name: rule?.name ?? "",
      amount: rule?.amount ?? "",
      category_id: rule?.category_id ?? (k === "expense" ? subsCat : salaryCat) ?? "",
      frequency: rule?.frequency ?? "monthly",
      next_date: rule?.next_date ?? todayISO(),
      account_id: "",
      credit_card_id: "",
      is_subscription: rule?.is_subscription ?? k === "expense",
      notes: rule?.notes ?? "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const res = await saveRecurring({
      ...values,
      account_id: source.startsWith("acc:") ? source.slice(4) : null,
      credit_card_id: source.startsWith("card:") ? source.slice(5) : null,
    });
    if (!res.ok) {
      for (const [key, msgs] of Object.entries(res.fieldErrors ?? {})) {
        if (msgs?.[0] && key in values) setError(key as keyof RuleValues, { message: msgs[0] });
      }
      return void toast.error(res.error);
    }
    toast.success(res.message ?? "Guardado");
    onDone?.();
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <Field label={k === "expense" ? "Servicio o pago" : "Concepto"} htmlFor="rr-name" error={errors.name?.message}>
        <Input id="rr-name" placeholder={k === "expense" ? "Ej. Netflix, Internet, Gimnasio" : "Ej. Sueldo"} {...register("name")} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe" htmlFor="rr-amount" error={errors.amount?.message}>
          <Input id="rr-amount" inputMode="decimal" className="tabular" placeholder="0.00" {...register("amount")} />
        </Field>
        <Field label="Frecuencia" htmlFor="rr-freq">
          <NativeSelect id="rr-freq" {...register("frequency")}>
            {(Object.keys(FREQUENCY_LABEL) as RecurringFrequency[]).map((f) => (
              <option key={f} value={f}>
                {FREQUENCY_LABEL[f]}
              </option>
            ))}
          </NativeSelect>
        </Field>
        <Field label="Próximo vencimiento" htmlFor="rr-next" error={errors.next_date?.message}>
          <Input id="rr-next" type="date" {...register("next_date")} />
        </Field>
        <Field label="Categoría" htmlFor="rr-cat" error={errors.category_id?.message}>
          <NativeSelect id="rr-cat" {...register("category_id")}>
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
      </div>
      <Field
        label={k === "expense" ? "Se paga con" : "Se recibe en"}
        htmlFor="rr-source"
        hint="Opcional: se usará por defecto al registrar el pago."
      >
        <NativeSelect id="rr-source" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="">Decidir al registrar</option>
          <optgroup label="Cuentas">
            {accounts.filter((a) => a.is_active).map((a) => (
              <option key={a.id} value={`acc:${a.id}`}>
                {a.name}
              </option>
            ))}
          </optgroup>
          {k === "expense" && cards.length > 0 && (
            <optgroup label="Tarjetas de crédito">
              {cards.filter((c) => c.is_active).map((c) => (
                <option key={c.id} value={`card:${c.id}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </NativeSelect>
      </Field>
      {k === "expense" && (
        <label className="flex items-center gap-3 rounded-xl border px-3 py-2.5 text-sm">
          <input type="checkbox" className="size-4 accent-[var(--primary)]" {...register("is_subscription")} />
          Es una suscripción (streaming, apps, membresías)
        </label>
      )}
      <Field label="Notas" htmlFor="rr-notes">
        <Textarea id="rr-notes" rows={2} {...register("notes")} />
      </Field>
      <p className="text-xs text-muted-foreground">
        La regla no mueve dinero por sí sola. Cuando ocurra, tócala y elige “Registrar” para crear el movimiento real.
      </p>
      <Button type="submit" size="lg" loading={isSubmitting}>
        {rule ? "Guardar cambios" : "Crear"}
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Registrar ocurrencia                                                       */
/* -------------------------------------------------------------------------- */
type RegValues = z.input<typeof registerRecurringSchema>;

export function RegisterOccurrenceForm({
  rule,
  accounts,
  cards,
  onDone,
}: { rule: RecurringRule; accounts: AccountWithBalance[]; cards: CardSummary[]; onDone?: () => void }) {
  const activeAccounts = accounts.filter((a) => a.is_active);
  const defaultSource = rule.credit_card_id
    ? `card:${rule.credit_card_id}`
    : `acc:${rule.account_id ?? activeAccounts.find((a) => a.is_default)?.id ?? activeAccounts[0]?.id ?? ""}`;
  const [source, setSource] = useState(defaultSource);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegValues, unknown, z.output<typeof registerRecurringSchema>>({
    resolver: zodResolver(registerRecurringSchema),
    defaultValues: {
      rule_id: rule.id,
      occurred_on: rule.next_date > todayISO() ? todayISO() : rule.next_date,
      amount: rule.amount,
      account_id: defaultSource.startsWith("acc:") ? defaultSource.slice(4) : "",
      credit_card_id: defaultSource.startsWith("card:") ? defaultSource.slice(5) : "",
      status: "confirmed",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const res = await registerRecurring({
      ...values,
      account_id: source.startsWith("acc:") ? source.slice(4) : null,
      credit_card_id: source.startsWith("card:") ? source.slice(5) : null,
    });
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.message ?? "Registrado");
    onDone?.();
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <p className="rounded-xl bg-muted px-3 py-2 text-sm">
        Ocurrencia del <b>{formatDate(rule.next_date, "long")}</b>. Al registrarla, la próxima fecha avanza
        automáticamente.
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe" htmlFor="ro-amount" error={errors.amount?.message}>
          <Input id="ro-amount" inputMode="decimal" className="tabular" {...register("amount")} />
        </Field>
        <Field label="Fecha" htmlFor="ro-date" error={errors.occurred_on?.message}>
          <Input id="ro-date" type="date" {...register("occurred_on")} />
        </Field>
      </div>
      <Field label={rule.kind === "expense" ? "Pagado con" : "Recibido en"} htmlFor="ro-source" error={errors.account_id?.message}>
        <NativeSelect id="ro-source" value={source} onChange={(e) => setSource(e.target.value)}>
          <optgroup label="Cuentas">
            {activeAccounts.map((a) => (
              <option key={a.id} value={`acc:${a.id}`}>
                {a.name} · {formatMoney(a.balance)}
              </option>
            ))}
          </optgroup>
          {rule.kind === "expense" && cards.length > 0 && (
            <optgroup label="Tarjetas de crédito">
              {cards.filter((c) => c.is_active).map((c) => (
                <option key={c.id} value={`card:${c.id}`}>
                  {c.name}
                </option>
              ))}
            </optgroup>
          )}
        </NativeSelect>
      </Field>
      <Field label="Estado" htmlFor="ro-status">
        <NativeSelect id="ro-status" {...register("status")}>
          <option value="confirmed">{rule.kind === "expense" ? "Pagado" : "Recibido"}</option>
          <option value="pending">Pendiente (aún no afecta el saldo)</option>
        </NativeSelect>
      </Field>
      <Button type="submit" size="lg" loading={isSubmitting}>
        Registrar movimiento
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
/* Lista                                                                      */
/* -------------------------------------------------------------------------- */
export function RecurringList({ rules, ...sources }: Sources & { rules: RecurringRule[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<RecurringRule | null>(null);
  const [registering, setRegistering] = useState<RecurringRule | null>(null);
  const [deleting, setDeleting] = useState<RecurringRule | null>(null);
  const today = todayISO();

  async function run(fn: () => Promise<ActionResult>) {
    const res = await fn();
    if (res.ok) {
      toast.success(res.message ?? "Listo");
      router.refresh();
    } else toast.error(res.error);
  }

  return (
    <>
      <ul className="divide-y">
        {rules.map((r) => {
          const overdue = r.is_active && r.next_date < today;
          return (
            <li key={r.id} className={cn("flex items-center gap-3 py-3", !r.is_active && "opacity-50")}>
              <span
                className="flex size-10 shrink-0 items-center justify-center rounded-xl text-sm font-semibold text-white"
                style={{ backgroundColor: r.category?.color ?? "#64748b" }}
                aria-hidden
              >
                {r.name.charAt(0).toUpperCase()}
              </span>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className="truncate text-sm font-medium">{r.name}</p>
                  {r.is_subscription && <Badge tone="primary">Suscripción</Badge>}
                  {!r.is_active && <Badge>Pausado</Badge>}
                </div>
                <p className="truncate text-xs text-muted-foreground">
                  {FREQUENCY_LABEL[r.frequency]} · {r.credit_card?.name ?? r.account?.name ?? "sin cuenta asignada"}
                </p>
              </div>
              <div className="flex shrink-0 flex-col items-end gap-0.5">
                <p className={cn("tabular text-sm font-semibold", r.kind === "income" ? "text-income" : "text-foreground")}>
                  {formatMoney(r.amount)}
                </p>
                <span className={cn("text-xs", overdue ? "font-medium text-destructive" : "text-muted-foreground")}>
                  {overdue ? "Vencido · " : ""}
                  {formatDate(r.next_date)}
                </span>
              </div>
              {r.is_active && (
                <Button size="sm" variant="outline" className="hidden sm:inline-flex" onClick={() => setRegistering(r)}>
                  <Check /> Registrar
                </Button>
              )}
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  aria-label="Acciones"
                  className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content
                    align="end"
                    sideOffset={4}
                    className="z-50 min-w-48 rounded-xl border bg-popover p-1 text-sm shadow-lg"
                  >
                    {r.is_active && (
                      <Item icon={<Check />} onSelect={() => setRegistering(r)}>
                        Registrar {r.kind === "expense" ? "pago" : "ingreso"}
                      </Item>
                    )}
                    {r.is_active && (
                      <Item icon={<SkipForward />} onSelect={() => run(() => skipRecurring({ id: r.id }))}>
                        Omitir esta vez
                      </Item>
                    )}
                    <Item icon={<Pencil />} onSelect={() => setEditing(r)}>
                      Editar
                    </Item>
                    <Item
                      icon={r.is_active ? <Pause /> : <Play />}
                      onSelect={() => run(() => setRecurringActive({ id: r.id }, !r.is_active))}
                    >
                      {r.is_active ? "Pausar" : "Reanudar"}
                    </Item>
                    <Item icon={<Trash2 />} destructive onSelect={() => setDeleting(r)}>
                      Eliminar
                    </Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!registering} onOpenChange={(o) => !o && setRegistering(null)}>
        {registering && (
          <DialogContent title={`Registrar ${registering.name}`}>
            <RegisterOccurrenceForm
              rule={registering}
              accounts={sources.accounts}
              cards={sources.cards}
              onDone={() => {
                setRegistering(null);
                router.refresh();
              }}
            />
          </DialogContent>
        )}
      </Dialog>
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title="Editar recurrente">
            <RecurringForm
              rule={editing}
              kind={editing.kind}
              {...sources}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          </DialogContent>
        )}
      </Dialog>
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(o) => !o && setDeleting(null)}
        title="¿Eliminar este recurrente?"
        description="Se elimina la regla. Los movimientos que ya registraste con ella se conservan en tu historial."
        confirmLabel="Eliminar"
        onConfirm={() => run(() => deleteRecurring({ id: deleting!.id }))}
      />
    </>
  );
}

function Item({
  children,
  icon,
  onSelect,
  destructive,
}: {
  children: React.ReactNode;
  icon: React.ReactNode;
  onSelect: () => void;
  destructive?: boolean;
}) {
  return (
    <DropdownMenu.Item
      onSelect={onSelect}
      className={cn(
        "flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-muted [&_svg]:size-4",
        destructive && "text-destructive",
      )}
    >
      {icon}
      {children}
    </DropdownMenu.Item>
  );
}

export function NewRecurringButton({
  kind,
  label,
  variant = "default",
  ...sources
}: Sources & { kind: "income" | "expense"; label: string; variant?: "default" | "outline" }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button variant={variant} onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      <DialogContent title={kind === "expense" ? "Nuevo pago recurrente" : "Nuevo ingreso recurrente"}>
        <RecurringForm
          kind={kind}
          {...sources}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
