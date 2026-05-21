import { createClient } from '@supabase/supabase-js'
import ExcelJS from 'exceljs'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  try {
    // Auth: verify caller is workspace member
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

    // Fetch documents
    const { data: docs, error: docsErr } = await supabase
      .from('documents')
      .select('*, clients(business_name, registration_number)')
      .eq('workspace_id', workspace_id)
      .in('id', document_ids)

    if (docsErr) return res.status(500).json({ error: docsErr.message })

    // Build Excel
    const workbook  = new ExcelJS.Workbook()
    workbook.creator = 'Luca AI'
    workbook.created = new Date()

    const sheet = workbook.addWorksheet('חשבוניות', { views: [{ rightToLeft: true }] })

    const HEADERS = [
      { header: 'תאריך חשבונית',    key: 'invoice_date',              width: 14 },
      { header: 'שם ספק',            key: 'vendor_name',               width: 28 },
      { header: 'ח.פ ספק',           key: 'vendor_registration_number', width: 13 },
      { header: 'מספר חשבונית',      key: 'invoice_number',            width: 16 },
      { header: 'לפני מע"מ',         key: 'amount_before_vat',         width: 14 },
      { header: 'מע"מ',              key: 'vat_amount',                width: 12 },
      { header: 'סה"כ',              key: 'total_amount',              width: 14 },
      { header: 'ניכוי מס במקור',   key: 'withholding_tax',           width: 14 },
      { header: 'מספר הקצאה',        key: 'allocation_number',         width: 16 },
      { header: 'לקוח',              key: 'client_name',               width: 22 },
      { header: 'סטטוס',             key: 'review_status',             width: 12 },
      { header: 'מעבד',              key: 'processed_by',              width: 16 },
    ]

    sheet.columns = HEADERS

    // Style header row
    const headerRow = sheet.getRow(1)
    headerRow.font      = { bold: true }
    headerRow.fill      = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A5F' } }
    headerRow.font      = { bold: true, color: { argb: 'FFFFFFFF' } }
    headerRow.alignment = { horizontal: 'right' }

    let grandTotal = 0

    docs.forEach(doc => {
      const total = Number(doc.total_amount) || 0
      grandTotal += total

      const row = sheet.addRow({
        invoice_date:               doc.invoice_date || '',
        vendor_name:                doc.vendor_name  || '',
        vendor_registration_number: doc.vendor_registration_number || '',
        invoice_number:             doc.invoice_number || '',
        amount_before_vat:          doc.amount_before_vat  != null ? Number(doc.amount_before_vat)  : '',
        vat_amount:                 doc.vat_amount          != null ? Number(doc.vat_amount)          : '',
        total_amount:               total || '',
        withholding_tax:            doc.withholding_tax     != null ? Number(doc.withholding_tax)     : '',
        allocation_number:          doc.allocation_number || '',
        client_name:                doc.clients?.business_name || '',
        review_status:              doc.review_status || '',
        processed_by:               callerProfile.full_name || '',
      })

      // Number format for currency columns
      ;['amount_before_vat','vat_amount','total_amount','withholding_tax'].forEach(key => {
        const col = HEADERS.findIndex(h => h.key === key) + 1
        row.getCell(col).numFmt = '#,##0.00'
      })
    })

    // Grand total row
    const totalRow = sheet.addRow({
      vendor_name:      'סה"כ',
      total_amount:     grandTotal,
    })
    totalRow.font = { bold: true }
    const totalCol = HEADERS.findIndex(h => h.key === 'total_amount') + 1
    totalRow.getCell(totalCol).numFmt = '#,##0.00'

    // Write audit + mark exported
    const now = new Date().toISOString()

    const { data: exportRecord } = await supabase.from('exports').insert({
      workspace_id,
      client_id:      client_id || null,
      period_from:    period_from || null,
      period_to:      period_to   || null,
      erp_target:     'excel',
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
      user_id:     user.id,
      entity_type: 'export',
      entity_id:   exportRecord?.id,
      action:      'export_excel',
      new_value:   { document_count: docs.length, total_amount: grandTotal },
    })

    // Stream file
    const buf = await workbook.xlsx.writeBuffer()
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    res.setHeader('Content-Disposition', `attachment; filename="export_${now.slice(0,10)}.xlsx"`)
    return res.status(200).send(Buffer.from(buf))

  } catch (err) {
    console.error('export-excel error:', err)
    return res.status(500).json({ error: err.message })
  }
}
