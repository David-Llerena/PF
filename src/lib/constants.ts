import type { AccountType, ExpenseType, PaymentMethod, TransactionKind, TransactionStatus } from "@/lib/types";

export const ACCOUNT_TYPE_LABEL: Record<AccountType, string> = {
  checking: "Corriente",
  savings: "Ahorros",
  cash: "Efectivo",
  wallet: "Billetera digital",
};

export const KIND_LABEL: Record<TransactionKind, string> = {
  opening: "Saldo inicial",
  income: "Ingreso",
  expense: "Gasto",
  transfer: "Transferencia",
  adjustment: "Ajuste",
};

export const STATUS_LABEL: Record<TransactionStatus, string> = {
  pending: "Pendiente",
  confirmed: "Confirmado",
  void: "Anulado",
};

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  debit: "Tarjeta de débito",
  transfer: "Transferencia",
  card: "Tarjeta de crédito",
  other: "Otro",
};

export const EXPENSE_TYPE_LABEL: Record<ExpenseType, string> = {
  fixed: "Fijo",
  variable: "Variable",
};

export const ACCOUNT_COLORS = [
  "#7c3aed", "#4f46e5", "#2563eb", "#0891b2", "#059669",
  "#16a34a", "#ca8a04", "#ea580c", "#dc2626", "#db2777", "#475569",
];
