-- ============================================================================
-- Sprint 17 — Client Contacts + Multi-Client Linkage
-- ============================================================================
-- Purpose:
--   Enable multiple "contact persons" per client (business), and allow a single
--   end_client user to be linked to multiple businesses (1-to-N).
--
-- New tables:
--   1. client_contacts — people who belong to a client business
--   2. user_clients    — junction: which clients a user can access (end_client)
--
-- RLS policies:
--   - office users (workspace_owner/accountant/reviewer) manage contacts of
--     clients in their workspace
--   - end_clients see only the clients they are linked to via user_clients
-- ============================================================================

-- ────────────────────────────────────────────────────────────────────────────
-- 1) client_contacts
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.client_contacts (
  id              uuid primary key default gen_random_uuid(),
  client_id       uuid not null references public.clients(id) on delete cascade,
  full_name       text not null,
  email           text,
  phone           text,
  position        text,
  -- once the contact accepts an invite, this links to their auth.users row
  invited_user_id uuid references auth.users(id) on delete set null,
  invited_at      timestamptz,
  accepted_at     timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists client_contacts_client_idx
  on public.client_contacts(client_id);
create index if not exists client_contacts_user_idx
  on public.client_contacts(invited_user_id);
create index if not exists client_contacts_email_idx
  on public.client_contacts(lower(email));

-- ────────────────────────────────────────────────────────────────────────────
-- 2) user_clients (junction for end_client → N clients)
-- ────────────────────────────────────────────────────────────────────────────
create table if not exists public.user_clients (
  user_id     uuid not null references auth.users(id) on delete cascade,
  client_id   uuid not null references public.clients(id) on delete cascade,
  contact_id  uuid references public.client_contacts(id) on delete set null,
  granted_at  timestamptz not null default now(),
  primary key (user_id, client_id)
);

create index if not exists user_clients_client_idx on public.user_clients(client_id);
create index if not exists user_clients_contact_idx on public.user_clients(contact_id);

-- ────────────────────────────────────────────────────────────────────────────
-- 3) updated_at trigger for client_contacts
-- ────────────────────────────────────────────────────────────────────────────
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists trg_client_contacts_touch on public.client_contacts;
create trigger trg_client_contacts_touch
  before update on public.client_contacts
  for each row execute function public.touch_updated_at();

-- ────────────────────────────────────────────────────────────────────────────
-- 4) RLS — client_contacts
-- ────────────────────────────────────────────────────────────────────────────
alter table public.client_contacts enable row level security;

-- office users see contacts of clients in their workspace
create policy "client_contacts_select_office"
  on public.client_contacts for select
  using (
    exists (
      select 1
      from public.clients c
      join public.profiles p on p.workspace_id = c.workspace_id
      where c.id = client_contacts.client_id
        and p.id = auth.uid()
        and p.role in ('workspace_owner','accountant','reviewer')
    )
  );

-- end_client sees contacts of clients they are linked to (themselves + others
-- in the same business — useful so the end_client knows who else has access)
create policy "client_contacts_select_endclient"
  on public.client_contacts for select
  using (
    exists (
      select 1
      from public.user_clients uc
      where uc.user_id = auth.uid()
        and uc.client_id = client_contacts.client_id
    )
  );

-- only workspace_owner / accountant can write contacts
create policy "client_contacts_write_office"
  on public.client_contacts for all
  using (
    exists (
      select 1
      from public.clients c
      join public.profiles p on p.workspace_id = c.workspace_id
      where c.id = client_contacts.client_id
        and p.id = auth.uid()
        and p.role in ('workspace_owner','accountant')
    )
  )
  with check (
    exists (
      select 1
      from public.clients c
      join public.profiles p on p.workspace_id = c.workspace_id
      where c.id = client_contacts.client_id
        and p.id = auth.uid()
        and p.role in ('workspace_owner','accountant')
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 5) RLS — user_clients
-- ────────────────────────────────────────────────────────────────────────────
alter table public.user_clients enable row level security;

-- the user themselves can see their own access records
create policy "user_clients_select_self"
  on public.user_clients for select
  using (user_id = auth.uid());

-- office users see all access records for clients in their workspace
create policy "user_clients_select_office"
  on public.user_clients for select
  using (
    exists (
      select 1
      from public.clients c
      join public.profiles p on p.workspace_id = c.workspace_id
      where c.id = user_clients.client_id
        and p.id = auth.uid()
        and p.role in ('workspace_owner','accountant','reviewer')
    )
  );

-- only workspace_owner / accountant can grant or revoke access
create policy "user_clients_write_office"
  on public.user_clients for all
  using (
    exists (
      select 1
      from public.clients c
      join public.profiles p on p.workspace_id = c.workspace_id
      where c.id = user_clients.client_id
        and p.id = auth.uid()
        and p.role in ('workspace_owner','accountant')
    )
  )
  with check (
    exists (
      select 1
      from public.clients c
      join public.profiles p on p.workspace_id = c.workspace_id
      where c.id = user_clients.client_id
        and p.id = auth.uid()
        and p.role in ('workspace_owner','accountant')
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 6) Update existing clients.documents RLS for end_client to use user_clients
--    (replace the old single-owner-based policy)
-- ────────────────────────────────────────────────────────────────────────────
-- NOTE: This depends on existing policy names from previous migrations.
-- If any of these drops error out, the existing policies likely have different
-- names — review supabase/migrations/001_sprint1_schema.sql + 007_sprint13_rls_audit.sql
-- and adjust accordingly. Safe-guarded with IF EXISTS.

drop policy if exists "end_client_read_own_clients"   on public.clients;
drop policy if exists "end_client_read_own_documents" on public.documents;

create policy "end_client_read_own_clients_v2"
  on public.clients for select
  using (
    exists (
      select 1
      from public.user_clients uc
      where uc.user_id = auth.uid()
        and uc.client_id = clients.id
    )
    or
    -- backwards-compat: keep old owner_user_id link working until we migrate data
    owner_user_id = auth.uid()
  );

create policy "end_client_read_own_documents_v2"
  on public.documents for select
  using (
    client_id in (
      select uc.client_id from public.user_clients uc where uc.user_id = auth.uid()
      union
      select c.id from public.clients c where c.owner_user_id = auth.uid()
    )
  );

-- ────────────────────────────────────────────────────────────────────────────
-- 7) Helpful comment
-- ────────────────────────────────────────────────────────────────────────────
comment on table public.client_contacts is
  'People who work for a client business. Each contact may be invited to use Luca AI as an end_client.';
comment on table public.user_clients is
  'Junction: a single end_client user can be linked to multiple client businesses.';
