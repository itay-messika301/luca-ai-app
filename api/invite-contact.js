import { createClient } from '@supabase/supabase-js'

// Vercel serverless function: POST /api/invite-contact
// Body: { contact_id }
// Auth: Bearer token in Authorization header (workspace_owner / accountant of the contact's client workspace)
//
// Flow:
//   1. Verify caller permission
//   2. Look up the contact + its client + workspace
//   3. Cancel any pending end_client invitations for this email+workspace
//   4. Insert workspace_invitations row (role='end_client')
//   5. Update client_contacts.invited_at
//   6. Generate magic link → user receives email via configured SMTP

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing authorization token' })
  }
  const accessToken = authHeader.slice(7)

  const { contact_id } = req.body || {}
  if (!contact_id) {
    return res.status(400).json({ error: 'Missing required field: contact_id' })
  }

  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // 1. Resolve caller
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken)
  if (authError || !user) {
    return res.status(401).json({ error: 'Invalid token' })
  }

  // 2. Load contact + its client + workspace name
  const { data: contact, error: contactError } = await supabaseAdmin
    .from('client_contacts')
    .select('id, client_id, email, full_name, clients(id, workspace_id, business_name, workspaces(name))')
    .eq('id', contact_id)
    .single()

  if (contactError || !contact) {
    return res.status(404).json({ error: 'Contact not found' })
  }
  if (!contact.email) {
    return res.status(400).json({ error: 'Contact has no email address' })
  }

  const workspaceId   = contact.clients.workspace_id
  const workspaceName = contact.clients?.workspaces?.name || ''
  const businessName  = contact.clients?.business_name || ''
  const email         = contact.email.trim().toLowerCase()

  // 3. Caller must be workspace_owner or accountant in the contact's workspace
  const { data: callerProfile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role, workspace_id, full_name')
    .eq('id', user.id)
    .single()

  if (profileError ||
      callerProfile?.workspace_id !== workspaceId ||
      !['workspace_owner', 'accountant'].includes(callerProfile?.role)) {
    return res.status(403).json({ error: 'Only workspace_owner or accountant can invite contacts' })
  }

  // 4. Cancel previous pending end_client invitations for the same email+workspace
  await supabaseAdmin
    .from('workspace_invitations')
    .update({ status: 'cancelled' })
    .eq('workspace_id', workspaceId)
    .eq('email', email)
    .eq('role', 'end_client')
    .eq('status', 'pending')

  // 5. Create the new invitation
  const { data: invitation, error: inviteError } = await supabaseAdmin
    .from('workspace_invitations')
    .insert({
      workspace_id: workspaceId,
      email,
      role: 'end_client',
      invited_by: user.id,
    })
    .select()
    .single()

  if (inviteError) {
    console.error('Invitation insert error:', inviteError)
    return res.status(500).json({ error: 'Failed to create invitation' })
  }

  // 6. Mark contact as invited (resets accepted_at if previously cleared)
  await supabaseAdmin
    .from('client_contacts')
    .update({ invited_at: new Date().toISOString() })
    .eq('id', contact_id)

  // 7. Send magic link
  const redirectTo = `${process.env.SITE_URL || 'https://luca-ai-app.vercel.app'}/accept-invitation?token=${invitation.token}`

  console.log('[invite-contact] generating magic link', {
    email,
    redirectTo,
    invitationId: invitation.id,
    workspaceId,
  })

  const { data: linkData, error: emailError } = await supabaseAdmin.auth.admin.generateLink({
    type:  'magiclink',
    email,
    options: {
      redirectTo,
      data: {
        invitation_token: invitation.token,
        workspace_name:   workspaceName,
        business_name:    businessName,
        contact_name:     contact.full_name,
        inviter_name:     callerProfile.full_name,
        role:             'end_client',
      },
    },
  })

  if (emailError) {
    console.error('[invite-contact] Magic link generation error:', {
      message: emailError.message,
      status:  emailError.status,
      code:    emailError.code,
      name:    emailError.name,
    })
    return res.status(200).json({
      success: false,
      warning: 'Invitation created but email delivery failed (check SMTP config)',
      error:   emailError.message,
      invitationId: invitation.id,
    })
  }

  // generateLink returns the link in linkData.properties.action_link.
  // If SMTP is configured properly Supabase ALSO sends the email automatically.
  // If SMTP isn't configured, the link is still generated but no email is sent —
  // log the action_link so we can inspect it via Vercel logs and forward manually.
  console.log('[invite-contact] magic link generated', {
    email,
    has_action_link: !!linkData?.properties?.action_link,
    invitationId: invitation.id,
  })

  return res.status(200).json({
    success: true,
    message: `Invitation sent to ${email}`,
    invitationId: invitation.id,
    // For debug only — remove in production once SMTP is verified working.
    debug_action_link: linkData?.properties?.action_link || null,
  })
}
