"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Search, SlidersHorizontal, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Field, Input, NativeSelect } from "@/components/ui/primitives";
import { PAYMENT_METHOD_LABEL } from "@/lib/constants";
import { cn } from "@/lib/utils";
import type { AccountWithBalance, Category, PaymentMethod } from "@/lib/types";

const KIND_TABS = [
  { v: "", label: "Todos" },
  { v: "expense", label: "Gastos" },
  { v: "income", label: "Ingresos" },
  { v: "transfer", label: "Transferencias" },
  { v: "adjustment", label: "Ajustes" },
];

const ADVANCED_KEYS = ["cuenta", "categoria", "medio", "estado", "min", "max"];

export function TransactionFilters({
  accounts,
  categories,
}: {
  accounts: AccountWithBalance[];
  categories: Category[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [showAdvanced, setShowAdvanced] = useState(ADVANCED_KEYS.some((k) => params.get(k)));
  const [q, setQ] = useState(params.get("q") ?? "");

  const kind = params.get("tipo") ?? "";
  const activeCount = ADVANCED_KEYS.filter((k) => params.get(k)).length;

  function update(patch: Record<string, string | null>) {
    const next = new URLSearchParams(params.toString());
    for (const [k, v] of Object.entries(patch)) {
      if (v) next.set(k, v);
      else next.delete(k);
    }
    router.push(`${pathname}?${next.toString()}`);
  }

  const visibleCategories = categories.filter((c) => !kind || c.kind === kind);

  return (
    <div className="flex flex-col gap-3">
      <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0">
        <div role="tablist" className="flex w-max gap-1.5">
          {KIND_TABS.map((t) => (
            <button
              key={t.v}
              type="button"
              role="tab"
              aria-selected={kind === t.v}
              onClick={() => update({ tipo: t.v || null, categoria: null })}
              className={cn(
                "h-9 rounded-full border px-4 text-sm font-medium transition-colors",
                kind === t.v ? "border-primary bg-primary text-primary-foreground" : "bg-card hover:bg-muted",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <form
          className="relative flex-1"
          onSubmit={(e) => {
            e.preventDefault();
            update({ q: q.trim() || null });
          }}
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            type="search"
            placeholder="Buscar por concepto"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            className="pl-9"
            aria-label="Buscar movimientos"
          />
        </form>
        <Button
          variant="outline"
          onClick={() => setShowAdvanced((s) => !s)}
          aria-expanded={showAdvanced}
          className="shrink-0"
        >
          <SlidersHorizontal />
          <span className="hidden sm:inline">Filtros</span>
          {activeCount > 0 && (
            <span className="rounded-full bg-primary px-1.5 text-[11px] text-primary-foreground">{activeCount}</span>
          )}
        </Button>
      </div>

      {showAdvanced && (
        <div className="grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4 md:grid-cols-3 lg:grid-cols-6">
          <Field label="Cuenta" htmlFor="f-cuenta">
            <NativeSelect id="f-cuenta" value={params.get("cuenta") ?? ""} onChange={(e) => update({ cuenta: e.target.value || null })}>
              <option value="">Todas</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Categoría" htmlFor="f-cat">
            <NativeSelect id="f-cat" value={params.get("categoria") ?? ""} onChange={(e) => update({ categoria: e.target.value || null })}>
              <option value="">Todas</option>
              {visibleCategories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {kind ? "" : c.kind === "income" ? "(ingreso)" : "(gasto)"}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Medio de pago" htmlFor="f-medio">
            <NativeSelect id="f-medio" value={params.get("medio") ?? ""} onChange={(e) => update({ medio: e.target.value || null })}>
              <option value="">Todos</option>
              {(["cash", "debit", "transfer", "other"] as PaymentMethod[]).map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_METHOD_LABEL[m]}
                </option>
              ))}
            </NativeSelect>
          </Field>
          <Field label="Estado" htmlFor="f-estado">
            <NativeSelect id="f-estado" value={params.get("estado") ?? ""} onChange={(e) => update({ estado: e.target.value || null })}>
              <option value="">Vigentes</option>
              <option value="confirmed">Confirmados</option>
              <option value="pending">Pendientes</option>
              <option value="void">Anulados</option>
            </NativeSelect>
          </Field>
          <Field label="Importe mín." htmlFor="f-min">
            <Input
              id="f-min"
              inputMode="decimal"
              defaultValue={params.get("min") ?? ""}
              onBlur={(e) => update({ min: e.target.value.trim() || null })}
              placeholder="0.00"
            />
          </Field>
          <Field label="Importe máx." htmlFor="f-max">
            <Input
              id="f-max"
              inputMode="decimal"
              defaultValue={params.get("max") ?? ""}
              onBlur={(e) => update({ max: e.target.value.trim() || null })}
              placeholder="0.00"
            />
          </Field>
          {activeCount > 0 && (
            <button
              type="button"
              onClick={() => update(Object.fromEntries(ADVANCED_KEYS.map((k) => [k, null])))}
              className="col-span-full flex items-center gap-1 justify-self-start text-sm text-primary hover:underline"
            >
              <X className="size-3.5" /> Limpiar filtros
            </button>
          )}
        </div>
      )}
    </div>
  );
}
