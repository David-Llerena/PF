"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ArrowDownLeft,
  ArrowLeftRight,
  ArrowUpRight,
  Check,
  Flag,
  MoreHorizontal,
  Pencil,
  Scale,
  Ban,
  CreditCard,
  HandCoins,
} from "lucide-react";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import { Badge } from "@/components/ui/primitives";
import { ConfirmDialog, Dialog, DialogContent } from "@/components/ui/dialog";
import { MovementForm } from "@/components/forms/movement-form";
import { confirmTransaction, voidTransaction } from "@/actions/transactions";
import { KIND_LABEL, PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { formatMoney } from "@/lib/money";
import { formatDate, todayISO } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { AccountWithBalance, CardSummary, Category, Transaction } from "@/lib/types";

type Row = Transaction & { balanceAfter?: string | null };

/**
 * Lista de movimientos. Se renderiza como lista de tarjetas en móvil y
 * como filas compactas en escritorio (sin scroll horizontal).
 */
export function TransactionList({
  transactions,
  accounts,
  categories,
  cards = [],
  perspectiveAccountId,
  perspectiveCardId,
  showBalance = false,
}: {
  transactions: Row[];
  accounts: AccountWithBalance[];
  categories: Category[];
  cards?: CardSummary[];
  /** Si se indica, el signo de las transferencias se muestra desde esa cuenta. */
  perspectiveAccountId?: string;
  /** Vista desde una tarjeta: los pagos se muestran como abono (+). */
  perspectiveCardId?: string;
  showBalance?: boolean;
}) {
  const [editing, setEditing] = useState<Transaction | null>(null);
  const router = useRouter();

  return (
    <>
      <ul className="divide-y">
        {transactions.map((t) => (
          <TransactionRow
            key={t.id}
            t={t}
            perspectiveAccountId={perspectiveAccountId}
            perspectiveCardId={perspectiveCardId}
            showBalance={showBalance}
            onEdit={() => setEditing(t)}
          />
        ))}
      </ul>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        {editing && (editing.kind === "income" || editing.kind === "expense" || editing.kind === "transfer") && (
          <DialogContent title={`Editar ${KIND_LABEL[editing.kind].toLowerCase()}`}>
            <MovementForm
              kind={editing.kind}
              transaction={editing}
              accounts={accounts}
              categories={categories}
              cards={cards}
              onDone={() => {
                setEditing(null);
                router.refresh();
              }}
            />
          </DialogContent>
        )}
      </Dialog>
    </>
  );
}

function signedFor(t: Transaction, perspective?: string, cardPerspective?: string): { sign: 1 | -1 | 0; tone: string } {
  if (t.kind === "card_payment") {
    return cardPerspective ? { sign: 1, tone: "text-income" } : { sign: -1, tone: "text-info" };
  }
  if (t.kind === "card_opening") return { sign: -1, tone: "text-foreground" };
  if (t.kind === "loan_payment") return { sign: -1, tone: "text-info" };
  if (t.kind === "transfer") {
    if (perspective && t.counter_account_id === perspective) return { sign: 1, tone: "text-info" };
    if (perspective && t.account_id === perspective) return { sign: -1, tone: "text-info" };
    return { sign: 0, tone: "text-info" };
  }
  if (t.direction === 1) return { sign: 1, tone: "text-income" };
  return { sign: -1, tone: t.kind === "expense" ? "text-expense" : "text-foreground" };
}

function KindIcon({ t }: { t: Transaction }) {
  const base = "flex size-10 shrink-0 items-center justify-center rounded-xl [&_svg]:size-[18px]";
  if (t.kind === "income") return <span className={cn(base, "bg-income-soft text-income")}><ArrowDownLeft /></span>;
  if (t.kind === "expense")
    return (
      <span
        className={cn(base, "text-white")}
        style={{ backgroundColor: t.category?.color ?? "var(--expense)" }}
      >
        <ArrowUpRight />
      </span>
    );
  if (t.kind === "transfer") return <span className={cn(base, "bg-info-soft text-info")}><ArrowLeftRight /></span>;
  if (t.kind === "opening" || t.kind === "card_opening")
    return <span className={cn(base, "bg-primary-soft text-primary")}><Flag /></span>;
  if (t.kind === "card_payment") return <span className={cn(base, "bg-info-soft text-info")}><CreditCard /></span>;
  if (t.kind === "loan_payment") return <span className={cn(base, "bg-info-soft text-info")}><HandCoins /></span>;
  if (t.kind === "loan_disbursement")
    return <span className={cn(base, "bg-income-soft text-income")}><HandCoins /></span>;
  return <span className={cn(base, "bg-muted text-muted-foreground")}><Scale /></span>;
}

function TransactionRow({
  t,
  perspectiveAccountId,
  perspectiveCardId,
  showBalance,
  onEdit,
}: {
  t: Row;
  perspectiveAccountId?: string;
  perspectiveCardId?: string;
  showBalance: boolean;
  onEdit: () => void;
}) {
  const router = useRouter();
  const [confirmVoid, setConfirmVoid] = useState(false);
  const { sign, tone } = signedFor(t, perspectiveAccountId, perspectiveCardId);
  const isVoid = t.status === "void";
  const isPending = t.status === "pending";
  const overdue = isPending && t.occurred_on < todayISO();
  const isLinked = !!t.payment_group_id || !!t.card_purchase_id;
  const editable =
    !isVoid && !isLinked && (t.kind === "income" || t.kind === "expense" || t.kind === "transfer");
  const voidable = !isVoid && t.kind !== "opening" && !(t.kind === "card_opening" && !t.card_purchase_id);
  const source = t.credit_card?.name ?? t.account?.name;

  const subtitle = [
    t.kind === "transfer"
      ? `${t.account?.name ?? "?"} → ${t.counter_account?.name ?? "?"}`
      : t.kind === "card_payment"
        ? `${t.account?.name ?? "?"} → ${t.credit_card?.name ?? "?"}`
        : t.category?.name ?? KIND_LABEL[t.kind],
    t.kind !== "transfer" && t.kind !== "card_payment" && !perspectiveAccountId && !perspectiveCardId ? source : null,
    t.card_purchase_id && t.kind === "expense" ? "Diferido" : null,
    t.payment_method && t.payment_method !== "card" && PAYMENT_METHOD_LABEL[t.payment_method] !== source
      ? PAYMENT_METHOD_LABEL[t.payment_method]
      : null,
  ]
    .filter(Boolean)
    .join(" · ");

  const amountText =
    sign === 0 ? formatMoney(t.amount) : formatMoney(sign === 1 ? t.amount : `-${t.amount}`, { signed: true });

  async function run(action: typeof confirmTransaction) {
    const res = await action({ id: t.id });
    if (res.ok) {
      toast.success(res.message ?? "Listo");
      router.refresh();
    } else toast.error(res.error);
  }

  return (
    <li className={cn("flex items-center gap-3 py-3", isVoid && "opacity-50")}>
      <KindIcon t={t} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className={cn("truncate text-sm font-medium", isVoid && "line-through")}>{t.description}</p>
          {t.is_demo && <Badge tone="info">Demo</Badge>}
        </div>
        <p className="truncate text-xs text-muted-foreground">{subtitle}</p>
        {t.kind === "adjustment" && t.reason && (
          <p className="truncate text-xs italic text-muted-foreground">Motivo: {t.reason}</p>
        )}
      </div>
      <div className="flex shrink-0 flex-col items-end gap-0.5">
        <p className={cn("tabular text-sm font-semibold", isPending ? "text-muted-foreground" : tone)}>{amountText}</p>
        <div className="flex items-center gap-1.5">
          {isPending && <Badge tone={overdue ? "expense" : "warning"}>{overdue ? "Vencido" : "Pendiente"}</Badge>}
          {isVoid && <Badge>Anulado</Badge>}
          <span className="text-xs text-muted-foreground">{formatDate(t.occurred_on)}</span>
        </div>
        {showBalance && t.balanceAfter != null && (
          <span className="tabular text-[11px] text-muted-foreground">Saldo {formatMoney(t.balanceAfter)}</span>
        )}
      </div>

      {(editable || voidable || isPending) && (
        <DropdownMenu.Root>
          <DropdownMenu.Trigger
            aria-label="Acciones"
            className="-mr-1 flex size-9 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              align="end"
              sideOffset={4}
              className="z-50 min-w-44 rounded-xl border bg-popover p-1 text-sm shadow-lg data-[state=open]:animate-fade-in"
            >
              {isPending && (
                <MenuItem onSelect={() => run(confirmTransaction)} icon={<Check />}>
                  Marcar como {t.kind === "income" ? "recibido" : "pagado"}
                </MenuItem>
              )}
              {editable && (
                <MenuItem onSelect={onEdit} icon={<Pencil />}>
                  Editar
                </MenuItem>
              )}
              {voidable && (
                <MenuItem onSelect={() => setConfirmVoid(true)} icon={<Ban />} destructive>
                  Anular
                </MenuItem>
              )}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
      <ConfirmDialog
        open={confirmVoid}
        onOpenChange={setConfirmVoid}
        title="¿Anular este movimiento?"
        description={
          t.card_purchase_id
            ? "Se anulará la compra diferida completa (consumo, intereses y cronograma de cuotas). Quedará en el historial como anulada."
            : t.payment_group_id
              ? "Se anulará el pago completo (capital e intereses) y la cuota volverá a quedar pendiente."
              : "Dejará de afectar tus saldos y reportes. Quedará registrado en el historial como anulado."
        }
        confirmLabel="Anular"
        onConfirm={() => run(voidTransaction)}
      />
    </li>
  );
}

function MenuItem({
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
