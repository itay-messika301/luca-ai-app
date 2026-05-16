-- ============================================================================
-- Sprint 17 — HOTFIX: Break RLS recursion between clients ↔ user_clients
-- ============================================================================
-- Bug introduced by migration 008:
--   - clients policy end_client_read_own_clients_v2 queries user_clients
--   - user_clients policy user_clients_select_office queries clients (via JOIN)
--   - Postgres tries to evaluate them mutually → infinite recursion → 500 error
--     on any query that hits public.clients (and the same chain via documents).
--
-- Fix:
--   Replace both v2 policies with policies that call a SECURITY DEFINER helper
--   function. SECURITY DEFINER bypasses RLS within its body, breaking the loop.
-- ============================================================================

-- 1) Helper function that checks if the calling user can access a given client
create or replace function public.has_client_access(p_client_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_clients
    where user_id = auth.uid() and client_id = p_client_id
  )
  or exists (
    select 1 from public.clients
    where id = p_client_id and owner_user_id = auth.uid()
  );
$$;

revoke all     on function public.has_client_access(uuid) from public;
grant  execute on function public.has_client_access(uuid) to authenticated;

-- 2) Drop the recursive policies
drop policy if exists "end_client_read_own_clients_v2"   on public.clients;
drop policy if exists "end_client_read_own_documents_v2" on public.documents;

-- 3) Recreate them using the helper (no recursion now)
create policy "end_client_read_own_clients_v2"
  on public.clients for select
  using (public.has_client_access(id));

create policy "end_client_read_own_documents_v2"
  on public.documents for select
  using (public.has_client_access(client_id));

comment on function public.has_client_access(uuid) is
  'SECURITY DEFINER helper used by RLS policies on clients/documents to determine end_client access without triggering recursive RLS evaluation against user_clients.';
