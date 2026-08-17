-- The dashboard previously issued 7 separate PostgREST calls (KPIs, cities,
-- balances, receivable/payable, obligations, recent transactions, top
-- parties). Each is its own HTTP round-trip to Supabase; on a cold or
-- distant connection that dominates page load. This returns the whole
-- dashboard payload in one call. SECURITY INVOKER so every underlying RLS
-- policy still applies — a caller only ever sees their own book.

create or replace function public.dashboard_snapshot()
returns jsonb
language sql
stable
security invoker
set search_path = public
as $$
  select jsonb_build_object(
    'kpis', (select to_jsonb(k) from public.dashboard_kpis k),
    'cities', coalesce((select jsonb_agg(to_jsonb(c)) from public.cities c), '[]'::jsonb),
    'city_balances', coalesce((select jsonb_agg(to_jsonb(b)) from public.city_balances b), '[]'::jsonb),
    'city_receivable_payable', coalesce((select jsonb_agg(to_jsonb(r)) from public.city_receivable_payable r), '[]'::jsonb),
    'obligations', coalesce((select jsonb_agg(to_jsonb(o)) from public.city_to_city_obligations o), '[]'::jsonb),
    'recent_transactions', coalesce((
      select jsonb_agg(to_jsonb(t)) from (
        select * from public.transactions order by created_at desc limit 8
      ) t
    ), '[]'::jsonb),
    'top_parties', coalesce((
      select jsonb_agg(to_jsonb(p)) from (
        select * from public.party_exposure limit 8
      ) p
    ), '[]'::jsonb)
  );
$$;

revoke execute on function public.dashboard_snapshot() from anon, public;
grant execute on function public.dashboard_snapshot() to authenticated;
