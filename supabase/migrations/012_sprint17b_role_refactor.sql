-- ============================================================================
-- Sprint 17b — Phase B1 — Role refactor + super admin + approval attribution
-- ============================================================================
-- Goals:
--   1. Simplify roles to 4 canonical values:
--        super_admin (flag, not a role)
--        workspace_owner   = paying subscriber, runs the firm
--        workspace_employee = staff of the firm (replaces accountant + reviewer)
--        end_client        = customer of the firm
--   2. Add is_super_admin flag for cross-workspace admin access (1 user — owner of Luca AI)
--   3. Add created_by + description to approval_rules so workspace_owners can
--      track which team member created each rule and why.
-- ============================================================================

-- ---------------------------------------------------------------
-- 1) PROFILES — collapse accountant + reviewer into workspace_employee
-- ---------------------------------------------------------------
alter table public.profiles
  drop constraint if exists profiles_role_check;

-- Transitional CHECK allows old + new values so the UPDATE works
alter table public.profiles
  add constraint profiles_role_check
  check (role in (
    'workspace_owner',
    'workspace_employee',
    'accountant',           -- transitional, removed below
    'reviewer',             -- transitional, removed below
    'end_client'
  ));

update public.profiles
set    role = 'workspace_employee'
where  role in ('accountant', 'reviewer');

-- Narrow the constraint to the final set
alter table public.profiles
  drop constraint profiles_role_check;
alter table public.profiles
  add constraint profiles_role_check
  check (role in ('workspace_owner', 'workspace_employee', 'end_client'));


-- ---------------------------------------------------------------
-- 2) WORKSPACE_INVITATIONS — same role collapse
-- ---------------------------------------------------------------
alter table public.workspace_invitations
  drop constraint if exists workspace_invitations_role_check;

alter table public.workspace_invitations
  add constraint workspace_invitations_role_check
  check (role in (
    'workspace_employee',
    'accountant',
    'reviewer',
    'end_client'
  ));

update public.workspace_invitations
set    role = 'workspace_employee'
where  role in ('accountant', 'reviewer');

alter table public.workspace_invitations
  drop constraint workspace_invitations_role_check;
alter table public.workspace_invitations
  add constraint workspace_invitations_role_check
  check (role in ('workspace_employee', 'end_client'));


-- ---------------------------------------------------------------
-- 3) IS_SUPER_ADMIN flag on profiles
-- ---------------------------------------------------------------
alter table public.profiles
  add column if not exists is_super_admin boolean not null default false;

comment on column public.profiles.is_super_admin is
  'When true the user can view (read-only) all workspaces in the system. Set this manually for the Luca AI administrator only.';


-- ---------------------------------------------------------------
-- 4) APPROVAL_RULES — attribution + description
-- ---------------------------------------------------------------
alter table public.approval_rules
  add column if not exists created_by uuid references auth.users(id) on delete set null,
  add column if not exists description text;

comment on column public.approval_rules.created_by is
  'The user (workspace_owner or employee) that created the rule. Used for audit display in Settings.';
comment on column public.approval_rules.description is
  'Free-text explanation of WHY this rule exists. Displayed alongside the rule in Settings.';


-- ---------------------------------------------------------------
-- 5) APPROVAL_RULES.stages — migrate "accountant" / "reviewer" → "workspace_employee"
-- ---------------------------------------------------------------
update public.approval_rules
set    stages = (
  select jsonb_agg(
    case
      when stage->>'role' in ('accountant', 'reviewer')
      then jsonb_set(stage, '{role}', '"workspace_employee"'::jsonb)
      else stage
    end
  )
  from jsonb_array_elements(stages) as stage
)
where  stages::text like '%"accountant"%' or stages::text like '%"reviewer"%';


-- ---------------------------------------------------------------
-- 6) Helper function for is_super_admin checks in RLS
-- ---------------------------------------------------------------
create or replace function public.is_super_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select is_super_admin from public.profiles where id = auth.uid()),
    false
  );
$$;

revoke all on function public.is_super_admin() from public;
grant  execute on function public.is_super_admin() to authenticated;

comment on function public.is_super_admin() is
  'Returns true if the calling user has is_super_admin=true. Use in RLS policies to grant cross-workspace read access.';


-- ---------------------------------------------------------------
-- 7) Replace RLS policies that referenced old roles ('accountant', 'reviewer')
--    Office actions are now allowed for both workspace_owner + workspace_employee.
--    Super admin is granted SELECT (read-only) across all workspaces.
-- ---------------------------------------------------------------

-- ---- CLIENTS ----
drop policy if exists "clients: accountant and owner can insert"  on public.clients;
drop policy if exists "clients: accountant and owner can update"  on public.clients;

create policy "clients: office staff can insert"
  on public.clients for insert to authenticated
  with check (
    workspace_id = public.my_workspace_id()
    and public.my_role() in ('workspace_owner','workspace_employee')
  );

create policy "clients: office staff can update"
  on public.clients for update to authenticated
  using (
    workspace_id = public.my_workspace_id()
    and public.my_role() in ('workspace_owner','workspace_employee')
  );

drop policy if exists "clients: super_admin can read all" on public.clients;
create policy "clients: super_admin can read all"
  on public.clients for select to authenticated
  using (public.is_super_admin());


-- ---- DOCUMENTS ----
drop policy if exists "documents: accountant and owner can insert"      on public.documents;
drop policy if exists "documents: accountant and owner can update"      on public.documents;
drop policy if exists "documents: reviewer can read and update review_status" on public.documents;
drop policy if exists "documents: owner and accountant can delete"      on public.documents;
drop policy if exists "documents: office staff can read"                on public.documents;

create policy "documents: office staff can insert"
  on public.documents for insert to authenticated
  with check (
    workspace_id = public.my_workspace_id()
    and public.my_role() in ('workspace_owner','workspace_employee')
  );

create policy "documents: office staff can update"
  on public.documents for update to authenticated
  using (
    workspace_id = public.my_workspace_id()
    and public.my_role() in ('workspace_owner','workspace_employee')
  );

create policy "documents: office staff can delete"
  on public.documents for delete to authenticated
  using (
    workspace_id = public.my_workspace_id()
    and public.my_role() in ('workspace_owner','workspace_employee')
  );

create policy "documents: office staff can read"
  on public.documents for select to authenticated
  using (
    workspace_id = public.my_workspace_id()
    and public.my_role() in ('workspace_owner','workspace_employee')
  );

drop policy if exists "documents: super_admin can read all" on public.documents;
create policy "documents: super_admin can read all"
  on public.documents for select to authenticated
  using (public.is_super_admin());


-- ---- AUDIT_LOG ----
drop policy if exists "audit_log: office can read"   on public.audit_log;
drop policy if exists "audit_log: office can insert" on public.audit_log;

create policy "audit_log: office can read"
  on public.audit_log for select to authenticated
  using (
    workspace_id = public.my_workspace_id()
    and public.my_role() in ('workspace_owner','workspace_employee')
  );

create policy "audit_log: office can insert"
  on public.audit_log for insert to authenticated
  with check (
    workspace_id = public.my_workspace_id()
    and public.my_role() in ('workspace_owner','workspace_employee')
  );

drop policy if exists "audit_log: super_admin can read all" on public.audit_log;
create policy "audit_log: super_admin can read all"
  on public.audit_log for select to authenticated
  using (public.is_super_admin());


-- ---- PROFILES super-admin visibility ----
drop policy if exists "profiles: super_admin can read all" on public.profiles;
create policy "profiles: super_admin can read all"
  on public.profiles for select to authenticated
  using (public.is_super_admin());


-- ---- WORKSPACES super-admin visibility ----
drop policy if exists "workspaces: super_admin can read all" on public.workspaces;
create policy "workspaces: super_admin can read all"
  on public.workspaces for select to authenticated
  using (public.is_super_admin());
