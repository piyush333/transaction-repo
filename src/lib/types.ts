// Hand-written types mirroring the Supabase schema (see supabase/migrations).
// Regenerate with `npx supabase gen types typescript` once the Supabase CLI
// is linked, if you want fully generated types instead.

export type Role = "owner" | "city_manager" | "operator" | "viewer" | "auditor";

export type PartyType = "person" | "business" | "agent" | "internal";

export type TransactionType =
  | "receipt"
  | "collection"
  | "settlement_received"
  | "transfer_received"
  | "adjustment_credit"
  | "payment"
  | "settlement_paid"
  | "transfer_sent"
  | "adjustment_debit"
  | "city_transfer"
  | "party_transfer"
  | "reconciliation_adjustment";

export type TransactionStatus =
  | "draft"
  | "pending"
  | "confirmed"
  | "settled"
  | "cancelled"
  | "reversed"
  | "disputed";

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  role: Role;
  assigned_city_id: string | null;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface City {
  id: string;
  code: string;
  name: string;
  state: string | null;
  country: string;
  currency: string;
  active: boolean;
  manager_id: string | null;
  opening_balance: number;
  created_at: string;
  updated_at: string;
}

export interface Party {
  id: string;
  name: string;
  phone: string | null;
  primary_city_id: string;
  party_type: PartyType;
  opening_balance: number;
  notes: string | null;
  active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Transaction {
  id: string;
  token: string;
  transaction_type: TransactionType;
  origin_city_id: string;
  destination_city_id: string | null;
  party_id: string | null;
  counterparty_id: string | null;
  amount: number;
  currency: string;
  description: string | null;
  reference: string | null;
  status: TransactionStatus;
  reversed_transaction_id: string | null;
  settles_transaction_id: string | null;
  created_by: string | null;
  approved_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionEntry {
  id: string;
  transaction_id: string;
  entry_type: "city_cash" | "party";
  city_id: string;
  party_id: string | null;
  direction: "debit" | "credit";
  amount: number;
  currency: string;
  created_at: string;
}

export interface AuditLog {
  id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  performed_by: string | null;
  previous_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

export interface PartyBalance {
  party_id: string;
  name: string;
  party_type: PartyType;
  primary_city_id: string;
  balance: number;
  total_received: number;
  total_paid: number;
  last_transaction_at: string | null;
}

export interface CityBalance {
  city_id: string;
  name: string;
  code: string;
  balance: number;
  total_incoming: number;
  total_outgoing: number;
}

export interface CityReceivablePayable {
  city_id: string;
  receivable: number;
  payable: number;
}

export interface CityToCityObligation {
  origin_city_id: string;
  destination_city_id: string;
  amount: number;
  transaction_count: number;
}

export interface DashboardKpis {
  total_position: number;
  total_receivable: number;
  total_payable: number;
  net_position: number;
  todays_volume: number;
  pending_count: number;
  active_cities: number;
  active_parties: number;
}

export interface PartyExposureRow {
  party_id: string;
  name: string;
  party_type: PartyType;
  primary_city_id: string;
  balance: number;
  status: "receivable" | "payable" | "settled";
  exposure: number;
}

export interface ReconciliationFlag {
  transaction_id: string;
  token: string;
  reconciliation_status: "matched" | "pending" | "discrepancy";
  transaction_status: TransactionStatus;
  amount: number;
  origin_city_id: string;
  destination_city_id: string | null;
  created_at: string;
}

// Minimal Database shape so @supabase/ssr generics compile; not exhaustive.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Database = any;
