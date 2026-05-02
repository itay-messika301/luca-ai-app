-- Sprint 2: Staff Invitation & Team Management
-- workspace_invitations table + RLS policies

-- Create workspace_invitations table
CREATE TABLE IF NOT EXISTS public.workspace_invitations (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id  uuid NOT NULL REFERENCES public.workspaces(id) ON DELETE CASCADE,
  email         text NOT NULL,
  role          text NOT NULL CHECK (role IN ('accountant', 'reviewer')),
  token         uuid NOT NULL DEFAULT gen_random_uuid() UNIQUE,
  status        text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'expired', 'cancelled')),
  invited_by    uuid REFERENCES auth.users(id),
  expires_at    timestamptz NOT NULL DEFAULT (now() + interval '7 days'),
  accepted_at   timestamptz,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- Index for token lookup (used when accepting invitation)
CREATE INDEX IF NOT EXISTS workspace_invitations_token_idx ON public.workspace_invitations(token);
-- Index for workspace lookup
CREATE INDEX IF NOT EXISTS workspace_invitations_workspace_idx ON public.workspace_invitations(workspace_id);
-- Index for email lookup
CREATE INDEX IF NOT EXISTS workspace_invitations_email_idx ON public.workspace_invitations(email);

-- Enable RLS
ALTER TABLE public.workspace_invitations ENABLE ROW LEVEL SECURITY;

-- Helper: get current user's workspace_id
CREATE OR REPLACE FUNCTION public.my_workspace_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT workspace_id FROM public.profiles WHERE id = auth.uid()
$$;

-- Helper: get current user's role
CREATE OR REPLACE FUNCTION public.my_role()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT role FROM public.profiles WHERE id = auth.uid()
$$;

-- RLS: workspace_owner can see/manage all invitations for their workspace
CREATE POLICY "workspace_owner_manage_invitations" ON public.workspace_invitations
  FOR ALL
  USING (
    workspace_id = public.my_workspace_id()
    AND public.my_role() = 'workspace_owner'
  );

-- RLS: anyone can read an invitation by token (for accept-invitation page, unauthenticated)
CREATE POLICY "public_read_by_token" ON public.workspace_invitations
  FOR SELECT
  USING (status = 'pending' AND expires_at > now());

-- RLS: authenticated users can update their own invitation (to accept it)
CREATE POLICY "user_accept_own_invitation" ON public.workspace_invitations
  FOR UPDATE
  USING (email = (SELECT email FROM auth.users WHERE id = auth.uid()))
  WITH CHECK (status = 'accepted');
