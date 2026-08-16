-- ============================================================================
-- 03_balance_views.sql
-- The Balance Engine: every figure the UI shows is derived here from
-- transaction_entries / transactions, never from a manually-edited column.
--
-- Only entries belonging to 'confirmed' or 'settled' transactions count
-- toward a balance — draft/pending/cancelled/disputed transactions do not
-- move money until confirmed. Reversed transactions keep their own entries
-- (for history) but are offset by the equal-and-opposite reversal txn that
-- reverse_transaction() posts, so the net effect is correctly zero.
-- ============================================================================

create or replace view public.confirmed_entries as
select e.*, t.created_at as transaction_created_at
from public.transaction_entries e
join public.transactions t on t.id = e.transaction_id
where t.status in ('confirmed', 'settled');

-- Party balances (overall, across all cities)
create or replace view public.party_balances as
select
  p.id as party_id,
  p.name,
  p.party_type,
  p.primary_city_id,
  p.opening_balance
    + coalesce(sum(ce.amount) filter (where ce.direction = 'debit'), 0)
    - coalesce(sum(ce.amount) filter (where ce.direction = 'credit'), 0) as balance,
  coalesce(sum(ce.amount) filter (where ce.direction = 'credit'), 0) as total_received,
  coalesce(sum(ce.amount) filter (where ce.direction = 'debit'), 0) as total_paid,
  max(ce.transaction_created_at) as last_transaction_at
from public.parties p
left join public.confirmed_entries ce
  on ce.entry_type = 'party' and ce.party_id = p.id
group by p.id, p.name, p.party_type, p.primary_city_id, p.opening_balance;

comment on view public.party_balances is 'balance > 0 => party owes the owner (Receivable). balance < 0 => owner owes the party (Payable).';

-- Party balance scoped to a single city (city + party level from spec section 8)
create or replace view public.city_party_balances as
select
  ce.city_id,
  ce.party_id,
  coalesce(sum(ce.amount) filter (where ce.direction = 'debit'), 0)
    - coalesce(sum(ce.amount) filter (where ce.direction = 'credit'), 0) as balance,
  coalesce(sum(ce.amount) filter (where ce.direction = 'credit'), 0) as total_received,
  coalesce(sum(ce.amount) filter (where ce.direction = 'debit'), 0) as total_paid
from public.confirmed_entries ce
where ce.entry_type = 'party'
group by ce.city_id, ce.party_id;

-- City cash balances
create or replace view public.city_balances as
select
  c.id as city_id,
  c.name,
  c.code,
  c.opening_balance
    + coalesce(sum(ce.amount) filter (where ce.direction = 'debit'), 0)
    - coalesce(sum(ce.amount) filter (where ce.direction = 'credit'), 0) as balance,
  coalesce(sum(ce.amount) filter (where ce.direction = 'debit'), 0) as total_incoming,
  coalesce(sum(ce.amount) filter (where ce.direction = 'credit'), 0) as total_outgoing
from public.cities c
left join public.confirmed_entries ce
  on ce.entry_type = 'city_cash' and ce.city_id = c.id
group by c.id, c.name, c.code;

-- City receivable/payable = sum of party balances for parties whose ledger
-- activity happened in that city (via city_party_balances, not primary_city,
-- so it reflects where the exposure actually sits).
create or replace view public.city_receivable_payable as
select
  city_id,
  coalesce(sum(balance) filter (where balance > 0), 0) as receivable,
  coalesce(sum(-balance) filter (where balance < 0), 0) as payable
from public.city_party_balances
group by city_id;

-- City-to-city obligations, derived automatically from cross-city
-- transactions that have not yet been settled by a linked payout.
create or replace view public.city_to_city_obligations as
select
  origin_city_id,
  destination_city_id,
  sum(amount) as amount,
  count(*) as transaction_count
from public.transactions
where destination_city_id is not null
  and status = 'confirmed'
group by origin_city_id, destination_city_id;

-- Net pairwise obligation (A owes B net, collapsing both directions)
create or replace view public.city_to_city_net as
with pairs as (
  select origin_city_id as city_a, destination_city_id as city_b, amount from public.city_to_city_obligations
  union all
  select destination_city_id as city_a, origin_city_id as city_b, -amount from public.city_to_city_obligations
)
select city_a, city_b, sum(amount) as net_amount
from pairs
group by city_a, city_b
having sum(amount) <> 0;

-- Party exposure ranking (top parties by absolute outstanding balance)
create or replace view public.party_exposure as
select party_id, name, party_type, primary_city_id, balance,
  case when balance > 0 then 'receivable' when balance < 0 then 'payable' else 'settled' end as status,
  abs(balance) as exposure
from public.party_balances
order by abs(balance) desc;

-- City exposure ranking
create or replace view public.city_exposure as
select cb.city_id, cb.name, cb.code, cb.balance,
  coalesce(rp.receivable,0) as receivable,
  coalesce(rp.payable,0) as payable
from public.city_balances cb
left join public.city_receivable_payable rp on rp.city_id = cb.city_id
order by (coalesce(rp.receivable,0) + coalesce(rp.payable,0)) desc;

-- Overall dashboard KPIs
create or replace view public.dashboard_kpis as
select
  (select coalesce(sum(balance),0) from public.city_balances) as total_position,
  (select coalesce(sum(balance) filter (where balance > 0), 0) from public.party_balances) as total_receivable,
  (select coalesce(sum(-balance) filter (where balance < 0), 0) from public.party_balances) as total_payable,
  (select coalesce(sum(balance),0) from public.party_balances) as net_position,
  (select coalesce(sum(amount),0) from public.transactions
     where status in ('confirmed','settled') and created_at::date = current_date) as todays_volume,
  (select count(*) from public.transactions where status = 'pending') as pending_count,
  (select count(*) from public.cities where active) as active_cities,
  (select count(*) from public.parties where active) as active_parties;

-- Transaction volume time series (for graph dashboard)
create or replace view public.transaction_volume_daily as
select created_at::date as day, sum(amount) as volume, count(*) as txn_count
from public.transactions
where status in ('confirmed','settled')
group by created_at::date
order by day;

-- Reconciliation: flags to review
create or replace view public.reconciliation_flags as
select
  t.id as transaction_id,
  t.token,
  case
    when t.status = 'disputed' then 'discrepancy'
    when t.status = 'pending' and t.created_at < now() - interval '7 days' then 'pending'
    when t.destination_city_id is not null and t.status = 'confirmed'
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
   or (t.destination_city_id is not null and t.status = 'confirmed');

-- ---------------------------------------------------------------------------
-- Views run with the querying user's own RLS, not the view owner's — so a
-- restricted role never sees more through a view than through the base
-- tables directly.
-- ---------------------------------------------------------------------------
alter view public.confirmed_entries set (security_invoker = true);
alter view public.party_balances set (security_invoker = true);
alter view public.city_party_balances set (security_invoker = true);
alter view public.city_balances set (security_invoker = true);
alter view public.city_receivable_payable set (security_invoker = true);
alter view public.city_to_city_obligations set (security_invoker = true);
alter view public.city_to_city_net set (security_invoker = true);
alter view public.party_exposure set (security_invoker = true);
alter view public.city_exposure set (security_invoker = true);
alter view public.dashboard_kpis set (security_invoker = true);
alter view public.transaction_volume_daily set (security_invoker = true);
alter view public.reconciliation_flags set (security_invoker = true);

grant select on public.confirmed_entries, public.party_balances, public.city_party_balances,
  public.city_balances, public.city_receivable_payable, public.city_to_city_obligations,
  public.city_to_city_net, public.party_exposure, public.city_exposure, public.dashboard_kpis,
  public.transaction_volume_daily, public.reconciliation_flags
  to authenticated;
