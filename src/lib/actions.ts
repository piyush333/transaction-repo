"use server";

import { createClient } from "@/lib/supabase/server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type ActionState = { error: string | null };

export async function createCityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const code = String(formData.get("code") || "").toUpperCase().trim();
  const name = String(formData.get("name") || "").trim();
  const state = String(formData.get("state") || "").trim() || null;
  const currency = String(formData.get("currency") || "INR").trim();
  const opening_balance = Number(formData.get("opening_balance") || 0);

  if (!code || !name) return { error: "City code and name are required." };

  const { error } = await supabase.from("cities").insert({
    code,
    name,
    state,
    currency,
    opening_balance,
  });

  if (error) return { error: error.message };
  revalidatePath("/cities");
  redirect("/cities");
}

export async function createPartyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim() || null;
  const primary_city_id = String(formData.get("primary_city_id") || "");
  const party_type = String(formData.get("party_type") || "person");
  const opening_balance = Number(formData.get("opening_balance") || 0);
  const notes = String(formData.get("notes") || "").trim() || null;

  if (!name || !primary_city_id) return { error: "Name and primary city are required." };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { error } = await supabase.from("parties").insert({
    name,
    phone,
    primary_city_id,
    party_type,
    opening_balance,
    notes,
    created_by: user?.id ?? null,
  });

  if (error) return { error: error.message };
  revalidatePath("/parties");
  redirect("/parties");
}

export async function createTransactionAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();

  const transaction_type = String(formData.get("transaction_type") || "");
  const origin_city_id = String(formData.get("origin_city_id") || "");
  const amount = Number(formData.get("amount") || 0);
  const party_id = String(formData.get("party_id") || "") || null;
  const destination_city_id = String(formData.get("destination_city_id") || "") || null;
  const counterparty_id = String(formData.get("counterparty_id") || "") || null;
  const description = String(formData.get("description") || "").trim() || null;
  const reference = String(formData.get("reference") || "").trim() || null;

  if (!transaction_type || !origin_city_id || !amount) {
    return { error: "Transaction type, city and amount are required." };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role")
    .single();
  const status = profile?.role === "operator" ? "pending" : "confirmed";

  const { data, error } = await supabase.rpc("create_transaction", {
    p_transaction_type: transaction_type,
    p_origin_city_id: origin_city_id,
    p_amount: amount,
    p_party_id: party_id,
    p_destination_city_id: destination_city_id,
    p_counterparty_id: counterparty_id,
    p_description: description,
    p_reference: reference,
    p_status: status,
  });

  if (error) return { error: error.message };
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  redirect(`/transactions/${data.token}`);
}

export async function updateTransactionStatusAction(transactionId: string, status: string) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: before } = await supabase
    .from("transactions")
    .select("*")
    .eq("id", transactionId)
    .single();

  const { error } = await supabase
    .from("transactions")
    .update({ status, approved_by: status === "confirmed" ? user?.id : undefined })
    .eq("id", transactionId);

  if (!error) {
    await supabase.from("audit_logs").insert({
      entity_type: "transaction",
      entity_id: transactionId,
      action: `status_change:${status}`,
      performed_by: user?.id,
      previous_value: before,
      new_value: { ...before, status },
      reason: `Status changed to ${status}`,
    });
  }

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { error: error?.message ?? null };
}

export async function reverseTransactionAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const transaction_id = String(formData.get("transaction_id") || "");
  const reason = String(formData.get("reason") || "").trim();

  if (!reason) return { error: "A reason is required to reverse a transaction." };

  const { data, error } = await supabase.rpc("reverse_transaction", {
    p_transaction_id: transaction_id,
    p_reason: reason,
  });

  if (error) return { error: error.message };
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  redirect(`/transactions/${data.token}`);
}
