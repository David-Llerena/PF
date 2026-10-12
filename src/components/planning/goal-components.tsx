"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Archive, Check, Minus, MoreHorizontal, Pencil, Plus } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, Field, Input } from "@/components/ui/primitives";
import { allocateGoal, archiveGoal, saveGoal } from "@/actions/planning";
import { goalAllocationSchema, goalSchema } from "@/lib/validation/schemas";
import { ACCOUNT_COLORS } from "@/lib/constants";
import { formatMoney, money } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { GoalSummary } from "@/services/planning";

function GoalForm({ goal, onDone }: { goal?: GoalSummary; onDone: () => void }) {
  const [name, setName] = useState(goal?.name ?? "");
  const [target, setTarget] = useState(goal?.target_amount ?? "");
  const [date, setDate] = useState(goal?.target_date ?? "");
  const [color, setColor] = useState(goal?.color ?? "#059669");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [pending, start] = useTransition();

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const payload = { id: goal?.id, name, target_amount: target, target_date: date || null, color, notes: goal?.notes ?? null };
        const parsed = goalSchema.safeParse(payload);
        if (!parsed.success) {
          setErrors(Object.fromEntries(parsed.error.issues.map((i) => [String(i.path[0]), i.message])));
          return;
        }
        setErrors({});
        start(async () => {
          const res = await saveGoal(payload);
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message ?? "Guardado");
          onDone();
        });
      }}
    >
      <Field label="Nombre" htmlFor="gl-name" error={errors.name}>
        <Input id="gl-name" placeholder="Ej. Fondo de emergencia, Viaje" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Monto objetivo" htmlFor="gl-target" error={errors.target_amount}>
          <Input id="gl-target" inputMode="decimal" className="tabular" placeholder="0.00" value={target} onChange={(e) => setTarget(e.target.value)} />
        </Field>
        <Field label="Fecha objetivo (opcional)" htmlFor="gl-date" error={errors.target_date}>
          <Input id="gl-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1.5 text-sm font-medium">Color</legend>
        <div className="flex flex-wrap gap-2">
          {ACCOUNT_COLORS.map((c) => (
            <button
              key={c}
              type="button"
              aria-label={`Color ${c}`}
              aria-pressed={color === c}
              onClick={() => setColor(c)}
              className="flex size-8 items-center justify-center rounded-full"
              style={{ backgroundColor: c }}
            >
              {color === c && <Check className="size-4 text-white" />}
            </button>
          ))}
        </div>
      </fieldset>
      <Button type="submit" size="lg" loading={pending}>
        {goal ? "Guardar" : "Crear meta"}
      </Button>
    </form>
  );
}

export function NewGoalButton({ label = "Nueva meta" }: { label?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      <DialogContent title="Nueva meta de ahorro">
        <GoalForm
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

function AllocationForm({
  goal,
  direction,
  unreserved,
  onDone,
}: {
  goal: GoalSummary;
  direction: "reserve" | "release";
  unreserved: string;
  onDone: () => void;
}) {
  const suggested =
    direction === "release"
      ? goal.allocated
      : money(goal.progress.monthlyNeeded ?? goal.progress.remaining).gt(money(unreserved))
        ? unreserved
        : (goal.progress.monthlyNeeded ?? goal.progress.remaining);
  const [amount, setAmount] = useState(money(suggested).gt(0) ? money(suggested).toFixed(2) : "");
  const [date, setDate] = useState(todayISO());
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      noValidate
      className="flex flex-col gap-4"
      onSubmit={(e) => {
        e.preventDefault();
        const payload = { goal_id: goal.id, direction, amount, occurred_on: date, note };
        const parsed = goalAllocationSchema.safeParse(payload);
        if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
        setError(null);
        start(async () => {
          const res = await allocateGoal(payload);
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message ?? "Listo");
          onDone();
        });
      }}
    >
      <p className="rounded-xl bg-muted px-3 py-2 text-sm">
        {direction === "reserve" ? (
          <>
            Disponible sin reservar: <b className="tabular">{formatMoney(unreserved)}</b>. Reservar no mueve dinero entre
            cuentas: aparta una parte de tu saldo para esta meta.
          </>
        ) : (
          <>
            Reservado en la meta: <b className="tabular">{formatMoney(goal.allocated)}</b>. Al liberar, ese dinero vuelve
            a estar disponible sin reservar.
          </>
        )}
      </p>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Importe" htmlFor="ga-amount" error={error ?? undefined}>
          <Input id="ga-amount" inputMode="decimal" className="tabular" value={amount} onChange={(e) => setAmount(e.target.value)} />
        </Field>
        <Field label="Fecha" htmlFor="ga-date">
          <Input id="ga-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
      </div>
      <Field label="Nota (opcional)" htmlFor="ga-note">
        <Input id="ga-note" value={note} maxLength={200} onChange={(e) => setNote(e.target.value)} />
      </Field>
      <Button type="submit" size="lg" loading={pending}>
        {direction === "reserve" ? "Reservar" : "Liberar"}
      </Button>
    </form>
  );
}

export function GoalCard({ goal, unreserved }: { goal: GoalSummary; unreserved: string }) {
  const router = useRouter();
  const [dialog, setDialog] = useState<null | "reserve" | "release" | "edit">(null);
  const [confirmArchive, setConfirmArchive] = useState(false);
  const p = goal.progress;
  const archived = goal.status === "archived";
  const done = () => {
    setDialog(null);
    router.refresh();
  };

  return (
    <li className={cn("flex flex-col gap-3 rounded-2xl border bg-card p-4 shadow-card", archived && "opacity-60")}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: goal.color }} />
          <div className="min-w-0">
            <p className="truncate font-medium">{goal.name}</p>
            <p className="text-xs text-muted-foreground">
              Meta {formatMoney(goal.target_amount)}
              {goal.target_date && ` · ${formatDate(goal.target_date, "long")}`}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-1">
          {p.achieved && <Badge tone="income">¡Cumplida!</Badge>}
          {p.overdue && <Badge tone="expense">Fecha vencida</Badge>}
          {archived && <Badge>Archivada</Badge>}
          {goal.is_demo && <Badge tone="info">Demo</Badge>}
          {!archived && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger aria-label="Acciones" className="flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted">
                <MoreHorizontal className="size-4" />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content align="end" className="z-50 min-w-40 rounded-xl border bg-popover p-1 text-sm shadow-lg">
                  <DropdownMenu.Item
                    onSelect={() => setDialog("edit")}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-muted [&_svg]:size-4"
                  >
                    <Pencil /> Editar
                  </DropdownMenu.Item>
                  <DropdownMenu.Item
                    onSelect={() => setConfirmArchive(true)}
                    className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-destructive outline-none data-[highlighted]:bg-muted [&_svg]:size-4"
                  >
                    <Archive /> Archivar
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </div>
      </div>

      <div className="flex items-end justify-between gap-2">
        <div>
          <p className="text-xs text-muted-foreground">Reservado</p>
          <p className="tabular text-2xl font-semibold">{formatMoney(goal.allocated)}</p>
        </div>
        <p className="tabular text-sm font-semibold" style={{ color: goal.color }}>
          {p.pct}%
        </p>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-muted" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={p.pct} aria-label={`Progreso de ${goal.name}`}>
        <div className="h-full rounded-full" style={{ width: `${p.pct}%`, backgroundColor: goal.color }} />
      </div>
      <p className="text-xs text-muted-foreground">
        {p.achieved
          ? "Alcanzaste el monto objetivo."
          : `Faltan ${formatMoney(p.remaining)}${p.monthlyNeeded ? ` · ${formatMoney(p.monthlyNeeded)} al mes para llegar a tiempo` : ""}`}
      </p>

      {!archived && (
        <div className="flex gap-2">
          <Button size="sm" className="flex-1" onClick={() => setDialog("reserve")} disabled={money(unreserved).lte(0)}>
            <Plus /> Reservar
          </Button>
          <Button size="sm" variant="outline" className="flex-1" onClick={() => setDialog("release")} disabled={money(goal.allocated).lte(0)}>
            <Minus /> Liberar
          </Button>
        </div>
      )}

      {goal.movements.length > 0 && (
        <details className="text-xs">
          <summary className="cursor-pointer text-muted-foreground">Últimos movimientos de la meta</summary>
          <ul className="mt-2 space-y-1">
            {goal.movements.map((m) => (
              <li key={m.id} className="flex justify-between gap-2">
                <span className="truncate">
                  {formatDate(m.occurred_on)} · {m.note ?? (money(m.amount).isNegative() ? "Liberado" : "Reservado")}
                </span>
                <span className={cn("tabular", money(m.amount).isNegative() ? "text-expense" : "text-income")}>
                  {formatMoney(m.amount, { signed: true })}
                </span>
              </li>
            ))}
          </ul>
        </details>
      )}

      <Dialog open={dialog === "reserve" || dialog === "release"} onOpenChange={(o) => !o && setDialog(null)}>
        {(dialog === "reserve" || dialog === "release") && (
          <DialogContent title={dialog === "reserve" ? `Reservar para ${goal.name}` : `Liberar de ${goal.name}`}>
            <AllocationForm goal={goal} direction={dialog} unreserved={unreserved} onDone={done} />
          </DialogContent>
        )}
      </Dialog>
      <Dialog open={dialog === "edit"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Editar meta">
          <GoalForm goal={goal} onDone={done} />
        </DialogContent>
      </Dialog>
      <ConfirmDialog
        open={confirmArchive}
        onOpenChange={setConfirmArchive}
        title="¿Archivar esta meta?"
        description="Se libera todo lo reservado (queda registrado) y la meta deja de sumar al total reservado."
        confirmLabel="Archivar"
        onConfirm={async () => {
          const res = await archiveGoal({ id: goal.id });
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message ?? "Listo");
          router.refresh();
        }}
      />
    </li>
  );
}

