-- ============================================================================
-- 10_chat_messages.sql
-- A minimal internal chat channel shared by everyone with an account on
-- this ledger (in practice, the two people using it). One flat channel,
-- no threads/groups — kept deliberately simple. Messages are immutable
-- (no update/delete policy) for the same append-only spirit as the ledger.
-- ============================================================================

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  sender_id uuid not null references public.profiles(id),
  body text not null check (char_length(trim(body)) > 0 and char_length(body) <= 4000),
  created_at timestamptz not null default now()
);

create index idx_messages_created_at on public.messages(created_at);

alter table public.messages enable row level security;

revoke all on public.messages from anon;
grant select, insert on public.messages to authenticated;

create policy messages_select on public.messages for select to authenticated
  using (public.app_current_active());

create policy messages_insert on public.messages for insert to authenticated
  with check (sender_id = (select auth.uid()) and public.app_current_active());

-- Live updates via Supabase Realtime (Postgres change feed).
alter publication supabase_realtime add table public.messages;
