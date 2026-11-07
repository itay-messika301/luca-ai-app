// Inbound email → documents.
//
// A client forwards an invoice to the office intake address
//   invoices+<workspaces.intake_key>@in.luca-ai.io
// The email provider (Resend Inbound) posts a webhook here. We:
//   1. verify the webhook (Svix signature, or ?token= for the generic adapter)
//      against INTAKE_WEBHOOK_SECRET — anything else gets 401;
//   2. find the office by the intake key in the recipient address;
//   3. find the client by sender address (clients.intake_email, case-insensitive);
//      unknown / ambiguous / failed-SPF+DKIM sender → client_id = null ("unassigned");
//   4. store each PDF/image attachment (≤10MB) in the `documents` bucket and
//      insert a `documents` row with source_channel = 'email';
//   5. reply 200 straight away, then run AI processing for assigned documents
//      in the background. Unassigned documents wait (status pending) until the
//      office picks a client; they are processed then.
// The email body and inline images (signatures, logos) are ignored.
// See docs/EMAIL_INTAKE_SETUP.md.

import crypto from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import { waitUntil } from '@vercel/functions'
import { pickAdapter, readRawBody, intakeKeyFromRecipients } from './_lib/inbound-email.js'
import { processDocument } from './_lib/process.js'
import { MAX_UPLOAD_BYTES, ALLOWED_EXTENSIONS, safeStorageName, fileExtension } from '../src/lib/files.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const EXT_BY_TYPE = {
  'application/pdf': 'pdf',
  'image/jpeg':      'jpg',
  'image/jpg':       'jpg',
  'image/png':       'png',
  'image/webp':      'webp',
}

// Decide the stored file name + extension, or null if the file type isn't allowed.
function normaliseFile(att) {
  let name = att.filename || 'attachment'
  let ext  = fileExtension(name)
  if (!ALLOWED_EXTENSIONS.includes(ext)) {
    const fromType = EXT_BY_TYPE[String(att.contentType).toLowerCase().split(';')[0].trim()]
    if (!fromType) return null
    ext  = fromType
    name = `${name}.${ext}`
  }
  return { name, ext }
}

// Inline images are signatures / logos embedded in the body, not documents.
function isInlineImage(att) {
  const type = String(att.contentType).toLowerCase()
  const disp = String(att.disposition).toLowerCase()
  if (!type.startsWith('image/')) return false
  return disp === 'inline' || (!!att.contentId && disp !== 'attachment')
}

// Escape LIKE wildcards so ilike behaves as a case-insensitive equality.
const likeExact = s => s.replace(/[\\%_]/g, c => '\\' + c)

async function findClient(workspaceId, from, senderAuthFailed) {
  if (!from) return { clientId: null, reason: 'no_sender' }
  const { data, error } = await supabase
    .from('clients')
    .select('id')
    .eq('workspace_id', workspaceId)
    .is('archived_at', null)
    .ilike('intake_email', likeExact(from))
    .limit(2)
  if (error) throw error
  if (!data?.length)      return { clientId: null, reason: 'unknown_sender' }
  if (data.length > 1)    return { clientId: null, reason: 'ambiguous_sender' }
  if (senderAuthFailed)   return { clientId: null, reason: 'sender_not_verified' }
  return { clientId: data[0].id, reason: null }
}

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method not allowed' })

  if (!process.env.INTAKE_WEBHOOK_SECRET) {
    console.error('[intake-email] INTAKE_WEBHOOK_SECRET is not set')
    return res.status(503).json({ error: 'intake not configured' })
  }

  const adapter = pickAdapter(req)
  if (!adapter) return res.status(400).json({ error: 'unknown provider' })

  let rawBody
  try {
    rawBody = await readRawBody(req)
  } catch {
    return res.status(400).json({ error: 'unreadable body' })
  }
  if (!adapter.verify(req, rawBody)) return res.status(401).json({ error: 'invalid signature' })

  let payload
  try {
    payload = JSON.parse(rawBody.toString('utf8'))
  } catch {
    return res.status(400).json({ error: 'invalid json' })
  }

  let mail
  try {
    mail = await adapter.parse(payload)
  } catch (e) {
    // Provider API hiccup: let the provider retry later.
    console.error('[intake-email] parse failed', e.message)
    return res.status(502).json({ error: 'could not read email' })
  }
  if (!mail) return res.status(200).json({ ignored: 'not an inbound email event' })

  // Office by intake key. Unknown key → 200 so the provider stops retrying.
  const key = intakeKeyFromRecipients(mail.recipients)
  if (!key) return res.status(200).json({ ignored: 'no intake address in recipients' })
  const { data: ws, error: wsErr } = await supabase
    .from('workspaces').select('id').eq('intake_key', key).maybeSingle()
  if (wsErr) {
    console.error('[intake-email] workspace lookup failed', wsErr.message)
    return res.status(500).json({ error: 'lookup failed' })
  }
  if (!ws) return res.status(200).json({ ignored: 'unknown intake address' })

  try {
    const { clientId, reason } = await findClient(ws.id, mail.from, mail.senderAuthFailed)
    const folder     = clientId || 'unassigned'
    const receivedAt = new Date().toISOString()
    const results    = []
    const toProcess  = []

    for (let i = 0; i < mail.attachments.length; i++) {
      const att = mail.attachments[i]
      const label = att.filename

      if (isInlineImage(att)) { results.push({ file: label, skipped: 'inline' }); continue }
      const norm = normaliseFile(att)
      if (!norm) { results.push({ file: label, skipped: 'type' }); continue }
      if (att.size != null && att.size > MAX_UPLOAD_BYTES) { results.push({ file: label, skipped: 'too_large' }); continue }

      const buf = await att.load()
      if (buf.length > MAX_UPLOAD_BYTES) { results.push({ file: label, skipped: 'too_large' }); continue }
      if (buf.length === 0)              { results.push({ file: label, skipped: 'empty' }); continue }

      // Dedupe: same file already filed for this client (or, while unassigned, in this office's unassigned list)
      const hash = crypto.createHash('sha256').update(buf).digest('hex')
      let dupQ = supabase.from('documents').select('id').eq('workspace_id', ws.id).eq('file_hash', hash).limit(1)
      dupQ = clientId ? dupQ.eq('client_id', clientId) : dupQ.is('client_id', null)
      const { data: dup } = await dupQ
      if (dup?.length) { results.push({ file: label, skipped: 'duplicate', document_id: dup[0].id }); continue }

      const filePath = `${ws.id}/${folder}/${Date.now()}_${i}_${safeStorageName(norm.name)}`
      const contentType = norm.ext === 'pdf' ? 'application/pdf' : `image/${norm.ext === 'jpg' ? 'jpeg' : norm.ext}`
      const { error: upErr } = await supabase.storage.from('documents')
        .upload(filePath, buf, { contentType, upsert: false })
      if (upErr) throw new Error(`storage upload failed: ${upErr.message}`)

      const { data: row, error: insErr } = await supabase.from('documents').insert({
        workspace_id:   ws.id,
        client_id:      clientId,
        file_name:      norm.name,
        file_path:      filePath,
        file_size:      buf.length,
        file_type:      norm.ext,
        status:         'pending',
        source_channel: 'email',
        file_hash:      hash,
        intake_meta: {
          provider:    mail.provider,
          message_id:  mail.messageId,
          from:        mail.from,
          subject:     String(mail.subject).slice(0, 300),
          received_at: receivedAt,
          ...(reason ? { reason } : {}),
        },
      }).select('*').single()
      if (insErr) {
        await supabase.storage.from('documents').remove([filePath])
        throw new Error(`insert failed: ${insErr.message}`)
      }

      await supabase.from('audit_log').insert({
        workspace_id: ws.id,
        entity_type:  'document',
        entity_id:    row.id,
        action:       'email_intake',
        new_value:    { from: mail.from, client_id: clientId, reason, file_name: norm.name },
      })

      results.push({ file: label, document_id: row.id, client_id: clientId })
      if (clientId) toProcess.push(row)
    }

    // AI processing after the response, so the provider doesn't time out and
    // retry. In parallel, to stay inside the function's time limit.
    if (toProcess.length) {
      waitUntil(Promise.allSettled(toProcess.map(async doc => {
        try {
          const r = await processDocument(supabase, doc)
          if (!r.ok) console.error('[intake-email] processing failed', doc.id, r.error)
        } catch (e) {
          console.error('[intake-email] processing crashed', doc.id, e)
          await supabase.from('documents').update({ status: 'error' }).eq('id', doc.id)
        }
      })))
    }

    return res.status(200).json({
      workspace_id: ws.id,
      client_id:    clientId,
      unassigned_reason: reason,
      results,
    })
  } catch (e) {
    console.error('[intake-email] failed', e)
    // 500 → provider retries; already-stored files are skipped by the hash check.
    return res.status(500).json({ error: 'intake failed' })
  }
}
