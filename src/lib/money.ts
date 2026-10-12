import Decimal from "decimal.js";

/**
 * Aritmética monetaria exacta. Nunca se suman importes con `number`:
 * todo pasa por Decimal y se redondea a 2 decimales (half-up).
 */
Decimal.set({ precision: 30, rounding: Decimal.ROUND_HALF_UP });

export type MoneyInput = Decimal.Value | null | undefined;

export function money(value: MoneyInput): Decimal {
  if (value === null || value === undefined || value === "") return new Decimal(0);
  return new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sumMoney(values: MoneyInput[]): Decimal {
  return values.reduce<Decimal>((acc, v) => acc.plus(money(v)), new Decimal(0)).toDecimalPlaces(2);
}

/** Convierte a string con 2 decimales, apto para enviar a PostgreSQL numeric. */
export function toDbAmount(value: MoneyInput): string {
  return money(value).toFixed(2);
}

/** Normaliza la entrada del usuario: admite "1.234,56", "1234.56", "$ 1,234.56". */
export function parseMoneyInput(raw: string): Decimal | null {
  let s = raw.trim().replace(/[$\s]/g, "");
  if (!s) return null;
  const negative = s.startsWith("-");
  s = s.replace(/^-/, "");

  const lastComma = s.lastIndexOf(",");
  const lastDot = s.lastIndexOf(".");
  if (lastComma > -1 && lastDot > -1) {
    // El separador que aparece último es el decimal.
    if (lastComma > lastDot) s = s.replace(/\./g, "").replace(",", ".");
    else s = s.replace(/,/g, "");
  } else if (lastComma > -1) {
    const decimals = s.length - lastComma - 1;
    s = decimals <= 2 && s.indexOf(",") === lastComma ? s.replace(",", ".") : s.replace(/,/g, "");
  } else if (lastDot > -1 && (s.indexOf(".") !== lastDot || s.length - lastDot - 1 === 3)) {
    // "1.234" o "1.234.567": puntos como separador de miles.
    s = s.replace(/\./g, "");
  }

  if (!/^\d+(\.\d{0,2})?$/.test(s)) return null;
  const d = new Decimal(s);
  return negative ? d.negated() : d;
}

const formatter = new Intl.NumberFormat("es-EC", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/**
 * Formato de presentación. Intl requiere `number`; la conversión ocurre
 * solo al final, sobre un valor ya redondeado a 2 decimales, por lo que
 * no introduce error de cálculo.
 */
export function formatMoney(value: MoneyInput, opts: { signed?: boolean } = {}): string {
  const d = money(value);
  const formatted = formatter.format(d.abs().toNumber());
  if (d.isNegative() && !d.isZero()) return `-${formatted}`;
  if (opts.signed && d.isPositive() && !d.isZero()) return `+${formatted}`;
  return formatted;
}

export { Decimal };
