-- ============================================================================
-- Multi-currency correctness.
--
-- Previously every balance view summed `amount` with no regard to currency,
-- so a book holding both INR and AED produced totals that added rupees to
-- dirhams — a meaningless number. The app performs NO conversion (by
-- design: no FX rates, nothing invented), so instead every balance is
-- reported PER CURRENCY. A city or party can legitimately hold more than
-- one currency and simply gets one row per currency.
--
-- An entity's own `opening_balance` is taken to be in its native currency
-- (the city's currency; for a party, its primary city's currency), and only
-- contributes to that currency's row.
--
-- Views are dropped and recreated rather than CREATE OR REPLACE'd, because
-- adding the `currency` column changes their shape.
-- ============================================================================

drop view if exists public.dashboard_kpis cascade;
drop view if exists public.city_exposure cascade;
drop view if exists public.party_exposure cascade;
drop view if exists public.city_receivable_payable cascade;
drop view if exists public.city_party_balances cascade;
drop view if exists public.city_balances cascade;
drop view if exists public.party_balances cascade;
drop view if exists public.transaction_volume_daily cascade;

create view public.city_balances as
with entry_sums as (
  select ce.city_id, ce.currency,
    coalesce(sum(ce.amount) filter (where ce.direction = 'debit'), 0) as debits,
    coalesce(sum(ce.amount) filter (where ce.direction = 'credit'), 0) as credits
  from public.confirmed_entries ce
  where ce.entry_type = 'city_cash'
  group by ce.city_id, ce.currency
),
base as (
  select c.id as city_id, c.name, c.code, c.currency as native_currency, c.opening_balance
  from public.cities c
),
pairs as (
  select city_id, native_currency as currency from base
  union
  select city_id, currency from entry_sums
)
select
  p.city_id, b.name, b.code, p.currency,
  (case when p.currency = b.native_currency then b.opening_balance else 0 end)
    + coalesce(e.debits, 0) - coalesce(e.credits, 0) as balance,
  coalesce(e.debits, 0) as total_incoming,
  coalesce(e.credits, 0) as total_outgoing
from pairs p
join base b on b.city_id = p.city_id
left join entry_sums e on e.city_id = p.city_id and e.currency = p.currency;

create view public.party_balances as
with entry_sums as (
  select ce.party_id, ce.currency,
    coalesce(sum(ce.amount) filter (where ce.direction = 'debit'), 0) as debits,
    coalesce(sum(ce.amount) filter (where ce.direction = 'credit'), 0) as credits,
    max(ce.transaction_created_at) as last_txn
  from public.confirmed_entries ce
  where ce.entry_type = 'party'
  group by ce.party_id, ce.currency
),
base as (
  select p.id as party_id, p.name, p.party_type, p.primary_city_id, p.opening_balance,
         coalesce(c.currency, 'INR') as native_currency
  from public.parties p
  left join public.cities c on c.id = p.primary_city_id
),
pairs as (
  select party_id, native_currency as currency from base
  union
  select party_id, currency from entry_sums
)
select
  pr.party_id, b.name, b.party_type, b.primary_city_id, pr.currency,
  (case when pr.currency = b.native_currency then b.opening_balance else 0 end)
    + coalesce(e.debits, 0) - coalesce(e.credits, 0) as balance,
  coalesce(e.credits, 0) as total_received,
  coalesce(e.debits, 0) as total_paid,
  e.last_txn as last_transaction_at
from pairs pr
join base b on b.party_id = pr.party_id
left join entry_sums e on e.party_id = pr.party_id and e.currency = pr.currency;

comment on view public.party_balances is 'One row per (party, currency). balance > 0 => party owes the owner (Receivable). balance < 0 => owner owes the party (Payable). Currencies are never mixed.';

create view public.city_party_balances as
select ce.city_id, ce.party_id, ce.currency,
  coalesce(sum(ce.amount) filter (where ce.direction = 'debit'), 0)
    - coalesce(sum(ce.amount) filter (where ce.direction = 'credit'), 0) as balance,
  coalesce(sum(ce.amount) filter (where ce.direction = 'credit'), 0) as total_received,
  coalesce(sum(ce.amount) filter (where ce.direction = 'debit'), 0) as total_paid
from public.confirmed_entries ce
where ce.entry_type = 'party'
group by ce.city_id, ce.party_id, ce.currency;

create view public.city_receivable_payable as
select city_id, currency,
  coalesce(sum(balance) filter (where balance > 0), 0) as receivable,
  coalesce(sum(-balance) filter (where balance < 0), 0) as payable
from public.city_party_balances
group by city_id, currency;

create view public.party_exposure as
select party_id, name, party_type, primary_city_id, currency, balance,
  case when balance > 0 then 'receivable' when balance < 0 then 'payable' else 'settled' end as status,
  abs(balance) as exposure
from public.party_balances
order by abs(balance) desc;

create view public.city_exposure as
select cb.city_id, cb.name, cb.code, cb.currency, cb.balance,
  coalesce(rp.receivable, 0) as receivable,
  coalesce(rp.payable, 0) as payable
from public.city_balances cb
left join public.city_receivable_payable rp
  on rp.city_id = cb.city_id and rp.currency = cb.currency
order by (coalesce(rp.receivable, 0) + coalesce(rp.payable, 0)) desc;

create view public.dashboard_kpis as
with currencies as (
  select currency from public.city_balances
  union select currency from public.party_balances
  union select currency from public.transactions where status in ('confirmed','settled')
)
select
  cur.currency,
  (select coalesce(sum(balance), 0) from public.city_balances b where b.currency = cur.currency) as total_position,
  (select coalesce(sum(balance) filter (where balance > 0), 0) from public.party_balances p where p.currency = cur.currency) as total_receivable,
  (select coalesce(sum(-balance) filter (where balance < 0), 0) from public.party_balances p where p.currency = cur.currency) as total_payable,
  (select coalesce(sum(balance), 0) from public.party_balances p where p.currency = cur.currency) as net_position,
  (select coalesce(sum(amount), 0) from public.transactions t
     where t.status in ('confirmed','settled') and t.currency = cur.currency
       and t.created_at::date = current_date) as todays_volume
from currencies cur;

create or replace view public.dashboard_counts as
select
  (select count(*) from public.transactions where status = 'pending') as pending_count,
  (select count(*) from public.cities where active) as active_cities,
  (select count(*) from public.parties where active) as active_parties;

create view public.transaction_volume_daily as
select created_at::date as day, currency, sum(amount) as volume, count(*) as txn_count
from public.transactions
where status in ('confirmed','settled')
group by created_at::date, currency
order by day;

-- security_invoker must be (re)applied on every recreate, or these silently
-- bypass RLS and leak across books.
alter view public.city_balances set (security_invoker = true);
alter view public.party_balances set (security_invoker = true);
alter view public.city_party_balances set (security_invoker = true);
alter view public.city_receivable_payable set (security_invoker = true);
alter view public.party_exposure set (security_invoker = true);
alter view public.city_exposure set (security_invoker = true);
alter view public.dashboard_kpis set (security_invoker = true);
alter view public.dashboard_counts set (security_invoker = true);
alter view public.transaction_volume_daily set (security_invoker = true);

grant select on public.city_balances, public.party_balances, public.city_party_balances,
  public.city_receivable_payable, public.party_exposure, public.city_exposure,
  public.dashboard_kpis, public.dashboard_counts, public.transaction_volume_daily
  to authenticated;
