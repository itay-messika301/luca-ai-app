-- ============================================================================
-- Sprint 16 — Mock Documents Cleanup
-- ============================================================================
-- Removes everything inserted by sprint16_mock_documents.sql:
--   1) audit_log rows for those documents
--   2) approval_requests for those documents
--   3) the documents themselves (notes LIKE '[Sprint16-Mock%')
--   4) the dedicated test client (business_name = '__TEST__ Sprint16 QA')
-- ============================================================================

\set workspace_id '\'PASTE_WORKSPACE_ID\''

DO $$
BEGIN
  IF :'workspace_id' = '''PASTE_WORKSPACE_ID''' THEN
    RAISE EXCEPTION 'Replace PASTE_WORKSPACE_ID at the top.';
  END IF;
END$$;

BEGIN;

-- 1. audit_log for those documents
DELETE FROM public.audit_log
WHERE entity_type = 'document'
  AND entity_id IN (
    SELECT id FROM public.documents
    WHERE workspace_id = :workspace_id AND notes LIKE '[Sprint16-Mock%'
  );

-- 2. approval_requests
DELETE FROM public.approval_requests
WHERE document_id IN (
  SELECT id FROM public.documents
  WHERE workspace_id = :workspace_id AND notes LIKE '[Sprint16-Mock%'
);

-- 3. documents
DELETE FROM public.documents
WHERE workspace_id = :workspace_id
  AND notes LIKE '[Sprint16-Mock%';

-- 4. the test client itself
DELETE FROM public.clients
WHERE workspace_id = :workspace_id
  AND business_name = '__TEST__ Sprint16 QA'
RETURNING business_name;

COMMIT;
