import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAccountsWithBalances, getCategories, getProfile } from "@/services/finance";
import { AppShell } from "@/components/layout/app-shell";
import { QuickAddProvider } from "@/components/forms/quick-add";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [profile, accounts, categories] = await Promise.all([
    getProfile(supabase),
    getAccountsWithBalances(supabase),
    getCategories(supabase),
  ]);

  const name = profile?.full_name || user.email?.split("@")[0] || "Usuario";

  return (
    <QuickAddProvider accounts={accounts} categories={categories}>
      <AppShell userName={name} email={user.email ?? ""}>
        {children}
      </AppShell>
    </QuickAddProvider>
  );
}
