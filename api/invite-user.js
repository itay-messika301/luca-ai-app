import { createClient } from '@supabase/supabase-js'

// Vercel serverless function: POST /api/invite-user
// Body: { email, role, workspaceId, workspaceName, inviterName }
// Auth: Bearer token in Authorization header (workspace_owner only)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' })
  }
  const accessToken = authHeader.slice(7)

  const { email, role, workspaceId, workspaceName, inviterName } = req.body
  if (!email || !role || !workspaceId) {
    return res.status(400).json({ error: 'Missing required fields: email, role, workspaceId' })
  }
  if (!['accountant', 'reviewer'].includes(role)) {
    return res.status(400).json({ error: 'Invalid role. Must be accountant or reviewer' })
  }

  // Initialize Supabase with service role key for admin operations
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verify the caller is a workspace_owner for this workspace
  const supabaseUser = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken)
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role, workspace_id')
    .eq('id', user.id)
    .single()

  if (profileError || profile?.role !== 'workspace_owner' || profile?.workspace_id !== workspaceId) {
    return res.status(403).json({ error: 'Only workspace owners can invite users' })
  }

  // Cancel any existing pending invitations for this email+workspace
  await supabaseAdmin
    .from('workspace_invitations')
    .update({ status: 'cancelled' })
    .eq('workspace_id', workspaceId)
    .eq('email', email.toLowerCase())
    .eq('status', 'pending')

  // Create the invitation record
  const { data: invitation, error: inviteError } = await supabaseAdmin
    .from('workspace_invitations')
    .insert({
      workspace_id: workspaceId,
      email: email.toLowerCase(),
      role,
      invited_by: user.id,
    })
    .select()
    .single()

  if (inviteError) {
    console.error('Invitation insert error:', inviteError)
    return res.status(500).json({ error: 'Failed to create invitation' })
  }

  // Send magic link email via Supabase Auth
  // The magic link redirects to /accept-invitation?token=<uuid>
  const redirectTo = `${process.env.SITE_URL || 'https://luca-ai-app.vercel.app'}/accept-invitation?token=${invitation.token}`

  const { error: emailError } = await supabaseAdmin.auth.admin.generateLink({
    type: 'magiclink',
    email: email.toLowerCase(),
    options: {
      redirectTo,
      data: {
        invitation_token: invitation.token,
        workspace_name: workspaceName,
        inviter_name: inviterName,
        role,
      }
    }
  })

  if (emailError) {
    console.error('Magic link generation error:', emailError)
    // Don't fail — invitation record is created, admin can resend
    return res.status(200).json({
      success: true,
      warning: 'Invitation created but email delivery failed',
      invitationId: invitation.id,
    })
  }

  return res.status(200).json({
    success: true,
    message: `Invitation sent to ${email}`,
    invitationId: invitation.id,
  })
}
