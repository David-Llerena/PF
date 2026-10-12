/**
 * Fechas en la zona horaria de Ecuador. Los movimientos se guardan como
 * `date` (YYYY-MM-DD) local, así un gasto hecho a las 22:00 en Guayaquil
 * no "salta" al día siguiente por UTC.
 */
export const APP_TIME_ZONE = "America/Guayaquil";

const isoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Fecha de hoy en Ecuador como YYYY-MM-DD. */
export function todayISO(now: Date = new Date()): string {
  return isoFormatter.format(now);
}

export function isISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [y, m, d] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

export type YearMonth = { year: number; month: number }; // month 1-12

export function currentYearMonth(now: Date = new Date()): YearMonth {
  const [y, m] = todayISO(now).split("-").map(Number);
  return { year: y, month: m };
}

/** Primer y último día del mes como YYYY-MM-DD. */
export function monthRange({ year, month }: YearMonth): { from: string; to: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const mm = String(month).padStart(2, "0");
  return { from: `${year}-${mm}-01`, to: `${year}-${mm}-${String(lastDay).padStart(2, "0")}` };
}

/** Lee ?y=2026&m=10 con validación; si no es válido usa el mes actual de Ecuador. */
export function parseYearMonth(y?: string | string[], m?: string | string[]): YearMonth {
  const fallback = currentYearMonth();
  const year = Number(Array.isArray(y) ? y[0] : y);
  const month = Number(Array.isArray(m) ? m[0] : m);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) return fallback;
  if (!Number.isInteger(month) || month < 1 || month > 12) return fallback;
  return { year, month };
}

export function shiftMonth({ year, month }: YearMonth, delta: number): YearMonth {
  const idx = year * 12 + (month - 1) + delta;
  return { year: Math.floor(idx / 12), month: (idx % 12) + 1 };
}

const monthNames = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];

export function monthLabel({ year, month }: YearMonth, short = false): string {
  const name = monthNames[month - 1];
  const label = short ? name.slice(0, 3) : name;
  return `${label.charAt(0).toUpperCase()}${label.slice(1)} ${year}`;
}

/** Formatea YYYY-MM-DD para mostrar (sin conversión de zona horaria). */
export function formatDate(iso: string, style: "short" | "long" = "short"): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return new Intl.DateTimeFormat("es-EC", {
    timeZone: "UTC",
    day: "numeric",
    month: style === "short" ? "short" : "long",
    year: style === "long" ? "numeric" : undefined,
  }).format(dt);
}

/* -------------------------------------------------------------------------- */
/* Aritmética de fechas ISO (YYYY-MM-DD) sin zona horaria                      */
/* -------------------------------------------------------------------------- */
function parts(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y, m, d };
}

function toISO(y: number, m: number, d: number): string {
  return `${y}-${String(m).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
}

export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** Día `day` del mes indicado, ajustado al último día si el mes es más corto. */
export function clampedDate(year: number, month: number, day: number): string {
  return toISO(year, month, Math.min(day, daysInMonth(year, month)));
}

export function addDays(iso: string, days: number): string {
  const { y, m, d } = parts(iso);
  const dt = new Date(Date.UTC(y, m - 1, d + days));
  return toISO(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

/** Suma meses conservando el día ancla (31 → 28/29/30 → vuelve a 31). */
export function addMonthsAnchored(iso: string, months: number, anchorDay?: number): string {
  const { y, m, d } = parts(iso);
  const { year, month } = shiftMonth({ year: y, month: m }, months);
  return clampedDate(year, month, anchorDay ?? d);
}

export function dayOf(iso: string): number {
  return parts(iso).d;
}

export function diffDays(a: string, b: string): number {
  const pa = parts(a);
  const pb = parts(b);
  return Math.round((Date.UTC(pa.y, pa.m - 1, pa.d) - Date.UTC(pb.y, pb.m - 1, pb.d)) / 86_400_000);
}
