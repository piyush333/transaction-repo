-- Postgres grants EXECUTE to PUBLIC (which includes anon) by default.
-- Lock functions down to only the roles that legitimately need them.

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.next_token(text, text) from public, anon;
revoke execute on function public.app_current_role() from public, anon;
revoke execute on function public.app_current_city() from public, anon;
revoke execute on function public.app_current_active() from public, anon;

-- authenticated still needs these: RLS policies evaluate app_current_*()
-- under the querying session, and create_transaction() (security invoker)
-- calls next_token() under the caller's own privileges.
grant execute on function public.next_token(text, text) to authenticated;
grant execute on function public.app_current_role() to authenticated;
grant execute on function public.app_current_city() to authenticated;
grant execute on function public.app_current_active() to authenticated;

revoke execute on function public.create_transaction(text, uuid, numeric, uuid, uuid, uuid, text, text, text, text) from anon;
revoke execute on function public.reverse_transaction(uuid, text) from anon;
grant execute on function public.create_transaction(text, uuid, numeric, uuid, uuid, uuid, text, text, text, text) to authenticated;
grant execute on function public.reverse_transaction(uuid, text) to authenticated;
