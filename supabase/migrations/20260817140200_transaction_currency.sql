-- ============================================================================
-- Transactions inherit their origin city's currency instead of silently
-- defaulting to INR.
--
-- This was a real latent bug: the form had no currency field and the
-- function defaulted to 'INR', so a transaction recorded in Dubai (an AED
-- city) was stamped INR. It was harmless only because no transactions
-- existed yet; it would have silently corrupted the Dubai ledger.
--
-- Passing p_currency explicitly still wins, which is what makes cross-border
-- movement possible (e.g. carrying INR into Dubai). The app never converts —
-- it records honestly which currency was actually used, and reports balances
-- per currency.
-- ============================================================================

create or replace function public.create_transaction(
  p_transaction_type text,
  p_origin_city_id uuid,
  p_amount numeric,
  p_party_id uuid default null,
  p_destination_city_id uuid default null,
  p_counterparty_id uuid default null,
  p_description text default null,
  p_reference text default null,
  p_currency text default null,
  p_status text default 'confirmed'
)
returns public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_origin_code text;
  v_origin_currency text;
  v_dest_code text;
  v_token text;
  v_currency text;
  v_txn public.transactions;
  v_actor uuid := auth.uid();
  v_money_in constant text[] := array['receipt','collection','settlement_received','transfer_received','adjustment_credit'];
  v_money_out constant text[] := array['payment','settlement_paid','transfer_sent','adjustment_debit'];
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select code, currency into v_origin_code, v_origin_currency
  from public.cities where id = p_origin_city_id and active and owner_id = v_actor;
  if v_origin_code is null then
    raise exception 'origin city not found or inactive';
  end if;

  -- currency follows the city unless the caller deliberately overrides it
  v_currency := coalesce(nullif(trim(coalesce(p_currency, '')), ''), v_origin_currency, 'INR');

  if p_destination_city_id is not null then
    select code into v_dest_code from public.cities where id = p_destination_city_id and active and owner_id = v_actor;
    if v_dest_code is null then
      raise exception 'destination city not found or inactive';
    end if;
  end if;

  if p_transaction_type in ('receipt','collection','settlement_received','transfer_received','adjustment_credit',
                             'payment','settlement_paid','transfer_sent','adjustment_debit','party_transfer',
                             'reconciliation_adjustment')
     and p_party_id is null then
    raise exception 'party_id is required for transaction_type %', p_transaction_type;
  end if;

  if p_transaction_type = 'party_transfer' and p_counterparty_id is null then
    raise exception 'counterparty_id is required for party_transfer';
  end if;

  if p_transaction_type = 'city_transfer' and p_destination_city_id is null then
    raise exception 'destination_city_id is required for city_transfer';
  end if;

  v_token := public.next_token(v_actor, v_origin_code, v_dest_code);

  insert into public.transactions (
    token, transaction_type, origin_city_id, destination_city_id,
    party_id, counterparty_id, amount, currency, description, reference,
    status, created_by, owner_id
  ) values (
    v_token, p_transaction_type, p_origin_city_id, p_destination_city_id,
    p_party_id, p_counterparty_id, p_amount, v_currency, p_description, p_reference,
    p_status, v_actor, v_actor
  )
  returning * into v_txn;

  if p_transaction_type = any(v_money_in) then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency, owner_id)
    values
      (v_txn.id, 'city_cash', p_origin_city_id, null, 'debit', p_amount, v_currency, v_actor),
      (v_txn.id, 'party', p_origin_city_id, p_party_id, 'credit', p_amount, v_currency, v_actor);
  elsif p_transaction_type = any(v_money_out) then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency, owner_id)
    values
      (v_txn.id, 'party', p_origin_city_id, p_party_id, 'debit', p_amount, v_currency, v_actor),
      (v_txn.id, 'city_cash', p_origin_city_id, null, 'credit', p_amount, v_currency, v_actor);
  elsif p_transaction_type = 'city_transfer' then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency, owner_id)
    values
      (v_txn.id, 'city_cash', p_destination_city_id, null, 'debit', p_amount, v_currency, v_actor),
      (v_txn.id, 'city_cash', p_origin_city_id, null, 'credit', p_amount, v_currency, v_actor);
  elsif p_transaction_type = 'party_transfer' then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency, owner_id)
    values
      (v_txn.id, 'party', p_origin_city_id, p_party_id, 'debit', p_amount, v_currency, v_actor),
      (v_txn.id, 'party', p_origin_city_id, p_counterparty_id, 'credit', p_amount, v_currency, v_actor);
  elsif p_transaction_type = 'reconciliation_adjustment' then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency, owner_id)
    values
      (v_txn.id, 'city_cash', p_origin_city_id, null, 'debit', p_amount, v_currency, v_actor),
      (v_txn.id, 'party', p_origin_city_id, p_party_id, 'credit', p_amount, v_currency, v_actor);
  end if;

  insert into public.audit_logs (entity_type, entity_id, action, performed_by, new_value, reason, owner_id)
  values ('transaction', v_txn.id, 'create', v_actor, to_jsonb(v_txn), 'transaction created via create_transaction', v_actor);

  return v_txn;
end;
$$;

-- Shared transactions mirror the SAME amount and SAME currency into the
-- other book — no conversion, so both sides always agree on the figure.
create or replace function public.create_linked_transaction(
  p_transaction_type text,
  p_origin_city_id uuid,
  p_amount numeric,
  p_linked_party_id uuid,
  p_description text default null,
  p_reference text default null,
  p_currency text default null
)
returns public.transactions
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_counterpart_profile uuid;
  v_reciprocal public.parties;
  v_origin_txn public.transactions;
  v_mirror_txn public.transactions;
  v_mirror_type text;
  v_dest_code text;
  v_money_in constant text[] := array['receipt','collection','settlement_received','transfer_received','adjustment_credit'];
  v_money_out constant text[] := array['payment','settlement_paid','transfer_sent','adjustment_debit'];
begin
  if p_transaction_type not in (
    'receipt','collection','settlement_received','transfer_received','adjustment_credit',
    'payment','settlement_paid','transfer_sent','adjustment_debit'
  ) then
    raise exception 'transaction_type % cannot be shared with a linked contact', p_transaction_type;
  end if;

  select linked_profile_id into v_counterpart_profile
  from public.parties where id = p_linked_party_id and owner_id = v_actor;
  if v_counterpart_profile is null then
    raise exception 'party is not a linked contact';
  end if;

  select * into v_reciprocal from public.parties
  where owner_id = v_counterpart_profile and linked_profile_id = v_actor limit 1;
  if v_reciprocal.id is null then
    raise exception 'the other person has not added you as a linked contact yet';
  end if;

  v_origin_txn := public.create_transaction(
    p_transaction_type => p_transaction_type,
    p_origin_city_id => p_origin_city_id,
    p_amount => p_amount,
    p_party_id => p_linked_party_id,
    p_description => p_description,
    p_reference => p_reference,
    p_currency => p_currency,
    p_status => 'confirmed'
  );

  v_mirror_type := case p_transaction_type
    when 'receipt' then 'payment'
    when 'collection' then 'payment'
    when 'settlement_received' then 'settlement_paid'
    when 'transfer_received' then 'transfer_sent'
    when 'adjustment_credit' then 'adjustment_debit'
    when 'payment' then 'receipt'
    when 'settlement_paid' then 'settlement_received'
    when 'transfer_sent' then 'transfer_received'
    when 'adjustment_debit' then 'adjustment_credit'
  end;

  select code into v_dest_code from public.cities where id = v_reciprocal.primary_city_id;

  insert into public.transactions (
    token, transaction_type, origin_city_id, party_id, amount, currency,
    description, reference, status, created_by, owner_id, linked_transaction_id
  ) values (
    public.next_token(v_counterpart_profile, v_dest_code),
    v_mirror_type, v_reciprocal.primary_city_id, v_reciprocal.id,
    p_amount, v_origin_txn.currency, p_description, p_reference, 'pending',
    v_actor, v_counterpart_profile, v_origin_txn.id
  )
  returning * into v_mirror_txn;

  if v_mirror_type = any(v_money_in) then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency, owner_id)
    values
      (v_mirror_txn.id, 'city_cash', v_reciprocal.primary_city_id, null, 'debit', p_amount, v_origin_txn.currency, v_counterpart_profile),
      (v_mirror_txn.id, 'party', v_reciprocal.primary_city_id, v_reciprocal.id, 'credit', p_amount, v_origin_txn.currency, v_counterpart_profile);
  elsif v_mirror_type = any(v_money_out) then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency, owner_id)
    values
      (v_mirror_txn.id, 'party', v_reciprocal.primary_city_id, v_reciprocal.id, 'debit', p_amount, v_origin_txn.currency, v_counterpart_profile),
      (v_mirror_txn.id, 'city_cash', v_reciprocal.primary_city_id, null, 'credit', p_amount, v_origin_txn.currency, v_counterpart_profile);
  end if;

  update public.transactions set linked_transaction_id = v_mirror_txn.id where id = v_origin_txn.id;

  insert into public.audit_logs (entity_type, entity_id, action, performed_by, new_value, reason, owner_id)
  values ('transaction', v_mirror_txn.id, 'create', v_actor, to_jsonb(v_mirror_txn),
          'mirrored from linked transaction ' || v_origin_txn.token, v_counterpart_profile);

  select * into v_origin_txn from public.transactions where id = v_origin_txn.id;
  return v_origin_txn;
end;
$$;

-- Snapshot now carries per-currency KPI rows plus the currency-free counts.
create or replace function public.dashboard_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'kpis', coalesce((select jsonb_agg(to_jsonb(k)) from public.dashboard_kpis k), '[]'::jsonb),
    'counts', (select to_jsonb(c) from public.dashboard_counts c),
    'cities', coalesce((select jsonb_agg(to_jsonb(c)) from public.cities c), '[]'::jsonb),
    'city_balances', coalesce((select jsonb_agg(to_jsonb(b)) from public.city_balances b), '[]'::jsonb),
    'city_receivable_payable', coalesce((select jsonb_agg(to_jsonb(r)) from public.city_receivable_payable r), '[]'::jsonb),
    'obligations', coalesce((select jsonb_agg(to_jsonb(o)) from public.city_to_city_obligations o), '[]'::jsonb),
    'recent_transactions', coalesce((
      select jsonb_agg(to_jsonb(t)) from (
        select * from public.transactions order by created_at desc limit 8
      ) t
    ), '[]'::jsonb),
    'top_parties', coalesce((
      select jsonb_agg(to_jsonb(p)) from (
        select * from public.party_exposure where balance <> 0 limit 8
      ) p
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.dashboard_snapshot() from anon, public;
grant execute on function public.dashboard_snapshot() to authenticated;
revoke execute on function public.create_transaction(text, uuid, numeric, uuid, uuid, uuid, text, text, text, text) from anon;
grant execute on function public.create_transaction(text, uuid, numeric, uuid, uuid, uuid, text, text, text, text) to authenticated;
revoke execute on function public.create_linked_transaction(text, uuid, numeric, uuid, text, text, text) from anon, public;
grant execute on function public.create_linked_transaction(text, uuid, numeric, uuid, text, text, text) to authenticated;
