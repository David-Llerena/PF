export type AccountType = "checking" | "savings" | "cash" | "wallet";
export type TransactionKind = "opening" | "income" | "expense" | "transfer" | "adjustment";
export type TransactionStatus = "pending" | "confirmed" | "void";
export type PaymentMethod = "cash" | "debit" | "transfer" | "card" | "other";
export type ExpenseType = "fixed" | "variable";
export type CategoryKind = "income" | "expense";

export type Institution = {
  id: string;
  user_id: string | null;
  name: string;
};

export type Account = {
  id: string;
  name: string;
  account_type: AccountType;
  institution_id: string | null;
  currency: string;
  color: string;
  icon: string;
  is_active: boolean;
  is_default: boolean;
  is_demo: boolean;
  created_at: string;
  institution?: { name: string } | null;
};

export type AccountWithBalance = Account & { balance: string };

export type Category = {
  id: string;
  name: string;
  kind: CategoryKind;
  color: string;
  icon: string;
  is_active: boolean;
};

export type Transaction = {
  id: string;
  kind: TransactionKind;
  status: TransactionStatus;
  account_id: string;
  counter_account_id: string | null;
  category_id: string | null;
  /** numeric serializado como texto para no perder precisión */
  amount: string;
  direction: 1 | -1;
  occurred_on: string;
  description: string;
  notes: string | null;
  payment_method: PaymentMethod | null;
  expense_type: ExpenseType | null;
  reason: string | null;
  is_demo: boolean;
  created_at: string;
  account?: { name: string; color: string } | null;
  counter_account?: { name: string; color: string } | null;
  category?: { name: string; color: string; icon: string } | null;
};

export type Profile = {
  id: string;
  full_name: string | null;
  currency: string;
  timezone: string;
  onboarding_completed: boolean;
};

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string[] | undefined> };
