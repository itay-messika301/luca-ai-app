import { createClient } from '@supabase/supabase-js'
import { appUrl, sendInviteEmail } from './_lib/email.js'

// Vercel serverless function: POST /api/invite-user
// Body: { email, role, workspaceId, workspaceName, inviterName }
// Auth: Bearer token in Authorization header (workspace_owner only)

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'פעולה לא נתמכת' })
  }

  const authHeader = req.headers.authorization
  if (!authHeader?.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'יש להתחבר מחדש' })
  }
  const accessToken = authHeader.slice(7)

  const { email, role, workspaceId, workspaceName, inviterName, clientAccess, clientIds, accessLevel } = req.body
  const access = clientAccess === 'assigned' ? 'assigned' : 'all'
  const level  = accessLevel === 'read' ? 'read' : 'read_write'
  const ids    = Array.isArray(clientIds) ? clientIds.filter(x => typeof x === 'string').slice(0, 1000) : []
  if (access === 'assigned' && ids.length === 0) {
    return res.status(400).json({ error: 'יש לבחור לפחות לקוח אחד' })
  }
  if (!email || !role || !workspaceId) {
    return res.status(400).json({ error: 'חסרים פרטים: מייל ותפקיד' })
  }
  if (!['workspace_employee', 'end_client'].includes(role)) {
    return res.status(400).json({ error: 'תפקיד לא תקין' })
  }

  // Initialize Supabase with service role key for admin operations
  const supabaseAdmin = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )

  // Verify the caller is a workspace_owner for this workspace
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(accessToken)
  if (authError || !user) {
    return res.status(401).json({ error: 'החיבור פג תוקף. התחברו מחדש.' })
  }

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('profiles')
    .select('role, workspace_id')
    .eq('id', user.id)
    .single()

  if (profileError || profile?.role !== 'workspace_owner' || profile?.workspace_id !== workspaceId) {
    return res.status(403).json({ error: 'רק בעל המשרד יכול להזמין עובדים' })
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
      ...(role === 'workspace_employee' ? { client_access: access, client_ids: access === 'assigned' ? ids : [], access_level: level } : {}),
    })
    .select()
    .single()

  if (inviteError) {
    console.error('Invitation insert error:', inviteError)
    return res.status(500).json({ error: 'יצירת ההזמנה נכשלה. נסו שוב.' })
  }

  // Send the invitation email (inviteUserByEmail / signInWithOtp via Supabase SMTP)
  const redirectTo = `${appUrl(req)}/accept-invitation?token=${invitation.token}`
  const { sent, error: emailError } = await sendInviteEmail(supabaseAdmin, {
    email: email.toLowerCase(),
    redirectTo,
    data: {
      invitation_token: invitation.token,
      workspace_name: workspaceName,
      inviter_name: inviterName,
      role,
    },
  })

  if (!sent) {
    // Invitation record exists; the owner can copy the link or resend
    return res.status(200).json({
      success: false,
      email_sent: false,
      warning: 'ההזמנה נוצרה אבל שליחת המייל נכשלה',
      error: emailError,
      invitationId: invitation.id,
      invite_link: redirectTo,
    })
  }

  return res.status(200).json({
    success: true,
    email_sent: true,
    message: `Invitation sent to ${email}`,
    invitationId: invitation.id,
    invite_link: redirectTo,
  })
}
