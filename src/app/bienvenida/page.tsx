import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAccountsWithBalances, getCategories, getInstitutions, getProfile } from "@/services/finance";
import { getCards, getRecurringRules } from "@/services/obligations";
import { Onboarding } from "./onboarding";

export const metadata = { title: "Configuración inicial" };
export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [profile, institutions, accounts, cards, rules, categories] = await Promise.all([
    getProfile(supabase),
    getInstitutions(supabase),
    getAccountsWithBalances(supabase),
    getCards(supabase),
    getRecurringRules(supabase),
    getCategories(supabase),
  ]);
  if (profile?.onboarding_completed) redirect("/");

  return (
    <Onboarding
      name={profile?.full_name ?? ""}
      institutions={institutions}
      accounts={accounts}
      cards={cards}
      incomeRules={rules.filter((r) => r.kind === "income")}
      categories={categories}
    />
  );
}
