"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronRight, CreditCard, HandCoins } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MovementForm, MovementKindTabs, type MovementKind } from "@/components/forms/movement-form";
import { CardPaymentForm, LoanPaymentForm } from "@/components/forms/payment-forms";
import { formatMoney, money } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import type { AccountWithBalance, CardSummary, Category, LoanInstallment, LoanSummary } from "@/lib/types";

type OpenOptions = { kind?: MovementKind; accountId?: string; cardId?: string };

type View =
  | { type: "movement"; kind: MovementKind; accountId?: string; cardId?: string }
  | { type: "payments" }
  | { type: "card-payment"; cardId: string }
  | { type: "loan-payment"; loanId: string; installment?: LoanInstallment | null };

type Ctx = {
  open: (opts?: OpenOptions) => void;
  openPayments: () => void;
  payCard: (cardId: string) => void;
  payLoan: (loanId: string, installment?: LoanInstallment | null) => void;
};

const QuickAddContext = createContext<Ctx | null>(null);

export function useQuickAdd() {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd debe usarse dentro de QuickAddProvider");
  return ctx;
}

export function QuickAddProvider({
  accounts,
  categories,
  cards,
  loans,
  children,
}: {
  accounts: AccountWithBalance[];
  categories: Category[];
  cards: CardSummary[];
  loans: LoanSummary[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [view, setView] = useState<View>({ type: "movement", kind: "expense" });
  const [formKey, setFormKey] = useState(0);

  const show = useCallback((v: View) => {
    setView(v);
    setFormKey((k) => k + 1);
    setIsOpen(true);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      open: (opts) => show({ type: "movement", kind: opts?.kind ?? "expense", accountId: opts?.accountId, cardId: opts?.cardId }),
      openPayments: () => show({ type: "payments" }),
      payCard: (cardId) => show({ type: "card-payment", cardId }),
      payLoan: (loanId, installment) => show({ type: "loan-payment", loanId, installment }),
    }),
    [show],
  );

  const done = () => {
    setIsOpen(false);
    router.refresh();
  };

  const card = view.type === "card-payment" ? cards.find((c) => c.id === view.cardId) : undefined;
  const loan = view.type === "loan-payment" ? loans.find((l) => l.id === view.loanId) : undefined;

  const titles: Record<MovementKind, string> = {
    expense: "Nuevo gasto",
    income: "Nuevo ingreso",
    transfer: "Transferir entre cuentas",
  };
  const title =
    view.type === "movement"
      ? titles[view.kind]
      : view.type === "payments"
        ? "Registrar un pago"
        : view.type === "card-payment"
          ? `Pagar ${card?.name ?? "tarjeta"}`
          : `Pagar ${loan?.name ?? "préstamo"}`;

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent title={title}>
          {view.type === "movement" && (
            <div className="flex flex-col gap-4">
              <MovementKindTabs value={view.kind} onChange={(k) => setView({ ...view, kind: k })} />
              <MovementForm
                key={`${view.kind}-${formKey}`}
                kind={view.kind}
                accounts={accounts}
                categories={categories}
                cards={cards}
                defaultAccountId={view.accountId}
                defaultCardId={view.cardId}
                onDone={done}
              />
            </div>
          )}

          {view.type === "payments" && (
            <PaymentPicker
              cards={cards}
              loans={loans}
              onCard={(id) => setView({ type: "card-payment", cardId: id })}
              onLoan={(id) => setView({ type: "loan-payment", loanId: id })}
            />
          )}

          {view.type === "card-payment" && card && (
            <CardPaymentForm key={formKey} card={card} accounts={accounts} onDone={done} />
          )}

          {view.type === "loan-payment" && loan && (
            <LoanPaymentForm
              key={formKey}
              loan={loan}
              installment={view.installment}
              accounts={accounts}
              onDone={done}
            />
          )}
        </DialogContent>
      </Dialog>
    </QuickAddContext.Provider>
  );
}

function PaymentPicker({
  cards,
  loans,
  onCard,
  onLoan,
}: {
  cards: CardSummary[];
  loans: LoanSummary[];
  onCard: (id: string) => void;
  onLoan: (id: string) => void;
}) {
  const payableCards = cards.filter((c) => money(c.debt).gt(0));
  if (payableCards.length === 0 && loans.length === 0) {
    return (
      <p className="rounded-xl bg-muted px-4 py-6 text-center text-sm text-muted-foreground">
        No tienes tarjetas con deuda ni préstamos activos. Para pagar servicios o suscripciones usa “Nuevo gasto” o la
        sección Recurrentes.
      </p>
    );
  }
  const item =
    "flex w-full items-center gap-3 rounded-xl border px-3 py-3 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
  return (
    <div className="flex flex-col gap-4">
      {payableCards.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Tarjetas</h3>
          {payableCards.map((c) => (
            <button key={c.id} type="button" className={item} onClick={() => onCard(c.id)}>
              <span className="flex size-9 items-center justify-center rounded-lg text-white" style={{ backgroundColor: c.color }}>
                <CreditCard className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{c.name}</span>
                <span className="block text-xs text-muted-foreground">
                  Vence {formatDate(c.statement.due)} · período {formatMoney(c.statement.remaining)}
                </span>
              </span>
              <span className="tabular text-sm font-semibold">{formatMoney(c.debt)}</span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          ))}
        </section>
      )}
      {loans.length > 0 && (
        <section className="space-y-2">
          <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Préstamos y deudas</h3>
          {loans.map((l) => (
            <button key={l.id} type="button" className={item} onClick={() => onLoan(l.id)}>
              <span className="flex size-9 items-center justify-center rounded-lg bg-primary-soft text-primary">
                <HandCoins className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium">{l.name}</span>
                <span className="block text-xs text-muted-foreground">
                  {l.next_installment
                    ? `Cuota ${l.next_installment.number} · ${formatDate(l.next_installment.due_date)} · ${formatMoney(l.next_installment.amount)}`
                    : `Saldo ${formatMoney(l.outstanding)}`}
                </span>
              </span>
              <ChevronRight className="size-4 text-muted-foreground" />
            </button>
          ))}
        </section>
      )}
    </div>
  );
}
