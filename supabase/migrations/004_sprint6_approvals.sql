-- Sprint 6: Approval Workflow

-- ============================================================
-- 1. approval_rules  — configurable per workspace
-- ============================================================
create table if not exists public.approval_rules (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  name            text not null,
  trigger_type    text not null default 'amount_threshold'
                    check (trigger_type in ('amount_threshold', 'always')),
  threshold_amount numeric(12,2),    -- used when trigger_type='amount_threshold'
  stages          jsonb not null default '[]'::jsonb,
  -- stages example: [{"role":"reviewer","timeout_hours":48},{"role":"workspace_owner","timeout_hours":24}]
  is_active       boolean not null default true,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- ============================================================
-- 2. approval_requests  — per-document, per-stage
-- ============================================================
create table if not exists public.approval_requests (
  id              uuid primary key default gen_random_uuid(),
  workspace_id    uuid not null references public.workspaces(id) on delete cascade,
  document_id     uuid not null references public.documents(id) on delete cascade,
  rule_id         uuid references public.approval_rules(id) on delete set null,
  stage           int  not null default 0,    -- 0-based index into rule.stages
  assigned_to     uuid references public.profiles(id) on delete set null,
  status          text not null default 'pending'
                    check (status in ('pending', 'approved', 'rejected', 'escalated', 'cancelled')),
  comment         text,
  created_at      timestamptz not null default now(),
  actioned_at     timestamptz,
  escalate_at     timestamptz   -- auto-escalate time
);

-- ============================================================
-- 3. Add approval columns to documents
-- ============================================================
alter table public.documents
  add column if not exists approval_status text
    check (approval_status in ('none','pending','approved','rejected'))
    default 'none',
  add column if not exists approval_request_id uuid
    references public.approval_requests(id) on delete set null;

-- ============================================================
-- 4. Indexes
-- ============================================================
create index if not exists approval_rules_workspace_idx    on public.approval_rules(workspace_id);
create index if not exists approval_requests_workspace_idx on public.approval_requests(workspace_id);
create index if not exists approval_requests_document_idx  on public.approval_requests(document_id);
create index if not exists approval_requests_assigned_idx  on public.approval_requests(assigned_to);
create index if not exists approval_requests_status_idx    on public.approval_requests(status);

-- ============================================================
-- 5. RLS
-- ============================================================
alter table public.approval_rules    enable row level security;
alter table public.approval_requests enable row level security;

-- approval_rules: office users can read; only workspace_owner can write
create policy "approval_rules_select" on public.approval_rules
  for select using (
    workspace_id = (select workspace_id from public.profiles where id = auth.uid())
  );

create policy "approval_rules_insert" on public.approval_rules
  for insert with check (
    workspace_id = (select workspace_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'workspace_owner'
  );

create policy "approval_rules_update" on public.approval_rules
  for update using (
    workspace_id = (select workspace_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) = 'workspace_owner'
  );

-- approval_requests: office users of same workspace can read
create policy "approval_requests_select" on public.approval_requests
  for select using (
    workspace_id = (select workspace_id from public.profiles where id = auth.uid())
  );

-- accountants/workspace_owners can create
create policy "approval_requests_insert" on public.approval_requests
  for insert with check (
    workspace_id = (select workspace_id from public.profiles where id = auth.uid())
    and (select role from public.profiles where id = auth.uid()) in ('workspace_owner', 'accountant')
  );

-- assigned reviewer or workspace_owner can update (approve/reject)
create policy "approval_requests_update" on public.approval_requests
  for update using (
    workspace_id = (select workspace_id from public.profiles where id = auth.uid())
    and (
      assigned_to = auth.uid()
      or (select role from public.profiles where id = auth.uid()) = 'workspace_owner'
    )
  );
