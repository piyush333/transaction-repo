-- ============================================================================
-- Linked contacts, shared (mirrored) transactions, and permanent delete.
--
-- A party can be flagged as a "linked contact" — tied to the other real
-- user's account rather than just a name. A transaction against a linked
-- contact can be shared: it auto-creates a matching PENDING transaction in
-- the counterpart's own book, which they confirm. Once confirmed, both
-- people see that specific linked pair — nothing else in either book.
--
-- Delete is a true permanent delete (explicitly requested, overriding the
-- append-only default). Own unlinked transactions delete immediately;
-- linked ones need the counterpart's approval, since removing one side
-- changes both books' balances. A snapshot is written to audit_logs first;
-- audit_logs itself remains undeletable.
--
-- NOTE: the function bodies here are the corrected versions. Two bugs were
-- found by functional testing against the live database and are fixed
-- inline rather than as follow-up migrations:
--   1. RLS visibility for linked pairs originally used a self-referencing
--      correlated subquery on `transactions`, which causes genuine infinite
--      recursion in Postgres RLS. Fixed via the SECURITY DEFINER helper
--      visible_linked_transaction_ids(), the same pattern used by
--      app_current_role().
--   2. A linked pair references itself via linked_transaction_id, so
--      deleting either side violated the FK. Fixed by nulling the mutual
--      links before deleting.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Posting engine: stamp owner_id on everything it writes.
-- ---------------------------------------------------------------------------
create or replace function public.next_token(
  p_owner_id uuid,
  p_origin_code text,
  p_dest_code text default null
)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_date_part text := to_char(now(), 'YYMMDD');
  v_seq integer;
  v_token text;
begin
  insert into public.token_sequences (owner_id, city_code, seq_date, last_seq)
  values (p_owner_id, p_origin_code, current_date, 1)
  on conflict (owner_id, city_code, seq_date)
  do update set last_seq = public.token_sequences.last_seq + 1
  returning last_seq into v_seq;

  if p_dest_code is not null then
    v_token := p_origin_code || '-' || p_dest_code || '-' || v_date_part || '-' || lpad(v_seq::text, 6, '0');
  else
    v_token := p_origin_code || '-' || v_date_part || '-' || lpad(v_seq::text, 6, '0');
  end if;

  return v_token;
end;
$$;

drop function if exists public.next_token(text, text);

create or replace function public.create_transaction(
  p_transaction_type text,
  p_origin_city_id uuid,
  p_amount numeric,
  p_party_id uuid default null,
  p_destination_city_id uuid default null,
  p_counterparty_id uuid default null,
  p_description text default null,
  p_reference text default null,
  p_currency text default 'INR',
  p_status text default 'confirmed'
)
returns public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_origin_code text;
  v_dest_code text;
  v_token text;
  v_txn public.transactions;
  v_actor uuid := auth.uid();
  v_money_in constant text[] := array['receipt','collection','settlement_received','transfer_received','adjustment_credit'];
  v_money_out constant text[] := array['payment','settlement_paid','transfer_sent','adjustment_debit'];
begin
  if p_amount is null or p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select code into v_origin_code from public.cities where id = p_origin_city_id and active and owner_id = v_actor;
  if v_origin_code is null then
    raise exception 'origin city not found or inactive';
  end if;

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
    p_party_id, p_counterparty_id, p_amount, p_currency, p_description, p_reference,
    p_status, v_actor, v_actor
  )
  returning * into v_txn;

  if p_transaction_type = any(v_money_in) then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency, owner_id)
    values
      (v_txn.id, 'city_cash', p_origin_city_id, null, 'debit', p_amount, p_currency, v_actor),
      (v_txn.id, 'party', p_origin_city_id, p_party_id, 'credit', p_amount, p_currency, v_actor);

  elsif p_transaction_type = any(v_money_out) then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency, owner_id)
    values
      (v_txn.id, 'party', p_origin_city_id, p_party_id, 'debit', p_amount, p_currency, v_actor),
      (v_txn.id, 'city_cash', p_origin_city_id, null, 'credit', p_amount, p_currency, v_actor);

  elsif p_transaction_type = 'city_transfer' then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency, owner_id)
    values
      (v_txn.id, 'city_cash', p_destination_city_id, null, 'debit', p_amount, p_currency, v_actor),
      (v_txn.id, 'city_cash', p_origin_city_id, null, 'credit', p_amount, p_currency, v_actor);

  elsif p_transaction_type = 'party_transfer' then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency, owner_id)
    values
      (v_txn.id, 'party', p_origin_city_id, p_party_id, 'debit', p_amount, p_currency, v_actor),
      (v_txn.id, 'party', p_origin_city_id, p_counterparty_id, 'credit', p_amount, p_currency, v_actor);

  elsif p_transaction_type = 'reconciliation_adjustment' then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency, owner_id)
    values
      (v_txn.id, 'city_cash', p_origin_city_id, null, 'debit', p_amount, p_currency, v_actor),
      (v_txn.id, 'party', p_origin_city_id, p_party_id, 'credit', p_amount, p_currency, v_actor);
  end if;

  insert into public.audit_logs (entity_type, entity_id, action, performed_by, new_value, reason, owner_id)
  values ('transaction', v_txn.id, 'create', v_actor, to_jsonb(v_txn), 'transaction created via create_transaction', v_actor);

  return v_txn;
end;
$$;

create or replace function public.reverse_transaction(
  p_transaction_id uuid,
  p_reason text
)
returns public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_orig public.transactions;
  v_reversal public.transactions;
  v_reversal_type text;
  v_actor uuid := auth.uid();
begin
  select * into v_orig from public.transactions where id = p_transaction_id and owner_id = v_actor;
  if v_orig.id is null then
    raise exception 'transaction not found';
  end if;
  if v_orig.status = 'reversed' then
    raise exception 'transaction already reversed';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required to reverse a transaction';
  end if;

  v_reversal_type := case v_orig.transaction_type
    when 'receipt' then 'adjustment_debit'
    when 'collection' then 'adjustment_debit'
    when 'settlement_received' then 'adjustment_debit'
    when 'transfer_received' then 'adjustment_debit'
    when 'adjustment_credit' then 'adjustment_debit'
    when 'payment' then 'adjustment_credit'
    when 'settlement_paid' then 'adjustment_credit'
    when 'transfer_sent' then 'adjustment_credit'
    when 'adjustment_debit' then 'adjustment_credit'
    when 'reconciliation_adjustment' then 'adjustment_debit'
    else v_orig.transaction_type
  end;

  if v_orig.transaction_type = 'city_transfer' then
    v_reversal := public.create_transaction(
      p_transaction_type => 'city_transfer',
      p_origin_city_id => v_orig.destination_city_id,
      p_amount => v_orig.amount,
      p_destination_city_id => v_orig.origin_city_id,
      p_description => 'Reversal of ' || v_orig.token || ': ' || p_reason,
      p_currency => v_orig.currency
    );
  elsif v_orig.transaction_type = 'party_transfer' then
    v_reversal := public.create_transaction(
      p_transaction_type => 'party_transfer',
      p_origin_city_id => v_orig.origin_city_id,
      p_amount => v_orig.amount,
      p_party_id => v_orig.counterparty_id,
      p_counterparty_id => v_orig.party_id,
      p_description => 'Reversal of ' || v_orig.token || ': ' || p_reason,
      p_currency => v_orig.currency
    );
  else
    v_reversal := public.create_transaction(
      p_transaction_type => v_reversal_type,
      p_origin_city_id => v_orig.origin_city_id,
      p_amount => v_orig.amount,
      p_party_id => v_orig.party_id,
      p_description => 'Reversal of ' || v_orig.token || ': ' || p_reason,
      p_currency => v_orig.currency
    );
  end if;

  update public.transactions
    set status = 'reversed', reversed_transaction_id = v_reversal.id
    where id = v_orig.id;

  update public.transactions
    set settles_transaction_id = v_orig.id
    where id = v_reversal.id;

  insert into public.audit_logs (entity_type, entity_id, action, performed_by, previous_value, new_value, reason, owner_id)
  values ('transaction', v_orig.id, 'reverse', v_actor, to_jsonb(v_orig), to_jsonb(v_reversal), p_reason, v_actor);

  return v_reversal;
end;
$$;

-- ---------------------------------------------------------------------------
-- Linked contacts + shared transactions
-- ---------------------------------------------------------------------------
alter table public.parties add column linked_profile_id uuid references public.profiles(id)
  check (linked_profile_id is null or linked_profile_id <> owner_id);
create unique index idx_parties_unique_linked_contact on public.parties(owner_id, linked_profile_id)
  where linked_profile_id is not null;

alter table public.transactions add column linked_transaction_id uuid references public.transactions(id);
create index idx_transactions_linked on public.transactions(linked_transaction_id);

alter table public.transactions add column delete_requested_by uuid references public.profiles(id);
alter table public.transactions add column delete_requested_at timestamptz;
alter table public.transactions add column delete_reason text;

-- Breaks the RLS recursion cycle: a SECURITY DEFINER function bypasses RLS
-- on its internal reads, so referencing `transactions` here does not
-- re-trigger the policy that calls it.
create or replace function public.visible_linked_transaction_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select t.id from public.transactions t
  join public.transactions t2 on t2.linked_transaction_id = t.id
  where t2.owner_id = auth.uid();
$$;

drop policy transactions_select on public.transactions;
create policy transactions_select on public.transactions for select to authenticated
  using (
    owner_id = (select auth.uid())
    or id in (select public.visible_linked_transaction_ids())
  );

drop policy entries_select on public.transaction_entries;
create policy entries_select on public.transaction_entries for select to authenticated
  using (
    owner_id = (select auth.uid())
    or transaction_id in (select public.visible_linked_transaction_ids())
  );

drop policy parties_select on public.parties;
create policy parties_select on public.parties for select to authenticated
  using (
    owner_id = (select auth.uid())
    or id in (
      select party_id from public.transactions
      where id in (select public.visible_linked_transaction_ids())
    )
  );

drop policy cities_select on public.cities;
create policy cities_select on public.cities for select to authenticated
  using (
    owner_id = (select auth.uid())
    or id in (
      select origin_city_id from public.transactions
      where id in (select public.visible_linked_transaction_ids())
    )
  );

-- Posts the caller's own authoritative transaction, then mirrors a pending
-- counter-entry into the linked contact's book. SECURITY DEFINER because it
-- deliberately writes across the tenant boundary — gated entirely on both
-- people having mutually added each other as a linked contact.
create or replace function public.create_linked_transaction(
  p_transaction_type text,
  p_origin_city_id uuid,
  p_amount numeric,
  p_linked_party_id uuid,
  p_description text default null,
  p_reference text default null,
  p_currency text default 'INR'
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
  from public.parties
  where id = p_linked_party_id and owner_id = v_actor;

  if v_counterpart_profile is null then
    raise exception 'party is not a linked contact';
  end if;

  select * into v_reciprocal
  from public.parties
  where owner_id = v_counterpart_profile and linked_profile_id = v_actor
  limit 1;

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
    p_amount, p_currency, p_description, p_reference, 'pending', v_actor, v_counterpart_profile, v_origin_txn.id
  )
  returning * into v_mirror_txn;

  if v_mirror_type = any(v_money_in) then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency, owner_id)
    values
      (v_mirror_txn.id, 'city_cash', v_reciprocal.primary_city_id, null, 'debit', p_amount, p_currency, v_counterpart_profile),
      (v_mirror_txn.id, 'party', v_reciprocal.primary_city_id, v_reciprocal.id, 'credit', p_amount, p_currency, v_counterpart_profile);
  elsif v_mirror_type = any(v_money_out) then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency, owner_id)
    values
      (v_mirror_txn.id, 'party', v_reciprocal.primary_city_id, v_reciprocal.id, 'debit', p_amount, p_currency, v_counterpart_profile),
      (v_mirror_txn.id, 'city_cash', v_reciprocal.primary_city_id, null, 'credit', p_amount, p_currency, v_counterpart_profile);
  end if;

  update public.transactions set linked_transaction_id = v_mirror_txn.id where id = v_origin_txn.id;

  insert into public.audit_logs (entity_type, entity_id, action, performed_by, new_value, reason, owner_id)
  values ('transaction', v_mirror_txn.id, 'create', v_actor, to_jsonb(v_mirror_txn),
          'mirrored from linked transaction ' || v_origin_txn.token, v_counterpart_profile);

  select * into v_origin_txn from public.transactions where id = v_origin_txn.id;
  return v_origin_txn;
end;
$$;

-- ---------------------------------------------------------------------------
-- Permanent delete. audit_logs keeps its delete-blocking trigger.
-- ---------------------------------------------------------------------------
drop trigger trg_block_delete_transactions on public.transactions;
drop trigger trg_block_delete_entries on public.transaction_entries;

create or replace function public.request_delete_transaction(
  p_transaction_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_txn public.transactions;
begin
  select * into v_txn from public.transactions where id = p_transaction_id and owner_id = v_actor;
  if v_txn.id is null then
    raise exception 'transaction not found';
  end if;
  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'a reason is required to delete a transaction';
  end if;

  if v_txn.linked_transaction_id is null then
    insert into public.audit_logs (entity_type, entity_id, action, performed_by, previous_value, reason, owner_id)
    values ('transaction', v_txn.id, 'delete', v_actor, to_jsonb(v_txn), p_reason, v_actor);

    update public.transactions
      set reversed_transaction_id = null, settles_transaction_id = null
      where id = v_txn.id;
    update public.transactions set reversed_transaction_id = null where reversed_transaction_id = v_txn.id;
    update public.transactions set settles_transaction_id = null where settles_transaction_id = v_txn.id;
    update public.transactions set linked_transaction_id = null where linked_transaction_id = v_txn.id;

    delete from public.transactions where id = v_txn.id;
    return jsonb_build_object('status', 'deleted');
  end if;

  update public.transactions
    set delete_requested_by = v_actor, delete_requested_at = now(), delete_reason = p_reason
    where id in (v_txn.id, v_txn.linked_transaction_id);

  return jsonb_build_object('status', 'pending_approval');
end;
$$;

create or replace function public.confirm_delete_transaction(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_txn public.transactions;
  v_linked public.transactions;
begin
  select * into v_txn from public.transactions where id = p_transaction_id and owner_id = v_actor;
  if v_txn.id is null then
    raise exception 'transaction not found';
  end if;
  if v_txn.delete_requested_by is null then
    raise exception 'no deletion request is pending for this transaction';
  end if;
  if v_txn.delete_requested_by = v_actor then
    raise exception 'the person who requested the deletion cannot also approve it';
  end if;

  if v_txn.linked_transaction_id is not null then
    select * into v_linked from public.transactions where id = v_txn.linked_transaction_id;
  end if;

  insert into public.audit_logs (entity_type, entity_id, action, performed_by, previous_value, reason, owner_id)
  values ('transaction', v_txn.id, 'delete_approved', v_actor, to_jsonb(v_txn), v_txn.delete_reason, v_txn.owner_id);

  if v_linked.id is not null then
    insert into public.audit_logs (entity_type, entity_id, action, performed_by, previous_value, reason, owner_id)
    values ('transaction', v_linked.id, 'delete_approved', v_actor, to_jsonb(v_linked), v_linked.delete_reason, v_linked.owner_id);
  end if;

  -- break the mutual references before deleting, or the FK blocks it
  update public.transactions
    set linked_transaction_id = null, reversed_transaction_id = null, settles_transaction_id = null
    where id in (v_txn.id, coalesce(v_linked.id, v_txn.id));
  update public.transactions
    set reversed_transaction_id = null
    where reversed_transaction_id in (v_txn.id, coalesce(v_linked.id, v_txn.id));
  update public.transactions
    set settles_transaction_id = null
    where settles_transaction_id in (v_txn.id, coalesce(v_linked.id, v_txn.id));
  update public.transactions
    set linked_transaction_id = null
    where linked_transaction_id in (v_txn.id, coalesce(v_linked.id, v_txn.id));

  delete from public.transactions where id = v_txn.id;
  if v_linked.id is not null then
    delete from public.transactions where id = v_linked.id;
  end if;

  return jsonb_build_object('status', 'deleted');
end;
$$;

create or replace function public.cancel_delete_request(p_transaction_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_actor uuid := auth.uid();
  v_txn public.transactions;
begin
  select * into v_txn from public.transactions where id = p_transaction_id and owner_id = v_actor;
  if v_txn.id is null then
    raise exception 'transaction not found';
  end if;

  update public.transactions
    set delete_requested_by = null, delete_requested_at = null, delete_reason = null
    where id = v_txn.id;

  if v_txn.linked_transaction_id is not null then
    update public.transactions
      set delete_requested_by = null, delete_requested_at = null, delete_reason = null
      where id = v_txn.linked_transaction_id;
  end if;

  return jsonb_build_object('status', 'cancelled');
end;
$$;

-- Postgres grants EXECUTE to PUBLIC (incl. anon) by default — lock down.
revoke execute on function public.create_linked_transaction(text, uuid, numeric, uuid, text, text, text) from anon, public;
revoke execute on function public.request_delete_transaction(uuid, text) from anon, public;
revoke execute on function public.confirm_delete_transaction(uuid) from anon, public;
revoke execute on function public.cancel_delete_request(uuid) from anon, public;
revoke execute on function public.next_token(uuid, text, text) from anon, public;
revoke execute on function public.visible_linked_transaction_ids() from anon, public;

grant execute on function public.create_linked_transaction(text, uuid, numeric, uuid, text, text, text) to authenticated;
grant execute on function public.request_delete_transaction(uuid, text) to authenticated;
grant execute on function public.confirm_delete_transaction(uuid) to authenticated;
grant execute on function public.cancel_delete_request(uuid) to authenticated;
grant execute on function public.next_token(uuid, text, text) to authenticated;
grant execute on function public.visible_linked_transaction_ids() to authenticated;
