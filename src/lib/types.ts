export type AccountType = "checking" | "savings" | "cash" | "wallet";
export type TransactionKind =
  | "opening"
  | "income"
  | "expense"
  | "transfer"
  | "adjustment"
  | "card_opening"
  | "card_payment"
  | "loan_disbursement"
  | "loan_payment";
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
  account_id: string | null;
  credit_card_id: string | null;
  card_purchase_id: string | null;
  loan_id: string | null;
  payment_group_id: string | null;
  payment_kind: CardPaymentKind | null;
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
  credit_card?: { name: string; color: string } | null;
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

export type CardNetwork = "visa" | "mastercard" | "amex" | "diners" | "discover" | "other";
export type CardPaymentKind = "minimum" | "period" | "total" | "other";

export type CreditCard = {
  id: string;
  name: string;
  institution_id: string | null;
  network: CardNetwork;
  credit_limit: string;
  statement_day: number;
  due_day: number;
  last4: string | null;
  color: string;
  is_active: boolean;
  is_demo: boolean;
  institution?: { name: string } | null;
};

export type CardSummary = CreditCard & {
  debt: string;
  available: string;
  utilization: number;
  statement: {
    cut: string;
    due: string;
    isClosed: boolean;
    cycle: { start: string; end: string };
    current: string;
    installments: string;
    gross: string;
    paid: string;
    remaining: string;
  };
};

export type CardPurchase = {
  id: string;
  credit_card_id: string;
  description: string;
  merchant: string | null;
  purchase_date: string;
  principal: string;
  total_interest: string;
  annual_rate: string;
  installments: number;
  is_prior: boolean;
  status: "active" | "void";
  schedule: { number: number; due_date: string; principal: string; interest: string; amount: string }[];
};

export type LoanType = "amortized" | "simple";
export type LoanFrequency = "weekly" | "biweekly" | "monthly" | "quarterly";

export type Loan = {
  id: string;
  lender: string;
  name: string;
  loan_type: LoanType;
  original_principal: string | null;
  outstanding_start: string;
  annual_rate: string;
  frequency: LoanFrequency | null;
  installments_count: number | null;
  start_date: string;
  first_due_date: string | null;
  account_id: string | null;
  status: "active" | "paid" | "void";
  notes: string | null;
  is_demo: boolean;
};

export type LoanSummary = Loan & {
  outstanding: string;
  principal_paid: string;
  interest_paid: string;
  next_installment: LoanInstallment | null;
  paid_count: number;
};

export type LoanInstallment = {
  id: string;
  loan_id: string;
  number: number;
  due_date: string;
  principal: string;
  interest: string;
  amount: string;
  status: "pending" | "paid";
  paid_on: string | null;
};

export type RecurringFrequency = "weekly" | "biweekly" | "semimonthly" | "monthly" | "yearly";

export type RecurringRule = {
  id: string;
  kind: "income" | "expense";
  name: string;
  amount: string;
  category_id: string;
  frequency: RecurringFrequency;
  next_date: string;
  anchor_day: number;
  account_id: string | null;
  credit_card_id: string | null;
  is_subscription: boolean;
  is_active: boolean;
  notes: string | null;
  is_demo: boolean;
  category?: { name: string; color: string } | null;
  account?: { name: string } | null;
  credit_card?: { name: string } | null;
};

/** Obligación o ingreso próximo, derivado de su módulo de origen (sin duplicar registros). */
export type Obligation = {
  id: string;
  source: "card" | "loan" | "recurring" | "pending" | "installment";
  direction: "in" | "out";
  title: string;
  subtitle: string;
  date: string;
  amount: string;
  estimated: boolean;
  status: "overdue" | "upcoming" | "later";
  href?: string;
};
