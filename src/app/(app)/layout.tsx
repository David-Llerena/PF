import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAccountsWithBalances, getCategories, getProfile } from "@/services/finance";
import { getCards, getLoans } from "@/services/obligations";
import { AppShell } from "@/components/layout/app-shell";
import { QuickAddProvider } from "@/components/forms/quick-add";

export const dynamic = "force-dynamic";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [profile, accounts, categories, cards, loans] = await Promise.all([
    getProfile(supabase),
    getAccountsWithBalances(supabase),
    getCategories(supabase),
    getCards(supabase),
    getLoans(supabase),
  ]);

  const name = profile?.full_name || user.email?.split("@")[0] || "Usuario";

  return (
    <QuickAddProvider accounts={accounts} categories={categories} cards={cards} loans={loans}>
      <AppShell userName={name} email={user.email ?? ""}>
        {children}
      </AppShell>
    </QuickAddProvider>
  );
}
