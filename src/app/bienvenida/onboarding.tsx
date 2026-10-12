"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, CreditCard, Repeat, Sparkles, Wallet } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { AccountForm } from "@/components/forms/account-form";
import { CardForm } from "@/components/cards/card-forms";
import { RecurringForm } from "@/components/recurring/recurring-components";
import { completeOnboarding, loadDemoData } from "@/actions/settings";
import { FREQUENCY_LABEL } from "@/lib/finance/recurrence";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { AccountWithBalance, CardSummary, Category, Institution, RecurringRule } from "@/lib/types";

const STEPS = ["Inicio", "Cuentas", "Tarjetas", "Ingresos", "Listo"];

export function Onboarding({
  name,
  institutions,
  accounts,
  cards,
  incomeRules,
  categories,
}: {
  name: string;
  institutions: Institution[];
  accounts: AccountWithBalance[];
  cards: CardSummary[];
  incomeRules: RecurringRule[];
  categories: Category[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(accounts.length > 0 ? 1 : 0);
  const [adding, setAdding] = useState<null | "account" | "card" | "income">(accounts.length === 0 ? "account" : null);
  const [pending, start] = useTransition();

  function go(next: number) {
    setStep(next);
    setAdding(null);
  }

  function refreshAfterAdd() {
    setAdding(null);
    router.refresh();
  }

  function finish(withDemo: boolean) {
    start(async () => {
      if (withDemo) {
        const demo = await loadDemoData();
        if (!demo.ok) toast.error(demo.error);
      }
      const res = await completeOnboarding();
      if (!res.ok) return void toast.error(res.error);
      router.replace("/");
      router.refresh();
    });
  }

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-4 pb-[max(2rem,env(safe-area-inset-bottom))] pt-[max(1.5rem,env(safe-area-inset-top))]">
      <div className="mb-6 flex items-center justify-between">
        <Brand />
        <button
          type="button"
          onClick={() => finish(false)}
          className="text-sm text-muted-foreground hover:text-foreground"
          disabled={pending}
        >
          Omitir
        </button>
      </div>

      <ol className="mb-6 grid grid-cols-5 gap-1.5" aria-label="Progreso">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-col gap-1.5">
            <span className={cn("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
            <span className={cn("text-[11px]", i === step ? "font-medium" : "text-muted-foreground")}>{s}</span>
          </li>
        ))}
      </ol>

      {step === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">{name ? `¡Hola, ${name.split(" ")[0]}!` : "¡Hola!"}</CardTitle>
            <CardDescription>Vamos a registrar tu situación financiera actual en un par de minutos.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ul className="space-y-3 text-sm">
              <Point>Registra el saldo que tienes <b>hoy</b> en cada cuenta. No necesitas cargar movimientos pasados.</Point>
              <Point>Agrega tus tarjetas con la deuda actual: se registra como deuda inicial, no como gasto.</Point>
              <Point>Configura tu sueldo como ingreso recurrente: no suma dinero hasta que lo registres como recibido.</Point>
              <Point>Todo se ingresa manualmente: no conectamos con tu banco.</Point>
            </ul>
            <Button size="lg" className="w-full" onClick={() => go(1)}>
              Empezar <ArrowRight />
            </Button>
            {accounts.length === 0 && (
              <Button variant="ghost" className="w-full" onClick={() => finish(true)} disabled={pending}>
                <Sparkles /> Solo quiero explorar con datos de demostración
              </Button>
            )}
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <StepCard
          icon={<Wallet />}
          title="Tus cuentas"
          description="Bancos, efectivo o billeteras con su saldo actual."
          items={accounts.map((a) => ({ id: a.id, color: a.color, label: a.name, value: formatMoney(a.balance) }))}
          adding={adding === "account"}
          addLabel={accounts.length ? "Agregar otra cuenta" : "Agregar cuenta"}
          onAdd={() => setAdding("account")}
          onNext={() => go(2)}
          nextDisabled={accounts.length === 0}
        >
          <AccountForm institutions={institutions} isFirst={accounts.length === 0} onDone={refreshAfterAdd} />
        </StepCard>
      )}

      {step === 2 && (
        <StepCard
          icon={<CreditCard />}
          title="Tarjetas de crédito"
          description="Opcional. Cupo, fechas de corte y pago, y la deuda que tienes hoy."
          items={cards.map((c) => ({ id: c.id, color: c.color, label: c.name, value: `Deuda ${formatMoney(c.debt)}` }))}
          adding={adding === "card"}
          addLabel={cards.length ? "Agregar otra tarjeta" : "Agregar tarjeta"}
          onAdd={() => setAdding("card")}
          onNext={() => go(3)}
          nextLabel={cards.length ? "Continuar" : "No tengo tarjetas · continuar"}
        >
          <CardForm institutions={institutions} onDone={refreshAfterAdd} />
        </StepCard>
      )}

      {step === 3 && (
        <StepCard
          icon={<Repeat />}
          title="Ingreso recurrente"
          description="Opcional. Tu sueldo u otro ingreso periódico, para planificar tus pagos."
          items={incomeRules.map((r) => ({
            id: r.id,
            color: "#16a34a",
            label: `${r.name} · ${FREQUENCY_LABEL[r.frequency]}`,
            value: formatMoney(r.amount),
          }))}
          adding={adding === "income"}
          addLabel={incomeRules.length ? "Agregar otro ingreso" : "Agregar ingreso recurrente"}
          onAdd={() => setAdding("income")}
          onNext={() => go(4)}
          nextLabel={incomeRules.length ? "Continuar" : "Omitir este paso"}
        >
          <RecurringForm kind="income" accounts={accounts} cards={cards} categories={categories} onDone={refreshAfterAdd} />
        </StepCard>
      )}

      {step === 4 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">¡Todo listo!</CardTitle>
            <CardDescription>Ya puedes registrar gastos, consumos con tarjeta, pagos y transferencias.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Usa el botón <b>+</b> para registrar en segundos. En <b>Recurrentes</b> puedes agregar Netflix, internet,
              teléfono o gimnasio; en <b>Préstamos</b>, tus deudas con su tabla de cuotas.
            </p>
            <Button size="lg" className="w-full" onClick={() => finish(false)} loading={pending}>
              Ir a mi resumen <ArrowRight />
            </Button>
          </CardContent>
        </Card>
      )}
    </main>
  );
}

function StepCard({
  icon,
  title,
  description,
  items,
  adding,
  addLabel,
  onAdd,
  onNext,
  nextLabel = "Continuar",
  nextDisabled,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  items: { id: string; color: string; label: string; value: string }[];
  adding: boolean;
  addLabel: string;
  onAdd: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextDisabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-xl [&_svg]:size-5 [&_svg]:text-primary">
          {icon} {title}
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {items.length > 0 && (
          <ul className="space-y-2">
            {items.map((i) => (
              <li key={i.id} className="flex items-center justify-between gap-2 rounded-xl bg-muted px-3 py-2 text-sm">
                <span className="flex min-w-0 items-center gap-2">
                  <span className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: i.color }} />
                  <span className="truncate">{i.label}</span>
                </span>
                <span className="tabular shrink-0 font-medium">{i.value}</span>
              </li>
            ))}
          </ul>
        )}
        {adding ? (
          children
        ) : (
          <div className="flex flex-col gap-2">
            <Button variant="outline" onClick={onAdd}>
              {addLabel}
            </Button>
            <Button size="lg" onClick={onNext} disabled={nextDisabled}>
              {nextLabel} <ArrowRight />
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Point({ children }: { children: React.ReactNode }) {
  return (
    <li className="flex gap-2.5">
      <span className="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-income-soft text-income">
        <Check className="size-3" />
      </span>
      <span>{children}</span>
    </li>
  );
}
