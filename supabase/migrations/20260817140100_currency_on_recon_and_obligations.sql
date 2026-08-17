-- reconciliation_flags and city_to_city_obligations still exposed a bare
-- `amount` with no currency, so the UI had no way to render them correctly
-- once more than one currency exists. Obligations are additionally grouped
-- by currency: an INR debt and an AED debt between the same two cities are
-- separate obligations and must not be added together.

drop view if exists public.city_to_city_net cascade;
drop view if exists public.city_to_city_obligations cascade;
drop view if exists public.reconciliation_flags cascade;

create view public.city_to_city_obligations as
select origin_city_id, destination_city_id, currency,
  sum(amount) as amount, count(*) as transaction_count
from public.transactions
where destination_city_id is not null
  and status = 'confirmed'
  and transaction_type in ('transfer_sent','transfer_received')
group by origin_city_id, destination_city_id, currency;

create view public.city_to_city_net as
with pairs as (
  select origin_city_id as city_a, destination_city_id as city_b, currency, amount
    from public.city_to_city_obligations
  union all
  select destination_city_id as city_a, origin_city_id as city_b, currency, -amount
    from public.city_to_city_obligations
)
select city_a, city_b, currency, sum(amount) as net_amount
from pairs
group by city_a, city_b, currency
having sum(amount) <> 0;

create view public.reconciliation_flags as
select
  t.id as transaction_id,
  t.token,
  case
    when t.status = 'disputed' then 'discrepancy'
    when t.status = 'pending' and t.created_at < now() - interval '7 days' then 'pending'
    when t.destination_city_id is not null and t.status = 'confirmed'
      and t.transaction_type in ('transfer_sent','transfer_received')
      and not exists (
        select 1 from public.transactions s where s.settles_transaction_id = t.id
      ) then 'pending'
    else 'matched'
  end as reconciliation_status,
  t.status as transaction_status,
  t.amount,
  t.currency,
  t.origin_city_id,
  t.destination_city_id,
  t.linked_transaction_id,
  t.delete_requested_by,
  t.created_at
from public.transactions t
where t.status in ('pending','disputed')
   or (t.destination_city_id is not null and t.status = 'confirmed'
       and t.transaction_type in ('transfer_sent','transfer_received'));

alter view public.city_to_city_obligations set (security_invoker = true);
alter view public.city_to_city_net set (security_invoker = true);
alter view public.reconciliation_flags set (security_invoker = true);

grant select on public.city_to_city_obligations, public.city_to_city_net,
  public.reconciliation_flags to authenticated;
