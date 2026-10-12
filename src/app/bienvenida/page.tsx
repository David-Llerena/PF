import { redirect } from "next/navigation";
import { getAuthenticatedUser } from "@/lib/supabase/server";
import { getAccountsWithBalances, getInstitutions, getProfile } from "@/services/finance";
import { Onboarding } from "./onboarding";

export const metadata = { title: "Configuración inicial" };
export const dynamic = "force-dynamic";

export default async function WelcomePage() {
  const { supabase, user } = await getAuthenticatedUser();
  if (!user) redirect("/login");

  const [profile, institutions, accounts] = await Promise.all([
    getProfile(supabase),
    getInstitutions(supabase),
    getAccountsWithBalances(supabase),
  ]);
  if (profile?.onboarding_completed) redirect("/");

  return <Onboarding name={profile?.full_name ?? ""} institutions={institutions} accounts={accounts} />;
}
