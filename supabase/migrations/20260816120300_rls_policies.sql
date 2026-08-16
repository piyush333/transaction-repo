-- ============================================================================
-- 04_rls_policies.sql
-- Role-based access control, enforced at the database layer so it cannot be
-- bypassed by a buggy client. Roles: owner, city_manager, operator, viewer,
-- auditor (spec section 17).
-- ============================================================================

alter table public.profiles enable row level security;
alter table public.cities enable row level security;
alter table public.parties enable row level security;
alter table public.party_secondary_cities enable row level security;
alter table public.party_documents enable row level security;
alter table public.transactions enable row level security;
alter table public.transaction_entries enable row level security;
alter table public.audit_logs enable row level security;
alter table public.notifications enable row level security;
alter table public.alert_settings enable row level security;
alter table public.token_sequences enable row level security;

-- No table should be reachable by unauthenticated (anon) clients.
revoke all on public.profiles, public.cities, public.parties, public.party_secondary_cities,
  public.party_documents, public.transactions, public.transaction_entries, public.audit_logs,
  public.notifications, public.alert_settings, public.token_sequences from anon;

grant select, insert, update on public.profiles to authenticated;
grant select, insert, update on public.cities to authenticated;
grant select, insert, update on public.parties to authenticated;
grant select, insert, delete on public.party_secondary_cities to authenticated;
grant select, insert on public.party_documents to authenticated;
grant select, insert, update on public.transactions to authenticated;
grant select, insert on public.transaction_entries to authenticated;
grant select, insert on public.audit_logs to authenticated;
grant select, insert, update on public.notifications to authenticated;
grant select, update on public.alert_settings to authenticated;

-- ---------------------------------------------------------------------------
-- profiles
-- ---------------------------------------------------------------------------
create policy profiles_select on public.profiles for select to authenticated
  using (id = auth.uid() or public.app_current_role() in ('owner','auditor'));

create policy profiles_update_self on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.app_current_role());

create policy profiles_update_owner on public.profiles for update to authenticated
  using (public.app_current_role() = 'owner')
  with check (true);

-- ---------------------------------------------------------------------------
-- cities — everyone active can read (needed for dashboards/dropdowns);
-- only owner manages the master list.
-- ---------------------------------------------------------------------------
create policy cities_select on public.cities for select to authenticated
  using (public.app_current_active());

create policy cities_write_owner on public.cities for insert to authenticated
  with check (public.app_current_role() = 'owner');

create policy cities_update_owner on public.cities for update to authenticated
  using (public.app_current_role() = 'owner');

-- ---------------------------------------------------------------------------
-- parties
-- ---------------------------------------------------------------------------
create policy parties_select on public.parties for select to authenticated
  using (public.app_current_active());

create policy parties_insert on public.parties for insert to authenticated
  with check (
    public.app_current_active() and (
      public.app_current_role() = 'owner'
      or (public.app_current_role() in ('city_manager','operator') and primary_city_id = public.app_current_city())
    )
  );

create policy parties_update on public.parties for update to authenticated
  using (
    public.app_current_role() = 'owner'
    or (public.app_current_role() = 'city_manager' and primary_city_id = public.app_current_city())
  );

create policy party_secondary_cities_select on public.party_secondary_cities for select to authenticated
  using (public.app_current_active());
create policy party_secondary_cities_insert on public.party_secondary_cities for insert to authenticated
  with check (public.app_current_role() in ('owner','city_manager','operator'));
create policy party_secondary_cities_delete on public.party_secondary_cities for delete to authenticated
  using (public.app_current_role() in ('owner','city_manager'));

create policy party_documents_select on public.party_documents for select to authenticated
  using (public.app_current_active());
create policy party_documents_insert on public.party_documents for insert to authenticated
  with check (public.app_current_role() in ('owner','city_manager','operator'));

-- ---------------------------------------------------------------------------
-- transactions — read broad (needed for city-to-city visibility & search),
-- write scoped to the actor's assigned city (owner unrestricted). Operators
-- may only ever create; confirming/cancelling/reversing requires manager+.
-- ---------------------------------------------------------------------------
create policy transactions_select on public.transactions for select to authenticated
  using (public.app_current_active());

create policy transactions_insert on public.transactions for insert to authenticated
  with check (
    public.app_current_active() and (
      public.app_current_role() = 'owner'
      or (public.app_current_role() in ('city_manager','operator') and origin_city_id = public.app_current_city())
    )
  );

create policy transactions_update on public.transactions for update to authenticated
  using (
    public.app_current_role() = 'owner'
    or (public.app_current_role() = 'city_manager' and origin_city_id = public.app_current_city())
  );

-- ---------------------------------------------------------------------------
-- transaction_entries — posted only alongside a transaction the caller is
-- allowed to create; read broad like transactions.
-- ---------------------------------------------------------------------------
create policy entries_select on public.transaction_entries for select to authenticated
  using (public.app_current_active());

create policy entries_insert on public.transaction_entries for insert to authenticated
  with check (public.app_current_role() in ('owner','city_manager','operator'));

-- ---------------------------------------------------------------------------
-- audit_logs — append-only; only owner & auditor may read.
-- ---------------------------------------------------------------------------
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (public.app_current_role() in ('owner','auditor'));

create policy audit_logs_insert on public.audit_logs for insert to authenticated
  with check (public.app_current_active());

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create policy notifications_select on public.notifications for select to authenticated
  using (recipient_id = auth.uid() or public.app_current_role() = 'owner');

create policy notifications_insert on public.notifications for insert to authenticated
  with check (public.app_current_role() = 'owner');

create policy notifications_update on public.notifications for update to authenticated
  using (recipient_id = auth.uid());

-- ---------------------------------------------------------------------------
-- alert_settings — owner configurable, auditor can view.
-- ---------------------------------------------------------------------------
create policy alert_settings_select on public.alert_settings for select to authenticated
  using (public.app_current_role() in ('owner','auditor'));

create policy alert_settings_update on public.alert_settings for update to authenticated
  using (public.app_current_role() = 'owner');

-- token_sequences: no client policies — only reachable via the
-- security-definer next_token() function.
