// Provider adapters for inbound email webhooks.
//
// Every adapter turns a provider webhook into one normalised shape:
//   {
//     provider:    'resend' | 'generic',
//     messageId:   string | null,
//     from:        'sender@example.com' (lower-case, bare address),
//     recipients:  ['invoices+abc123@in.luca-ai.io', ...] (lower-case),
//     subject:     string,
//     senderAuthFailed: boolean,   // SPF and DKIM both failed (spoofing risk)
//     attachments: [{ filename, contentType, disposition, contentId, size,
//                     load: async () => Buffer }]
//   }
//
// The email body is ignored on purpose; we only file attachments.

import crypto from 'node:crypto'

// ── helpers ────────────────────────────────────────────────────────────────

export function timingSafeEqualStr(a, b) {
  const ba = Buffer.from(String(a || ''))
  const bb = Buffer.from(String(b || ''))
  if (ba.length !== bb.length || ba.length === 0) return false
  return crypto.timingSafeEqual(ba, bb)
}

// '"Dana Levi" <Dana@Example.com>' → 'dana@example.com'
export function bareAddress(value) {
  const s = String(value || '').trim()
  const m = s.match(/<([^>]+)>/)
  return (m ? m[1] : s).trim().toLowerCase()
}

const toList = v => (Array.isArray(v) ? v : v ? [v] : []).map(bareAddress).filter(Boolean)

// Reads the raw request body. Vercel parses req.body lazily, so as long as we
// never touch req.body first, the stream is still readable. Signature checks
// need the exact bytes that were signed.
export async function readRawBody(req) {
  if (Buffer.isBuffer(req.rawBody)) return req.rawBody
  if (typeof req.rawBody === 'string') return Buffer.from(req.rawBody)
  const chunks = []
  for await (const chunk of req) chunks.push(typeof chunk === 'string' ? Buffer.from(chunk) : chunk)
  return Buffer.concat(chunks)
}

// ── Resend Inbound ─────────────────────────────────────────────────────────
// Webhook (Svix-signed) carries metadata only; attachments are fetched from
// the Resend API afterwards, so large files never hit Vercel's 4.5MB limit.
// Docs: resend.com/docs/dashboard/receiving/introduction

const RESEND_API = 'https://api.resend.com'
const SVIX_TOLERANCE_SECONDS = 5 * 60

// Standard Svix scheme: HMAC-SHA256 over `${id}.${timestamp}.${body}` with the
// base64-decoded secret (the part after `whsec_`), sent as "v1,<base64>"
// (space-separated when several signatures are present).
export function verifySvixSignature({ secret, id, timestamp, signature, body, now = Date.now() }) {
  if (!secret || !id || !timestamp || !signature) return false
  const ts = Number(timestamp)
  if (!Number.isFinite(ts) || Math.abs(now / 1000 - ts) > SVIX_TOLERANCE_SECONDS) return false
  const key = Buffer.from(String(secret).replace(/^whsec_/, ''), 'base64')
  const expected = crypto
    .createHmac('sha256', key)
    .update(`${id}.${timestamp}.${Buffer.isBuffer(body) ? body.toString('utf8') : body}`)
    .digest('base64')
  return String(signature).split(' ').some(part => {
    const [version, sig] = part.split(',')
    return version === 'v1' && timingSafeEqualStr(sig, expected)
  })
}

async function resendGet(path) {
  const resp = await fetch(RESEND_API + path, {
    headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}` },
  })
  if (!resp.ok) {
    const body = await resp.text().catch(() => '')
    throw new Error(`Resend API ${path} → ${resp.status} ${body.slice(0, 300)}`)
  }
  return resp.json()
}

async function downloadUrl(url) {
  const resp = await fetch(url)
  if (!resp.ok) throw new Error(`attachment download → ${resp.status}`)
  return Buffer.from(await resp.arrayBuffer())
}

const resendAdapter = {
  name: 'resend',

  verify(req, rawBody) {
    return verifySvixSignature({
      secret:    process.env.INTAKE_WEBHOOK_SECRET,
      id:        req.headers['svix-id'],
      timestamp: req.headers['svix-timestamp'],
      signature: req.headers['svix-signature'],
      body:      rawBody,
    })
  },

  async parse(payload) {
    if (payload?.type !== 'email.received') return null // other events: ignore
    const d = payload.data || {}
    const emailId = d.email_id

    // Full email: SPF/DKIM result. Attachment list: size + fresh download URLs.
    let auth = null
    let attachments = []
    if (emailId) {
      try {
        const email = await resendGet(`/emails/receiving/${encodeURIComponent(emailId)}`)
        auth = email.authentication || null
      } catch (e) {
        console.error('[intake-email] could not fetch email details', e.message)
      }
      const list = await resendGet(`/emails/receiving/${encodeURIComponent(emailId)}/attachments?limit=100`)
      attachments = (list.data || []).map(a => ({
        filename:    a.filename || 'attachment',
        contentType: a.content_type || '',
        disposition: a.content_disposition || '',
        contentId:   a.content_id || '',
        size:        typeof a.size === 'number' ? a.size : null,
        load:        () => downloadUrl(a.download_url),
      }))
    }

    // Only an explicit SPF failure without a passing DKIM signature counts as
    // spoofed; an unknown or missing result never blocks auto-filing.
    const val = v => String(typeof v === 'object' && v ? (v.result ?? v.status ?? '') : (v ?? '')).toLowerCase()
    const senderAuthFailed = !!auth
      && ['fail', 'softfail'].includes(val(auth.spf))
      && val(auth.dkim) !== 'pass'

    return {
      provider:   'resend',
      messageId:  emailId || d.message_id || null,
      from:       bareAddress(d.from),
      recipients: [...toList(d.to), ...toList(d.cc), ...toList(d.received_for)],
      subject:    d.subject || '',
      senderAuthFailed,
      attachments,
    }
  },
}

// ── Generic JSON (local tests, or any provider behind a small relay) ───────
// POST /api/intake-email?provider=generic&token=<INTAKE_WEBHOOK_SECRET>
// { "from": "...", "to": ["..."], "subject": "...",
//   "attachments": [{ "filename", "content_type", "content" (base64),
//                     "disposition"?, "content_id"? }] }
// Note: Vercel caps request bodies at 4.5MB, so inline base64 suits tests
// and small files only.

const genericAdapter = {
  name: 'generic',

  verify(req) {
    const url = new URL(req.url, 'http://local')
    const token = url.searchParams.get('token') || req.headers['x-intake-token']
    return timingSafeEqualStr(token, process.env.INTAKE_WEBHOOK_SECRET)
  },

  async parse(payload) {
    if (!payload || typeof payload !== 'object') return null
    return {
      provider:   'generic',
      messageId:  payload.message_id || null,
      from:       bareAddress(payload.from),
      recipients: [...toList(payload.to), ...toList(payload.cc)],
      subject:    payload.subject || '',
      senderAuthFailed: false,
      attachments: (payload.attachments || []).map(a => {
        const buf = Buffer.from(String(a.content || ''), 'base64')
        return {
          filename:    a.filename || 'attachment',
          contentType: a.content_type || '',
          disposition: a.disposition || 'attachment',
          contentId:   a.content_id || '',
          size:        buf.length,
          load:        async () => buf,
        }
      }),
    }
  },
}

const ADAPTERS = { resend: resendAdapter, generic: genericAdapter }

// ?provider= wins; otherwise Svix headers mean Resend.
export function pickAdapter(req) {
  const url = new URL(req.url, 'http://local')
  const name = url.searchParams.get('provider') || (req.headers['svix-id'] ? 'resend' : 'generic')
  return ADAPTERS[name] || null
}

// ── Address scheme ─────────────────────────────────────────────────────────
// invoices+<key>@<domain>  (also accepts <key>@<domain>)

export const INTAKE_DOMAIN = (process.env.INTAKE_EMAIL_DOMAIN || 'in.luca-ai.io').toLowerCase()

export function intakeKeyFromRecipients(recipients) {
  for (const addr of recipients) {
    const at = addr.lastIndexOf('@')
    if (at < 0 || addr.slice(at + 1) !== INTAKE_DOMAIN) continue
    const local = addr.slice(0, at)
    const key = local.includes('+') ? local.slice(local.indexOf('+') + 1) : local
    if (/^[a-z0-9]{6,40}$/.test(key)) return key
  }
  return null
}
