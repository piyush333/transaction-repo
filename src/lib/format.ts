export function formatMoney(amount: number, currency = "INR") {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount);
}

export function formatCompactMoney(amount: number, currency = "INR") {
  const abs = Math.abs(amount);
  const sign = amount < 0 ? "-" : "";
  const symbol = currency === "INR" ? "₹" : currency + " ";
  if (abs >= 1_00_00_000) return `${sign}${symbol}${(abs / 1_00_00_000).toFixed(2)}Cr`;
  if (abs >= 1_00_000) return `${sign}${symbol}${(abs / 1_00_000).toFixed(2)}L`;
  if (abs >= 1_000) return `${sign}${symbol}${(abs / 1_000).toFixed(1)}K`;
  return formatMoney(amount, currency);
}

export function formatDate(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(d);
}

export function formatDateTime(value: string | Date) {
  const d = typeof value === "string" ? new Date(value) : value;
  return new Intl.DateTimeFormat("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * balance > 0 => the party owes the owner (Receivable)
 * balance < 0 => the owner owes the party (Payable)
 * (see supabase/migrations/03_balance_views.sql for the full convention)
 */
export function balanceLabel(balance: number): {
  label: "Receivable" | "Payable" | "Settled";
  amount: number;
  tone: "positive" | "negative" | "neutral";
} {
  if (balance > 0.005) return { label: "Receivable", amount: balance, tone: "positive" };
  if (balance < -0.005) return { label: "Payable", amount: Math.abs(balance), tone: "negative" };
  return { label: "Settled", amount: 0, tone: "neutral" };
}

export const TRANSACTION_TYPE_LABELS: Record<string, string> = {
  receipt: "Receipt",
  collection: "Collection",
  settlement_received: "Settlement Received",
  transfer_received: "Transfer Received",
  adjustment_credit: "Adjustment (Credit)",
  payment: "Payment",
  settlement_paid: "Settlement Paid",
  transfer_sent: "Transfer Sent",
  adjustment_debit: "Adjustment (Debit)",
  city_transfer: "City Transfer",
  party_transfer: "Party Transfer",
  reconciliation_adjustment: "Reconciliation Adjustment",
};

export const STATUS_LABELS: Record<string, string> = {
  draft: "Draft",
  pending: "Pending",
  confirmed: "Confirmed",
  settled: "Settled",
  cancelled: "Cancelled",
  reversed: "Reversed",
  disputed: "Disputed",
};

export const STATUS_TONE: Record<string, "positive" | "negative" | "neutral" | "warning"> = {
  draft: "neutral",
  pending: "warning",
  confirmed: "positive",
  settled: "positive",
  cancelled: "neutral",
  reversed: "negative",
  disputed: "negative",
};
