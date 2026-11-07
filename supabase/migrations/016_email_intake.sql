-- ============================================================================
-- 016 — Automatic document intake by email (gap #12b, email part)
-- (run after 015)
-- ============================================================================
--   A. workspaces.intake_key — random, unguessable key per office. The office
--      intake address is invoices+<intake_key>@in.luca-ai.io.
--      (Random rather than a UUID prefix, so nobody can guess another office's
--      address and drop files into it.)
--   B. documents.file_hash   — SHA-256 of the file, used to skip the same
--      attachment sent twice (per client, or per workspace while unassigned).
--   C. documents.intake_meta — where an emailed document came from
--      ({ from, subject, received_at, provider, message_id, reason }).
--   D. Fast case-insensitive lookup of clients by intake_email.
--
-- No RLS change is needed:
--   * documents with client_id = null are already visible / editable only to
--     full-access office staff (014/015 policies);
--   * the storage folder {workspace_id}/unassigned/... is likewise only
--     reachable by full-access office staff (can_access_document_path).
--   Assigning a client goes through /api/assign-document (service role),
--   which checks can-write itself and moves the file to the client folder.
-- ============================================================================

begin;

-- ── A. Intake key per workspace ───────────────────────────────────────────
alter table public.workspaces
  add column if not exists intake_key text;

update public.workspaces
   set intake_key = substr(replace(gen_random_uuid()::text, '-', ''), 1, 12)
 where intake_key is null;

alter table public.workspaces
  alter column intake_key set default substr(replace(gen_random_uuid()::text, '-', ''), 1, 12),
  alter column intake_key set not null;

create unique index if not exists workspaces_intake_key_key
  on public.workspaces (intake_key);

-- ── B + C. Document hash and intake metadata ──────────────────────────────
alter table public.documents
  add column if not exists file_hash   text,
  add column if not exists intake_meta jsonb;

create index if not exists documents_workspace_client_hash_idx
  on public.documents (workspace_id, client_id, file_hash)
  where file_hash is not null;

-- ── D. Client lookup by sender address ────────────────────────────────────
create index if not exists clients_workspace_intake_email_idx
  on public.clients (workspace_id, lower(intake_email))
  where intake_email is not null;

commit;
