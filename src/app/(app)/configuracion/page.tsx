import { redirect } from "next/navigation";
import { LogOut, ShieldCheck } from "lucide-react";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAccountsWithBalances, getCategories, getProfile } from "@/services/finance";
import { PageHeader } from "@/components/layout/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/primitives";
import { Button } from "@/components/ui/button";
import { ThemeToggle } from "@/components/layout/theme-toggle";
import { ProfileForm, CategoryManager, DemoDataCard } from "@/components/settings/settings-forms";
import { signOut } from "@/actions/auth";

export const metadata = { title: "Configuración" };

export default async function SettingsPage() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [profile, categories, accounts] = await Promise.all([
    getProfile(supabase),
    getCategories(supabase, { includeInactive: true }),
    getAccountsWithBalances(supabase, { includeInactive: true }),
  ]);

  return (
    <>
      <PageHeader title="Configuración" description="Perfil, categorías y preferencias." />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Perfil</CardTitle>
            <CardDescription>{user.email}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <ProfileForm fullName={profile?.full_name ?? ""} />
            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="rounded-xl bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">Moneda</p>
                <p className="font-medium">USD · Dólar estadounidense</p>
              </div>
              <div className="rounded-xl bg-muted px-3 py-2">
                <p className="text-xs text-muted-foreground">Zona horaria</p>
                <p className="font-medium">Ecuador (UTC−5)</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Apariencia y sesión</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="flex items-center justify-between rounded-xl border px-3 py-2">
              <span className="text-sm">Modo claro / oscuro</span>
              <ThemeToggle />
            </div>
            <div className="flex items-start gap-3 rounded-xl bg-income-soft px-3 py-3 text-sm text-income">
              <ShieldCheck className="mt-0.5 size-4 shrink-0" />
              <p>
                Tus datos están aislados por usuario con Row Level Security. La app no se conecta a tu banco ni
                almacena credenciales bancarias, números completos de tarjeta, CVV ni PIN.
              </p>
            </div>
            <form action={signOut}>
              <Button type="submit" variant="outline" className="w-full">
                <LogOut /> Cerrar sesión
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Categorías</CardTitle>
            <CardDescription>Crea, renombra o desactiva categorías. Las desactivadas conservan su historial.</CardDescription>
          </CardHeader>
          <CardContent>
            <CategoryManager categories={categories} />
          </CardContent>
        </Card>

        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Datos de demostración</CardTitle>
            <CardDescription>
              Datos ficticios para explorar la app. Se marcan como “Demo”, no son tus cuentas reales y puedes borrarlos
              en cualquier momento sin afectar tus datos.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <DemoDataCard loaded={accounts.some((a) => a.is_demo)} />
          </CardContent>
        </Card>
      </div>
    </>
  );
}
