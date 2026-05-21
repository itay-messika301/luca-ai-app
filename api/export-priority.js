import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

/**
 * Priority ERP REST API export
 *
 * Priority REST API endpoint (per workspace settings):
 *   PRIORITY_API_URL     e.g. https://prioritydemo.com/odata/priority/tabula.ini/demo
 *   PRIORITY_API_USER    HTTP Basic username
 *   PRIORITY_API_PASS    HTTP Basic password
 *
 * Each invoice becomes a PORDERSI (supplier invoice) record.
 * On partial success (some records rejected), we still mark successful ones as exported.
 */

function priorityDate(d) {
  if (!d) return null
  // Priority expects ISO 8601
  return new Date(d).toISOString()
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

    // Priority credentials from env (workspace-level would be stored in settings table in future)
    const priorityUrl  = process.env.PRIORITY_API_URL
    const priorityUser = process.env.PRIORITY_API_USER
    const priorityPass = process.env.PRIORITY_API_PASS

    if (!priorityUrl || !priorityUser || !priorityPass) {
      return res.status(500).json({
        error: 'Priority API credentials are not configured. Set PRIORITY_API_URL, PRIORITY_API_USER, PRIORITY_API_PASS in environment variables.',
      })
    }

    const { data: docs, error: docsErr } = await supabase
      .from('documents')
      .select('*')
      .eq('workspace_id', workspace_id)
      .in('id', document_ids)

    if (docsErr) return res.status(500).json({ error: docsErr.message })

    const authHeader = 'Basic ' + Buffer.from(`${priorityUser}:${priorityPass}`).toString('base64')
    const successIds = []
    const failures   = []
    let   grandTotal = 0

    for (const doc of docs) {
      try {
        const body = {
          IVNUM:    doc.invoice_number || `LUCA-${doc.id.slice(0,8)}`,
          IVDATE:   priorityDate(doc.invoice_date),
          SUPNAME:  doc.vendor_name || '',
          VATNUM:   doc.vendor_registration_number || '',
          PAYCODE:  'CAL',
          IVDES:    doc.validation_results?.description || doc.file_name || '',
          IVTOTAL:  Number(doc.total_amount)      || 0,
          IVVATAMT: Number(doc.vat_amount)         || 0,
          IVSUM:    Number(doc.amount_before_vat)  || 0,
          WITHHOLD: Number(doc.withholding_tax)    || 0,
          ALLOC:    doc.allocation_number          || '',
          CURRENCY: doc.currency                   || 'ILS',
        }

        const resp = await fetch(`${priorityUrl}/PORDERSI`, {
          method:  'POST',
          headers: {
            Authorization:  authHeader,
            'Content-Type': 'application/json',
            Accept:         'application/json',
          },
          body: JSON.stringify(body),
        })

        if (resp.ok) {
          successIds.push(doc.id)
          grandTotal += Number(doc.total_amount) || 0
        } else {
          const errBody = await resp.json().catch(() => ({}))
          failures.push({ id: doc.id, error: errBody?.error?.message || `HTTP ${resp.status}` })
        }
      } catch (fetchErr) {
        failures.push({ id: doc.id, error: fetchErr.message })
      }
    }

    const now    = new Date().toISOString()
    const status = failures.length === 0 ? 'completed' : successIds.length === 0 ? 'failed' : 'partial'

    const { data: exportRecord } = await supabase.from('exports').insert({
      workspace_id,
      client_id:      client_id || null,
      period_from:    period_from || null,
      period_to:      period_to   || null,
      erp_target:     'priority',
      document_count: successIds.length,
      total_amount:   grandTotal,
      performed_by:   user.id,
      status,
      notes: failures.length > 0 ? `${failures.length} מסמכים נכשלו` : null,
    }).select('id').single()

    if (successIds.length > 0) {
      await supabase.from('documents')
        .update({ exported_at: now, export_id: exportRecord?.id })
        .in('id', successIds)
    }

    await supabase.from('audit_log').insert({
      workspace_id,
      user_id:      user.id,
      entity_type:  'export',
      entity_id:    exportRecord?.id,
      action:       'export_priority',
      new_value:    { success_count: successIds.length, failure_count: failures.length, total_amount: grandTotal },
    })

    return res.status(200).json({
      success_count: successIds.length,
      failure_count: failures.length,
      failures,
      status,
    })

  } catch (err) {
    console.error('export-priority error:', err)
    return res.status(500).json({ error: err.message })
  }
}
