"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Copy, MoreHorizontal, Pencil, Plus, Trash2 } from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Badge, Field, Input, NativeSelect } from "@/components/ui/primitives";
import { copyBudgets, deleteBudget, saveBudget } from "@/actions/planning";
import { budgetSchema } from "@/lib/validation/schemas";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { Category } from "@/lib/types";
import type { BudgetRow } from "@/services/planning";

const LEVEL_BAR = { ok: "bg-income", warning: "bg-amber-500", over: "bg-destructive" } as const;

function BudgetForm({
  month,
  categories,
  budget,
  onDone,
}: {
  month: string;
  categories: Category[];
  budget?: BudgetRow;
  onDone: () => void;
}) {
  const [categoryId, setCategoryId] = useState(budget?.category_id ?? categories[0]?.id ?? "");
  const [amount, setAmount] = useState(budget?.amount ?? "");
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <form
      className="flex flex-col gap-4"
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        const payload = { id: budget?.budget_id, category_id: categoryId, period_month: month, amount };
        const parsed = budgetSchema.safeParse(payload);
        if (!parsed.success) return setError(parsed.error.issues[0]?.message ?? "Datos inválidos");
        setError(null);
        start(async () => {
          const res = await saveBudget(payload);
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message ?? "Guardado");
          onDone();
        });
      }}
    >
      <Field label="Categoría" htmlFor="bg-cat">
        <NativeSelect id="bg-cat" value={categoryId} disabled={!!budget} onChange={(e) => setCategoryId(e.target.value)}>
          {budget && <option value={budget.category_id}>{budget.name}</option>}
          {!budget &&
            categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
        </NativeSelect>
      </Field>
      <Field label="Monto mensual" htmlFor="bg-amount" error={error ?? undefined}>
        <Input
          id="bg-amount"
          inputMode="decimal"
          className="tabular h-12 text-lg font-semibold"
          placeholder="0.00"
          value={amount}
          autoFocus
          onChange={(e) => setAmount(e.target.value)}
        />
      </Field>
      <Button type="submit" size="lg" loading={pending}>
        {budget ? "Guardar" : "Crear presupuesto"}
      </Button>
    </form>
  );
}

export function NewBudgetButton({ month, categories }: { month: string; categories: Category[] }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  if (categories.length === 0) return null;
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus /> Presupuesto
      </Button>
      <DialogContent title="Nuevo presupuesto" description="Cuánto quieres gastar como máximo en la categoría este mes.">
        <BudgetForm
          month={month}
          categories={categories}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function CopyBudgetsButton({ from, to }: { from: string; to: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button
      variant="outline"
      loading={pending}
      onClick={() =>
        start(async () => {
          const res = await copyBudgets({ from, to });
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message ?? "Listo");
          router.refresh();
        })
      }
    >
      <Copy /> Copiar del mes anterior
    </Button>
  );
}

export function BudgetList({ rows, month }: { rows: BudgetRow[]; month: string }) {
  const router = useRouter();
  const [editing, setEditing] = useState<BudgetRow | null>(null);
  const [deleting, setDeleting] = useState<BudgetRow | null>(null);

  return (
    <>
      <ul className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((r) => (
          <li key={r.budget_id} className="rounded-2xl border bg-card p-4 shadow-card">
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <span className="size-3 shrink-0 rounded-full" style={{ backgroundColor: r.color }} />
                <p className="truncate font-medium">{r.name}</p>
                {r.level === "over" && <Badge tone="expense">Excedido</Badge>}
                {r.level === "warning" && <Badge tone="warning">Cerca del límite</Badge>}
              </div>
              <DropdownMenu.Root>
                <DropdownMenu.Trigger
                  aria-label={`Acciones de ${r.name}`}
                  className="-mr-2 -mt-1 flex size-8 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted"
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenu.Trigger>
                <DropdownMenu.Portal>
                  <DropdownMenu.Content align="end" className="z-50 min-w-40 rounded-xl border bg-popover p-1 text-sm shadow-lg">
                    <DropdownMenu.Item
                      onSelect={() => setEditing(r)}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 outline-none data-[highlighted]:bg-muted [&_svg]:size-4"
                    >
                      <Pencil /> Editar monto
                    </DropdownMenu.Item>
                    <DropdownMenu.Item
                      onSelect={() => setDeleting(r)}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-destructive outline-none data-[highlighted]:bg-muted [&_svg]:size-4"
                    >
                      <Trash2 /> Eliminar
                    </DropdownMenu.Item>
                  </DropdownMenu.Content>
                </DropdownMenu.Portal>
              </DropdownMenu.Root>
            </div>
            <div className="mt-3 flex items-end justify-between gap-2">
              <div>
                <p className="text-xs text-muted-foreground">Consumido</p>
                <p className="tabular text-lg font-semibold">{formatMoney(r.spent)}</p>
              </div>
              <div className="text-right">
                <p className="text-xs text-muted-foreground">{r.level === "over" ? "Excedido por" : "Restante"}</p>
                <p className={cn("tabular font-semibold", r.level === "over" ? "text-destructive" : "text-income")}>
                  {formatMoney(r.level === "over" ? r.remaining.replace("-", "") : r.remaining)}
                </p>
              </div>
            </div>
            <div
              className="mt-2 h-2.5 overflow-hidden rounded-full bg-muted"
              role="meter"
              aria-valuemin={0}
              aria-valuemax={100}
              aria-valuenow={Math.min(r.pct, 100)}
              aria-label={`${r.pct}% del presupuesto de ${r.name}`}
            >
              <div className={cn("h-full rounded-full", LEVEL_BAR[r.level])} style={{ width: `${Math.min(r.pct, 100)}%` }} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {r.pct}% de {formatMoney(r.amount)}
            </p>
          </li>
        ))}
      </ul>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (
          <DialogContent title={`Presupuesto · ${editing.name}`}>
            <BudgetForm
              month={month}
              categories={[]}
              budget={editing}
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
        title="¿Eliminar este presupuesto?"
        description="Solo se elimina el límite de este mes. Tus gastos no se modifican."
        confirmLabel="Eliminar"
        onConfirm={async () => {
          const res = await deleteBudget({ id: deleting!.budget_id });
          if (!res.ok) return void toast.error(res.error);
          toast.success(res.message ?? "Eliminado");
          router.refresh();
        }}
      />
    </>
  );
}
