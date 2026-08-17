-- ============================================================================
-- Personal books: owner scoping
-- Moves from "one shared organization ledger with delegated roles" to
-- independent private books. Every city/party/transaction belongs to exactly
-- one owner and is invisible to anyone else via RLS — a real database-level
-- wall, not a UI filter. Roles simplify: every signup is Owner of their own
-- book.
-- ============================================================================

alter table public.cities add column owner_id uuid references public.profiles(id) default auth.uid();
alter table public.parties add column owner_id uuid references public.profiles(id) default auth.uid();
alter table public.transactions add column owner_id uuid references public.profiles(id) default auth.uid();
alter table public.transaction_entries add column owner_id uuid references public.profiles(id);
alter table public.audit_logs add column owner_id uuid references public.profiles(id);

alter table public.cities alter column owner_id set not null;
alter table public.parties alter column owner_id set not null;
alter table public.transactions alter column owner_id set not null;

create index idx_cities_owner on public.cities(owner_id);
create index idx_parties_owner on public.parties(owner_id);
create index idx_transactions_owner on public.transactions(owner_id);
create index idx_entries_owner on public.transaction_entries(owner_id);
create index idx_audit_logs_owner on public.audit_logs(owner_id);

-- Scope token sequences per owner so two people using the same city code
-- (e.g. both pick 'NMC') don't collide or leak sequence info to each other.
alter table public.token_sequences drop constraint token_sequences_pkey;
alter table public.token_sequences add column owner_id uuid references public.profiles(id);
alter table public.token_sequences add primary key (owner_id, city_code, seq_date);

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, new.raw_user_meta_data->>'full_name', 'owner');
  return new;
end;
$$;

drop policy cities_select on public.cities;
drop policy cities_write_owner on public.cities;
drop policy cities_update_owner on public.cities;
create policy cities_select on public.cities for select to authenticated
  using (owner_id = (select auth.uid()));
create policy cities_insert on public.cities for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy cities_update on public.cities for update to authenticated
  using (owner_id = (select auth.uid()));

drop policy parties_select on public.parties;
drop policy parties_insert on public.parties;
drop policy parties_update on public.parties;
create policy parties_select on public.parties for select to authenticated
  using (owner_id = (select auth.uid()));
create policy parties_insert on public.parties for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy parties_update on public.parties for update to authenticated
  using (owner_id = (select auth.uid()));

drop policy party_secondary_cities_select on public.party_secondary_cities;
drop policy party_secondary_cities_insert on public.party_secondary_cities;
drop policy party_secondary_cities_delete on public.party_secondary_cities;
create policy party_secondary_cities_select on public.party_secondary_cities for select to authenticated
  using (exists (select 1 from public.parties p where p.id = party_id and p.owner_id = (select auth.uid())));
create policy party_secondary_cities_insert on public.party_secondary_cities for insert to authenticated
  with check (exists (select 1 from public.parties p where p.id = party_id and p.owner_id = (select auth.uid())));
create policy party_secondary_cities_delete on public.party_secondary_cities for delete to authenticated
  using (exists (select 1 from public.parties p where p.id = party_id and p.owner_id = (select auth.uid())));

drop policy party_documents_select on public.party_documents;
drop policy party_documents_insert on public.party_documents;
create policy party_documents_select on public.party_documents for select to authenticated
  using (exists (select 1 from public.parties p where p.id = party_id and p.owner_id = (select auth.uid())));
create policy party_documents_insert on public.party_documents for insert to authenticated
  with check (exists (select 1 from public.parties p where p.id = party_id and p.owner_id = (select auth.uid())));

drop policy transactions_select on public.transactions;
drop policy transactions_insert on public.transactions;
drop policy transactions_update on public.transactions;
create policy transactions_select on public.transactions for select to authenticated
  using (owner_id = (select auth.uid()));
create policy transactions_insert on public.transactions for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy transactions_update on public.transactions for update to authenticated
  using (owner_id = (select auth.uid()));

drop policy entries_select on public.transaction_entries;
drop policy entries_insert on public.transaction_entries;
create policy entries_select on public.transaction_entries for select to authenticated
  using (owner_id = (select auth.uid()));
create policy entries_insert on public.transaction_entries for insert to authenticated
  with check (owner_id = (select auth.uid()));

drop policy audit_logs_select on public.audit_logs;
drop policy audit_logs_insert on public.audit_logs;
create policy audit_logs_select on public.audit_logs for select to authenticated
  using (owner_id = (select auth.uid()));
create policy audit_logs_insert on public.audit_logs for insert to authenticated
  with check (owner_id = (select auth.uid()));
