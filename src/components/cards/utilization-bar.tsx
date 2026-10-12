import { cn } from "@/lib/utils";

/** Barra de utilización de cupo: verde < 30 %, ámbar < 70 %, rojo ≥ 70 %. */
export function UtilizationBar({ value, className }: { value: number; className?: string }) {
  const pct = Math.min(Math.max(value, 0), 100);
  const tone = value >= 70 ? "bg-destructive" : value >= 30 ? "bg-amber-500" : "bg-income";
  return (
    <div className={cn("space-y-1", className)}>
      <div
        className="h-2 overflow-hidden rounded-full bg-muted"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-label="Utilización del cupo"
      >
        <div className={cn("h-full rounded-full transition-[width]", tone)} style={{ width: `${pct}%` }} />
      </div>
      <p className="text-[11px] text-muted-foreground">{value}% del cupo utilizado</p>
    </div>
  );
}
