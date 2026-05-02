import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const ALLOCATION_NUMBER_THRESHOLD = 5000 // ILS — Mispar Haktza'a required above this amount
const EXPECTED_VAT_RATE           = 18   // Israeli VAT as of 2024

const EXTRACTION_PROMPT = `You are an expert Israeli accounting document analyzer. Analyze this document and extract all fields.
Return ONLY valid JSON with these exact keys (null if not found):
{
  "document_type": "invoice" | "receipt" | "credit_note" | "tax_document" | "bank_statement" | "other",
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "vendor_name": "string or null",
  "vendor_registration_number": "9-digit Israeli company number or null",
  "amount_before_vat": number or null,
  "vat_rate": number or null (percentage, e.g. 18 for Israeli VAT),
  "vat_amount": number or null,
  "total_amount": number or null,
  "withholding_tax": number or null (ניכוי מס במקור, if shown),
  "currency": "ILS" | "USD" | "EUR" | null,
  "allocation_number": "string or null (מספר הקצאה — the reference number from the Israeli Tax Authority portal)",
  "description": "brief description in Hebrew or English",
  "confidence": {
    "invoice_number": 0.0-1.0,
    "invoice_date": 0.0-1.0,
    "vendor_name": 0.0-1.0,
    "amounts": 0.0-1.0,
    "allocation_number": 0.0-1.0,
    "overall": 0.0-1.0
  }
}

Israeli-specific notes:
- Current VAT rate in Israel is 18% (not 17%)
- Mispar Haktza'a (מספר הקצאה) is a reference number issued by the Israeli Tax Authority
- Withholding tax (ניכוי מס במקור) appears on some invoices as a deduction
- Return ONLY the JSON, no markdown, no code blocks.`

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
  if (req.method === 'OPTIONS') return res.status(200).end()
  if (req.method !== 'POST')    return res.status(405).json({ error: 'Method not allowed' })

  try {
    const { document_id } = req.body
    if (!document_id) return res.status(400).json({ error: 'document_id is required' })

    // 1. Fetch document record
    const { data: doc, error: fetchErr } = await supabase
      .from('documents')
      .select('*')
      .eq('id', document_id)
      .single()

    if (fetchErr || !doc) return res.status(404).json({ error: 'Document not found' })

    // 2. Mark as processing
    await supabase.from('documents').update({ status: 'processing' }).eq('id', document_id)

    // 3. Download from storage
    const { data: fileData, error: downloadErr } = await supabase
      .storage.from('documents').download(doc.file_path)

    if (downloadErr) {
      await supabase.from('documents').update({ status: 'error' }).eq('id', document_id)
      return res.status(500).json({ error: 'Failed to download file: ' + downloadErr.message })
    }

    // 4. Prepare for Claude Vision
    const buffer   = Buffer.from(await fileData.arrayBuffer())
    const base64   = buffer.toString('base64')
    const mimeType = doc.file_type === 'pdf' ? 'application/pdf' : `image/${doc.file_type || 'jpeg'}`

    // 5. Claude Vision API
    const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key':          process.env.ANTHROPIC_API_KEY,
        'anthropic-version':  '2023-06-01',
        'Content-Type':       'application/json',
      },
      body: JSON.stringify({
        model:      'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
            { type: 'text',  text: EXTRACTION_PROMPT },
          ],
        }],
      }),
    })

    if (!aiResp.ok) {
      await supabase.from('documents').update({ status: 'error' }).eq('id', document_id)
      return res.status(500).json({ error: 'AI processing failed' })
    }

    const aiResult     = await aiResp.json()
    const responseText = aiResult.content?.[0]?.text || ''

    // 6. Parse AI response
    let extracted
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      extracted = JSON.parse(jsonMatch ? jsonMatch[0] : responseText)
    } catch {
      await supabase.from('documents').update({ status: 'error' }).eq('id', document_id)
      return res.status(500).json({ error: 'Failed to parse AI response' })
    }

    // 7. Israeli validation rules
    const validationIssues   = []  // needs_review
    const blockingIssues     = []  // blocked
    const allocationValidated = false

    const total = Number(extracted.total_amount) || 0

    // Rule 1: VAT rate must be 18%
    if (extracted.vat_rate !== null && extracted.vat_rate !== undefined) {
      const rate = Number(extracted.vat_rate)
      if (rate > 0 && Math.abs(rate - EXPECTED_VAT_RATE) > 0.5) {
        validationIssues.push(`שיעור מע"מ ${rate}% — הצפי הוא ${EXPECTED_VAT_RATE}%`)
      }
    }

    // Rule 2: Mispar Haktza'a required for invoices > 5,000 ILS
    if (total > ALLOCATION_NUMBER_THRESHOLD && !extracted.allocation_number) {
      blockingIssues.push(`חשבונית מעל ₪${ALLOCATION_NUMBER_THRESHOLD.toLocaleString()} — נדרש מספר הקצאה`)
    }

    // Rule 3: Confidence check — flag low confidence fields
    const confidence = extracted.confidence || {}
    if ((confidence.overall || 1) < 0.6) {
      validationIssues.push('ביטחון נמוך בחילוץ — נדרשת בדיקה ידנית')
    }
    if ((confidence.amounts || 1) < 0.7) {
      validationIssues.push('ביטחון נמוך בסכומים — נדרשת אימות')
    }

    // Rule 4: Duplicate check — same vendor + invoice number + amount within workspace
    if (extracted.vendor_name && extracted.invoice_number) {
      const { data: dupes } = await supabase
        .from('documents')
        .select('id')
        .eq('workspace_id', doc.workspace_id)
        .eq('vendor_name', extracted.vendor_name)
        .eq('invoice_number', extracted.invoice_number)
        .neq('id', document_id)
        .limit(1)

      if (dupes?.length > 0) {
        validationIssues.push(`חשבונית כפולה — ${extracted.vendor_name} / ${extracted.invoice_number}`)
      }
    }

    // Determine review_status
    let review_status = 'ready'
    let is_duplicate  = false

    if (blockingIssues.length > 0) {
      review_status = 'blocked'
    } else if (validationIssues.length > 0) {
      review_status = 'needs_review'
      is_duplicate  = validationIssues.some(i => i.includes('כפולה'))
    }

    // 8. Save extracted data
    const updateData = {
      status:                    'processed',
      review_status,
      is_duplicate,
      document_type:             extracted.document_type  || doc.document_type,
      invoice_number:            extracted.invoice_number,
      invoice_date:              extracted.invoice_date,
      vendor_name:               extracted.vendor_name,
      vendor_registration_number: extracted.vendor_registration_number,
      amount_before_vat:         extracted.amount_before_vat,
      vat_rate:                  extracted.vat_rate,
      vat_amount:                extracted.vat_amount,
      total_amount:              extracted.total_amount,
      withholding_tax:           extracted.withholding_tax,
      currency:                  extracted.currency || 'ILS',
      allocation_number:         extracted.allocation_number,
      allocation_validated:      allocationValidated,
      field_confidence:          extracted.confidence || {},
      validation_results: {
        description:    extracted.description,
        issues:         [...blockingIssues, ...validationIssues],
        blocking:       blockingIssues,
        needs_review:   validationIssues,
      },
      updated_at: new Date().toISOString(),
    }

    const { error: updateErr } = await supabase
      .from('documents').update(updateData).eq('id', document_id)

    if (updateErr) {
      return res.status(500).json({ error: 'Failed to save results: ' + updateErr.message })
    }

    // 9. Write audit log entry
    await supabase.from('audit_log').insert({
      workspace_id: doc.workspace_id,
      entity_type:  'document',
      entity_id:    document_id,
      action:       'ai_process',
      new_value:    { review_status, issues: updateData.validation_results.issues },
    })

    return res.status(200).json({ success: true, review_status, issues: updateData.validation_results.issues })

  } catch (err) {
    console.error('Process document error:', err)
    return res.status(500).json({ error: 'Internal server error: ' + err.message })
  }
}
