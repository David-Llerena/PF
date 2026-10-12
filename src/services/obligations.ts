import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { money, sumMoney } from "@/lib/money";
import { addDays, todayISO } from "@/lib/dates";
import {
  availableCredit,
  statementEstimate,
  upcomingStatement,
  utilization,
  type CardMovement,
} from "@/lib/finance/cards";
import { occurrencesUntil } from "@/lib/finance/recurrence";
import { FREQUENCY_LABEL } from "@/lib/finance/recurrence";
import type {
  CardPurchase,
  CardSummary,
  CreditCard,
  LoanInstallment,
  LoanSummary,
  Obligation,
  RecurringRule,
  Transaction,
} from "@/lib/types";
import { TX_SELECT } from "./finance";

/**
 * Consultas de Fase 2 (solo servidor). Deudas y estimados se derivan de
 * movimientos confirmados, cronogramas y reglas; nada se duplica.
 */

const CARD_SELECT =
  "id, name, institution_id, network, credit_limit:credit_limit::text, statement_day, due_day, last4, color, is_active, is_demo, institution:financial_institutions(name)";

// ---------------------------------------------------------------------
// Tarjetas
// ---------------------------------------------------------------------
export async function getCards(
  supabase: SupabaseClient,
  opts: { includeInactive?: boolean; today?: string } = {},
): Promise<CardSummary[]> {
  const today = opts.today ?? todayISO();
  let q = supabase.from("credit_cards").select(CARD_SELECT).order("created_at");
  if (!opts.includeInactive) q = q.eq("is_active", true);

  const since = addDays(today, -100); // cubre el ciclo anterior completo
  const [cardsRes, balRes, movRes, instRes] = await Promise.all([
    q,
    supabase.from("card_balances").select("credit_card_id, debt:debt::text"),
    supabase
      .from("financial_transactions")
      .select("credit_card_id, kind, status, amount:amount::text, direction, occurred_on, card_purchase_id")
      .not("credit_card_id", "is", null)
      .eq("status", "confirmed")
      .gte("occurred_on", since),
    supabase
      .from("installment_schedules")
      .select("due_date, amount:amount::text, purchase:credit_card_purchases!inner(credit_card_id, status)")
      .eq("purchase.status", "active")
      .gte("due_date", since)
      .lte("due_date", addDays(today, 100)),
  ]);
  for (const r of [cardsRes, balRes, movRes, instRes]) if (r.error) throw new Error(r.error.message);

  const debts = new Map((balRes.data ?? []).map((b) => [b.credit_card_id as string, b.debt as string]));
  type Mov = CardMovement & { credit_card_id: string };
  const movements = (movRes.data ?? []) as unknown as Mov[];
  type Inst = { due_date: string; amount: string; purchase: { credit_card_id: string } };
  const installments = (instRes.data ?? []) as unknown as Inst[];

  return ((cardsRes.data ?? []) as unknown as CreditCard[]).map((card) => {
    const debt = money(debts.get(card.id) ?? "0").toFixed(2);
    const st = upcomingStatement(today, { statementDay: card.statement_day, dueDay: card.due_day });
    const own = movements.filter((m) => m.credit_card_id === card.id);
    const estimate = statementEstimate({
      ...st,
      movements: own,
      installments: installments.filter((i) => i.purchase.credit_card_id === card.id),
      paymentsSinceCut: own
        .filter((m) => m.kind === "card_payment" && m.occurred_on > st.prevDue)
        .map((m) => m.amount),
    });
    // El pago del período nunca puede superar la deuda total.
    const cap = money(debt).isNegative() ? money(0) : money(debt);
    if (money(estimate.remaining).gt(cap)) estimate.remaining = cap.toFixed(2);
    return {
      ...card,
      debt,
      available: availableCredit(card.credit_limit, debt),
      utilization: utilization(card.credit_limit, debt),
      statement: { cut: st.cut, due: st.due, isClosed: st.isClosed, cycle: st.cycle, ...estimate },
    };
  });
}

export async function getCard(supabase: SupabaseClient, id: string) {
  const cards = await getCards(supabase, { includeInactive: true });
  return cards.find((c) => c.id === id) ?? null;
}

export async function getCardPurchases(supabase: SupabaseClient, cardId: string): Promise<CardPurchase[]> {
  const { data, error } = await supabase
    .from("credit_card_purchases")
    .select(
      `id, credit_card_id, description, merchant, purchase_date, principal:principal::text,
       total_interest:total_interest::text, annual_rate:annual_rate::text, installments, is_prior, status,
       schedule:installment_schedules(number, due_date, principal:principal::text, interest:interest::text, amount:amount::text)`,
    )
    .eq("credit_card_id", cardId)
    .eq("status", "active")
    .order("purchase_date", { ascending: false });
  if (error) throw new Error(error.message);
  return ((data ?? []) as unknown as CardPurchase[]).map((p) => ({
    ...p,
    schedule: [...p.schedule].sort((a, b) => a.number - b.number),
  }));
}

export async function getCardTransactions(
  supabase: SupabaseClient,
  cardId: string,
  range: { from: string; to: string },
): Promise<Transaction[]> {
  const { data, error } = await supabase
    .from("financial_transactions")
    .select(TX_SELECT)
    .eq("credit_card_id", cardId)
    .neq("status", "void")
    .gte("occurred_on", range.from)
    .lte("occurred_on", range.to)
    .order("occurred_on", { ascending: false })
    .order("created_at", { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as Transaction[];
}

// ---------------------------------------------------------------------
// Préstamos
// ---------------------------------------------------------------------
const LOAN_SELECT = `id, lender, name, loan_type, original_principal:original_principal::text,
  outstanding_start:outstanding_start::text, annual_rate:annual_rate::text, frequency, installments_count,
  start_date, first_due_date, account_id, status, notes, is_demo`;

const INSTALLMENT_SELECT =
  "id, loan_id, number, due_date, principal:principal::text, interest:interest::text, amount:amount::text, status, paid_on";

export async function getLoans(supabase: SupabaseClient, opts: { includeClosed?: boolean } = {}): Promise<LoanSummary[]> {
  let q = supabase.from("loans").select(LOAN_SELECT).neq("status", "void").order("created_at");
  if (!opts.includeClosed) q = q.eq("status", "active");

  const [loansRes, balRes, instRes] = await Promise.all([
    q,
    supabase
      .from("loan_balances")
      .select("loan_id, outstanding:outstanding::text, principal_paid:principal_paid::text, interest_paid:interest_paid::text"),
    supabase.from("loan_installments").select(INSTALLMENT_SELECT).order("number"),
  ]);
  for (const r of [loansRes, balRes, instRes]) if (r.error) throw new Error(r.error.message);

  const bal = new Map((balRes.data ?? []).map((b) => [b.loan_id as string, b]));
  const inst = (instRes.data ?? []) as unknown as LoanInstallment[];

  return ((loansRes.data ?? []) as unknown as LoanSummary[]).map((l) => {
    const b = bal.get(l.id);
    const own = inst.filter((i) => i.loan_id === l.id);
    return {
      ...l,
      outstanding: money(b?.outstanding ?? l.outstanding_start).toFixed(2),
      principal_paid: money(b?.principal_paid ?? "0").toFixed(2),
      interest_paid: money(b?.interest_paid ?? "0").toFixed(2),
      next_installment: own.find((i) => i.status === "pending") ?? null,
      paid_count: own.filter((i) => i.status === "paid").length,
    };
  });
}

export async function getLoan(supabase: SupabaseClient, id: string) {
  const [loans, instRes] = await Promise.all([
    getLoans(supabase, { includeClosed: true }),
    supabase.from("loan_installments").select(INSTALLMENT_SELECT).eq("loan_id", id).order("number"),
  ]);
  if (instRes.error) throw new Error(instRes.error.message);
  const loan = loans.find((l) => l.id === id);
  if (!loan) return null;
  return { loan, installments: (instRes.data ?? []) as unknown as LoanInstallment[] };
}

// ---------------------------------------------------------------------
// Recurrentes
// ---------------------------------------------------------------------
export async function getRecurringRules(supabase: SupabaseClient): Promise<RecurringRule[]> {
  const { data, error } = await supabase
    .from("recurring_rules")
    .select(
      `id, kind, name, amount:amount::text, category_id, frequency, next_date, anchor_day, account_id, credit_card_id,
       is_subscription, is_active, notes, is_demo,
       category:transaction_categories(name, color), account:accounts(name), credit_card:credit_cards(name)`,
    )
    .order("is_active", { ascending: false })
    .order("next_date");
  if (error) throw new Error(error.message);
  return (data ?? []) as unknown as RecurringRule[];
}

// ---------------------------------------------------------------------
// Deudas y obligaciones consolidadas
// ---------------------------------------------------------------------
export function totalDebts(cards: CardSummary[], loans: LoanSummary[]): string {
  return sumMoney([
    ...cards.map((c) => (money(c.debt).isNegative() ? "0" : c.debt)),
    ...loans.filter((l) => l.status === "active").map((l) => l.outstanding),
  ]).toFixed(2);
}

/**
 * Próximas obligaciones e ingresos esperados hasta `horizonDays`, más los
 * vencidos. Cada fuente aporta una sola vez:
 *  - Tarjeta: pago estimado del período (ya incluye cuotas de diferidos).
 *  - Préstamo: cuotas pendientes.
 *  - Recurrentes: ocurrencias aún no registradas.
 *  - Movimientos pendientes ya registrados.
 */
export function buildObligations(params: {
  today: string;
  horizonDays: number;
  cards: CardSummary[];
  loans: (LoanSummary & { pending: LoanInstallment[] })[];
  rules: RecurringRule[];
  pending: Transaction[];
  maxPerRule?: number;
}): Obligation[] {
  const { today } = params;
  const horizon = addDays(today, params.horizonDays);
  const soon = addDays(today, 7);
  const statusOf = (date: string): Obligation["status"] =>
    date < today ? "overdue" : date <= soon ? "upcoming" : "later";
  const out: Obligation[] = [];

  for (const c of params.cards) {
    const remaining = money(c.statement.remaining);
    if (remaining.lte(0) || c.statement.due > horizon) continue;
    out.push({
      id: `card-${c.id}`,
      source: "card",
      direction: "out",
      title: `Pago ${c.name}`,
      subtitle: c.statement.isClosed ? "Pago del período" : "Pago del período (ciclo en curso)",
      date: c.statement.due,
      amount: remaining.toFixed(2),
      estimated: true,
      status: statusOf(c.statement.due),
      href: `/tarjetas/${c.id}`,
    });
  }

  for (const l of params.loans) {
    for (const i of l.pending) {
      if (i.due_date > horizon) break;
      out.push({
        id: `loan-${i.id}`,
        source: "loan",
        direction: "out",
        title: `${l.name} · cuota ${i.number}`,
        subtitle: l.lender,
        date: i.due_date,
        amount: i.amount,
        estimated: false,
        status: statusOf(i.due_date),
        href: `/prestamos/${l.id}`,
      });
    }
  }

  for (const r of params.rules) {
    if (!r.is_active) continue;
    for (const date of occurrencesUntil(r.next_date, r.frequency, r.anchor_day, horizon, params.maxPerRule ?? 6)) {
      out.push({
        id: `rule-${r.id}-${date}`,
        source: "recurring",
        direction: r.kind === "income" ? "in" : "out",
        title: r.name,
        subtitle: `${FREQUENCY_LABEL[r.frequency]} · ${r.credit_card?.name ?? r.account?.name ?? "sin cuenta asignada"}`,
        date,
        amount: r.amount,
        estimated: false,
        status: statusOf(date),
        href: "/recurrentes",
      });
    }
  }

  for (const t of params.pending) {
    if (t.occurred_on > horizon) continue;
    if (t.kind !== "income" && t.kind !== "expense") continue;
    out.push({
      id: `tx-${t.id}`,
      source: "pending",
      direction: t.kind === "income" ? "in" : "out",
      title: t.description,
      subtitle: t.credit_card?.name ?? t.account?.name ?? "",
      date: t.occurred_on,
      amount: t.amount,
      estimated: false,
      status: statusOf(t.occurred_on),
      href: "/movimientos?estado=pending",
    });
  }

  return out.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));
}

export async function getObligations(supabase: SupabaseClient, horizonDays = 30, maxPerRule = 6) {
  const today = todayISO();
  const [cards, loans, rules, pendingRes, instRes] = await Promise.all([
    getCards(supabase, { today }),
    getLoans(supabase),
    getRecurringRules(supabase),
    supabase.from("financial_transactions").select(TX_SELECT).eq("status", "pending").order("occurred_on").limit(100),
    supabase.from("loan_installments").select(INSTALLMENT_SELECT).eq("status", "pending").order("due_date"),
  ]);
  if (pendingRes.error) throw new Error(pendingRes.error.message);
  if (instRes.error) throw new Error(instRes.error.message);
  const pendingInst = (instRes.data ?? []) as unknown as LoanInstallment[];

  const obligations = buildObligations({
    today,
    horizonDays,
    cards,
    loans: loans.map((l) => ({ ...l, pending: pendingInst.filter((i) => i.loan_id === l.id) })),
    rules,
    pending: (pendingRes.data ?? []) as unknown as Transaction[],
    maxPerRule,
  });

  return {
    today,
    cards,
    loans,
    rules,
    obligations,
    pendingInstallments: pendingInst,
    pendingTransactions: (pendingRes.data ?? []) as unknown as Transaction[],
    debts: totalDebts(cards, loans),
  };
}
