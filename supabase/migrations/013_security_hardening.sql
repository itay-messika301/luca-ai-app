-- ============================================================================
-- 013 — Security hardening before go-live (2026-11-06)
-- ============================================================================
-- RUN ORDER (one sitting, Supabase SQL Editor):
--   0. Pre-check (below, read-only)  →  1. 011  →  2. 012  →  3. THIS FILE
--
-- What this fixes:
--   A. Privilege escalation: any user could UPDATE their own profile's
--      role / workspace_id / is_super_admin. Now guarded by a trigger;
--      onboarding + invitation acceptance go through SECURITY DEFINER RPCs.
--   B. Anonymous leaks: workspace_invitations (email + token) and workspaces
--      were readable without login. Invitation lookup is now an RPC by token.
--   C. End clients could read every client / document / audit row of their
--      office (old 001 policies). All policies on app tables are rebuilt
--      from scratch with explicit office vs end_client scoping.
--   D. Storage: end clients can upload/read only inside
--      {workspace_id}/{client_id}/..., office staff inside {workspace_id}/...
--   E. New signups get role NULL (→ onboarding) instead of 'end_client'.
--   F. is_email_authorised() no longer callable by anon/authenticated.
--
-- ── 0. PRE-CHECK (run first, read-only) ─────────────────────────────────────
--   select role, count(*) from public.profiles group by role;
--     → 012 will fail if any role is not one of
--       workspace_owner / accountant / reviewer / end_client.
--   select tablename, policyname from pg_policies
--     where schemaname in ('public','storage') order by 1,2;
--     → keep the output; this file drops & recreates the app policies.
-- ============================================================================

begin;

-- ────────────────────────────────────────────────────────────────────────────
-- 1) Helper functions (SECURITY DEFINER → no RLS recursion)
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.my_workspace_id()
returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from public.profiles where id = auth.uid()
$$;

create or replace function public.my_role()
returns text language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid()
$$;

create or replace function public.is_office()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce(
    (select role in ('workspace_owner','workspace_employee') and workspace_id is not null
       from public.profiles where id = auth.uid()),
    false)
$$;

create or replace function public.client_workspace_id(p_client_id uuid)
returns uuid language sql stable security definer set search_path = public as $$
  select workspace_id from public.clients where id = p_client_id
$$;

-- office staff of the client's workspace?
create or replace function public.is_office_for_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_office()
     and public.client_workspace_id(p_client_id) = public.my_workspace_id()
$$;

grant execute on function public.my_workspace_id()            to authenticated;
grant execute on function public.my_role()                    to authenticated;
grant execute on function public.is_office()                  to authenticated;
grant execute on function public.client_workspace_id(uuid)    to authenticated;
grant execute on function public.is_office_for_client(uuid)   to authenticated;

-- F. email enumeration
revoke execute on function public.is_email_authorised(text) from public, anon, authenticated;
grant  execute on function public.is_email_authorised(text) to service_role;

drop view if exists public.v_rls_policies;

-- ────────────────────────────────────────────────────────────────────────────
-- 2) E. New users start with no role → app sends them to onboarding
-- ────────────────────────────────────────────────────────────────────────────
alter table public.profiles alter column role drop default;
alter table public.profiles alter column role drop not null;

-- ────────────────────────────────────────────────────────────────────────────
-- 3) A. Guard sensitive profile columns
--    Direct API calls run as role "authenticated"; SECURITY DEFINER RPCs and
--    service_role run as a different current_user and are trusted.
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.guard_profile_columns()
returns trigger language plpgsql set search_path = public as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;

  if tg_op = 'INSERT' then
    new.role           := null;
    new.workspace_id   := null;
    new.is_super_admin := false;
    return new;
  end if;

  if new.is_super_admin is distinct from old.is_super_admin then
    raise exception 'is_super_admin cannot be changed' using errcode = '42501';
  end if;

  if new.role is distinct from old.role
     or new.workspace_id is distinct from old.workspace_id then
    -- Only allowed: a workspace_owner changing / removing a non-owner member
    if old.id <> auth.uid()
       and old.workspace_id is not null
       and old.workspace_id = public.my_workspace_id()
       and public.my_role() = 'workspace_owner'
       and old.role is distinct from 'workspace_owner'
       and new.role in ('workspace_employee', 'end_client')
       and (new.workspace_id is null or new.workspace_id = old.workspace_id) then
      return new;
    end if;
    raise exception 'role / workspace cannot be changed directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_guard_profile_columns on public.profiles;
create trigger trg_guard_profile_columns
  before insert or update on public.profiles
  for each row execute function public.guard_profile_columns();

-- ────────────────────────────────────────────────────────────────────────────
-- 4) RPCs for onboarding and invitations
-- ────────────────────────────────────────────────────────────────────────────

-- Create an office for the caller (onboarding). Returns the new workspace id.
create or replace function public.create_workspace(
  p_name  text,
  p_phone text default null,
  p_plan  text default 'starter'
) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_uid uuid := auth.uid();
  v_ws  uuid;
begin
  if v_uid is null then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;
  if coalesce(trim(p_name), '') = '' then
    raise exception 'name_required';
  end if;
  if exists (select 1 from public.profiles where id = v_uid and workspace_id is not null) then
    raise exception 'already_has_workspace';
  end if;

  insert into public.workspaces (name, phone, plan, owner_id)
  values (trim(p_name), nullif(trim(coalesce(p_phone, '')), ''), coalesce(p_plan, 'starter'), v_uid)
  returning id into v_ws;

  insert into public.profiles (id, role, workspace_id, full_name, avatar_url)
  select u.id, 'workspace_owner', v_ws,
         coalesce(u.raw_user_meta_data->>'full_name', u.raw_user_meta_data->>'name', split_part(u.email, '@', 1)),
         u.raw_user_meta_data->>'avatar_url'
  from auth.users u where u.id = v_uid
  on conflict (id) do update
    set role = 'workspace_owner', workspace_id = v_ws, updated_at = now();

  return v_ws;
end;
$$;

-- Public lookup of a pending invitation by its secret token.
create or replace function public.get_invitation(p_token uuid)
returns table (email text, role text, workspace_name text, expires_at timestamptz)
language sql stable security definer set search_path = public as $$
  select i.email, i.role, w.name, i.expires_at
  from public.workspace_invitations i
  join public.workspaces w on w.id = i.workspace_id
  where i.token = p_token and i.status = 'pending' and i.expires_at > now()
$$;

-- Accept an invitation. The caller's login email must match.
create or replace function public.accept_invitation(p_token uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid   uuid := auth.uid();
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_inv   public.workspace_invitations%rowtype;
  v_prof  public.profiles%rowtype;
begin
  if v_uid is null or v_email = '' then
    raise exception 'not_authenticated' using errcode = '42501';
  end if;

  select * into v_inv from public.workspace_invitations
  where token = p_token and status = 'pending' and expires_at > now()
  for update;
  if not found then
    raise exception 'invitation_not_found';
  end if;
  if lower(v_inv.email) <> v_email then
    raise exception 'email_mismatch';
  end if;

  select * into v_prof from public.profiles where id = v_uid;
  if v_prof.workspace_id is not null and v_prof.workspace_id <> v_inv.workspace_id then
    raise exception 'already_in_other_workspace';
  end if;

  -- never downgrade an existing owner of this same workspace
  if not (v_prof.role = 'workspace_owner' and v_prof.workspace_id = v_inv.workspace_id) then
    insert into public.profiles (id, role, workspace_id)
    values (v_uid, v_inv.role, v_inv.workspace_id)
    on conflict (id) do update
      set role = excluded.role, workspace_id = excluded.workspace_id, updated_at = now();
  end if;

  update public.workspace_invitations
  set status = 'accepted', accepted_at = now()
  where id = v_inv.id;

  if v_inv.role = 'end_client' then
    perform public.claim_end_client_contacts();
  end if;

  return coalesce((select role from public.profiles where id = v_uid), v_inv.role);
end;
$$;

-- Auto-accept the newest pending invitation for the caller's email
-- (user signed in directly instead of via the invitation link).
create or replace function public.accept_my_pending_invitation()
returns text
language plpgsql security definer set search_path = public as $$
declare
  v_email text := lower(coalesce(auth.jwt()->>'email', ''));
  v_token uuid;
begin
  if auth.uid() is null or v_email = '' then return null; end if;
  if exists (select 1 from public.profiles where id = auth.uid() and workspace_id is not null) then
    return null;
  end if;
  select token into v_token from public.workspace_invitations
  where lower(email) = v_email and status = 'pending' and expires_at > now()
  order by created_at desc limit 1;
  if v_token is null then return null; end if;
  return public.accept_invitation(v_token);
end;
$$;

revoke all on function public.create_workspace(text, text, text)   from public;
revoke all on function public.get_invitation(uuid)                 from public;
revoke all on function public.accept_invitation(uuid)              from public;
revoke all on function public.accept_my_pending_invitation()       from public;
grant execute on function public.create_workspace(text, text, text) to authenticated;
grant execute on function public.get_invitation(uuid)               to anon, authenticated;
grant execute on function public.accept_invitation(uuid)            to authenticated;
grant execute on function public.accept_my_pending_invitation()     to authenticated;

-- ────────────────────────────────────────────────────────────────────────────
-- 5) Drop ALL existing policies on app tables + documents-bucket storage
--    (prod has policies that are not in the repo, e.g. anon read on workspaces)
-- ────────────────────────────────────────────────────────────────────────────
do $$
declare r record;
begin
  for r in
    select tablename, policyname from pg_policies
    where schemaname = 'public'
      and tablename in ('workspaces','profiles','clients','documents','audit_log',
                        'workspace_invitations','client_contacts','user_clients',
                        'exports','approval_rules','approval_requests')
  loop
    execute format('drop policy if exists %I on public.%I', r.policyname, r.tablename);
  end loop;

  for r in
    select policyname from pg_policies
    where schemaname = 'storage' and tablename = 'objects'
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%documents%'
  loop
    execute format('drop policy if exists %I on storage.objects', r.policyname);
  end loop;
end $$;

alter table public.workspaces            enable row level security;
alter table public.profiles              enable row level security;
alter table public.clients               enable row level security;
alter table public.documents             enable row level security;
alter table public.audit_log             enable row level security;
alter table public.workspace_invitations enable row level security;
alter table public.client_contacts       enable row level security;
alter table public.user_clients          enable row level security;
alter table public.exports               enable row level security;
alter table public.approval_rules        enable row level security;
alter table public.approval_requests     enable row level security;

-- ────────────────────────────────────────────────────────────────────────────
-- 6) Rebuild policies
-- ────────────────────────────────────────────────────────────────────────────

-- WORKSPACES (insert only via create_workspace RPC)
create policy "workspaces: members read own" on public.workspaces
  for select to authenticated using (id = public.my_workspace_id());
create policy "workspaces: super_admin read all" on public.workspaces
  for select to authenticated using (public.is_super_admin());
create policy "workspaces: owner update" on public.workspaces
  for update to authenticated
  using (owner_id = auth.uid() and id = public.my_workspace_id())
  with check (owner_id = auth.uid());

-- PROFILES (sensitive columns guarded by trigger)
create policy "profiles: read self" on public.profiles
  for select to authenticated using (id = auth.uid());
create policy "profiles: office reads workspace" on public.profiles
  for select to authenticated
  using (public.is_office() and workspace_id = public.my_workspace_id());
create policy "profiles: super_admin read all" on public.profiles
  for select to authenticated using (public.is_super_admin());
create policy "profiles: insert self" on public.profiles
  for insert to authenticated with check (id = auth.uid());
create policy "profiles: update self" on public.profiles
  for update to authenticated using (id = auth.uid()) with check (id = auth.uid());
create policy "profiles: owner updates team" on public.profiles
  for update to authenticated
  using (workspace_id = public.my_workspace_id() and public.my_role() = 'workspace_owner')
  with check (workspace_id is null or workspace_id = public.my_workspace_id());

-- CLIENTS
create policy "clients: office read" on public.clients
  for select to authenticated
  using (public.is_office() and workspace_id = public.my_workspace_id());
create policy "clients: end_client read linked" on public.clients
  for select to authenticated using (public.has_client_access(id));
create policy "clients: super_admin read all" on public.clients
  for select to authenticated using (public.is_super_admin());
create policy "clients: office insert" on public.clients
  for insert to authenticated
  with check (public.is_office() and workspace_id = public.my_workspace_id());
create policy "clients: office update" on public.clients
  for update to authenticated
  using (public.is_office() and workspace_id = public.my_workspace_id())
  with check (workspace_id = public.my_workspace_id());
create policy "clients: owner delete" on public.clients
  for delete to authenticated
  using (workspace_id = public.my_workspace_id() and public.my_role() = 'workspace_owner');

-- DOCUMENTS
create policy "documents: office read" on public.documents
  for select to authenticated
  using (public.is_office() and workspace_id = public.my_workspace_id());
create policy "documents: end_client read linked" on public.documents
  for select to authenticated
  using (client_id is not null and public.has_client_access(client_id));
create policy "documents: super_admin read all" on public.documents
  for select to authenticated using (public.is_super_admin());
create policy "documents: office insert" on public.documents
  for insert to authenticated
  with check (public.is_office() and workspace_id = public.my_workspace_id());
create policy "documents: end_client insert linked" on public.documents
  for insert to authenticated
  with check (
    public.my_role() = 'end_client'
    and client_id is not null
    and public.has_client_access(client_id)
    and workspace_id = public.client_workspace_id(client_id)
  );
create policy "documents: office update" on public.documents
  for update to authenticated
  using (public.is_office() and workspace_id = public.my_workspace_id())
  with check (workspace_id = public.my_workspace_id());
create policy "documents: office delete" on public.documents
  for delete to authenticated
  using (public.is_office() and workspace_id = public.my_workspace_id());

-- AUDIT LOG
create policy "audit_log: office read" on public.audit_log
  for select to authenticated
  using (public.is_office() and workspace_id = public.my_workspace_id());
create policy "audit_log: super_admin read all" on public.audit_log
  for select to authenticated using (public.is_super_admin());
create policy "audit_log: office insert" on public.audit_log
  for insert to authenticated
  with check (public.is_office() and workspace_id = public.my_workspace_id());

-- WORKSPACE INVITATIONS (no anonymous access; lookup via get_invitation RPC)
create policy "invitations: owner manage" on public.workspace_invitations
  for all to authenticated
  using (workspace_id = public.my_workspace_id() and public.my_role() = 'workspace_owner')
  with check (workspace_id = public.my_workspace_id() and public.my_role() = 'workspace_owner');

-- CLIENT CONTACTS
create policy "client_contacts: office all" on public.client_contacts
  for all to authenticated
  using (public.is_office_for_client(client_id))
  with check (public.is_office_for_client(client_id));
create policy "client_contacts: end_client read linked" on public.client_contacts
  for select to authenticated using (public.has_client_access(client_id));

-- USER CLIENTS
create policy "user_clients: read self" on public.user_clients
  for select to authenticated using (user_id = auth.uid());
create policy "user_clients: office all" on public.user_clients
  for all to authenticated
  using (public.is_office_for_client(client_id))
  with check (public.is_office_for_client(client_id));

-- EXPORTS
create policy "exports: office read" on public.exports
  for select to authenticated
  using (public.is_office() and workspace_id = public.my_workspace_id());
create policy "exports: office insert" on public.exports
  for insert to authenticated
  with check (public.is_office() and workspace_id = public.my_workspace_id());

-- APPROVAL RULES
create policy "approval_rules: office read" on public.approval_rules
  for select to authenticated
  using (public.is_office() and workspace_id = public.my_workspace_id());
create policy "approval_rules: owner write" on public.approval_rules
  for all to authenticated
  using (workspace_id = public.my_workspace_id() and public.my_role() = 'workspace_owner')
  with check (workspace_id = public.my_workspace_id() and public.my_role() = 'workspace_owner');

-- APPROVAL REQUESTS
create policy "approval_requests: office read" on public.approval_requests
  for select to authenticated
  using (public.is_office() and workspace_id = public.my_workspace_id());
create policy "approval_requests: office insert" on public.approval_requests
  for insert to authenticated
  with check (public.is_office() and workspace_id = public.my_workspace_id());
create policy "approval_requests: assignee or owner update" on public.approval_requests
  for update to authenticated
  using (
    workspace_id = public.my_workspace_id()
    and (assigned_to = auth.uid() or public.my_role() = 'workspace_owner')
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 7) D. Storage — bucket "documents"
--    office:     {workspace_id}/...
--    end client: {workspace_id}/{client_id}/...
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.can_access_document_path(p_name text, p_write boolean default false)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_folders text[] := storage.foldername(p_name);
  v_client  uuid;
begin
  if auth.uid() is null or v_folders is null or array_length(v_folders, 1) is null then
    return false;
  end if;

  if public.is_office() and v_folders[1] = public.my_workspace_id()::text then
    return true;
  end if;

  if public.my_role() = 'end_client' and array_length(v_folders, 1) >= 2
     and v_folders[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then
    v_client := v_folders[2]::uuid;
    return public.has_client_access(v_client)
       and public.client_workspace_id(v_client)::text = v_folders[1];
  end if;

  return false;
end;
$$;
grant execute on function public.can_access_document_path(text, boolean) to authenticated;

create policy "documents bucket: upload" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'documents' and public.can_access_document_path(name, true));
create policy "documents bucket: read" on storage.objects
  for select to authenticated
  using (bucket_id = 'documents' and public.can_access_document_path(name));
create policy "documents bucket: office delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents'
         and public.is_office()
         and (storage.foldername(name))[1] = public.my_workspace_id()::text);

commit;

-- ── VERIFY (after commit) ───────────────────────────────────────────────────
--   select tablename, policyname, cmd from pg_policies
--     where schemaname in ('public','storage') order by 1,2;
--   As anon (REST, no login) these must return [] :
--     /rest/v1/workspace_invitations?select=id
--     /rest/v1/workspaces?select=id
