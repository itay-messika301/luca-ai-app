-- ============================================================================
-- 014 — Employee access per client + member emails + client intake fields
-- (run after 013)
-- ============================================================================
--   A. profiles.client_access ('all' | 'assigned') + staff_clients table.
--      workspace_owner always sees every client. An employee with 'assigned'
--      sees only the clients listed for them in staff_clients.
--   B. Invitations carry the access choice; accept_invitation applies it.
--   C. set_member_client_access(): owner changes an employee's access.
--   D. get_workspace_member_emails(): emails of office members (owner/staff).
--   E. clients.intake_whatsapp / intake_email (gap #12a).
-- ============================================================================

begin;

-- ── A. Columns + table ─────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists client_access text not null default 'all';
alter table public.profiles drop constraint if exists profiles_client_access_check;
alter table public.profiles add constraint profiles_client_access_check
  check (client_access in ('all', 'assigned'));

create table if not exists public.staff_clients (
  user_id    uuid not null references auth.users(id)     on delete cascade,
  client_id  uuid not null references public.clients(id) on delete cascade,
  granted_by uuid references auth.users(id) on delete set null,
  granted_at timestamptz not null default now(),
  primary key (user_id, client_id)
);
create index if not exists staff_clients_client_idx on public.staff_clients(client_id);
alter table public.staff_clients enable row level security;

alter table public.workspace_invitations
  add column if not exists client_access text not null default 'all',
  add column if not exists client_ids    uuid[] not null default '{}';
alter table public.workspace_invitations drop constraint if exists workspace_invitations_client_access_check;
alter table public.workspace_invitations add constraint workspace_invitations_client_access_check
  check (client_access in ('all', 'assigned'));

-- ── E. Client intake channels ──────────────────────────────────────────────
alter table public.clients
  add column if not exists intake_whatsapp text,
  add column if not exists intake_email    text;

-- ── Helpers ────────────────────────────────────────────────────────────────
-- Office user who sees every client of the workspace (owner, or employee with 'all')
create or replace function public.is_full_office()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select workspace_id is not null and (
      role = 'workspace_owner' or (role = 'workspace_employee' and client_access = 'all'))
    from public.profiles where id = auth.uid()), false)
$$;

-- Office user who may see this specific client
create or replace function public.staff_can_see_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.is_office()
     and public.client_workspace_id(p_client_id) = public.my_workspace_id()
     and (public.is_full_office()
          or exists (select 1 from public.staff_clients sc
                     where sc.user_id = auth.uid() and sc.client_id = p_client_id))
$$;

-- Existing helper now respects per-client access (used by client_contacts / user_clients)
create or replace function public.is_office_for_client(p_client_id uuid)
returns boolean language sql stable security definer set search_path = public as $$
  select public.staff_can_see_client(p_client_id)
$$;

grant execute on function public.is_full_office()            to authenticated;
grant execute on function public.staff_can_see_client(uuid)  to authenticated;

-- ── Guard: client_access may only be changed by the owner (or via RPC) ─────
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
    new.client_access  := 'all';
    return new;
  end if;

  if new.is_super_admin is distinct from old.is_super_admin then
    raise exception 'is_super_admin cannot be changed' using errcode = '42501';
  end if;

  if new.role is distinct from old.role
     or new.workspace_id is distinct from old.workspace_id
     or new.client_access is distinct from old.client_access then
    if old.id <> auth.uid()
       and old.workspace_id is not null
       and old.workspace_id = public.my_workspace_id()
       and public.my_role() = 'workspace_owner'
       and old.role is distinct from 'workspace_owner'
       and new.role in ('workspace_employee', 'end_client')
       and (new.workspace_id is null or new.workspace_id = old.workspace_id) then
      return new;
    end if;
    raise exception 'role / workspace / access cannot be changed directly' using errcode = '42501';
  end if;

  return new;
end;
$$;

-- ── B. Accept invitation applies the access choice ─────────────────────────
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
  if not found then raise exception 'invitation_not_found'; end if;
  if lower(v_inv.email) <> v_email then raise exception 'email_mismatch'; end if;

  select * into v_prof from public.profiles where id = v_uid;
  if v_prof.workspace_id is not null and v_prof.workspace_id <> v_inv.workspace_id then
    raise exception 'already_in_other_workspace';
  end if;

  if not (v_prof.role = 'workspace_owner' and v_prof.workspace_id = v_inv.workspace_id) then
    insert into public.profiles (id, role, workspace_id, client_access)
    values (v_uid, v_inv.role, v_inv.workspace_id,
            case when v_inv.role = 'workspace_employee' then v_inv.client_access else 'all' end)
    on conflict (id) do update
      set role = excluded.role, workspace_id = excluded.workspace_id,
          client_access = excluded.client_access, updated_at = now();

    if v_inv.role = 'workspace_employee' and v_inv.client_access = 'assigned' then
      insert into public.staff_clients (user_id, client_id, granted_by)
      select v_uid, c.id, v_inv.invited_by
      from public.clients c
      where c.id = any (v_inv.client_ids) and c.workspace_id = v_inv.workspace_id
      on conflict do nothing;
    end if;
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

-- ── C. Owner sets an employee's client access ──────────────────────────────
create or replace function public.set_member_client_access(
  p_user_id    uuid,
  p_access     text,
  p_client_ids uuid[] default '{}'
) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_ws uuid := public.my_workspace_id();
begin
  if public.my_role() is distinct from 'workspace_owner' then
    raise exception 'owner_only' using errcode = '42501';
  end if;
  if p_access not in ('all', 'assigned') then
    raise exception 'invalid_access';
  end if;
  if not exists (select 1 from public.profiles
                 where id = p_user_id and workspace_id = v_ws and role = 'workspace_employee') then
    raise exception 'not_an_employee_of_this_office';
  end if;

  update public.profiles set client_access = p_access, updated_at = now() where id = p_user_id;

  delete from public.staff_clients sc
  using public.clients c
  where sc.user_id = p_user_id and c.id = sc.client_id and c.workspace_id = v_ws;

  if p_access = 'assigned' then
    insert into public.staff_clients (user_id, client_id, granted_by)
    select p_user_id, c.id, auth.uid()
    from public.clients c
    where c.id = any (coalesce(p_client_ids, '{}')) and c.workspace_id = v_ws
    on conflict do nothing;
  end if;
end;
$$;

-- ── D. Member emails for the team screen ───────────────────────────────────
create or replace function public.get_workspace_member_emails()
returns table (id uuid, email text)
language sql stable security definer set search_path = public as $$
  select p.id, u.email::text
  from public.profiles p
  join auth.users u on u.id = p.id
  where public.is_office()
    and p.workspace_id = public.my_workspace_id()
    and p.role in ('workspace_owner', 'workspace_employee')
$$;

revoke all on function public.set_member_client_access(uuid, text, uuid[]) from public;
revoke all on function public.get_workspace_member_emails()               from public;
grant execute on function public.set_member_client_access(uuid, text, uuid[]) to authenticated;
grant execute on function public.get_workspace_member_emails()               to authenticated;

-- ── Policies: replace office-wide access with per-client access ────────────
drop policy if exists "clients: office read"   on public.clients;
drop policy if exists "clients: office update" on public.clients;
create policy "clients: office read" on public.clients
  for select to authenticated
  using (workspace_id = public.my_workspace_id() and public.staff_can_see_client(id));
create policy "clients: office update" on public.clients
  for update to authenticated
  using (workspace_id = public.my_workspace_id() and public.staff_can_see_client(id))
  with check (workspace_id = public.my_workspace_id());

drop policy if exists "documents: office read"   on public.documents;
drop policy if exists "documents: office insert" on public.documents;
drop policy if exists "documents: office update" on public.documents;
drop policy if exists "documents: office delete" on public.documents;
create policy "documents: office read" on public.documents
  for select to authenticated
  using (workspace_id = public.my_workspace_id() and public.is_office()
         and (public.is_full_office() or (client_id is not null and public.staff_can_see_client(client_id))));
create policy "documents: office insert" on public.documents
  for insert to authenticated
  with check (workspace_id = public.my_workspace_id() and public.is_office()
              and (public.is_full_office() or (client_id is not null and public.staff_can_see_client(client_id))));
create policy "documents: office update" on public.documents
  for update to authenticated
  using (workspace_id = public.my_workspace_id() and public.is_office()
         and (public.is_full_office() or (client_id is not null and public.staff_can_see_client(client_id))))
  with check (workspace_id = public.my_workspace_id());
create policy "documents: office delete" on public.documents
  for delete to authenticated
  using (workspace_id = public.my_workspace_id() and public.is_office()
         and (public.is_full_office() or (client_id is not null and public.staff_can_see_client(client_id))));

-- Audit log and exports span many clients → only full-access office users
drop policy if exists "audit_log: office read" on public.audit_log;
create policy "audit_log: office read" on public.audit_log
  for select to authenticated
  using (workspace_id = public.my_workspace_id() and public.is_full_office());
drop policy if exists "exports: office read" on public.exports;
create policy "exports: office read" on public.exports
  for select to authenticated
  using (workspace_id = public.my_workspace_id() and public.is_full_office());

-- staff_clients: owner manages, employee reads own rows
create policy "staff_clients: owner manage" on public.staff_clients
  for all to authenticated
  using (public.my_role() = 'workspace_owner' and public.client_workspace_id(client_id) = public.my_workspace_id())
  with check (public.my_role() = 'workspace_owner' and public.client_workspace_id(client_id) = public.my_workspace_id());
create policy "staff_clients: read own" on public.staff_clients
  for select to authenticated using (user_id = auth.uid());

-- Storage: employees limited to their clients' folders ({workspace}/{client}/...)
create or replace function public.can_access_document_path(p_name text, p_write boolean default false)
returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_folders text[] := storage.foldername(p_name);
  v_client  uuid;
  v_is_uuid boolean;
begin
  if auth.uid() is null or v_folders is null or array_length(v_folders, 1) is null then
    return false;
  end if;
  v_is_uuid := array_length(v_folders, 1) >= 2
    and v_folders[2] ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$';
  if v_is_uuid then v_client := v_folders[2]::uuid; end if;

  if public.is_office() and v_folders[1] = public.my_workspace_id()::text then
    if public.is_full_office() then return true; end if;
    return v_client is not null and public.staff_can_see_client(v_client);
  end if;

  if public.my_role() = 'end_client' and v_client is not null then
    return public.has_client_access(v_client)
       and public.client_workspace_id(v_client)::text = v_folders[1];
  end if;

  return false;
end;
$$;

drop policy if exists "documents bucket: office delete" on storage.objects;
create policy "documents bucket: office delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'documents' and public.is_office() and public.can_access_document_path(name));

commit;
