import { createClient } from "@/lib/supabase/server";
import type {
  AuditLog,
  City,
  CityBalance,
  CityReceivablePayable,
  CityToCityObligation,
  DashboardCounts,
  DashboardKpis,
  Message,
  Party,
  PartyBalance,
  PartyExposureRow,
  Profile,
  ReconciliationFlag,
  Transaction,
} from "@/lib/types";

export async function getCurrentProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data } = await supabase.from("profiles").select("*").eq("id", user.id).single();
  return data as Profile | null;
}

/** One row per currency. */
export async function getDashboardKpis(): Promise<DashboardKpis[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("dashboard_kpis").select("*").order("currency");
  return (data as DashboardKpis[]) ?? [];
}

export async function getCities(): Promise<City[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("cities").select("*").order("name");
  return (data as City[]) ?? [];
}

export async function getCityBalances(): Promise<CityBalance[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("city_balances").select("*").order("name").order("currency");
  return (data as CityBalance[]) ?? [];
}

export async function getCityReceivablePayable(): Promise<CityReceivablePayable[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("city_receivable_payable").select("*");
  return (data as CityReceivablePayable[]) ?? [];
}

export async function getCityToCityObligations(): Promise<CityToCityObligation[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("city_to_city_obligations").select("*");
  return (data as CityToCityObligation[]) ?? [];
}

export async function getCityPartyBalances(cityId: string) {
  const supabase = await createClient();
  const { data: balances } = await supabase
    .from("city_party_balances")
    .select("*")
    .eq("city_id", cityId);
  if (!balances || balances.length === 0) return [];

  const partyIds = balances.map((b) => b.party_id);
  const { data: parties } = await supabase.from("parties").select("*").in("id", partyIds);
  const partyById = new Map((parties as Party[] | null)?.map((p) => [p.id, p]) ?? []);

  return balances
    .map((b) => ({ ...b, party: partyById.get(b.party_id) }))
    .filter((b) => b.party)
    .sort((a, b) => Math.abs(b.balance) - Math.abs(a.balance));
}

export async function getCityById(id: string): Promise<City | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("cities").select("*").eq("id", id).single();
  return data as City | null;
}

export async function getParties(): Promise<Party[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("parties").select("*").order("name");
  return (data as Party[]) ?? [];
}

export async function getPartyBalances(): Promise<PartyBalance[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("party_balances").select("*");
  return (data as PartyBalance[]) ?? [];
}

export async function getPartyById(id: string): Promise<Party | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("parties").select("*").eq("id", id).single();
  return data as Party | null;
}

/** A party can hold several currencies, so this returns one row per currency. */
export async function getPartyBalance(id: string): Promise<PartyBalance[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("party_balances")
    .select("*")
    .eq("party_id", id)
    .order("currency");
  return (data as PartyBalance[]) ?? [];
}

export async function getRecentTransactions(limit = 10): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as Transaction[]) ?? [];
}

export async function getTransactions(filters?: {
  status?: string;
  cityId?: string;
  partyId?: string;
}): Promise<Transaction[]> {
  const supabase = await createClient();
  let query = supabase.from("transactions").select("*").order("created_at", { ascending: false });
  if (filters?.status) query = query.eq("status", filters.status);
  if (filters?.cityId) query = query.eq("origin_city_id", filters.cityId);
  if (filters?.partyId) query = query.eq("party_id", filters.partyId);
  const { data } = await query.limit(200);
  return (data as Transaction[]) ?? [];
}

export async function getTransactionsForParty(partyId: string): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .or(`party_id.eq.${partyId},counterparty_id.eq.${partyId}`)
    .order("created_at", { ascending: false })
    .limit(200);
  return (data as Transaction[]) ?? [];
}

export async function getTransactionByToken(token: string): Promise<Transaction | null> {
  const supabase = await createClient();
  const { data } = await supabase.from("transactions").select("*").eq("token", token).single();
  return data as Transaction | null;
}

export async function getTransactionEntries(transactionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transaction_entries")
    .select("*")
    .eq("transaction_id", transactionId)
    .order("created_at");
  return data ?? [];
}

export async function getAuditLogsForEntity(entityType: string, entityId: string): Promise<AuditLog[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("*")
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at", { ascending: false });
  return (data as AuditLog[]) ?? [];
}

export async function getAuditLogs(limit = 100): Promise<AuditLog[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("audit_logs")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return (data as AuditLog[]) ?? [];
}

export async function getReconciliationFlags(): Promise<ReconciliationFlag[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("reconciliation_flags")
    .select("*")
    .order("created_at", { ascending: false });
  return (data as ReconciliationFlag[]) ?? [];
}

/**
 * Transfers posted at the destination that settle this one. Reversals also
 * carry settles_transaction_id, so restrict to the transfer types the way
 * settle_transfer and reconciliation_flags do — otherwise a reversal reads
 * as delivered money.
 */
export async function getSettlementsOf(transactionId: string): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("settles_transaction_id", transactionId)
    .in("transaction_type", ["transfer_sent", "transfer_received"])
    .in("status", ["confirmed", "settled"])
    .order("created_at");
  return (data as Transaction[]) ?? [];
}

/**
 * For a batch of linked-transaction ids, the origin city of each — i.e.
 * the OTHER person's city that a shared transaction is booked at in their
 * book. A mirror always posts at the counterpart's own city, never at the
 * origin's city (cities are never shared), so this is the only way to see
 * where a linked transaction actually landed on the other side.
 *
 * Readable at all only because of a narrow RLS carve-out on `cities`: you
 * may see the origin city of any transaction reachable through a mutual
 * link, and nothing else of the other person's book. Returns a map keyed
 * by the linked_transaction_id passed in, so callers look up by
 * `transaction.linked_transaction_id` directly.
 */
export async function getLinkedTransactionCities(
  linkedTransactionIds: (string | null)[]
): Promise<Map<string, City>> {
  const ids = [...new Set(linkedTransactionIds.filter((x): x is string => Boolean(x)))];
  if (ids.length === 0) return new Map();

  const supabase = await createClient();
  const { data: linked } = await supabase
    .from("transactions")
    .select("id, origin_city_id")
    .in("id", ids);
  if (!linked?.length) return new Map();

  const cityIds = [...new Set(linked.map((t) => t.origin_city_id).filter(Boolean))];
  const { data: cities } = await supabase.from("cities").select("*").in("id", cityIds);
  const cityById = new Map(((cities as City[]) ?? []).map((c) => [c.id, c]));

  const result = new Map<string, City>();
  for (const t of linked) {
    const city = t.origin_city_id ? cityById.get(t.origin_city_id) : undefined;
    if (city) result.set(t.id, city);
  }
  return result;
}

export async function getTransactionVolumeDaily(days = 30) {
  const supabase = await createClient();
  const since = new Date();
  since.setDate(since.getDate() - days);
  const { data } = await supabase
    .from("transaction_volume_daily")
    .select("*")
    .gte("day", since.toISOString().slice(0, 10))
    .order("day");
  return (data as { day: string; currency: string; volume: number; txn_count: number }[]) ?? [];
}

export async function getPartyExposure(limit = 10): Promise<PartyExposureRow[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("party_exposure").select("*").limit(limit);
  return (data as PartyExposureRow[]) ?? [];
}

export async function getProfilesByIds(ids: string[]): Promise<Profile[]> {
  if (ids.length === 0) return [];
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").in("id", ids);
  return (data as Profile[]) ?? [];
}

export async function getAllProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("*").order("email");
  return (data as Profile[]) ?? [];
}

export interface DashboardSnapshot {
  /** One entry per currency — never summed together. */
  kpis: DashboardKpis[];
  counts: DashboardCounts | null;
  cities: City[];
  city_balances: CityBalance[];
  city_receivable_payable: CityReceivablePayable[];
  obligations: CityToCityObligation[];
  recent_transactions: Transaction[];
  top_parties: PartyExposureRow[];
}

/** One round-trip for the whole dashboard instead of seven. */
export async function getDashboardSnapshot(): Promise<DashboardSnapshot> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("dashboard_snapshot");
  return (
    (data as DashboardSnapshot) ?? {
      kpis: [],
      counts: null,
      cities: [],
      city_balances: [],
      city_receivable_payable: [],
      obligations: [],
      recent_transactions: [],
      top_parties: [],
    }
  );
}

/** Every other person with an account — candidates to add as a linked contact. */
export async function getOtherProfiles(): Promise<Profile[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  const { data } = await supabase.from("profiles").select("*").neq("id", user.id).order("email");
  return (data as Profile[]) ?? [];
}

/** Parties in my book that represent the other real user. */
export async function getLinkedContacts(): Promise<Party[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("parties")
    .select("*")
    .not("linked_profile_id", "is", null)
    .order("name");
  return (data as Party[]) ?? [];
}

/** Shared transactions the other person created that I haven't confirmed yet. */
export async function getPendingLinkedTransactions(): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .eq("status", "pending")
    .not("linked_transaction_id", "is", null)
    .order("created_at", { ascending: false });
  return (data as Transaction[]) ?? [];
}

/** Linked transactions where the other person has asked to delete. */
export async function getPendingDeleteRequests(): Promise<Transaction[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("transactions")
    .select("*")
    .not("delete_requested_by", "is", null)
    .order("delete_requested_at", { ascending: false });
  return (data as Transaction[]) ?? [];
}

export async function getRecentMessages(limit = 100): Promise<Message[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("messages")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(limit);
  return ((data as Message[]) ?? []).reverse();
}

export async function searchAll(q: string) {
  const supabase = await createClient();
  const like = `%${q}%`;

  const [tokens, parties, cities] = await Promise.all([
    supabase
      .from("transactions")
      .select("*")
      .or(`token.ilike.${like},reference.ilike.${like},description.ilike.${like}`)
      .limit(20),
    supabase.from("parties").select("*").or(`name.ilike.${like},phone.ilike.${like}`).limit(20),
    supabase.from("cities").select("*").or(`name.ilike.${like},code.ilike.${like}`).limit(20),
  ]);

  return {
    transactions: (tokens.data as Transaction[]) ?? [],
    parties: (parties.data as Party[]) ?? [],
    cities: (cities.data as City[]) ?? [],
  };
}
