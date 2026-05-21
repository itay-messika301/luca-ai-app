-- ============================================================================
-- Sprint 17b — Phase A1 — Fix #4
-- Issue: ValidationTab / ApprovalsTab / ERPTab all read/write
-- workspaces.settings JSONB column that was never created.
-- Resulting error: "Could not find the 'settings' column of 'workspaces'"
--
-- Fix: add the column with a default empty object so existing rows are valid.
-- Shape of settings:
--   {
--     "validation": { "allocation_threshold": 5000, "dupe_sensitivity": "vendor_invoice" },
--     "erp":        { "hashavshevet_url": "...", "priority_url": "...", ... }
--   }
-- ============================================================================

alter table public.workspaces
  add column if not exists settings jsonb not null default '{}'::jsonb;

comment on column public.workspaces.settings is
  'Workspace-level configuration (validation thresholds, ERP credentials, etc).';
