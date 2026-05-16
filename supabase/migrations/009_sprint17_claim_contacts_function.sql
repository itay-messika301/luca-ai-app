-- ============================================================================
-- Sprint 17 — claim_end_client_contacts() function
-- ============================================================================
-- Purpose:
--   When an end_client accepts an invitation, they need to be linked to ALL
--   the client businesses where their email is listed in client_contacts.
--   RLS prevents the user from writing to user_clients themselves (only
--   office users can), so we expose this controlled action via a SECURITY
--   DEFINER function that:
--     1. Reads the caller's auth.uid() and their email
--     2. Finds matching client_contacts (by email + invited_at set + not yet accepted)
--     3. Inserts user_clients rows
--     4. Marks the contacts as accepted and links them to the user
--   Returns the number of contacts linked.
--
-- The function is granted to `authenticated` role only.
-- ============================================================================

create or replace function public.claim_end_client_contacts()
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_email text;
  v_count int := 0;
begin
  select lower(email) into v_email from auth.users where id = auth.uid();
  if v_email is null then
    return 0;
  end if;

  with linked as (
    insert into public.user_clients (user_id, client_id, contact_id)
    select auth.uid(), c.client_id, c.id
    from public.client_contacts c
    where lower(c.email) = v_email
      and c.invited_at is not null
      and c.accepted_at is null
    on conflict (user_id, client_id) do nothing
    returning contact_id
  )
  update public.client_contacts
  set    invited_user_id = auth.uid(),
         accepted_at     = now()
  where  id in (select contact_id from linked);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.claim_end_client_contacts() from public;
grant  execute on function public.claim_end_client_contacts() to authenticated;

comment on function public.claim_end_client_contacts() is
  'Called by an end_client after accepting an invitation. Links them to all client_contacts rows where their email matches and an invitation was sent.';
