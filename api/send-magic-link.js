import { createClient } from '@supabase/supabase-js'

// adminClient — service role key; used for validation only (never exposed to client)
const adminClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

// anonClient — public anon key; used to trigger the OTP email via Supabase Auth
const anonClient = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  try {
    const rawEmail = req.body?.email
    if (!rawEmail || typeof rawEmail !== 'string') {
      return res.status(400).json({ error: 'כתובת מייל נדרשת' })
    }

    const email = rawEmail.toLowerCase().trim()

    // ── Check 1: email already registered in auth.users ──────────────────────
    const { data: isRegistered, error: rpcErr } = await adminClient
      .rpc('is_email_authorised', { p_email: email })

    if (rpcErr) {
      console.error('is_email_authorised RPC error:', rpcErr)
      return res.status(500).json({ error: 'שגיאה פנימית' })
    }

    // ── Check 2: pending invitation for this email ────────────────────────────
    let hasPendingInvitation = false
    if (!isRegistered) {
      const { data: inv, error: invErr } = await adminClient
        .from('workspace_invitations')
        .select('id')
        .eq('email', email)
        .eq('status', 'pending')
        .gt('expires_at', new Date().toISOString())
        .limit(1)

      if (invErr) {
        console.error('Invitation lookup error:', invErr)
        return res.status(500).json({ error: 'שגיאה פנימית' })
      }
      hasPendingInvitation = (inv?.length ?? 0) > 0
    }

    // ── Neither registered nor invited → reject ───────────────────────────────
    if (!isRegistered && !hasPendingInvitation) {
      return res.status(403).json({
        error: 'כתובת המייל אינה רשומה במערכת. פנה לרואה החשבון שלך.',
      })
    }

    // ── Authorised → send magic link via Supabase Auth ────────────────────────
    const appUrl = process.env.APP_URL || 'http://localhost:5173'
    const { error: otpErr } = await anonClient.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${appUrl}/auth/callback`,
        shouldCreateUser: false, // never create new accounts; only auth.users entries already exist
      },
    })

    if (otpErr) {
      console.error('signInWithOtp error:', otpErr)
      return res.status(500).json({ error: 'שגיאה בשליחת הקישור: ' + otpErr.message })
    }

    return res.status(200).json({ success: true })

  } catch (err) {
    console.error('send-magic-link error:', err)
    return res.status(500).json({ error: 'שגיאה פנימית: ' + err.message })
  }
}
