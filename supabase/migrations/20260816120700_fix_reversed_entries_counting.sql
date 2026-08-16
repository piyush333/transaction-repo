-- Bug found via functional test: confirmed_entries excluded 'reversed'
-- status, which meant reversing a transaction removed its original entries
-- from every balance AND added the reversal's opposite entries, doubling
-- the correction instead of netting to zero. A reversed transaction's
-- entries are real history and must keep counting — the reversal
-- transaction's equal-and-opposite entries are what cancel them out.
-- 'disputed' also keeps counting (the money movement is real; it's just
-- under review) — only 'draft', 'pending' and 'cancelled' are excluded.

create or replace view public.confirmed_entries as
select e.*, t.created_at as transaction_created_at
from public.transaction_entries e
join public.transactions t on t.id = e.transaction_id
where t.status in ('confirmed', 'settled', 'reversed', 'disputed');
