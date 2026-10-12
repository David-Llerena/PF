import { Brand } from "@/components/layout/brand";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="relative flex min-h-dvh flex-col items-center justify-center px-4 py-10 pt-[max(2.5rem,env(safe-area-inset-top))]">
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-72 bg-gradient-to-b from-primary-soft to-transparent"
      />
      <div className="w-full max-w-sm">
        <div className="mb-8 flex justify-center">
          <Brand />
        </div>
        {children}
        <p className="mt-8 text-center text-xs text-muted-foreground">
          Tus datos financieros son privados y se ingresan manualmente.
          <br />
          No conectamos con tu banco ni pedimos credenciales bancarias.
        </p>
      </div>
    </main>
  );
}
