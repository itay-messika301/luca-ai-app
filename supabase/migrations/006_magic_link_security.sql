-- Migration 006: Magic Link Security
-- Run this in the Supabase SQL editor.
--
-- 1. Allow end_client role in workspace_invitations
-- 2. Create is_email_authorised() function (SECURITY DEFINER — reads auth.users)

-- ── 1. Extend the role CHECK constraint ──────────────────────────────────────
ALTER TABLE public.workspace_invitations
  DROP CONSTRAINT IF EXISTS workspace_invitations_role_check;

ALTER TABLE public.workspace_invitations
  ADD CONSTRAINT workspace_invitations_role_check
  CHECK (role IN ('accountant', 'reviewer', 'end_client'));

-- ── 2. SECURITY DEFINER helper: checks if an email exists in auth.users ──────
--    Called by the send-magic-link API with service_role credentials.
--    Using SECURITY DEFINER so the service_role doesn't need direct SELECT on auth.users.
CREATE OR REPLACE FUNCTION public.is_email_authorised(p_email TEXT)
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = auth, public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM auth.users WHERE email = lower(p_email)
  )
$$;

-- Only the service_role needs to call this from the API layer
GRANT EXECUTE ON FUNCTION public.is_email_authorised(TEXT) TO service_role;
-- Revoke from anon / authenticated to prevent enumeration from the client
REVOKE EXECUTE ON FUNCTION public.is_email_authorised(TEXT) FROM anon, authenticated;
