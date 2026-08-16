-- city_transfer is an atomic, already-settled movement of cash between two
-- city pools (both legs post immediately) — it is NOT a pending inter-city
-- obligation. Only transfer_sent/transfer_received (a single-party payment
-- tagged with a destination city for later payout) represent a genuine
-- "city A owes city B" obligation until a linked settlement occurs.
-- party_transfer never touches a destination city (it reallocates balance
-- between two parties within the same city), so tighten the constraint that
-- previously allowed it to carry one.

alter table public.transactions drop constraint transactions_dest_requires_type;
alter table public.transactions add constraint transactions_dest_requires_type check (
  destination_city_id is null or transaction_type in ('city_transfer','transfer_sent','transfer_received')
);

create or replace view public.city_to_city_obligations as
select
  origin_city_id,
  destination_city_id,
  sum(amount) as amount,
  count(*) as transaction_count
from public.transactions
where destination_city_id is not null
  and status = 'confirmed'
  and transaction_type in ('transfer_sent','transfer_received')
group by origin_city_id, destination_city_id;

create or replace view public.reconciliation_flags as
select
  t.id as transaction_id,
  t.token,
  case
    when t.status = 'disputed' then 'discrepancy'
    when t.status = 'pending' and t.created_at < now() - interval '7 days' then 'pending'
    when t.destination_city_id is not null and t.status = 'confirmed'
      and t.transaction_type in ('transfer_sent','transfer_received')
      and not exists (
        select 1 from public.transactions s
        where s.settles_transaction_id = t.id
      ) then 'pending'
    else 'matched'
  end as reconciliation_status,
  t.status as transaction_status,
  t.amount,
  t.origin_city_id,
  t.destination_city_id,
  t.created_at
from public.transactions t
where t.status in ('pending','disputed')
   or (t.destination_city_id is not null and t.status = 'confirmed' and t.transaction_type in ('transfer_sent','transfer_received'));
