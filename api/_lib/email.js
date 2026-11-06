import { createClient } from '@supabase/supabase-js'

// Files under api/_lib are not exposed as Vercel routes (underscore prefix).

// Public base URL of the app, e.g. https://app.luca-ai.io
export function appUrl(req) {
  const fromEnv = process.env.APP_URL || process.env.SITE_URL
  if (fromEnv) return fromEnv.replace(/\/+$/, '')
  const host = req?.headers?.['x-forwarded-host'] || req?.headers?.host
  return host ? `https://${host}` : 'https://app.luca-ai.io'
}

function anonClient() {
  return createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_ANON_KEY,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

// Actually SENDS an invitation email through Supabase Auth (uses the SMTP
// configured in Supabase → Auth → SMTP).
//  - New address      → auth.admin.inviteUserByEmail ("Invite user" template)
//  - Existing account → signInWithOtp                ("Magic Link" template)
// Returns { sent: boolean, error?: string }
export async function sendInviteEmail(supabaseAdmin, { email, redirectTo, data }) {
  const { error: inviteErr } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
    redirectTo,
    data,
  })
  if (!inviteErr) return { sent: true }

  const alreadyExists =
    inviteErr.status === 422 ||
    inviteErr.code === 'email_exists' ||
    /already|registered|exists/i.test(inviteErr.message || '')

  if (!alreadyExists) {
    console.error('[sendInviteEmail] inviteUserByEmail failed', {
      message: inviteErr.message, status: inviteErr.status, code: inviteErr.code,
    })
    return { sent: false, error: inviteErr.message }
  }

  const { error: otpErr } = await anonClient().auth.signInWithOtp({
    email,
    options: { emailRedirectTo: redirectTo, shouldCreateUser: false },
  })
  if (otpErr) {
    console.error('[sendInviteEmail] signInWithOtp failed', {
      message: otpErr.message, status: otpErr.status, code: otpErr.code,
    })
    return { sent: false, error: otpErr.message }
  }
  return { sent: true }
}
