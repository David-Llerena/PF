"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowRight, Check, CreditCard, Repeat, Sparkles, Wallet } from "lucide-react";
import { Brand } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { AccountForm } from "@/components/forms/account-form";
import { completeOnboarding, loadDemoData } from "@/actions/settings";
import { formatMoney } from "@/lib/money";
import { cn } from "@/lib/utils";
import type { AccountWithBalance, Institution } from "@/lib/types";

const STEPS = ["Bienvenida", "Primera cuenta", "Siguiente paso"];

export function Onboarding({
  name,
  institutions,
  accounts,
}: {
  name: string;
  institutions: Institution[];
  accounts: AccountWithBalance[];
}) {
  const router = useRouter();
  const [step, setStep] = useState(accounts.length > 0 ? 1 : 0);
  const [addingAnother, setAddingAnother] = useState(accounts.length === 0);
  const [pending, start] = useTransition();

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

      <ol className="mb-6 grid grid-cols-3 gap-2" aria-label="Progreso">
        {STEPS.map((s, i) => (
          <li key={s} className="flex flex-col gap-1.5">
            <span className={cn("h-1.5 rounded-full", i <= step ? "bg-primary" : "bg-muted")} />
            <span className={cn("text-xs", i === step ? "font-medium" : "text-muted-foreground")}>{s}</span>
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
              <Point>Los saldos se calculan automáticamente con cada ingreso, gasto o transferencia.</Point>
              <Point>Todo se ingresa manualmente: no conectamos con tu banco.</Point>
            </ul>
            <Button size="lg" className="w-full" onClick={() => setStep(1)}>
              Empezar <ArrowRight />
            </Button>
          </CardContent>
        </Card>
      )}

      {step === 1 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-xl">
              <Wallet className="size-5 text-primary" /> Tus cuentas
            </CardTitle>
            <CardDescription>Agrega tus bancos, efectivo o billeteras con su saldo actual.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {accounts.length > 0 && (
              <ul className="space-y-2">
                {accounts.map((a) => (
                  <li key={a.id} className="flex items-center justify-between rounded-xl bg-muted px-3 py-2 text-sm">
                    <span className="flex items-center gap-2">
                      <span className="size-2.5 rounded-full" style={{ backgroundColor: a.color }} />
                      {a.name}
                    </span>
                    <span className="tabular font-medium">{formatMoney(a.balance)}</span>
                  </li>
                ))}
              </ul>
            )}

            {addingAnother ? (
              <AccountForm
                institutions={institutions}
                isFirst={accounts.length === 0}
                onDone={() => {
                  setAddingAnother(false);
                  router.refresh();
                }}
              />
            ) : (
              <div className="flex flex-col gap-2">
                <Button variant="outline" onClick={() => setAddingAnother(true)}>
                  Agregar otra cuenta
                </Button>
                <Button size="lg" onClick={() => setStep(2)}>
                  Continuar <ArrowRight />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {step === 2 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-xl">¡Todo listo para empezar!</CardTitle>
            <CardDescription>Ya puedes registrar ingresos, gastos y transferencias.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <Upcoming icon={<CreditCard />} title="Tarjetas de crédito" text="Cupo, consumos, compras diferidas y pagos." />
              <Upcoming icon={<Repeat />} title="Ingresos y pagos recurrentes" text="Sueldo, suscripciones y vencimientos." />
            </div>
            <p className="text-xs text-muted-foreground">
              Estos pasos se habilitarán en la Fase 2. Por ahora, si recibes tu sueldo, regístralo como ingreso y
              márcalo como <b>pendiente</b> hasta que llegue: así no se suma a tu saldo antes de tiempo.
            </p>
            <Button size="lg" className="w-full" onClick={() => finish(false)} loading={pending}>
              Ir a mi resumen <ArrowRight />
            </Button>
            {accounts.length === 0 && (
              <Button variant="ghost" className="w-full" onClick={() => finish(true)} disabled={pending}>
                <Sparkles /> Explorar con datos de demostración
              </Button>
            )}
          </CardContent>
        </Card>
      )}
    </main>
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

function Upcoming({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-dashed px-3 py-2.5">
      <span className="flex size-9 items-center justify-center rounded-lg bg-muted text-muted-foreground [&_svg]:size-4">
        {icon}
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium">{title}</p>
        <p className="truncate text-xs text-muted-foreground">{text}</p>
      </div>
      <span className="rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">Fase 2</span>
    </div>
  );
}
