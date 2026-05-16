-- =============================================================
-- Sprint 13 — RLS Audit & Hardening
-- Closes gaps in the existing policies:
--   1. DELETE policies on documents and clients (were missing entirely)
--   2. End-client scoping: end_client should only see/insert/update
--      documents and clients that belong to THEIR client record.
--   3. Documents reviewer UPDATE policy was missing a check on the
--      column-list — left as-is; reviewers can still update review_status.
--   4. End-client INSERT on documents (uploads via ClientUpload page).
-- Run this in Supabase SQL Editor.
-- =============================================================

-- ─────────────────────────────────────────────────────────────
-- 0. Helper: is_my_client(client_id)
--    Returns TRUE if the given client_id belongs to the caller
--    (end_client whose owner_user_id matches auth.uid()).
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.is_my_client(p_client_id UUID)
RETURNS BOOLEAN
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clients
    WHERE id = p_client_id AND owner_user_id = auth.uid()
  )
$$;
GRANT EXECUTE ON FUNCTION public.is_my_client(UUID) TO authenticated;

-- ─────────────────────────────────────────────────────────────
-- 1. DOCUMENTS — DELETE policy (was missing)
--    Only workspace_owner and accountant may delete documents.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "documents: owner and accountant can delete" ON public.documents;
CREATE POLICY "documents: owner and accountant can delete"
  ON public.documents FOR DELETE
  USING (
    workspace_id = public.my_workspace_id()
    AND public.my_role() IN ('workspace_owner','accountant')
  );

-- ─────────────────────────────────────────────────────────────
-- 2. CLIENTS — DELETE policy (was missing)
--    Only workspace_owner may delete a client (hard-delete).
--    Soft-delete (archived_at) goes through UPDATE which is already covered.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "clients: owner can delete" ON public.clients;
CREATE POLICY "clients: owner can delete"
  ON public.clients FOR DELETE
  USING (
    workspace_id = public.my_workspace_id()
    AND public.my_role() = 'workspace_owner'
  );

-- ─────────────────────────────────────────────────────────────
-- 3. END-CLIENT scoped policies on DOCUMENTS
--    The existing "workspace members can read" policy lets ALL members
--    (including end_client) read every document in the workspace.
--    That is wrong: end_client should only see docs of their own client.
--    We replace it with role-aware policies.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "documents: workspace members can read" ON public.documents;

-- office staff (owner/accountant/reviewer) see all docs in workspace
CREATE POLICY "documents: office staff can read all workspace docs"
  ON public.documents FOR SELECT
  USING (
    workspace_id = public.my_workspace_id()
    AND public.my_role() IN ('workspace_owner','accountant','reviewer')
  );

-- end_client only sees docs of their own client
CREATE POLICY "documents: end_client can read own docs"
  ON public.documents FOR SELECT
  USING (
    public.my_role() = 'end_client'
    AND public.is_my_client(client_id)
  );

-- end_client may upload docs for their own client (ClientUpload page)
DROP POLICY IF EXISTS "documents: end_client can insert own docs" ON public.documents;
CREATE POLICY "documents: end_client can insert own docs"
  ON public.documents FOR INSERT
  WITH CHECK (
    public.my_role() = 'end_client'
    AND public.is_my_client(client_id)
    AND workspace_id IN (
      SELECT workspace_id FROM public.clients WHERE id = client_id
    )
  );

-- ─────────────────────────────────────────────────────────────
-- 4. END-CLIENT scoped policy on CLIENTS
--    Currently "clients: workspace members can read" lets end_clients
--    see every client in the workspace. Restrict end_clients to their
--    own record.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "clients: workspace members can read" ON public.clients;

CREATE POLICY "clients: office staff can read all"
  ON public.clients FOR SELECT
  USING (
    workspace_id = public.my_workspace_id()
    AND public.my_role() IN ('workspace_owner','accountant','reviewer')
  );

CREATE POLICY "clients: end_client can read own"
  ON public.clients FOR SELECT
  USING (
    public.my_role() = 'end_client'
    AND owner_user_id = auth.uid()
  );

-- ─────────────────────────────────────────────────────────────
-- 5. AUDIT_LOG — INSERT policy was workspace-scoped only;
--    leave SELECT as-is (workspace members) but ensure end_clients
--    cannot read sensitive audit entries.
-- ─────────────────────────────────────────────────────────────
DROP POLICY IF EXISTS "audit_log: workspace members can read" ON public.audit_log;
CREATE POLICY "audit_log: office staff can read"
  ON public.audit_log FOR SELECT
  USING (
    workspace_id = public.my_workspace_id()
    AND public.my_role() IN ('workspace_owner','accountant','reviewer')
  );

-- ─────────────────────────────────────────────────────────────
-- 6. Diagnostic view (for QA): which policies exist on each table.
--    Read-only; safe to leave in production.
-- ─────────────────────────────────────────────────────────────
CREATE OR REPLACE VIEW public.v_rls_policies AS
  SELECT schemaname, tablename, policyname, cmd, roles, qual, with_check
  FROM pg_policies
  WHERE schemaname = 'public'
  ORDER BY tablename, cmd, policyname;
GRANT SELECT ON public.v_rls_policies TO authenticated;
