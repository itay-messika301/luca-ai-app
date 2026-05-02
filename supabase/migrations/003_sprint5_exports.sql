-- Sprint 5: Export Center
-- Creates the exports table and adds exported_at / export_id to documents

-- ============================================================
-- 1. exports table
-- ============================================================
create table if not exists public.exports (
  id             uuid primary key default gen_random_uuid(),
  workspace_id   uuid not null references public.workspaces(id) on delete cascade,
  client_id      uuid references public.clients(id) on delete set null,
  period_from    date,
  period_to      date,
  erp_target     text,          -- 'excel' | 'hashavshevet' | 'priority'
  document_count int  not null default 0,
  total_amount   numeric(12,2),
  performed_by   uuid references public.profiles(id) on delete set null,
  status         text not null default 'completed'
                   check (status in ('completed', 'partial', 'failed')),
  notes          text,
  created_at     timestamptz not null default now()
);

-- ============================================================
-- 2. Add export tracking columns to documents
-- ============================================================
alter table public.documents
  add column if not exists exported_at  timestamptz,
  add column if not exists export_id    uuid references public.exports(id) on delete set null;

-- ============================================================
-- 3. Indexes
-- ============================================================
create index if not exists exports_workspace_id_idx on public.exports(workspace_id);
create index if not exists exports_client_id_idx    on public.exports(client_id);
create index if not exists exports_created_at_idx   on public.exports(created_at desc);
create index if not exists documents_export_id_idx  on public.documents(export_id);

-- ============================================================
-- 4. RLS
-- ============================================================
alter table public.exports enable row level security;

-- office users of the same workspace can read exports
create policy "exports_select" on public.exports
  for select using (
    workspace_id = (select workspace_id from public.profiles where id = auth.uid())
  );

-- workspace_owner and accountant can insert exports
create policy "exports_insert" on public.exports
  for insert with check (
    workspace_id = (select workspace_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('workspace_owner', 'accountant')
  );
