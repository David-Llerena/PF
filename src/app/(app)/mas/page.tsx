import Link from "next/link";
import {
  CalendarDays,
  ChevronRight,
  CreditCard,
  HandCoins,
  LineChart,
  PiggyBank,
  Repeat,
  Settings,
  Target,
  Wallet,
} from "lucide-react";
import { PageHeader } from "@/components/layout/page-header";
import { Card } from "@/components/ui/primitives";

export const metadata = { title: "Más" };

const SECTIONS = [
  { href: "/cuentas", label: "Cuentas", desc: "Bancos, efectivo y billeteras", icon: Wallet },
  { href: "/tarjetas", label: "Tarjetas de crédito", desc: "Deuda, cupo, diferidos y pagos", icon: CreditCard },
  { href: "/prestamos", label: "Préstamos y deudas", desc: "Cuotas, capital e intereses", icon: HandCoins },
  { href: "/recurrentes", label: "Recurrentes", desc: "Suscripciones, servicios e ingresos", icon: Repeat },
];

const PLANNING = [
  { href: "/presupuestos", label: "Presupuestos", desc: "Límites mensuales por categoría", icon: PiggyBank },
  { href: "/metas", label: "Metas de ahorro", desc: "Reservas para tus objetivos", icon: Target },
  { href: "/calendario", label: "Calendario", desc: "Pagos e ingresos del mes", icon: CalendarDays },
  { href: "/reportes", label: "Reportes y proyección", desc: "¿Cuánto te quedará el próximo mes?", icon: LineChart },
  { href: "/configuracion", label: "Configuración", desc: "Perfil, categorías y datos demo", icon: Settings },
];


export default function MorePage() {
  return (
    <>
      <PageHeader title="Más" />
      <Card className="divide-y overflow-hidden">
        {SECTIONS.map((s) => (
          <Link key={s.href} href={s.href} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <s.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{s.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{s.desc}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </Card>
      <p className="mb-2 mt-6 text-xs font-semibold uppercase tracking-wider text-muted-foreground">Planificación</p>
      <Card className="divide-y overflow-hidden">
        {PLANNING.map((s) => (
          <Link key={s.href} href={s.href} className="flex items-center gap-3 px-4 py-3.5 transition-colors hover:bg-muted">
            <span className="flex size-10 items-center justify-center rounded-xl bg-primary-soft text-primary">
              <s.icon className="size-5" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block text-sm font-medium">{s.label}</span>
              <span className="block truncate text-xs text-muted-foreground">{s.desc}</span>
            </span>
            <ChevronRight className="size-4 text-muted-foreground" />
          </Link>
        ))}
      </Card>
    </>
  );
}
