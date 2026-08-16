-- ============================================================================
-- 02_token_and_posting.sql
-- Token generation + the single entry point for creating a balanced
-- transaction. Tokens are immutable once assigned; corrections happen via
-- reversal, never deletion (enforced by revoking DELETE in RLS + a trigger
-- that blocks UPDATE of a confirmed+ transaction's core fields).
-- ============================================================================

create or replace function public.next_token(
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
  insert into public.token_sequences (city_code, seq_date, last_seq)
  values (p_origin_code, current_date, 1)
  on conflict (city_code, seq_date)
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

-- ---------------------------------------------------------------------------
-- app_current_role / app_current_city: read the caller's own profile,
-- bypassing RLS recursion (SECURITY DEFINER limited to reading profiles).
-- ---------------------------------------------------------------------------
create or replace function public.app_current_role()
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.app_current_city()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select assigned_city_id from public.profiles where id = auth.uid();
$$;

create or replace function public.app_current_active()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select active from public.profiles where id = auth.uid()), false);
$$;

-- ---------------------------------------------------------------------------
-- create_transaction: the ONLY sanctioned way to post a transaction. Builds
-- the token, inserts the transaction row, posts balanced ledger legs per
-- transaction_type, and writes an audit log entry — all in one call so the
-- ledger can never end up half-written.
-- ---------------------------------------------------------------------------
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

  select code into v_origin_code from public.cities where id = p_origin_city_id and active;
  if v_origin_code is null then
    raise exception 'origin city not found or inactive';
  end if;

  if p_destination_city_id is not null then
    select code into v_dest_code from public.cities where id = p_destination_city_id and active;
    if v_dest_code is null then
      raise exception 'destination city not found or inactive';
    end if;
  end if;

  if p_transaction_type in ('receipt','collection','settlement_received','transfer_received','adjustment_credit',
                             'payment','settlement_paid','transfer_sent','adjustment_debit','party_transfer')
     and p_party_id is null then
    raise exception 'party_id is required for transaction_type %', p_transaction_type;
  end if;

  if p_transaction_type = 'party_transfer' and p_counterparty_id is null then
    raise exception 'counterparty_id is required for party_transfer';
  end if;

  if p_transaction_type = 'city_transfer' and p_destination_city_id is null then
    raise exception 'destination_city_id is required for city_transfer';
  end if;

  v_token := public.next_token(v_origin_code, v_dest_code);

  insert into public.transactions (
    token, transaction_type, origin_city_id, destination_city_id,
    party_id, counterparty_id, amount, currency, description, reference,
    status, created_by
  ) values (
    v_token, p_transaction_type, p_origin_city_id, p_destination_city_id,
    p_party_id, p_counterparty_id, p_amount, p_currency, p_description, p_reference,
    p_status, v_actor
  )
  returning * into v_txn;

  if p_transaction_type = any(v_money_in) then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency)
    values
      (v_txn.id, 'city_cash', p_origin_city_id, null, 'debit', p_amount, p_currency),
      (v_txn.id, 'party', p_origin_city_id, p_party_id, 'credit', p_amount, p_currency);

  elsif p_transaction_type = any(v_money_out) then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency)
    values
      (v_txn.id, 'party', p_origin_city_id, p_party_id, 'debit', p_amount, p_currency),
      (v_txn.id, 'city_cash', p_origin_city_id, null, 'credit', p_amount, p_currency);

  elsif p_transaction_type = 'city_transfer' then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency)
    values
      (v_txn.id, 'city_cash', p_destination_city_id, null, 'debit', p_amount, p_currency),
      (v_txn.id, 'city_cash', p_origin_city_id, null, 'credit', p_amount, p_currency);

  elsif p_transaction_type = 'party_transfer' then
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency)
    values
      (v_txn.id, 'party', p_origin_city_id, p_party_id, 'debit', p_amount, p_currency),
      (v_txn.id, 'party', p_origin_city_id, p_counterparty_id, 'credit', p_amount, p_currency);

  elsif p_transaction_type = 'reconciliation_adjustment' then
    -- Directionality for ad-hoc adjustments is explicit in the description;
    -- treated as money_in by default (credit party / debit cash). Owners
    -- should prefer adjustment_credit/adjustment_debit for clarity.
    insert into public.transaction_entries (transaction_id, entry_type, city_id, party_id, direction, amount, currency)
    values
      (v_txn.id, 'city_cash', p_origin_city_id, null, 'debit', p_amount, p_currency),
      (v_txn.id, 'party', p_origin_city_id, p_party_id, 'credit', p_amount, p_currency);
  end if;

  insert into public.audit_logs (entity_type, entity_id, action, performed_by, new_value, reason)
  values ('transaction', v_txn.id, 'create', v_actor, to_jsonb(v_txn), 'transaction created via create_transaction');

  return v_txn;
end;
$$;

-- ---------------------------------------------------------------------------
-- reverse_transaction: never deletes. Posts an equal-and-opposite
-- transaction and links both records together, flips original to 'reversed'.
-- ---------------------------------------------------------------------------
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
  select * into v_orig from public.transactions where id = p_transaction_id;
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
    else v_orig.transaction_type -- city_transfer / party_transfer reverse as themselves (see below)
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

  insert into public.audit_logs (entity_type, entity_id, action, performed_by, previous_value, new_value, reason)
  values ('transaction', v_orig.id, 'reverse', v_actor, to_jsonb(v_orig), to_jsonb(v_reversal), p_reason);

  return v_reversal;
end;
$$;

-- ---------------------------------------------------------------------------
-- Guard: confirmed+ transactions are immutable except for status
-- progression/reversal linkage. No hard deletes ever.
-- ---------------------------------------------------------------------------
create or replace function public.guard_transaction_immutability()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if old.status in ('confirmed','settled','reversed') then
    if new.amount <> old.amount
       or new.transaction_type <> old.transaction_type
       or new.origin_city_id <> old.origin_city_id
       or coalesce(new.party_id::text,'') <> coalesce(old.party_id::text,'')
       or new.token <> old.token then
      raise exception 'confirmed transactions are immutable; use reverse_transaction() to correct them';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_transaction_immutability
  before update on public.transactions
  for each row execute function public.guard_transaction_immutability();

create or replace function public.block_delete()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  raise exception '% rows cannot be deleted; use reverse_transaction() or set active=false', TG_TABLE_NAME;
end;
$$;

create trigger trg_block_delete_transactions
  before delete on public.transactions
  for each row execute function public.block_delete();
create trigger trg_block_delete_entries
  before delete on public.transaction_entries
  for each row execute function public.block_delete();
create trigger trg_block_delete_audit
  before delete on public.audit_logs
  for each row execute function public.block_delete();
