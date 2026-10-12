"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { MovementForm, MovementKindTabs, type MovementKind } from "@/components/forms/movement-form";
import type { AccountWithBalance, Category } from "@/lib/types";

type OpenOptions = { kind?: MovementKind; accountId?: string };

const QuickAddContext = createContext<{ open: (opts?: OpenOptions) => void } | null>(null);

export function useQuickAdd() {
  const ctx = useContext(QuickAddContext);
  if (!ctx) throw new Error("useQuickAdd debe usarse dentro de QuickAddProvider");
  return ctx;
}

export function QuickAddProvider({
  accounts,
  categories,
  children,
}: {
  accounts: AccountWithBalance[];
  categories: Category[];
  children: React.ReactNode;
}) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [kind, setKind] = useState<MovementKind>("expense");
  const [accountId, setAccountId] = useState<string | undefined>();
  const [formKey, setFormKey] = useState(0);

  const open = useCallback((opts?: OpenOptions) => {
    setKind(opts?.kind ?? "expense");
    setAccountId(opts?.accountId);
    setFormKey((k) => k + 1);
    setIsOpen(true);
  }, []);

  const value = useMemo(() => ({ open }), [open]);

  const titles: Record<MovementKind, string> = {
    expense: "Nuevo gasto",
    income: "Nuevo ingreso",
    transfer: "Transferir entre cuentas",
  };

  return (
    <QuickAddContext.Provider value={value}>
      {children}
      <Dialog open={isOpen} onOpenChange={setIsOpen}>
        <DialogContent title={titles[kind]}>
          <div className="flex flex-col gap-4">
            <MovementKindTabs value={kind} onChange={setKind} />
            <MovementForm
              key={`${kind}-${formKey}`}
              kind={kind}
              accounts={accounts}
              categories={categories}
              defaultAccountId={accountId}
              onDone={() => {
                setIsOpen(false);
                router.refresh();
              }}
            />
          </div>
        </DialogContent>
      </Dialog>
    </QuickAddContext.Provider>
  );
}
