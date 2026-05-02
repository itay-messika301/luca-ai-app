-- =============================================================
-- Sprint 1 Migration — Fresh Start Schema
-- Run this in Supabase SQL Editor (Dashboard → SQL Editor)
-- =============================================================

-- ---------------------------------------------------------------
-- 0. DROP OLD TABLES (fresh start)
-- ---------------------------------------------------------------
DROP TABLE IF EXISTS documents CASCADE;
DROP TABLE IF EXISTS clients CASCADE;
DROP TABLE IF EXISTS profiles CASCADE;

-- ---------------------------------------------------------------
-- 1. WORKSPACES
-- ---------------------------------------------------------------
CREATE TABLE workspaces (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT        NOT NULL,
  phone         TEXT,
  plan          TEXT        NOT NULL DEFAULT 'starter'
                            CHECK (plan IN ('starter', 'growth', 'scale')),
  logo_url      TEXT,
  owner_id      UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 2. PROFILES (replaces old table)
-- ---------------------------------------------------------------
CREATE TABLE profiles (
  id            UUID        PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name     TEXT,
  avatar_url    TEXT,
  role          TEXT        NOT NULL DEFAULT 'end_client'
                            CHECK (role IN ('workspace_owner','accountant','reviewer','end_client')),
  workspace_id  UUID        REFERENCES workspaces(id) ON DELETE SET NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 3. AUTO-CREATE PROFILE ON SIGNUP (trigger)
-- ---------------------------------------------------------------
CREATE OR REPLACE FUNCTION handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name'),
    NEW.raw_user_meta_data->>'avatar_url'
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION handle_new_user();

-- ---------------------------------------------------------------
-- 4. CLIENTS
-- ---------------------------------------------------------------
CREATE TABLE clients (
  id                      UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id            UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  registration_number     TEXT        NOT NULL,
  business_name           TEXT        NOT NULL,
  owner_name              TEXT,
  reporting_cycle         TEXT        NOT NULL DEFAULT 'monthly'
                                      CHECK (reporting_cycle IN ('monthly','bimonthly')),
  assigned_accountant_id  UUID        REFERENCES profiles(id) ON DELETE SET NULL,
  owner_user_id           UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  archived_at             TIMESTAMPTZ,
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  -- registration_number unique per workspace
  UNIQUE (workspace_id, registration_number)
);

-- ---------------------------------------------------------------
-- 5. DOCUMENTS
-- ---------------------------------------------------------------
CREATE TABLE documents (
  id                        UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id              UUID        NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
  client_id                 UUID        REFERENCES clients(id) ON DELETE SET NULL,
  -- storage
  file_name                 TEXT        NOT NULL,
  file_path                 TEXT        NOT NULL,
  file_size                 BIGINT,
  file_type                 TEXT,
  -- status
  status                    TEXT        NOT NULL DEFAULT 'pending'
                                        CHECK (status IN ('pending','processing','processed','error')),
  review_status             TEXT        CHECK (review_status IN ('ready','needs_review','blocked')),
  -- AI extraction
  document_type             TEXT,
  invoice_number            TEXT,
  invoice_date              DATE,
  vendor_name               TEXT,
  vendor_registration_number TEXT,
  amount_before_vat         NUMERIC(15,2),
  vat_rate                  NUMERIC(5,2),
  vat_amount                NUMERIC(15,2),
  total_amount              NUMERIC(15,2),
  withholding_tax           NUMERIC(15,2),
  currency                  TEXT        DEFAULT 'ILS',
  allocation_number         TEXT,
  allocation_validated      BOOLEAN     DEFAULT FALSE,
  is_duplicate              BOOLEAN     DEFAULT FALSE,
  field_confidence          JSONB       DEFAULT '{}',
  validation_results        JSONB       DEFAULT '{}',
  -- review
  review_notes              TEXT,
  reviewed_by               UUID        REFERENCES profiles(id),
  reviewed_at               TIMESTAMPTZ,
  -- export
  exported_at               TIMESTAMPTZ,
  export_id                 UUID,
  -- meta
  uploaded_by               UUID        REFERENCES profiles(id),
  source_channel            TEXT        DEFAULT 'portal'
                                        CHECK (source_channel IN ('portal','whatsapp','email')),
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 6. AUDIT LOG
-- ---------------------------------------------------------------
CREATE TABLE audit_log (
  id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  UUID        REFERENCES workspaces(id) ON DELETE SET NULL,
  user_id       UUID        REFERENCES auth.users(id) ON DELETE SET NULL,
  entity_type   TEXT        NOT NULL,  -- 'document' | 'client' | 'user' | 'export'
  entity_id     UUID,
  action        TEXT        NOT NULL,  -- 'edit_field' | 'override' | 'reject' | 'export' | ...
  old_value     JSONB,
  new_value     JSONB,
  note          TEXT,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ---------------------------------------------------------------
-- 7. ROW LEVEL SECURITY
-- ---------------------------------------------------------------

-- Enable RLS on all tables
ALTER TABLE workspaces      ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles        ENABLE ROW LEVEL SECURITY;
ALTER TABLE clients         ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents       ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_log       ENABLE ROW LEVEL SECURITY;

-- Helper function: get the caller's workspace_id
CREATE OR REPLACE FUNCTION my_workspace_id()
RETURNS UUID
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Helper function: get the caller's role
CREATE OR REPLACE FUNCTION my_role()
RETURNS TEXT
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- WORKSPACES
CREATE POLICY "workspace: members can read own workspace"
  ON workspaces FOR SELECT
  USING (id = my_workspace_id());

CREATE POLICY "workspace: owner can update"
  ON workspaces FOR UPDATE
  USING (owner_id = auth.uid());

CREATE POLICY "workspace: allow insert during onboarding"
  ON workspaces FOR INSERT
  WITH CHECK (owner_id = auth.uid());

-- PROFILES
CREATE POLICY "profiles: user can read own profile"
  ON profiles FOR SELECT
  USING (id = auth.uid());

CREATE POLICY "profiles: workspace members can read each other"
  ON profiles FOR SELECT
  USING (workspace_id = my_workspace_id());

CREATE POLICY "profiles: user can update own profile"
  ON profiles FOR UPDATE
  USING (id = auth.uid());

CREATE POLICY "profiles: workspace_owner can update team members"
  ON profiles FOR UPDATE
  USING (workspace_id = my_workspace_id() AND my_role() = 'workspace_owner');

-- CLIENTS
CREATE POLICY "clients: workspace members can read"
  ON clients FOR SELECT
  USING (workspace_id = my_workspace_id());

CREATE POLICY "clients: accountant and owner can insert"
  ON clients FOR INSERT
  WITH CHECK (
    workspace_id = my_workspace_id()
    AND my_role() IN ('workspace_owner','accountant')
  );

CREATE POLICY "clients: accountant and owner can update"
  ON clients FOR UPDATE
  USING (
    workspace_id = my_workspace_id()
    AND my_role() IN ('workspace_owner','accountant')
  );

-- DOCUMENTS
CREATE POLICY "documents: workspace members can read"
  ON documents FOR SELECT
  USING (workspace_id = my_workspace_id());

CREATE POLICY "documents: accountant and owner can insert"
  ON documents FOR INSERT
  WITH CHECK (
    workspace_id = my_workspace_id()
    AND my_role() IN ('workspace_owner','accountant')
  );

CREATE POLICY "documents: accountant and owner can update"
  ON documents FOR UPDATE
  USING (
    workspace_id = my_workspace_id()
    AND my_role() IN ('workspace_owner','accountant')
  );

CREATE POLICY "documents: reviewer can read and update review_status"
  ON documents FOR UPDATE
  USING (
    workspace_id = my_workspace_id()
    AND my_role() = 'reviewer'
  );

-- AUDIT LOG
CREATE POLICY "audit_log: workspace members can read"
  ON audit_log FOR SELECT
  USING (workspace_id = my_workspace_id());

CREATE POLICY "audit_log: system can insert"
  ON audit_log FOR INSERT
  WITH CHECK (workspace_id = my_workspace_id());

-- ---------------------------------------------------------------
-- 8. STORAGE BUCKET (run separately if needed)
-- ---------------------------------------------------------------
-- In Supabase Dashboard → Storage → Create bucket named "documents"
-- Set bucket to private (not public)
-- The following storage policy allows workspace members to access files:
--
-- INSERT INTO storage.policies (name, bucket_id, definition)
-- VALUES (
--   'workspace members can upload',
--   'documents',
--   '(bucket_id = ''documents'' AND auth.uid() IS NOT NULL)'
-- );
