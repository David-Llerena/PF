import type {
  AccountType,
  CardNetwork,
  CardPaymentKind,
  ExpenseType,
  LoanFrequency,
  PaymentMethod,
  TransactionKind,
  TransactionStatus,
} from "@/lib/types";

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
  card_opening: "Deuda inicial de tarjeta",
  card_payment: "Pago de tarjeta",
  loan_disbursement: "Préstamo recibido",
  loan_payment: "Abono a préstamo",
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

export const CARD_NETWORK_LABEL: Record<CardNetwork, string> = {
  visa: "Visa",
  mastercard: "Mastercard",
  amex: "American Express",
  diners: "Diners Club",
  discover: "Discover",
  other: "Otra",
};

export const CARD_PAYMENT_KIND_LABEL: Record<CardPaymentKind, string> = {
  minimum: "Pago mínimo",
  period: "Pago del período",
  total: "Pago total",
  other: "Otro valor",
};

export const LOAN_FREQUENCY_LABEL: Record<LoanFrequency, string> = {
  weekly: "Semanal",
  biweekly: "Cada 2 semanas",
  monthly: "Mensual",
  quarterly: "Trimestral",
};
