"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { currentYearMonth, monthLabel, shiftMonth, type YearMonth } from "@/lib/dates";

export function MonthPicker({ value }: { value: YearMonth }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const now = currentYearMonth();
  const isCurrent = value.year === now.year && value.month === now.month;

  function go(ym: YearMonth) {
    const next = new URLSearchParams(params.toString());
    next.set("y", String(ym.year));
    next.set("m", String(ym.month));
    router.push(`${pathname}?${next.toString()}`);
  }

  const btn =
    "flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30";

  return (
    <div className="flex items-center gap-1 rounded-xl border bg-card p-1 shadow-card">
      <button type="button" className={btn} onClick={() => go(shiftMonth(value, -1))} aria-label="Mes anterior">
        <ChevronLeft className="size-4" />
      </button>
      <label className="relative">
        <span className="sr-only">Seleccionar mes</span>
        <input
          type="month"
          value={`${value.year}-${String(value.month).padStart(2, "0")}`}
          onChange={(e) => {
            const [y, m] = e.target.value.split("-").map(Number);
            if (y && m) go({ year: y, month: m });
          }}
          className="absolute inset-0 cursor-pointer opacity-0"
        />
        <span className="block min-w-32 px-2 text-center text-sm font-medium">{monthLabel(value)}</span>
      </label>
      <button
        type="button"
        className={btn}
        onClick={() => go(shiftMonth(value, 1))}
        aria-label="Mes siguiente"
        disabled={isCurrent}
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}
