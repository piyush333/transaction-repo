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
  const country = String(formData.get("country") || "India").trim() || "India";
  const currency = String(formData.get("currency") || "INR").trim();
  const opening_balance = Number(formData.get("opening_balance") || 0);

  if (!code || !name) return { error: "City code and name are required." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("cities").insert({
    code,
    name,
    state,
    country,
    currency,
    opening_balance,
    owner_id: user.id,
  });

  if (error) return { error: error.message };
  revalidatePath("/cities");
  redirect("/cities");
}

export async function updateCityAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const id = String(formData.get("id") || "");
  const code = String(formData.get("code") || "").toUpperCase().trim();
  const name = String(formData.get("name") || "").trim();
  const state = String(formData.get("state") || "").trim() || null;
  const country = String(formData.get("country") || "India").trim() || "India";
  const currency = String(formData.get("currency") || "INR").trim();
  const opening_balance = Number(formData.get("opening_balance") || 0);
  const active = formData.get("active") === "on";

  if (!id || !code || !name) return { error: "City code and name are required." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: before } = await supabase.from("cities").select("*").eq("id", id).single();

  const { error } = await supabase
    .from("cities")
    .update({ code, name, state, country, currency, opening_balance, active })
    .eq("id", id);

  if (error) return { error: error.message };

  // Cities carry an opening balance and drive token prefixes, so edits are
  // worth recording even though they aren't ledger entries themselves.
  await supabase.from("audit_logs").insert({
    entity_type: "city",
    entity_id: id,
    action: "update",
    performed_by: user.id,
    previous_value: before,
    new_value: { code, name, state, country, currency, opening_balance, active },
    reason: "City details edited",
    owner_id: user.id,
  });

  revalidatePath("/cities");
  revalidatePath(`/cities/${id}`);
  revalidatePath("/dashboard");
  redirect(`/cities/${id}`);
}

export async function updatePartyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const id = String(formData.get("id") || "");
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim() || null;
  const party_type = String(formData.get("party_type") || "person");
  const opening_balance = Number(formData.get("opening_balance") || 0);
  const notes = String(formData.get("notes") || "").trim() || null;
  const linked_profile_id = String(formData.get("linked_profile_id") || "") || null;
  const active = formData.get("active") === "on";

  if (!id || !name) return { error: "Name is required." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { data: before } = await supabase.from("parties").select("*").eq("id", id).single();

  const { error } = await supabase
    .from("parties")
    .update({ name, phone, party_type, opening_balance, notes, linked_profile_id, active })
    .eq("id", id);

  if (error) return { error: error.message };

  await supabase.from("audit_logs").insert({
    entity_type: "party",
    entity_id: id,
    action: "update",
    performed_by: user.id,
    previous_value: before,
    new_value: { name, phone, party_type, opening_balance, notes, linked_profile_id, active },
    reason: "Party details edited",
    owner_id: user.id,
  });

  revalidatePath("/parties");
  revalidatePath(`/parties/${id}`);
  revalidatePath("/dashboard");
  redirect(`/parties/${id}`);
}

export async function createPartyAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const supabase = await createClient();
  const name = String(formData.get("name") || "").trim();
  const phone = String(formData.get("phone") || "").trim() || null;
  const primary_city_id = String(formData.get("primary_city_id") || "");
  const party_type = String(formData.get("party_type") || "person");
  const opening_balance = Number(formData.get("opening_balance") || 0);
  const notes = String(formData.get("notes") || "").trim() || null;
  const linked_profile_id = String(formData.get("linked_profile_id") || "") || null;

  if (!name || !primary_city_id) return { error: "Name and primary city are required." };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Not signed in." };

  const { error } = await supabase.from("parties").insert({
    name,
    phone,
    primary_city_id,
    party_type,
    opening_balance,
    notes,
    linked_profile_id,
    created_by: user.id,
    owner_id: user.id,
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
  const share_with_linked = formData.get("share_with_linked") === "on";

  if (!transaction_type || !origin_city_id || !amount) {
    return { error: "Transaction type, city and amount are required." };
  }

  // Sharing routes through create_linked_transaction, which also mirrors a
  // pending counter-entry into the linked contact's own book.
  if (share_with_linked && party_id) {
    const { data, error } = await supabase.rpc("create_linked_transaction", {
      p_transaction_type: transaction_type,
      p_origin_city_id: origin_city_id,
      p_amount: amount,
      p_linked_party_id: party_id,
      p_description: description,
      p_reference: reference,
    });
    if (error) return { error: error.message };
    revalidatePath("/transactions");
    revalidatePath("/dashboard");
    redirect(`/transactions/${data.token}`);
  }

  const { data, error } = await supabase.rpc("create_transaction", {
    p_transaction_type: transaction_type,
    p_origin_city_id: origin_city_id,
    p_amount: amount,
    p_party_id: party_id,
    p_destination_city_id: destination_city_id,
    p_counterparty_id: counterparty_id,
    p_description: description,
    p_reference: reference,
    p_status: "confirmed",
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
      owner_id: user?.id,
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

/**
 * Deletes permanently. Unlinked transactions go immediately; linked ones
 * need the other person's approval first (their balance changes too).
 */
export async function requestDeleteTransactionAction(
  _prev: ActionState,
  formData: FormData
): Promise<ActionState> {
  const supabase = await createClient();
  const transaction_id = String(formData.get("transaction_id") || "");
  const reason = String(formData.get("reason") || "").trim();

  if (!reason) return { error: "A reason is required to delete a transaction." };

  const { data, error } = await supabase.rpc("request_delete_transaction", {
    p_transaction_id: transaction_id,
    p_reason: reason,
  });

  if (error) return { error: error.message };

  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  if (data?.status === "deleted") redirect("/transactions");
  redirect(`/transactions?pending_delete=1`);
}

export async function confirmDeleteTransactionAction(transactionId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("confirm_delete_transaction", {
    p_transaction_id: transactionId,
  });
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { error: error?.message ?? null };
}

export async function cancelDeleteRequestAction(transactionId: string) {
  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_delete_request", {
    p_transaction_id: transactionId,
  });
  revalidatePath("/transactions");
  revalidatePath("/dashboard");
  return { error: error?.message ?? null };
}
