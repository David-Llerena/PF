"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, CalendarPlus, CreditCard, Flag, Pencil, Plus, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { useQuickAdd } from "@/components/forms/quick-add";
import { CardForm, CardOpeningForm, PriorDeferredForm } from "@/components/cards/card-forms";
import { setCardActive } from "@/actions/cards";
import type { CardSummary, Institution } from "@/lib/types";

export function NewCardButton({ institutions, label = "Nueva tarjeta" }: { institutions: Institution[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <Button onClick={() => setOpen(true)}>
        <Plus /> {label}
      </Button>
      <DialogContent title="Nueva tarjeta de crédito" description="Sin número completo, CVV ni PIN.">
        <CardForm
          institutions={institutions}
          onDone={() => {
            setOpen(false);
            router.refresh();
          }}
        />
      </DialogContent>
    </Dialog>
  );
}

export function CardActions({
  card,
  institutions,
  opening,
}: {
  card: CardSummary;
  institutions: Institution[];
  opening: { amount: string; date: string } | null;
}) {
  const router = useRouter();
  const quick = useQuickAdd();
  const [dialog, setDialog] = useState<null | "edit" | "opening" | "prior">(null);
  const [confirm, setConfirm] = useState(false);
  const close = () => {
    setDialog(null);
    router.refresh();
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {card.is_active && (
          <>
            <Button size="sm" onClick={() => quick.open({ kind: "expense", cardId: card.id })}>
              <Plus /> Consumo
            </Button>
            <Button size="sm" variant="outline" onClick={() => quick.payCard(card.id)}>
              <CreditCard /> Pagar
            </Button>
            <Button size="sm" variant="outline" onClick={() => setDialog("prior")}>
              <CalendarPlus /> Diferido previo
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={() => setDialog("opening")}>
          <Flag /> Deuda inicial
        </Button>
        <Button size="sm" variant="outline" onClick={() => setDialog("edit")}>
          <Pencil /> Editar
        </Button>
        <Button size="sm" variant="ghost" onClick={() => setConfirm(true)}>
          {card.is_active ? <Ban /> : <RotateCcw />} {card.is_active ? "Desactivar" : "Reactivar"}
        </Button>
      </div>

      <ConfirmDialog
        open={confirm}
        onOpenChange={setConfirm}
        destructive={card.is_active}
        title={card.is_active ? "¿Desactivar esta tarjeta?" : "¿Reactivar esta tarjeta?"}
        description={
          card.is_active
            ? "Dejará de aparecer en formularios. Su deuda se sigue contando mientras no esté en cero y el historial se conserva."
            : "Volverá a aparecer en los formularios."
        }
        confirmLabel={card.is_active ? "Desactivar" : "Reactivar"}
        onConfirm={async () => {
          const res = await setCardActive({ id: card.id }, !card.is_active);
          if (res.ok) {
            toast.success(res.message ?? "Listo");
            router.refresh();
          } else toast.error(res.error);
        }}
      />

      <Dialog open={dialog === "edit"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Editar tarjeta">
          <CardForm institutions={institutions} card={card} onDone={close} />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "opening"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Deuda corriente inicial" description="Consumos no diferidos que debías al empezar a usar la app.">
          <CardOpeningForm cardId={card.id} current={opening} onDone={close} />
        </DialogContent>
      </Dialog>
      <Dialog open={dialog === "prior"} onOpenChange={(o) => !o && setDialog(null)}>
        <DialogContent title="Diferido anterior a la app" description="Compras diferidas que ya estabas pagando.">
          <PriorDeferredForm card={card} onDone={close} />
        </DialogContent>
      </Dialog>
    </>
  );
}
