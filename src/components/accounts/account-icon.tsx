import { Banknote, Landmark, PiggyBank, Smartphone } from "lucide-react";
import type { AccountType } from "@/lib/types";
import { cn } from "@/lib/utils";

const ICONS: Record<AccountType, React.ElementType> = {
  checking: Landmark,
  savings: PiggyBank,
  cash: Banknote,
  wallet: Smartphone,
};

export function AccountIcon({ type, color, className }: { type: AccountType; color: string; className?: string }) {
  const Icon = ICONS[type];
  return (
    <span
      className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl text-white", className)}
      style={{ backgroundColor: color }}
      aria-hidden
    >
      <Icon className="size-5" />
    </span>
  );
}
