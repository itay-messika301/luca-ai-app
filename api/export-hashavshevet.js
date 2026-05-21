import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * Hashavshevet import format (CSV)
 * Each row represents one journal line in the B100 format
 *
 * Columns (semicolon-delimited):
 *  1  תאריך          DD/MM/YYYY
 *  2  חשבון חובה     debit account code
 *  3  חשבון זכות     credit account code
 *  4  סכום           amount
 *  5  פרטים          description
 *  6  מסמך           invoice / reference number
 *  7  מטבע           currency
 *
 * Convention used here (simple 2-sided entry):
 *  Debit:  expense account (default 7300 — הוצאות כלליות)
 *  Credit: accounts payable (2000)
 *  VAT debit: 1350 — מע"מ תשומות
 */

function formatDate(d) {
  if (!d) return ''
  const dt = new Date(d)
  if (isNaN(dt)) return d
  const dd = String(dt.getDate()).padStart(2,'0')
  const mm = String(dt.getMonth()+1).padStart(2,'0')
  const yy = dt.getFullYear()
  return `${dd}/${mm}/${yy}`
}

function esc(str) {
  const s = String(str || '')
  return s.includes(';') || s.includes('"') ? `"${s.replace(/"/g,'""')}"` : s
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'Unauthorized' })

    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return res.status(401).json({ error: 'Invalid token' })

    const { data: callerProfile } = await supabase
      .from('profiles').select('workspace_id, role, full_name').eq('id', user.id).single()
    if (!callerProfile || !['workspace_owner', 'workspace_employee'].includes(callerProfile.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' })
    }

    const { workspace_id, document_ids, client_id, period_from, period_to } = req.body
    if (!workspace_id || !document_ids?.length) {
      return res.status(400).json({ error: 'workspace_id and document_ids are required' })
    }
    if (callerProfile.workspace_id !== workspace_id) {
      return res.status(403).json({ error: 'Workspace mismatch' })
    }

    const { data: docs, error: docsErr } = await supabase
      .from('documents')
      .select('*')
      .eq('workspace_id', workspace_id)
      .in('id', document_ids)

    if (docsErr) return res.status(500).json({ error: docsErr.message })

    // Build CSV lines — BOM for Hebrew Excel compatibility
    const rows = ['\ufeff' + 'תאריך;חשבון חובה;חשבון זכות;סכום;פרטים;מסמך;מטבע']

    let grandTotal = 0

    docs.forEach(doc => {
      const date        = formatDate(doc.invoice_date)
      const beforeVat   = Number(doc.amount_before_vat) || 0
      const vatAmount   = Number(doc.vat_amount)  || 0
      const currency    = doc.currency || 'ILS'
      const desc        = doc.vendor_name || doc.description || ''
      const ref         = doc.invoice_number || ''

      // Main expense line (before VAT)
      if (beforeVat) {
        rows.push([
          esc(date), '7300', '2000',
          beforeVat.toFixed(2), esc(desc), esc(ref), currency
        ].join(';'))
      }

      // VAT line
      if (vatAmount) {
        rows.push([
          esc(date), '1350', '2000',
          vatAmount.toFixed(2), `מע"מ - ${esc(desc)}`, esc(ref), currency
        ].join(';'))
      }

      grandTotal += Number(doc.total_amount) || 0
    })

    const now = new Date().toISOString()

    const { data: exportRecord } = await supabase.from('exports').insert({
      workspace_id,
      client_id:      client_id || null,
      period_from:    period_from || null,
      period_to:      period_to   || null,
      erp_target:     'hashavshevet',
      document_count: docs.length,
      total_amount:   grandTotal,
      performed_by:   user.id,
      status:         'completed',
    }).select('id').single()

    await supabase.from('documents')
      .update({ exported_at: now, export_id: exportRecord?.id })
      .in('id', document_ids)

    await supabase.from('audit_log').insert({
      workspace_id,
      user_id:      user.id,
      entity_type:  'export',
      entity_id:    exportRecord?.id,
      action:       'export_hashavshevet',
      new_value:    { document_count: docs.length, total_amount: grandTotal },
    })

    const csv = rows.join('\r\n')
    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="hashavshevet_${now.slice(0,10)}.csv"`)
    return res.status(200).send(csv)

  } catch (err) {
    console.error('export-hashavshevet error:', err)
    return res.status(500).json({ error: err.message })
  }
}
