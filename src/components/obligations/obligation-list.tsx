import Link from "next/link";
import { CreditCard, HandCoins, Repeat, Clock } from "lucide-react";
import { Badge } from "@/components/ui/primitives";
import { formatMoney } from "@/lib/money";
import { formatDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import type { Obligation } from "@/lib/types";

const ICON = { card: CreditCard, loan: HandCoins, installment: HandCoins, recurring: Repeat, pending: Clock } as const;

export function ObligationList({ items, limit }: { items: Obligation[]; limit?: number }) {
  const shown = limit ? items.slice(0, limit) : items;
  return (
    <ul className="space-y-2">
      {shown.map((o) => {
        const Icon = ICON[o.source];
        const content = (
          <>
            <span
              className={cn(
                "flex size-9 shrink-0 items-center justify-center rounded-lg [&_svg]:size-4",
                o.direction === "in" ? "bg-income-soft text-income" : "bg-card text-muted-foreground",
              )}
            >
              <Icon />
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{o.title}</p>
              <p className="truncate text-xs text-muted-foreground">
                {formatDate(o.date, "long")} · {o.subtitle}
              </p>
            </div>
            <div className="flex shrink-0 flex-col items-end gap-0.5">
              <span className={cn("tabular text-sm font-semibold", o.direction === "in" ? "text-income" : "text-expense")}>
                {o.direction === "in" ? "+" : "−"}
                {formatMoney(o.amount)}
              </span>
              {o.status === "overdue" ? (
                <Badge tone="expense">Vencido</Badge>
              ) : o.estimated ? (
                <Badge tone="warning">Estimado</Badge>
              ) : o.status === "upcoming" ? (
                <Badge tone="info">Esta semana</Badge>
              ) : null}
            </div>
          </>
        );
        return (
          <li key={o.id}>
            {o.href ? (
              <Link
                href={o.href}
                className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5 transition-colors hover:bg-muted"
              >
                {content}
              </Link>
            ) : (
              <div className="flex items-center gap-3 rounded-xl bg-muted/50 px-3 py-2.5">{content}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
