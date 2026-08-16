-- ============================================================================
-- 01_core_tables.sql
-- Core entities: profiles (roles), cities, parties, transactions, ledger
-- entries, audit log.
--
-- ACCOUNTING CONVENTION (mirrors spec section 22's own worked example):
--   Every transaction posts a balanced pair (or more) of ledger legs to
--   transaction_entries. Two account "kinds" exist:
--     - city_cash: a city's physical cash/value position. DEBIT increases it,
--       CREDIT decreases it (standard asset-account behaviour).
--     - party: a party's sub-ledger (like an Accounts Receivable control
--       account). DEBIT increases it, CREDIT decreases it.
--   party balance = opening_balance + SUM(debit) - SUM(credit)
--     balance > 0  => the party owes the OWNER money  => "Receivable"
--     balance < 0  => the OWNER owes the party money  => "Payable"
--   city cash balance = opening_balance + SUM(debit) - SUM(credit) on
--   city_cash entries for that city.
--
--   Example: Ahmed hands the owner cash in Neemuch ("Receipt").
--     Debit  city_cash(Neemuch)      amount   (cash on hand increases)
--     Credit party(Ahmed)            amount   (owner now owes Ahmed that
--                                               value elsewhere -> Payable)
--   This matches the spec's own worked example in section 22 exactly.
-- ============================================================================

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------------
-- profiles (extends auth.users) — carries the app role
-- ---------------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'viewer'
    check (role in ('owner','city_manager','operator','viewer','auditor')),
  assigned_city_id uuid, -- fk added after cities exists
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'One row per auth.users member, carries the app-level role and (for city_manager/operator) their assigned city.';

-- ---------------------------------------------------------------------------
-- cities
-- ---------------------------------------------------------------------------
create table public.cities (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,          -- short token code, e.g. 'NMC'
  name text not null,
  state text,
  country text not null default 'India',
  currency text not null default 'INR',
  active boolean not null default true,
  manager_id uuid references public.profiles(id) on delete set null,
  opening_balance numeric(18,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint cities_code_format check (code ~ '^[A-Z0-9]{2,6}$')
);

alter table public.profiles
  add constraint profiles_assigned_city_fk foreign key (assigned_city_id) references public.cities(id) on delete set null;

-- ---------------------------------------------------------------------------
-- parties
-- ---------------------------------------------------------------------------
create table public.parties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  primary_city_id uuid not null references public.cities(id),
  party_type text not null default 'person'
    check (party_type in ('person','business','agent','internal')),
  opening_balance numeric(18,2) not null default 0,
  notes text,
  active boolean not null default true,
  created_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.party_secondary_cities (
  party_id uuid not null references public.parties(id) on delete cascade,
  city_id uuid not null references public.cities(id) on delete cascade,
  primary key (party_id, city_id)
);

create table public.party_documents (
  id uuid primary key default gen_random_uuid(),
  party_id uuid not null references public.parties(id) on delete cascade,
  label text not null,
  storage_path text not null,
  uploaded_by uuid references public.profiles(id),
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- token sequence (CITY-DATE-SEQUENCE / CITY-DESTCITY-DATE-SEQUENCE)
-- ---------------------------------------------------------------------------
create table public.token_sequences (
  city_code text not null,
  seq_date date not null,
  last_seq integer not null default 0,
  primary key (city_code, seq_date)
);

-- ---------------------------------------------------------------------------
-- transactions (the token itself)
-- ---------------------------------------------------------------------------
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  token text not null unique,
  transaction_type text not null check (transaction_type in (
    'receipt','collection','settlement_received','transfer_received','adjustment_credit',
    'payment','settlement_paid','transfer_sent','adjustment_debit',
    'city_transfer','party_transfer','reconciliation_adjustment'
  )),
  origin_city_id uuid not null references public.cities(id),
  destination_city_id uuid references public.cities(id),
  party_id uuid references public.parties(id),
  counterparty_id uuid references public.parties(id),
  amount numeric(18,2) not null check (amount > 0),
  currency text not null default 'INR',
  description text,
  reference text,
  status text not null default 'pending' check (status in (
    'draft','pending','confirmed','settled','cancelled','reversed','disputed'
  )),
  reversed_transaction_id uuid references public.transactions(id),
  settles_transaction_id uuid references public.transactions(id),
  created_by uuid references public.profiles(id),
  approved_by uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint transactions_dest_requires_type check (
    destination_city_id is null or transaction_type in ('city_transfer','party_transfer','transfer_sent','transfer_received')
  ),
  constraint transactions_party_transfer_requires_counterparty check (
    transaction_type <> 'party_transfer' or counterparty_id is not null
  ),
  constraint transactions_city_transfer_requires_dest check (
    transaction_type <> 'city_transfer' or destination_city_id is not null
  ),
  constraint transactions_no_self_transfer check (
    destination_city_id is null or destination_city_id <> origin_city_id
  )
);

-- ---------------------------------------------------------------------------
-- transaction_entries (the double-entry ledger legs)
-- ---------------------------------------------------------------------------
create table public.transaction_entries (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.transactions(id) on delete cascade,
  entry_type text not null check (entry_type in ('city_cash','party')),
  city_id uuid not null references public.cities(id),
  party_id uuid references public.parties(id),
  direction text not null check (direction in ('debit','credit')),
  amount numeric(18,2) not null check (amount > 0),
  currency text not null default 'INR',
  created_at timestamptz not null default now(),
  constraint transaction_entries_party_consistency check (
    (entry_type = 'party' and party_id is not null) or
    (entry_type = 'city_cash' and party_id is null)
  )
);

-- ---------------------------------------------------------------------------
-- audit_logs (append-only)
-- ---------------------------------------------------------------------------
create table public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid,
  action text not null,
  performed_by uuid references public.profiles(id),
  previous_value jsonb,
  new_value jsonb,
  reason text,
  session_info jsonb,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- notifications / alerts
-- ---------------------------------------------------------------------------
create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references public.profiles(id) on delete cascade,
  alert_type text not null,
  title text not null,
  body text,
  related_entity_type text,
  related_entity_id uuid,
  severity text not null default 'info' check (severity in ('info','warning','critical')),
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- alert thresholds (owner-configurable)
-- ---------------------------------------------------------------------------
create table public.alert_settings (
  key text primary key,
  value jsonb not null,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);

insert into public.alert_settings (key, value) values
  ('large_transaction_threshold', '100000'),
  ('long_pending_days', '7');

-- ---------------------------------------------------------------------------
-- indexes
-- ---------------------------------------------------------------------------
create index idx_parties_primary_city on public.parties(primary_city_id);
create index idx_transactions_origin_city on public.transactions(origin_city_id);
create index idx_transactions_destination_city on public.transactions(destination_city_id);
create index idx_transactions_party on public.transactions(party_id);
create index idx_transactions_counterparty on public.transactions(counterparty_id);
create index idx_transactions_status on public.transactions(status);
create index idx_transactions_created_at on public.transactions(created_at desc);
create index idx_transactions_token on public.transactions(token);
create index idx_entries_transaction on public.transaction_entries(transaction_id);
create index idx_entries_city on public.transaction_entries(city_id);
create index idx_entries_party on public.transaction_entries(party_id);
create index idx_audit_entity on public.audit_logs(entity_type, entity_id);
create index idx_audit_created_at on public.audit_logs(created_at desc);
create index idx_notifications_recipient on public.notifications(recipient_id, read_at);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated_at before update on public.profiles
  for each row execute function public.set_updated_at();
create trigger trg_cities_updated_at before update on public.cities
  for each row execute function public.set_updated_at();
create trigger trg_parties_updated_at before update on public.parties
  for each row execute function public.set_updated_at();
create trigger trg_transactions_updated_at before update on public.transactions
  for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- auto-create profile on signup; first user in the system becomes 'owner'
-- ---------------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  is_first boolean;
begin
  select not exists(select 1 from public.profiles) into is_first;
  insert into public.profiles (id, email, full_name, role)
  values (
    new.id,
    new.email,
    new.raw_user_meta_data->>'full_name',
    case when is_first then 'owner' else 'viewer' end
  );
  return new;
end;
$$;

create trigger trg_on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
