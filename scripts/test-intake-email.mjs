#!/usr/bin/env node
// Local tests for /api/intake-email.
//
// 1) Offline unit checks (no server, no database):
//      node scripts/test-intake-email.mjs --unit
//
// 2) Post a sample email with a PDF attachment to a running endpoint
//    (generic adapter, authenticated with ?token=INTAKE_WEBHOOK_SECRET):
//      INTAKE_WEBHOOK_SECRET=... node scripts/test-intake-email.mjs \
//        --url http://localhost:3000/api/intake-email \
//        --to invoices+<intake_key>@in.luca-ai.io \
//        --from client@example.com
//    Run the endpoint with `vercel dev` against a NON-production Supabase
//    project — this writes to storage and the documents table.

import assert from 'node:assert/strict'
import crypto from 'node:crypto'

const args = process.argv.slice(2)
const arg = (name, def) => {
  const i = args.indexOf(`--${name}`)
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def
}

// A tiny, valid one-page PDF with the text "Invoice 1001 Total 118.00".
function samplePdf() {
  const text = 'BT /F1 18 Tf 50 750 Td (Invoice 1001 - Total 118.00 ILS) Tj ET'
  const objs = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${text.length} >>\nstream\n${text}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',
  ]
  let out = '%PDF-1.4\n'
  const offsets = []
  objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n` })
  const xref = out.length
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`
  offsets.forEach(o => { out += `${String(o).padStart(10, '0')} 00000 n \n` })
  out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}

async function unit() {
  process.env.INTAKE_EMAIL_DOMAIN = 'in.luca-ai.io'
  const lib = await import('../api/_lib/inbound-email.js')

  // Address parsing
  assert.equal(lib.bareAddress('"Dana" <Dana@Example.COM>'), 'dana@example.com')
  assert.equal(lib.bareAddress(' x@y.io '), 'x@y.io')
  assert.equal(lib.intakeKeyFromRecipients(['invoices+ab12cd34ef56@in.luca-ai.io']), 'ab12cd34ef56')
  assert.equal(lib.intakeKeyFromRecipients(['ab12cd34ef56@in.luca-ai.io']), 'ab12cd34ef56')
  assert.equal(lib.intakeKeyFromRecipients(['invoices+ab12cd34ef56@other.com']), null)
  assert.equal(lib.intakeKeyFromRecipients(['someone@gmail.com', 'invoices+zz99zz99@in.luca-ai.io']), 'zz99zz99')
  assert.equal(lib.intakeKeyFromRecipients(['invoices+../x@in.luca-ai.io']), null)

  // Svix signature (Resend)
  const secretBytes = crypto.randomBytes(24)
  const secret = 'whsec_' + secretBytes.toString('base64')
  const body = JSON.stringify({ type: 'email.received', data: {} })
  const id = 'msg_123'
  const ts = String(Math.floor(Date.now() / 1000))
  const sig = crypto.createHmac('sha256', secretBytes).update(`${id}.${ts}.${body}`).digest('base64')
  assert.ok(lib.verifySvixSignature({ secret, id, timestamp: ts, signature: `v1,${sig}`, body }))
  assert.ok(lib.verifySvixSignature({ secret, id, timestamp: ts, signature: `v1,bogus v1,${sig}`, body: Buffer.from(body) }))
  assert.ok(!lib.verifySvixSignature({ secret, id, timestamp: ts, signature: `v1,${sig}`, body: body + ' ' }))
  assert.ok(!lib.verifySvixSignature({ secret, id: 'other', timestamp: ts, signature: `v1,${sig}`, body }))
  const old = String(Math.floor(Date.now() / 1000) - 3600)
  const oldSig = crypto.createHmac('sha256', secretBytes).update(`${id}.${old}.${body}`).digest('base64')
  assert.ok(!lib.verifySvixSignature({ secret, id, timestamp: old, signature: `v1,${oldSig}`, body }), 'stale timestamp rejected')
  assert.ok(!lib.verifySvixSignature({ secret: '', id, timestamp: ts, signature: `v1,${sig}`, body }))

  // Generic adapter: token check + parsing
  process.env.INTAKE_WEBHOOK_SECRET = 'test-secret-123'
  const reqOk  = { url: '/api/intake-email?provider=generic&token=test-secret-123', headers: {} }
  const reqBad = { url: '/api/intake-email?provider=generic&token=nope', headers: {} }
  const reqNone = { url: '/api/intake-email?provider=generic', headers: {} }
  const adapter = lib.pickAdapter(reqOk)
  assert.equal(adapter.name, 'generic')
  assert.ok(adapter.verify(reqOk))
  assert.ok(!adapter.verify(reqBad))
  assert.ok(!adapter.verify(reqNone))
  assert.equal(lib.pickAdapter({ url: '/api/intake-email', headers: { 'svix-id': 'x' } }).name, 'resend')
  assert.equal(lib.pickAdapter({ url: '/api/intake-email?provider=evil', headers: {} }), null)

  const pdf = samplePdf()
  const mail = await adapter.parse({
    from: 'Client <Client@Example.com>',
    to: ['invoices+ab12cd34ef56@in.luca-ai.io'],
    subject: 'חשבונית',
    attachments: [{ filename: 'inv.pdf', content_type: 'application/pdf', content: pdf.toString('base64') }],
  })
  assert.equal(mail.from, 'client@example.com')
  assert.equal(mail.attachments.length, 1)
  assert.equal((await mail.attachments[0].load()).equals(pdf), true)

  // Resend adapter ignores non-inbound events without calling the API
  assert.equal(await lib.pickAdapter({ url: '/x?provider=resend', headers: {} }).parse({ type: 'email.sent' }), null)

  console.log('unit: all checks passed')
}

async function post() {
  const url    = arg('url', 'http://localhost:3000/api/intake-email')
  const to     = arg('to')
  const from   = arg('from', 'client@example.com')
  const secret = process.env.INTAKE_WEBHOOK_SECRET
  if (!to || !secret) {
    console.error('Usage: INTAKE_WEBHOOK_SECRET=... node scripts/test-intake-email.mjs --to invoices+<key>@in.luca-ai.io [--from a@b.c] [--url ...]')
    process.exit(2)
  }
  const pdf = samplePdf()
  const payload = {
    message_id: `<test-${Date.now()}@local>`,
    from,
    to: [to],
    subject: 'Test invoice from scripts/test-intake-email.mjs',
    text: 'body is ignored',
    attachments: [
      { filename: `test-invoice-${Date.now()}.pdf`, content_type: 'application/pdf', content: pdf.toString('base64') },
      // Inline signature image — must be skipped
      { filename: 'logo.png', content_type: 'image/png', content: Buffer.from('fake').toString('base64'), disposition: 'inline', content_id: 'logo' },
      // Not an allowed type — must be skipped
      { filename: 'notes.txt', content_type: 'text/plain', content: Buffer.from('hi').toString('base64') },
    ],
  }
  const target = new URL(url)
  target.searchParams.set('provider', 'generic')

  // Wrong token first: must be rejected
  const bad = new URL(target); bad.searchParams.set('token', 'wrong')
  const badResp = await fetch(bad, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  console.log('wrong token →', badResp.status, badResp.status === 401 ? 'OK (rejected)' : 'UNEXPECTED')

  target.searchParams.set('token', secret)
  const resp = await fetch(target, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  console.log('valid token →', resp.status)
  console.log(JSON.stringify(await resp.json().catch(() => null), null, 2))
}

if (args.includes('--unit')) await unit()
else await post()
