-- ============================================================================
-- Sprint 16 — Mock Documents Seed (creates dedicated test client + 5 docs)
-- ============================================================================
-- Approach decided 2026-05-16: production DB has only real customer clients,
-- so we create a DEDICATED test client per workspace and put the mocks under
-- it. This isolates QA data and makes cleanup trivial.
--
-- WHAT THIS SCRIPT DOES (single transaction):
--   1. Inserts a client named '__TEST__ Sprint16 QA' under the given workspace
--      (or returns the existing one if already created — idempotent).
--   2. Inserts 5 mock documents under that test client with status='processed'
--      and pre-populated extracted fields (simulating successful AI extraction).
--
-- ALL inserted rows are tagged for easy cleanup:
--   - client.business_name LIKE '__TEST__ Sprint16%'
--   - documents.notes      LIKE '[Sprint16-Mock%'
--
-- USAGE (Supabase SQL Editor):
--   1. Replace PASTE_WORKSPACE_ID below with your workspace UUID.
--   2. Run.
--   3. The last SELECT shows the 5 seeded documents + the test client id.
-- ============================================================================

\set workspace_id '\'PASTE_WORKSPACE_ID\''

DO $$
BEGIN
  IF :'workspace_id' = '''PASTE_WORKSPACE_ID''' THEN
    RAISE EXCEPTION 'Replace PASTE_WORKSPACE_ID at the top.';
  END IF;
END$$;

BEGIN;

-- ────────────────────────────────────────────────────────────────────────────
-- Step 1 — Get-or-create the dedicated test client
-- ────────────────────────────────────────────────────────────────────────────
WITH ins AS (
  INSERT INTO public.clients (workspace_id, registration_number, business_name, owner_name, reporting_cycle)
  SELECT :workspace_id, '000000016', '__TEST__ Sprint16 QA', 'QA Bot', 'monthly'
  WHERE NOT EXISTS (
    SELECT 1 FROM public.clients
    WHERE workspace_id = :workspace_id AND business_name = '__TEST__ Sprint16 QA'
  )
  RETURNING id
),
test_client AS (
  SELECT id FROM ins
  UNION ALL
  SELECT id FROM public.clients
  WHERE workspace_id = :workspace_id AND business_name = '__TEST__ Sprint16 QA'
  LIMIT 1
)

-- ────────────────────────────────────────────────────────────────────────────
-- Step 2 — Insert 5 mock documents (D1-D5) under the test client
-- ────────────────────────────────────────────────────────────────────────────
INSERT INTO public.documents (
  workspace_id, client_id, status, review_status,
  file_name, file_path, file_size, file_type,
  document_type, invoice_number, invoice_date,
  vendor_name, vendor_registration_number,
  amount_before_vat, vat_rate, vat_amount, total_amount, currency,
  allocation_number, allocation_validated, is_duplicate,
  field_confidence, validation_results,
  source_channel, notes
)
SELECT :workspace_id, tc.id, v.status, v.review_status,
       v.file_name, v.file_path, v.file_size, v.file_type,
       v.document_type, v.invoice_number, v.invoice_date::date,
       v.vendor_name, v.vendor_registration_number,
       v.amount_before_vat, v.vat_rate, v.vat_amount, v.total_amount, v.currency,
       v.allocation_number, v.allocation_validated, v.is_duplicate,
       v.field_confidence::jsonb, v.validation_results::jsonb,
       v.source_channel, v.notes
FROM test_client tc, (VALUES
  -- D1 — Small invoice, happy path
  ('processed', 'needs_review',
   'D1_invoice_small_office_supplies.pdf', 'mock/sprint16/D1_invoice_small.pdf', 124500, 'pdf',
   'invoice', 'INV-2026-00187', '2026-04-12',
   'אופיס דיפו בע"מ', '512345671',
   1000.00, 18, 180.00, 1180.00, 'ILS',
   NULL, false, false,
   '{"invoice_number":0.97,"invoice_date":0.95,"vendor_name":0.96,"amounts":0.98,"allocation_number":1.0,"overall":0.95}',
   '{"description":"מסמך תקין","issues":[],"blocking":false,"needs_review":false}',
   'portal', '[Sprint16-Mock D1] Small invoice — happy path'),

  -- D2 — Large invoice WITH valid allocation number
  ('processed', 'needs_review',
   'D2_invoice_large_consulting_with_allocation.pdf', 'mock/sprint16/D2_invoice_large_with_alloc.pdf', 287340, 'pdf',
   'invoice', 'INV-2026-00412', '2026-04-22',
   'יועצי טכנולוגיה אלפא בע"מ', '513987654',
   10000.00, 18, 1800.00, 11800.00, 'ILS',
   'AL-2026-9182374', true, false,
   '{"invoice_number":0.94,"invoice_date":0.93,"vendor_name":0.95,"amounts":0.97,"allocation_number":0.96,"overall":0.92}',
   '{"description":"חשבונית גדולה עם מספר הקצאה תקין","issues":[],"blocking":false,"needs_review":false}',
   'portal', '[Sprint16-Mock D2] Large invoice with valid allocation'),

  -- D3 — Large invoice WITHOUT allocation number → BLOCKED
  ('processed', 'blocked',
   'D3_invoice_large_NO_allocation.pdf', 'mock/sprint16/D3_invoice_no_alloc.pdf', 198220, 'pdf',
   'invoice', 'INV-2026-00509', '2026-04-25',
   'שירותי הדפסה ועיצוב בע"מ', '514567890',
   6000.00, 18, 1080.00, 7080.00, 'ILS',
   NULL, false, false,
   '{"invoice_number":0.91,"invoice_date":0.93,"vendor_name":0.89,"amounts":0.94,"allocation_number":0.0,"overall":0.88}',
   '{"description":"חשבונית מעל ₪5000 ללא מספר הקצאה","issues":["חשבונית מעל ₪5000 — נדרש מספר הקצאה"],"blocking":true,"needs_review":true}',
   'portal', '[Sprint16-Mock D3] Large invoice — missing allocation (BLOCKED)'),

  -- D4 — Receipt with LOW confidence
  ('processed', 'needs_review',
   'D4_receipt_low_confidence_blurry.jpg', 'mock/sprint16/D4_receipt_blurry.jpg', 84230, 'jpg',
   'receipt', 'R-77234', '2026-04-18',
   'תחנת דלק מרכזית', NULL,
   350.00, 18, 63.00, 413.00, 'ILS',
   NULL, false, false,
   '{"invoice_number":0.41,"invoice_date":0.55,"vendor_name":0.62,"amounts":0.48,"allocation_number":1.0,"overall":0.45}',
   '{"description":"איכות סריקה נמוכה","issues":["רמת ביטחון כללית נמוכה (45%)","סכומים מטושטשים — נדרשת בדיקה ידנית"],"blocking":false,"needs_review":true}',
   'whatsapp', '[Sprint16-Mock D4] Low confidence receipt — should be REJECTED in QA'),

  -- D5 — DUPLICATE of D1 (same vendor + invoice_number)
  ('processed', 'needs_review',
   'D5_invoice_DUPLICATE_of_D1.pdf', 'mock/sprint16/D5_duplicate.pdf', 124900, 'pdf',
   'invoice', 'INV-2026-00187', '2026-04-12',
   'אופיס דיפו בע"מ', '512345671',
   1000.00, 18, 180.00, 1180.00, 'ILS',
   NULL, false, true,
   '{"invoice_number":0.96,"invoice_date":0.94,"vendor_name":0.97,"amounts":0.96,"allocation_number":1.0,"overall":0.90}',
   '{"description":"חשבונית כפולה זוהתה","issues":["חשבונית כפולה — אופיס דיפו בע\"מ/INV-2026-00187"],"blocking":false,"needs_review":true}',
   'email', '[Sprint16-Mock D5] Duplicate of D1 — same vendor + invoice number')
) AS v(
  status, review_status,
  file_name, file_path, file_size, file_type,
  document_type, invoice_number, invoice_date,
  vendor_name, vendor_registration_number,
  amount_before_vat, vat_rate, vat_amount, total_amount, currency,
  allocation_number, allocation_validated, is_duplicate,
  field_confidence, validation_results,
  source_channel, notes
);

COMMIT;

-- ────────────────────────────────────────────────────────────────────────────
-- Verify
-- ────────────────────────────────────────────────────────────────────────────
SELECT d.file_name, d.status, d.review_status, d.total_amount,
       d.is_duplicate, (d.validation_results->>'blocking')::boolean AS blocking,
       c.business_name AS client
FROM public.documents d
JOIN public.clients c ON c.id = d.client_id
WHERE d.workspace_id = :workspace_id
  AND d.notes LIKE '[Sprint16-Mock%'
ORDER BY d.file_name;
