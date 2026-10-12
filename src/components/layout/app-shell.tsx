"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  ArrowLeftRight,
  CalendarDays,
  CreditCard,
  HandCoins,
  LayoutDashboard,
  LineChart,
  LogOut,
  PiggyBank,
  Plus,
  Repeat,
  Settings,
  Target,
  Wallet,
} from "lucide-react";
import { Brand, BrandMark } from "@/components/layout/brand";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { useQuickAdd } from "@/components/forms/quick-add";
import { signOut } from "@/actions/auth";
import { cn } from "@/lib/utils";

type NavItem = { href: string; label: string; icon: React.ElementType; phase?: number };

const MAIN_NAV: NavItem[] = [
  { href: "/", label: "Inicio", icon: LayoutDashboard },
  { href: "/movimientos", label: "Movimientos", icon: ArrowLeftRight },
  { href: "/cuentas", label: "Cuentas", icon: Wallet },
];

/** Módulos planificados: visibles para orientar, pero sin simular que funcionan. */
const UPCOMING_NAV: NavItem[] = [
  { href: "#", label: "Tarjetas", icon: CreditCard, phase: 2 },
  { href: "#", label: "Préstamos", icon: HandCoins, phase: 2 },
  { href: "#", label: "Suscripciones", icon: Repeat, phase: 2 },
  { href: "#", label: "Presupuestos", icon: PiggyBank, phase: 3 },
  { href: "#", label: "Metas", icon: Target, phase: 3 },
  { href: "#", label: "Calendario", icon: CalendarDays, phase: 3 },
  { href: "#", label: "Reportes", icon: LineChart, phase: 3 },
];

function isActive(pathname: string, href: string) {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);
}

export function AppShell({
  userName,
  email,
  children,
}: {
  userName: string;
  email: string;
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const { open } = useQuickAdd();

  return (
    <div className="min-h-dvh md:pl-64">
      {/* ------------------------------ Sidebar (escritorio) ------------------------------ */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r bg-card md:flex">
        <div className="flex h-16 items-center px-5">
          <Link href="/" aria-label="Inicio">
            <Brand />
          </Link>
        </div>

        <div className="px-3">
          <button
            type="button"
            onClick={() => open()}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-primary text-sm font-medium text-primary-foreground shadow-sm transition-colors hover:bg-primary/90"
          >
            <Plus className="size-4" /> Nuevo movimiento
          </button>
        </div>

        <nav className="mt-4 flex-1 overflow-y-auto px-3" aria-label="Principal">
          <ul className="space-y-0.5">
            {MAIN_NAV.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  aria-current={isActive(pathname, item.href) ? "page" : undefined}
                  className={cn(
                    "flex h-10 items-center gap-3 rounded-xl px-3 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                    isActive(pathname, item.href) && "bg-primary-soft text-accent-foreground hover:bg-primary-soft",
                  )}
                >
                  <item.icon className="size-[18px]" />
                  {item.label}
                </Link>
              </li>
            ))}
          </ul>

          <p className="mb-1 mt-6 px-3 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground/70">
            Próximamente
          </p>
          <ul className="space-y-0.5">
            {UPCOMING_NAV.map((item) => (
              <li key={item.label}>
                <span
                  aria-disabled
                  title={`Disponible en la Fase ${item.phase}`}
                  className="flex h-9 cursor-not-allowed items-center gap-3 rounded-xl px-3 text-sm text-muted-foreground/60"
                >
                  <item.icon className="size-[18px]" />
                  {item.label}
                  <span className="ml-auto rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium">
                    Fase {item.phase}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        </nav>

        <div className="border-t p-3">
          <Link
            href="/configuracion"
            aria-current={isActive(pathname, "/configuracion") ? "page" : undefined}
            className={cn(
              "flex items-center gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-muted",
              isActive(pathname, "/configuracion") && "bg-primary-soft",
            )}
          >
            <span className="flex size-8 items-center justify-center rounded-full bg-primary-soft text-sm font-semibold text-accent-foreground">
              {userName.charAt(0).toUpperCase()}
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-sm font-medium">{userName}</span>
              <span className="block truncate text-xs text-muted-foreground">{email}</span>
            </span>
            <Settings className="size-4 text-muted-foreground" />
          </Link>
          <div className="mt-2 flex items-center gap-2 px-1">
            <ThemeToggle />
            <form action={signOut} className="flex-1">
              <button
                type="submit"
                className="flex h-9 w-full items-center justify-center gap-2 rounded-lg text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                <LogOut className="size-4" /> Cerrar sesión
              </button>
            </form>
          </div>
        </div>
      </aside>

      {/* ------------------------------ Header (móvil) ------------------------------ */}
      <header className="sticky top-0 z-30 flex items-center justify-between border-b bg-background/85 px-4 pb-2 pt-[max(0.5rem,env(safe-area-inset-top))] backdrop-blur-md md:hidden">
        <Link href="/" className="flex items-center gap-2" aria-label="Inicio">
          <BrandMark className="size-8" />
          <span className="font-semibold">Finanzas</span>
        </Link>
        <ThemeToggle />
      </header>

      <main className="mx-auto w-full max-w-6xl px-4 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-4 md:px-8 md:pb-10 md:pt-8">
        {children}
      </main>

      {/* ------------------------------ Navegación inferior (móvil) ------------------------------ */}
      <nav
        aria-label="Principal"
        className="fixed inset-x-0 bottom-0 z-40 border-t bg-card/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden"
      >
        <ul className="grid h-16 grid-cols-5 items-center">
          <BottomLink href="/" label="Inicio" icon={LayoutDashboard} active={isActive(pathname, "/")} />
          <BottomLink
            href="/movimientos"
            label="Movimientos"
            icon={ArrowLeftRight}
            active={isActive(pathname, "/movimientos")}
          />
          <li className="flex justify-center">
            <button
              type="button"
              onClick={() => open()}
              aria-label="Agregar movimiento"
              className="-mt-6 flex size-14 items-center justify-center rounded-2xl bg-primary text-primary-foreground shadow-lg shadow-primary/30 transition-transform active:scale-95"
            >
              <Plus className="size-6" />
            </button>
          </li>
          <BottomLink href="/cuentas" label="Cuentas" icon={Wallet} active={isActive(pathname, "/cuentas")} />
          <BottomLink
            href="/configuracion"
            label="Ajustes"
            icon={Settings}
            active={isActive(pathname, "/configuracion")}
          />
        </ul>
      </nav>
    </div>
  );
}

function BottomLink({
  href,
  label,
  icon: Icon,
  active,
}: {
  href: string;
  label: string;
  icon: React.ElementType;
  active: boolean;
}) {
  return (
    <li>
      <Link
        href={href}
        aria-current={active ? "page" : undefined}
        className={cn(
          "flex flex-col items-center gap-0.5 py-1 text-[11px] font-medium text-muted-foreground",
          active && "text-primary",
        )}
      >
        <Icon className="size-5" />
        {label}
      </Link>
    </li>
  );
}
