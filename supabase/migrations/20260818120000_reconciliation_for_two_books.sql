-- Reconciliation, rebuilt for the two-book / linked-transaction model.
--
-- The old view classified rows as matched/pending/discrepancy, which said
-- nothing about *who has to do something*. With two private books and
-- mirrored transactions, the only useful question is "is this waiting on me,
-- on them, or is it actually broken?" — so the view answers that directly.
--
-- Categories, in priority order (first match wins):
--   delete_awaiting_you   they asked to delete a shared txn; you must approve
--   delete_awaiting_them  you asked to delete; waiting on them
--   disputed              either side flagged it
--   broken_pair           one side is confirmed/settled, the other was
--                         reversed or cancelled — the books no longer agree.
--                         Nothing caught this before: reverse your half of a
--                         shared transaction and your book nets to zero while
--                         theirs still shows the money.
--   awaiting_you          a mirrored entry landed in your book, unconfirmed
--   awaiting_them         you confirmed yours, theirs is still pending
--   stale_pending         an unshared pending txn older than 7 days
--   unsettled_transfer    a confirmed cross-city transfer with no settlement
--   matched               both sides confirmed/settled — a *real* match, so
--                         the page can show a true count instead of
--                         subtracting one bucket from another
--   ok                    nothing to say; filtered out
--
-- `matched` rows are returned deliberately. Everything else is actionable.
--
-- Shape changes (category, needs_action_by, counterpart_status), so this
-- has to DROP rather than CREATE OR REPLACE. Note the security_invoker
-- re-apply at the bottom: recreating a view silently drops reloptions, and
-- losing it here would leak the other person's book.

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
    c.status as counterpart_status
  from mine m
  left join public.transactions c on c.id = m.linked_transaction_id
)
select
  p.id as transaction_id, p.token, p.status as transaction_status,
  p.counterpart_status, p.amount, p.currency, p.origin_city_id,
  p.destination_city_id, p.party_id, p.linked_transaction_id,
  p.delete_reason, p.created_at, cat.category,
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
         and p.status = 'confirmed'
         and p.transaction_type in ('transfer_sent','transfer_received')
         and not exists (
           select 1 from public.transactions s where s.settles_transaction_id = p.id
         )
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
