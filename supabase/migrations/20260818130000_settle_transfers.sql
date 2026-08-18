-- ============================================================================
-- Settlement of cross-city transfers.
--
-- WHY THIS EXISTS
-- A `city_transfer` posts BOTH legs the moment it is confirmed (debit
-- destination cash, credit origin cash), so it is never outstanding. A
-- `transfer_sent` does not: it posts only at the origin (debit the party,
-- credit origin cash), meaning "I handed this cash to X in Neemuch to be
-- delivered in Dubai". The destination city's books do not move at all
-- until the money actually lands. Nothing in the app could record that
-- landing -- `settles_transaction_id` was only ever written by
-- reverse_transaction -- so the reconciliation page could raise an
-- `unsettled_transfer` flag with no way to clear it.
--
-- WHAT A SETTLEMENT IS
-- The mirror image at the destination: cash arrives there and the party who
-- carried it is discharged. That is exactly what a `transfer_received` at
-- the destination city with the same party posts, so settlement creates one
-- rather than inventing a new transaction type or a status flag:
--
--   original    transfer_sent  NMH->UAE  party P  50,000
--               debit  party P    @ NMH   50,000
--               credit city_cash  @ NMH   50,000
--   settlement  transfer_received @ UAE   party P  50,000
--               debit  city_cash  @ UAE   50,000
--               credit party P    @ UAE   50,000
--
-- Cash moves NMH -> UAE and P nets to zero across the two cities, because
-- party_balances aggregates a party over every city. The per-city detail
-- stays visible in city_party_balances. It is a real ledger entry, not a
-- flag, which is the only way the destination city's cash can be right.
--
-- CURRENCY: the settlement always carries the transfer's currency. The app
-- performs no conversion anywhere; if rupees are handed over and dirhams
-- come out the other end, that is an FX transaction to record separately,
-- not something this function will silently invent a rate for.
--
-- PARTIAL SETTLEMENT is supported -- cash of this kind routinely moves in
-- tranches -- so "settled" is the SUM of settling transactions, not merely
-- whether one exists. The original flips to `settled` once fully covered.
--
-- OWN BOOK ONLY: transfers carry a destination city, and the create form
-- refuses to share anything with a destination, so a transfer is never
-- mirrored into the other person's book. Settlement therefore needs no
-- cross-book approval -- it moves your own cash between your own cities.
-- ============================================================================

create or replace function public.settle_transfer(
  p_transaction_id uuid,
  p_amount numeric default null,
  p_description text default null
)
returns public.transactions
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_orig public.transactions;
  v_actor uuid := auth.uid();
  v_settled numeric;
  v_remaining numeric;
  v_amount numeric;
  v_settle_type text;
  v_new public.transactions;
begin
  select * into v_orig from public.transactions where id = p_transaction_id;
  if v_orig.id is null then
    raise exception 'transaction not found';
  end if;
  if v_orig.owner_id <> v_actor then
    raise exception 'you can only settle transfers in your own book';
  end if;
  if v_orig.transaction_type not in ('transfer_sent','transfer_received') then
    raise exception
      'only transfer_sent / transfer_received are settled separately; % posts both legs when it is confirmed',
      v_orig.transaction_type;
  end if;
  if v_orig.destination_city_id is null then
    raise exception 'transfer % has no destination city to settle at', v_orig.token;
  end if;
  if v_orig.party_id is null then
    raise exception 'transfer % has no party', v_orig.token;
  end if;
  if v_orig.status not in ('confirmed','settled') then
    raise exception 'only a confirmed transfer can be settled; % is %', v_orig.token, v_orig.status;
  end if;

  -- Only genuine settlements count. reverse_transaction also writes
  -- settles_transaction_id, but a reversal of a transfer is posted as an
  -- adjustment_credit/debit, so restricting to the transfer types keeps a
  -- reversal from reading as delivered money.
  select coalesce(sum(amount), 0) into v_settled
  from public.transactions
  where settles_transaction_id = v_orig.id
    and transaction_type in ('transfer_sent','transfer_received')
    and status in ('confirmed','settled');

  v_remaining := v_orig.amount - v_settled;
  if v_remaining <= 0 then
    raise exception 'transfer % is already fully settled', v_orig.token;
  end if;

  v_amount := coalesce(p_amount, v_remaining);
  if v_amount <= 0 then
    raise exception 'settlement amount must be positive';
  end if;
  if v_amount > v_remaining then
    raise exception 'settling % exceeds the % still outstanding on %',
      v_amount, v_remaining, v_orig.token;
  end if;

  v_settle_type := case v_orig.transaction_type
    when 'transfer_sent' then 'transfer_received'
    when 'transfer_received' then 'transfer_sent'
  end;

  -- No destination_city_id on the settlement itself: it is the arrival, so
  -- it must not in turn be flagged as an outstanding transfer.
  v_new := public.create_transaction(
    p_transaction_type => v_settle_type,
    p_origin_city_id   => v_orig.destination_city_id,
    p_amount           => v_amount,
    p_party_id         => v_orig.party_id,
    p_description      => coalesce(
                            nullif(trim(coalesce(p_description, '')), ''),
                            'Settlement of ' || v_orig.token),
    p_reference        => v_orig.reference,
    p_currency         => v_orig.currency,
    p_status           => 'confirmed'
  );

  update public.transactions
    set settles_transaction_id = v_orig.id
    where id = v_new.id;

  if v_settled + v_amount >= v_orig.amount then
    update public.transactions
      set status = 'settled'
      where id = v_orig.id and status = 'confirmed';
  end if;

  insert into public.audit_logs (
    entity_type, entity_id, action, performed_by, previous_value, new_value, reason, owner_id
  ) values (
    'transaction', v_orig.id, 'settle', v_actor, to_jsonb(v_orig), to_jsonb(v_new),
    'settled ' || v_amount || ' of ' || v_orig.amount || ' via ' || v_new.token,
    v_actor
  );

  return v_new;
end;
$$;

revoke all on function public.settle_transfer(uuid, numeric, text) from public, anon;
grant execute on function public.settle_transfer(uuid, numeric, text) to authenticated;

-- ---------------------------------------------------------------------------
-- reconciliation_flags: settlement is now a SUM, not an existence check, and
-- the outstanding amount is exposed so the page can show progress. A
-- transfer also stays visible if a settlement is later reversed, which the
-- old status-only test would have missed.
--
-- Shape change (settled_amount), so DROP rather than CREATE OR REPLACE, and
-- re-apply security_invoker afterwards -- recreating a view silently drops
-- reloptions and losing it here would expose the other person's book.
-- ---------------------------------------------------------------------------

drop view if exists public.reconciliation_flags cascade;

create view public.reconciliation_flags as
with mine as (
  select * from public.transactions where owner_id = (select auth.uid())
),
paired as (
  select
    m.id, m.token, m.status, m.amount, m.currency, m.origin_city_id,
    m.destination_city_id, m.party_id, m.transaction_type, m.owner_id,
    m.linked_transaction_id, m.delete_requested_by, m.delete_reason,
    m.created_at,
    c.id as counterpart_id,
    c.status as counterpart_status,
    coalesce((
      select sum(s.amount) from public.transactions s
      where s.settles_transaction_id = m.id
        and s.transaction_type in ('transfer_sent','transfer_received')
        and s.status in ('confirmed','settled')
    ), 0) as settled_amount
  from mine m
  left join public.transactions c on c.id = m.linked_transaction_id
)
select
  p.id as transaction_id, p.token, p.status as transaction_status,
  p.counterpart_status, p.amount, p.currency, p.origin_city_id,
  p.destination_city_id, p.party_id, p.linked_transaction_id,
  p.delete_reason, p.settled_amount, p.created_at, cat.category,
  case cat.category
    when 'delete_awaiting_you' then 'you'
    when 'awaiting_you' then 'you'
    when 'stale_pending' then 'you'
    when 'unsettled_transfer' then 'you'
    when 'delete_awaiting_them' then 'them'
    when 'awaiting_them' then 'them'
    when 'disputed' then 'either'
    when 'broken_pair' then 'either'
    else null
  end as needs_action_by
from paired p
cross join lateral (
  select case
    when p.delete_requested_by is not null and p.delete_requested_by <> p.owner_id
      then 'delete_awaiting_you'
    when p.delete_requested_by is not null and p.delete_requested_by = p.owner_id
      then 'delete_awaiting_them'
    when p.status = 'disputed' or p.counterpart_status = 'disputed'
      then 'disputed'
    when p.counterpart_id is not null
         and p.status in ('confirmed','settled')
         and p.counterpart_status in ('reversed','cancelled')
      then 'broken_pair'
    when p.counterpart_id is not null
         and p.status in ('reversed','cancelled')
         and p.counterpart_status in ('confirmed','settled')
      then 'broken_pair'
    when p.linked_transaction_id is not null and p.status = 'pending'
      then 'awaiting_you'
    when p.counterpart_id is not null
         and p.status in ('confirmed','settled')
         and p.counterpart_status = 'pending'
      then 'awaiting_them'
    when p.linked_transaction_id is null
         and p.status = 'pending'
         and p.created_at < now() - interval '7 days'
      then 'stale_pending'
    when p.destination_city_id is not null
         and p.status in ('confirmed','settled')
         and p.transaction_type in ('transfer_sent','transfer_received')
         and p.settled_amount < p.amount
      then 'unsettled_transfer'
    when p.counterpart_id is not null
         and p.status in ('confirmed','settled')
         and p.counterpart_status in ('confirmed','settled')
      then 'matched'
    else 'ok'
  end as category
) cat
where cat.category <> 'ok';

alter view public.reconciliation_flags set (security_invoker = true);
grant select on public.reconciliation_flags to authenticated;
