-- ============================================================================
-- 015 — Read-only staff + richer profiles + avatars (gaps 7.11)
-- (run after 014)
-- ============================================================================
--   A. profiles.access_level ('read_write' | 'read'), default read_write.
--      An employee with 'read' sees everything their client_access allows
--      but can't upload, edit, delete, archive or export.
--      The owner is always read_write.
--   B. Invitations carry access_level; accept_invitation applies it;
--      set_member_client_access() can change it.
--   C. Every office write policy now also requires can_office_write().
--   D. profiles.display_name / phone / job_title (full_name + avatar_url exist).
--   E. Public "avatars" bucket; each user writes only under {their uid}/.
-- ============================================================================

begin;

-- ── A. Columns ─────────────────────────────────────────────────────────────
alter table public.profiles
  add column if not exists access_level text not null default 'read_write',
  add column if not exists display_name text,
  add column if not exists phone        text,
  add column if not exists job_title    text;
alter table public.profiles drop constraint if exists profiles_access_level_check;
alter table public.profiles add constraint profiles_access_level_check
  check (access_level in ('read_write', 'read'));

alter table public.workspace_invitations
  add column if not exists access_level text not null default 'read_write';
alter table public.workspace_invitations drop constraint if exists workspace_invitations_access_level_check;
alter table public.workspace_invitations add constraint workspace_invitations_access_level_check
  check (access_level in ('read_write', 'read'));

create or replace function public.can_office_write()
returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((
    select workspace_id is not null and (
      role = 'workspace_owner' or (role = 'workspace_employee' and access_level = 'read_write'))
    from public.profiles where id = auth.uid()), false)
$$;
revoke all on function public.can_office_write() from public;
grant execute on function public.can_office_write() to authenticated;

-- ── Guard: users can't grant themselves access; owner can set it for staff ──
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
    new.access_level   := 'read_write';
    return new;
  end if;

  if new.is_super_admin is distinct from old.is_super_admin then
    raise exception 'is_super_admin cannot be changed' using errcode = '42501';
  end if;

  if new.role is distinct from old.role
     or new.workspace_id is distinct from old.workspace_id
     or new.client_access is distinct from old.client_access
     or new.access_level is distinct from old.access_level then
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

-- ── B. Invitations apply access_level ──────────────────────────────────────
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
    insert into public.profiles (id, role, workspace_id, client_access, access_level)
    values (v_uid, v_inv.role, v_inv.workspace_id,
            case when v_inv.role = 'workspace_employee' then v_inv.client_access else 'all' end,
            case when v_inv.role = 'workspace_employee' then v_inv.access_level  else 'read_write' end)
    on conflict (id) do update
      set role = excluded.role, workspace_id = excluded.workspace_id,
          client_access = excluded.client_access, access_level = excluded.access_level,
          updated_at = now();

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

drop function if exists public.set_member_client_access(uuid, text, uuid[]);
create or replace function public.set_member_client_access(
  p_user_id      uuid,
  p_access       text,
  p_client_ids   uuid[] default '{}',
  p_access_level text   default null
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
  if p_access_level is not null and p_access_level not in ('read_write', 'read') then
    raise exception 'invalid_access_level';
  end if;
  if not exists (select 1 from public.profiles
                 where id = p_user_id and workspace_id = v_ws and role = 'workspace_employee') then
    raise exception 'not_an_employee_of_this_office';
  end if;

  update public.profiles
  set client_access = p_access,
      access_level  = coalesce(p_access_level, access_level),
      updated_at    = now()
  where id = p_user_id;

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
revoke all on function public.set_member_client_access(uuid, text, uuid[], text) from public;
grant execute on function public.set_member_client_access(uuid, text, uuid[], text) to authenticated;

-- ── C. Office write policies require can_office_write() ────────────────────
-- CLIENTS
drop policy if exists "clients: office insert" on public.clients;
drop policy if exists "clients: office update" on public.clients;
create policy "clients: office insert" on public.clients
  for insert to authenticated
  with check (public.is_office() and public.can_office_write()
              and workspace_id = public.my_workspace_id());
create policy "clients: office update" on public.clients
  for update to authenticated
  using (workspace_id = public.my_workspace_id() and public.staff_can_see_client(id)
         and public.can_office_write())
  with check (workspace_id = public.my_workspace_id());

-- DOCUMENTS
drop policy if exists "documents: office insert" on public.documents;
drop policy if exists "documents: office update" on public.documents;
drop policy if exists "documents: office delete" on public.documents;
create policy "documents: office insert" on public.documents
  for insert to authenticated
  with check (workspace_id = public.my_workspace_id() and public.is_office()
              and public.can_office_write()
              and (public.is_full_office() or (client_id is not null and public.staff_can_see_client(client_id))));
create policy "documents: office update" on public.documents
  for update to authenticated
  using (workspace_id = public.my_workspace_id() and public.is_office()
         and public.can_office_write()
         and (public.is_full_office() or (client_id is not null and public.staff_can_see_client(client_id))))
  with check (workspace_id = public.my_workspace_id());
create policy "documents: office delete" on public.documents
  for delete to authenticated
  using (workspace_id = public.my_workspace_id() and public.is_office()
         and public.can_office_write()
         and (public.is_full_office() or (client_id is not null and public.staff_can_see_client(client_id))));

-- CLIENT CONTACTS / USER CLIENTS: split "office all" into read + write
drop policy if exists "client_contacts: office all"   on public.client_contacts;
drop policy if exists "client_contacts: office read"  on public.client_contacts;
drop policy if exists "client_contacts: office write" on public.client_contacts;
create policy "client_contacts: office read" on public.client_contacts
  for select to authenticated using (public.is_office_for_client(client_id));
create policy "client_contacts: office write" on public.client_contacts
  for all to authenticated
  using (public.is_office_for_client(client_id) and public.can_office_write())
  with check (public.is_office_for_client(client_id) and public.can_office_write());

drop policy if exists "user_clients: office all"   on public.user_clients;
drop policy if exists "user_clients: office read"  on public.user_clients;
drop policy if exists "user_clients: office write" on public.user_clients;
create policy "user_clients: office read" on public.user_clients
  for select to authenticated using (public.is_office_for_client(client_id));
create policy "user_clients: office write" on public.user_clients
  for all to authenticated
  using (public.is_office_for_client(client_id) and public.can_office_write())
  with check (public.is_office_for_client(client_id) and public.can_office_write());

-- EXPORTS / APPROVAL REQUESTS
drop policy if exists "exports: office insert" on public.exports;
create policy "exports: office insert" on public.exports
  for insert to authenticated
  with check (public.is_office() and public.can_office_write()
              and workspace_id = public.my_workspace_id());
drop policy if exists "approval_requests: office insert" on public.approval_requests;
create policy "approval_requests: office insert" on public.approval_requests
  for insert to authenticated
  with check (public.is_office() and public.can_office_write()
              and workspace_id = public.my_workspace_id());

-- STORAGE "documents": office uploads/deletes need write access
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
    if p_write and not public.can_office_write() then return false; end if;
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
  using (bucket_id = 'documents' and public.is_office()
         and public.can_access_document_path(name, true));

-- ── E. Avatars bucket ──────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = true, file_size_limit = 2097152,
      allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp'];

drop policy if exists "avatars: public read" on storage.objects;
drop policy if exists "avatars: own insert"  on storage.objects;
drop policy if exists "avatars: own update"  on storage.objects;
drop policy if exists "avatars: own delete"  on storage.objects;
create policy "avatars: public read" on storage.objects
  for select using (bucket_id = 'avatars');
create policy "avatars: own insert" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: own update" on storage.objects
  for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "avatars: own delete" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

commit;
