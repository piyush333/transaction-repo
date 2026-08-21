-- ============================================================================
-- Party opening balances were invisible to every city-level figure.
--
-- Two views computed party balances from different inputs:
--
--   party_balances       opening_balance + confirmed entries   (Parties page,
--                                                               dashboard KPI)
--   city_party_balances  confirmed entries ONLY                (city pages,
--                                                               map tooltip,
--                                                               via
--                                                               city_receivable_payable)
--
-- So a party set up with an opening balance and no transactions yet showed
-- the right figure on the Parties page and nothing at all at city level:
-- a Delhi party owed 50,000 while Delhi's Receivable read 0, and the party
-- did not appear in Delhi's Top Parties at all.
--
-- That is not cosmetic. "Receivable in Delhi" is what tells the other city
-- there is money collectible there -- the basis for settling a Mumbai
-- obligation out of a Delhi receivable instead of physically moving cash.
-- Reading 0 says the opposite and sends cash on a trip it did not need.
--
-- Fix: attribute a party's opening balance to its primary city, in its
-- native currency, exactly as party_balances already does. This restores
-- the invariant that a party's balances summed across cities equal that
-- party's total balance.
--
-- Opening balances are a starting position, not a flow, so they are
-- deliberately excluded from total_received / total_paid -- again matching
-- party_balances. Only parties with a non-zero opening balance get a row,
-- so untouched parties do not start appearing as zero-balance noise in the
-- city "Top Parties" list.
--
-- Shape is unchanged but the dependency chain must be rebuilt, so this
-- DROPs CASCADE. Note the security_invoker re-apply on all three views:
-- recreating a view silently drops reloptions, and losing it here would
-- expose the other person's book. Grants are reproduced exactly as they
-- were (anon included) to keep this migration about the bug and nothing
-- else -- anon sees no rows regardless, since security_invoker means RLS
-- on parties/cities/transaction_entries still applies.
-- ============================================================================

drop view if exists public.city_party_balances cascade;

create view public.city_party_balances as
with entry_sums as (
  select ce.city_id, ce.party_id, ce.currency,
    coalesce(sum(ce.amount) filter (where ce.direction = 'debit'), 0) as debits,
    coalesce(sum(ce.amount) filter (where ce.direction = 'credit'), 0) as credits
  from public.confirmed_entries ce
  where ce.entry_type = 'party'
  group by ce.city_id, ce.party_id, ce.currency
),
openings as (
  select
    p.primary_city_id as city_id,
    p.id as party_id,
    coalesce(c.currency, 'INR') as currency,
    p.opening_balance as opening
  from public.parties p
  left join public.cities c on c.id = p.primary_city_id
  where p.opening_balance <> 0
),
pairs as (
  select city_id, party_id, currency from entry_sums
  union
  select city_id, party_id, currency from openings
)
select
  k.city_id,
  k.party_id,
  k.currency,
  coalesce(o.opening, 0) + coalesce(e.debits, 0) - coalesce(e.credits, 0) as balance,
  coalesce(e.credits, 0) as total_received,
  coalesce(e.debits, 0) as total_paid
from pairs k
left join entry_sums e
  on e.city_id = k.city_id and e.party_id = k.party_id and e.currency = k.currency
left join openings o
  on o.city_id = k.city_id and o.party_id = k.party_id and o.currency = k.currency;

comment on view public.city_party_balances is
  'One row per (city, party, currency). Includes the party opening balance at its primary city, so summing a party across cities equals party_balances. balance > 0 => party owes the owner.';

create view public.city_receivable_payable as
select city_id, currency,
  coalesce(sum(balance) filter (where balance > 0), 0) as receivable,
  coalesce(sum(-balance) filter (where balance < 0), 0) as payable
from public.city_party_balances
group by city_id, currency;

create view public.city_exposure as
select cb.city_id, cb.name, cb.code, cb.currency, cb.balance,
  coalesce(rp.receivable, 0) as receivable,
  coalesce(rp.payable, 0) as payable
from public.city_balances cb
left join public.city_receivable_payable rp
  on rp.city_id = cb.city_id and rp.currency = cb.currency
order by (coalesce(rp.receivable, 0) + coalesce(rp.payable, 0)) desc;

alter view public.city_party_balances    set (security_invoker = true);
alter view public.city_receivable_payable set (security_invoker = true);
alter view public.city_exposure           set (security_invoker = true);

grant select on public.city_party_balances    to anon, authenticated;
grant select on public.city_receivable_payable to anon, authenticated;
grant select on public.city_exposure           to anon, authenticated;
