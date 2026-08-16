-- reconciliation_adjustment posts a 'party' entry but was missing from the
-- required-party validation list, so a null party_id would fail late with a
-- confusing constraint error instead of a clear exception.
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
