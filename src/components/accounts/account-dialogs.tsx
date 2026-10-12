"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import type { z } from "zod";
import { ArrowLeftRight, Ban, Flag, Pencil, Plus, RotateCcw, Scale, Star } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { Field, Input, NativeSelect, Textarea } from "@/components/ui/primitives";
import { AccountForm } from "@/components/forms/account-form";
import { useQuickAdd } from "@/components/forms/quick-add";
import { adjustmentSchema, openingBalanceSchema } from "@/lib/validation/schemas";
import { createAdjustment } from "@/actions/transactions";
import { setAccountActive, setDefaultAccount, setOpeningBalance } from "@/actions/accounts";
import { formatMoney } from "@/lib/money";
import { todayISO } from "@/lib/dates";
import type { AccountWithBalance, Institution } from "@/lib/types";

export function NewAccountButton({
  institutions,
  isFirst,
  label = "Nueva cuenta",
}: {
  institutions: Institution[];
  isFirst?: boolean;
  label?: string;
}) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      <DialogContent title="Nueva cuenta" description="Banco, efectivo o billetera digital.">
        <AccountForm
          institutions={institutions}
          isFirst={isFirst}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function AccountActions({
  account,
  institutions,
  openingBalance,
}: {
  account: AccountWithBalance;
  institutions: Institution[];
  openingBalance: { amount: string; date: string } | null;
}) {
  const router = useRouter();
  const { open: openQuickAdd } = useQuickAdd();
  const [dialog, setDialog] = useState<null | "edit" | "adjust" | "opening">(null);
  const [confirmToggle, setConfirmToggle] = useState(false);
  const close = () => {
    setDialog(null);
    router.refresh();
  };

  async function toggleActive() {
    const res = await setAccountActive({ id: account.id }, !account.is_active);
    if (res.ok) {
      toast.success(res.message ?? "Listo");
      router.refresh();
    } else toast.error(res.error);
  }

  async function makeDefault() {
    const res = await setDefaultAccount({ id: account.id });
    if (res.ok) {
      toast.success(res.message ?? "Listo");
      router.refresh();
    } else toast.error(res.error);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {account.is_active && (
          <>
            <Button size="sm" onClick={() => openQuickAdd({ kind: "transfer", accountId: account.id })}>
              <ArrowLeftRight /> Transferir
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog("adjust")}>
              <Scale /> Ajustar saldo
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={() => setDialog("edit")}>
          <Pencil /> Editar
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDialog("opening")}>
          <Flag /> Saldo inicial
        </Button>
        {account.is_active && !account.is_default && (
          <Button size="sm" variant="ghost" onClick={makeDefault}>
            <Star /> Predeterminada
          </Button>
        )}
        <Button size="sm" variant="ghost" onClick={() => setConfirmToggle(true)}>
          {account.is_active ? <Ban /> : <RotateCcw />}
          {account.is_active ? "Desactivar" : "Reactivar"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirmToggle}
        onOpenChange={setConfirmToggle}
        destructive={account.is_active}
        title={account.is_active ? "¿Desactivar esta cuenta?" : "¿Reactivar esta cuenta?"}
        description={
          account.is_active
            ? "Dejará de aparecer en formularios y su saldo no se sumará al dinero disponible. El historial se conserva y puedes reactivarla cuando quieras."
            : "La cuenta volverá a sumarse al dinero disponible y a aparecer en los formularios."
        }
        confirmLabel={account.is_active ? "Desactivar" : "Reactivar"}
        onConfirm={toggleActive}
      />

      <Dialog open={dialog === "edit"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Editar cuenta">
          <AccountForm institutions={institutions} account={account} onDone={close} />
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "adjust"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent
          title="Ajustar saldo"
          description={`Saldo actual: ${formatMoney(account.balance)}. El ajuste no cuenta como ingreso ni gasto.`}
        >
          <AdjustmentForm account={account} onDone={close} />
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === "opening"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent
          title="Saldo inicial"
          description="El dinero que tenías en esta cuenta cuando empezaste a usar la app."
        >
          <OpeningBalanceForm accountId={account.id} current={openingBalance} onDone={close} />
        </DialogContent>
      </Dialog>
    </>
  );
}

/* -------------------------------------------------------------------------- */
type AdjValues = z.input<typeof adjustmentSchema>;

function AdjustmentForm({ account, onDone }: { account: AccountWithBalance; onDone: () => void }) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<AdjValues, unknown, z.output<typeof adjustmentSchema>>({
    resolver: zodResolver(adjustmentSchema),
    defaultValues: {
      account_id: account.id,
      direction: "decrease",
      amount: "",
      occurred_on: todayISO(),
      reason: "",
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const res = await createAdjustment(values);
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.message ?? "Ajuste registrado");
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Tipo" htmlFor="adj-dir">
          <NativeSelect id="adj-dir" {...register("direction")}>
            <option value="decrease">Disminuir saldo</option>
            <option value="increase">Aumentar saldo</option>
          </NativeSelect>
        </Field>
        <Field label="Importe" htmlFor="adj-amount" error={errors.amount?.message}>
          <Input id="adj-amount" inputMode="decimal" placeholder="0.00" className="tabular" {...register("amount")} />
        </Field>
      </div>
      <Field label="Fecha" htmlFor="adj-date" error={errors.occurred_on?.message}>
        <Input id="adj-date" type="date" {...register("occurred_on")} />
      </Field>
      <Field label="Motivo (obligatorio)" htmlFor="adj-reason" error={errors.reason?.message}>
        <Textarea
          id="adj-reason"
          rows={2}
          placeholder="Ej. Cuadre con el estado de cuenta del banco"
          {...register("reason")}
        />
      </Field>
      <Button type="submit" size="lg" loading={isSubmitting}>
        Registrar ajuste
      </Button>
    </form>
  );
}

/* -------------------------------------------------------------------------- */
type OpeningValues = z.input<typeof openingBalanceSchema>;

function OpeningBalanceForm({
  accountId,
  current,
  onDone,
}: {
  accountId: string;
  current: { amount: string; date: string } | null;
  onDone: () => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<OpeningValues, unknown, z.output<typeof openingBalanceSchema>>({
    resolver: zodResolver(openingBalanceSchema),
    defaultValues: {
      account_id: accountId,
      opening_balance: current?.amount ?? "",
      opening_date: current?.date ?? todayISO(),
    },
  });

  const onSubmit = handleSubmit(async (values) => {
    const res = await setOpeningBalance(values);
    if (!res.ok) return void toast.error(res.error);
    toast.success(res.message ?? "Actualizado");
    onDone();
  });

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-4" noValidate>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Saldo inicial" htmlFor="ob-amount" error={errors.opening_balance?.message}>
          <Input id="ob-amount" inputMode="decimal" placeholder="0.00" className="tabular" {...register("opening_balance")} />
        </Field>
        <Field label="Fecha" htmlFor="ob-date" error={errors.opening_date?.message}>
          <Input id="ob-date" type="date" {...register("opening_date")} />
        </Field>
      </div>
      <p className="text-xs text-muted-foreground">
        Al cambiarlo, el saldo anterior queda anulado en la auditoría y el saldo actual se recalcula automáticamente.
        Si lo dejas en 0 se elimina el saldo inicial.
      </p>
      <Button type="submit" size="lg" loading={isSubmitting}>
        Guardar saldo inicial
      </Button>
    </form>
  );
}
