-- profiles_select previously only let a user see their own row (plus
-- owner/auditor see everyone). That silently broke "Created By"/"Approved
-- By" display on transactions and the sender name in chat for any
-- non-owner/auditor role — they'd just see blanks. This is a small,
-- trusted team using one shared ledger (not a multi-tenant system with
-- adversarial internal parties), so basic identity (name/email/role) is
-- fine to share among every active member.

drop policy profiles_select on public.profiles;
create policy profiles_select on public.profiles for select to authenticated
  using (public.app_current_active());
