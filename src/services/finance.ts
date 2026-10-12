import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { money, sumMoney } from "@/lib/money";
import { financialPosition } from "@/lib/finance/rules";
import { monthRange, shiftMonth, type YearMonth } from "@/lib/dates";
import type { AccountWithBalance, Category, Institution, Profile, Transaction } from "@/lib/types";

/**
 * Capa de consultas (solo servidor). Todas las consultas usan el cliente
 * del usuario, por lo que RLS garantiza el aislamiento por usuario.
 * Los importes se piden como texto (`::text`) para no perder precisión.
 */

export const TX_SELECT = `
  id, kind, status, account_id, counter_account_id, category_id,
  credit_card_id, card_purchase_id, loan_id, payment_group_id, payment_kind,
  amount:amount::text, direction, occurred_on, description, notes,
  payment_method, expense_type, reason, is_demo, created_at,
  account:accounts!financial_transactions_account_id_fkey(name, color),
  counter_account:accounts!financial_transactions_counter_account_id_fkey(name, color),
  credit_card:credit_cards(name, color),
  category:transaction_categories(name, color, icon)
`;

export async function getProfile(supabase: SupabaseClient): Promise<Profile | null> {
  const { data } = await supabase
    .from("profiles")
    .select("id, full_name, currency, timezone, onboarding_completed")
    .maybeSingle();
  return data as Profile | null;
}

export async function getAccountsWithBalances(
  supabase: SupabaseClient,
  opts: { includeInactive?: boolean } = {},
): Promise<AccountWithBalance[]> {
  let query = supabase
    .from("accounts")
    .select(
      "id, name, account_type, institution_id, currency, color, icon, is_active, is_default, is_demo, created_at, institution:financial_institutions(name)",
    )
    .order("is_default", { ascending: false })
    .order("created_at", { ascending: true });
  if (!opts.includeInactive) query = query.eq("is_active", true);

  const [{ data: accounts, error }, { data: balances, error: balErr }] = await Promise.all([
    query,
    supabase.from("account_balances").select("account_id, balance:balance::text"),
  ]);
  if (error) throw new Error(error.message);
  if (balErr) throw new Error(balErr.message);

  const map = new Map((balances ?? []).map((b) => [b.account_id as string, b.balance as string]));
  return (accounts ?? []).map((a) => ({
    ...(a as unknown as Omit<AccountWithBalance, "balance">),
    balance: money(map.get(a.id) ?? "0").toFixed(2),
  }));
}

export async function getAccount(supabase: SupabaseClient, id: string): Promise<AccountWithBalance | null> {
  const all = await getAccountsWithBalances(supabase, { includeInactive: true });
  return all.find((a) => a.id === id) ?? null;
}

export async function getInstitutions(supabase: SupabaseClient): Promise<Institution[]> {
  const { data, error } = await supabase
    .from("financial_institutions")
    .select("id, user_id, name")
    .order("user_id", { ascending: true, nullsFirst: true })
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? []) as Institution[];
}

export async function getCategories(supabase: SupabaseClient, opts: { includeInactive?: boolean } = {}) {
  let q = supabase.from("transaction_categories").select("id, name, kind, color, icon, is_active").order("name");
  if (!opts.includeInactive) q = q.eq("is_active", true);
  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as Category[];
}

export type TransactionFilters = {
  from?: string;
  to?: string;
  kind?: Transaction["kind"];
  creditCardId?: string;
  loanId?: string;
  status?: "pending" | "confirmed" | "void";
  accountId?: string;
  categoryId?: string;
  paymentMethod?: string;
  minAmount?: string;
  maxAmount?: string;
  q?: string;
  limit?: number;
  includeVoid?: boolean;
  ascending?: boolean;
};

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const AMOUNT_RE = /^\d{1,12}(\.\d{1,2})?$/;

export async function getTransactions(supabase: SupabaseClient, f: TransactionFilters = {}): Promise<Transaction[]> {
  let q = supabase
    .from("financial_transactions")
    .select(TX_SELECT)
    .order("occurred_on", { ascending: !!f.ascending })
    .order("created_at", { ascending: !!f.ascending })
    .limit(Math.min(f.limit ?? 200, 500));

  if (f.from) q = q.gte("occurred_on", f.from);
  if (f.to) q = q.lte("occurred_on", f.to);
  if (f.kind) q = q.eq("kind", f.kind);
  if (f.status) q = q.eq("status", f.status);
  else if (!f.includeVoid) q = q.neq("status", "void");
  if (f.accountId && UUID_RE.test(f.accountId)) q = q.or(`account_id.eq.${f.accountId},counter_account_id.eq.${f.accountId}`);
  if (f.creditCardId && UUID_RE.test(f.creditCardId)) q = q.eq("credit_card_id", f.creditCardId);
  if (f.loanId && UUID_RE.test(f.loanId)) q = q.eq("loan_id", f.loanId);
  if (f.categoryId && UUID_RE.test(f.categoryId)) q = q.eq("category_id", f.categoryId);
  if (f.paymentMethod) q = q.eq("payment_method", f.paymentMethod);
  if (f.minAmount && AMOUNT_RE.test(f.minAmount)) q = q.gte("amount", f.minAmount);
  if (f.maxAmount && AMOUNT_RE.test(f.maxAmount)) q = q.lte("amount", f.maxAmount);
  if (f.q) q = q.ilike("description", `%${f.q.replace(/[%_\\]/g, (c) => `\\${c}`)}%`);

  const { data, error } = await q;
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Transaction[];
}

export type DashboardData = {
  period: YearMonth;
  accounts: AccountWithBalance[];
  available: string;
  income: string;
  expense: string;
  monthlyNet: string;
  pendingIncome: string;
  pendingExpense: string;
  debts: string;
  netWorth: string;
  byCategory: { category_id: string; name: string; color: string; total: string }[];
  cashflow: { month: string; income: string; expense: string }[];
  recent: Transaction[];
};

/**
 * KPIs del período. Las deudas (tarjetas y préstamos) se calculan en
 * services/obligations y se pasan aquí para obtener el patrimonio neto.
 */
export async function getDashboard(
  supabase: SupabaseClient,
  period: YearMonth,
  debts: string[] = [],
): Promise<DashboardData> {
  const { from, to } = monthRange(period);

  const [accounts, totalsRes, catRes, flowRes, recent] = await Promise.all([
    getAccountsWithBalances(supabase),
    supabase.rpc("period_totals", { p_from: from, p_to: to }).single(),
    supabase.rpc("expenses_by_category", { p_from: from, p_to: to }),
    supabase.rpc("monthly_cashflow", { p_end: to, p_months: 6 }),
    getTransactions(supabase, { from, to, limit: 8, status: "confirmed" }),
  ]);

  if (totalsRes.error) throw new Error(totalsRes.error.message);
  if (catRes.error) throw new Error(catRes.error.message);
  if (flowRes.error) throw new Error(flowRes.error.message);

  const totals = totalsRes.data as { income: string; expense: string; pending_income: string; pending_expense: string };
  const income = money(totals.income);
  const expense = money(totals.expense);

  const position = financialPosition({ accountBalances: accounts.map((a) => a.balance), debts });

  return {
    period,
    accounts,
    available: position.available.toFixed(2),
    income: income.toFixed(2),
    expense: expense.toFixed(2),
    monthlyNet: income.minus(expense).toFixed(2),
    pendingIncome: money(totals.pending_income).toFixed(2),
    pendingExpense: money(totals.pending_expense).toFixed(2),
    debts: position.debts.toFixed(2),
    netWorth: position.netWorth.toFixed(2),
    byCategory: (catRes.data ?? []) as DashboardData["byCategory"],
    cashflow: (flowRes.data ?? []) as DashboardData["cashflow"],
    recent,
  };
}

export function totalOf(values: string[]) {
  return sumMoney(values).toFixed(2);
}

export function previousPeriod(p: YearMonth) {
  return shiftMonth(p, -1);
}
