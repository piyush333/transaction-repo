-- ============================================================================
-- 09_hardening_pass.sql
-- Fixes a real regression: CREATE OR REPLACE VIEW does not preserve the
-- security_invoker option, so the two later migrations that redefined
-- confirmed_entries / city_to_city_obligations / reconciliation_flags
-- silently made them SECURITY DEFINER again (flagged ERROR by the advisor).
-- Also: covering indexes for every FK the advisor flagged as unindexed,
-- wraps auth.uid()/auth.<fn>() in RLS policies with (select ...) so Postgres
-- caches the result once per statement instead of re-evaluating per row,
-- and consolidates the two permissive UPDATE policies on profiles into one.
-- ============================================================================

alter view public.confirmed_entries set (security_invoker = true);
alter view public.city_to_city_obligations set (security_invoker = true);
alter view public.reconciliation_flags set (security_invoker = true);

-- ---------------------------------------------------------------------------
-- covering indexes for FKs flagged by the performance advisor
-- ---------------------------------------------------------------------------
create index if not exists idx_alert_settings_updated_by on public.alert_settings(updated_by);
create index if not exists idx_audit_logs_performed_by on public.audit_logs(performed_by);
create index if not exists idx_cities_manager_id on public.cities(manager_id);
create index if not exists idx_parties_created_by on public.parties(created_by);
create index if not exists idx_party_documents_party_id on public.party_documents(party_id);
create index if not exists idx_party_documents_uploaded_by on public.party_documents(uploaded_by);
create index if not exists idx_party_secondary_cities_city_id on public.party_secondary_cities(city_id);
create index if not exists idx_profiles_assigned_city_id on public.profiles(assigned_city_id);
create index if not exists idx_transactions_approved_by on public.transactions(approved_by);
create index if not exists idx_transactions_created_by on public.transactions(created_by);
create index if not exists idx_transactions_reversed_transaction_id on public.transactions(reversed_transaction_id);
create index if not exists idx_transactions_settles_transaction_id on public.transactions(settles_transaction_id);

-- ---------------------------------------------------------------------------
-- RLS policy perf: wrap auth.uid() so it's evaluated once per statement,
-- not once per row (Postgres RLS "initplan" optimization).
-- ---------------------------------------------------------------------------
drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (id = (select auth.uid()) or public.app_current_role() in ('owner','auditor'));

drop policy profiles_update_self on public.profiles;
drop policy profiles_update_owner on public.profiles;
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid()) or public.app_current_role() = 'owner')
  with check (
    public.app_current_role() = 'owner'
    or (id = (select auth.uid()) and role = public.app_current_role())
  );

drop policy notifications_select on public.notifications;
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = (select auth.uid()) or public.app_current_role() = 'owner');

drop policy notifications_update on public.notifications;
create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = (select auth.uid()));
