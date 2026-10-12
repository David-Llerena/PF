"use client";

import { ArrowDownLeft, ArrowLeftRight, ArrowUpRight, CreditCard } from "lucide-react";
import { useQuickAdd } from "@/components/forms/quick-add";
import { cn } from "@/lib/utils";

export function QuickActions() {
  const { open, openPayments } = useQuickAdd();
  const items = [
    { label: "Gasto", icon: ArrowUpRight, tone: "bg-expense-soft text-expense", onClick: () => open({ kind: "expense" }) },
    { label: "Ingreso", icon: ArrowDownLeft, tone: "bg-income-soft text-income", onClick: () => open({ kind: "income" }) },
    { label: "Transferir", icon: ArrowLeftRight, tone: "bg-info-soft text-info", onClick: () => open({ kind: "transfer" }) },
  ];

  return (
    <div className="grid grid-cols-4 gap-2">
      {items.map((i) => (
        <button
          key={i.label}
          type="button"
          onClick={i.onClick}
          className="flex flex-col items-center gap-1.5 rounded-2xl border bg-card px-2 py-3 text-xs font-medium shadow-card transition-transform active:scale-[0.97]"
        >
          <span className={cn("flex size-10 items-center justify-center rounded-xl", i.tone)}>
            <i.icon className="size-5" />
          </span>
          {i.label}
        </button>
      ))}
      <button
        type="button"
        onClick={openPayments}
        className="flex flex-col items-center gap-1.5 rounded-2xl border bg-card px-2 py-3 text-xs font-medium shadow-card transition-transform active:scale-[0.97]"
      >
        <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
          <CreditCard className="size-5" />
        </span>
        Pagar
      </button>
    </div>
  );
}
