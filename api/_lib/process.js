// Core AI processing of one document, shared by /api/process-document
// (manual upload / "process again") and /api/intake-email (automatic intake).
// The caller is responsible for authorisation; this function trusts `doc`.

export const ALLOCATION_NUMBER_THRESHOLD = 5000 // ILS — Mispar Haktza'a required above this amount
export const EXPECTED_VAT_RATE           = 18   // Israeli VAT as of 2024

export const EXTRACTION_PROMPT = `You are an expert Israeli accounting document analyzer. Analyze this document and extract all fields.
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

// Anthropic accepts image/jpeg, image/png, image/gif, image/webp only
export function imageMediaType(fileType) {
  const t = String(fileType || '').toLowerCase()
  if (t === 'png')  return 'image/png'
  if (t === 'webp') return 'image/webp'
  if (t === 'gif')  return 'image/gif'
  return 'image/jpeg' // jpg, jpeg, unknown
}

// Runs extraction + Israeli validation rules on a document row and saves the
// result. Returns { ok: true, review_status, issues } or
// { ok: false, httpStatus, error, detail? }. On failure the row is left with
// status 'error'.
export async function processDocument(supabase, doc) {
  const document_id = doc.id
  const fail = async (httpStatus, error, detail) => {
    await supabase.from('documents').update({ status: 'error' }).eq('id', document_id)
    return { ok: false, httpStatus, error, detail }
  }

  // 1. Mark as processing
  await supabase.from('documents').update({ status: 'processing' }).eq('id', document_id)

  // 2. Download from storage
  const { data: fileData, error: downloadErr } = await supabase
    .storage.from('documents').download(doc.file_path)
  if (downloadErr) return fail(500, 'לא הצלחנו להוריד את הקובץ לעיבוד')

  // 3. Prepare for Claude Vision
  const buffer  = Buffer.from(await fileData.arrayBuffer())
  const base64  = buffer.toString('base64')
  const isPdf   = String(doc.file_type || '').toLowerCase() === 'pdf'

  // PDFs require type:'document'; images require type:'image'
  const fileContentBlock = isPdf
    ? { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: base64 } }
    : { type: 'image',    source: { type: 'base64', media_type: imageMediaType(doc.file_type), data: base64 } }

  // 4. Claude Vision API
  const aiResp = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key':          process.env.ANTHROPIC_API_KEY,
      'anthropic-version':  '2023-06-01',
      'Content-Type':       'application/json',
    },
    body: JSON.stringify({
      model:      'claude-sonnet-4-5',
      max_tokens: 2048,
      messages: [{
        role: 'user',
        content: [
          fileContentBlock,
          { type: 'text', text: EXTRACTION_PROMPT },
        ],
      }],
    }),
  })

  if (!aiResp.ok) {
    const aiErrBody = await aiResp.text().catch(() => '')
    console.error('Anthropic API error:', aiResp.status, aiErrBody)
    return fail(500, 'עיבוד ה-AI נכשל. נסו לעבד מחדש.', aiErrBody)
  }

  const aiResult     = await aiResp.json()
  const responseText = aiResult.content?.[0]?.text || ''

  // 5. Parse AI response
  let extracted
  try {
    const jsonMatch = responseText.match(/\{[\s\S]*\}/)
    extracted = JSON.parse(jsonMatch ? jsonMatch[0] : responseText)
  } catch {
    return fail(500, 'לא הצלחנו לקרוא את תשובת ה-AI. נסו לעבד מחדש.')
  }

  // 6. Israeli validation rules
  const validationIssues    = []  // needs_review
  const blockingIssues      = []  // blocked
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
    validationIssues.push('ביטחון נמוך בסכומים — נדרש אימות')
  }

  // Rule 4: Duplicate check — same vendor + invoice number within workspace
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

  // All AI-processed documents require manual approval in the review queue.
  // Blocking issues → 'blocked'; everything else → 'needs_review'.
  // Only a human reviewer can promote a document to 'ready'.
  let review_status = 'needs_review'
  let is_duplicate  = false
  if (blockingIssues.length > 0) review_status = 'blocked'
  if (validationIssues.some(i => i.includes('כפולה'))) is_duplicate = true

  // 7. Save extracted data
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
  if (updateErr) return { ok: false, httpStatus: 500, error: 'שמירת תוצאות העיבוד נכשלה' }

  // 8. Audit log entry
  await supabase.from('audit_log').insert({
    workspace_id: doc.workspace_id,
    entity_type:  'document',
    entity_id:    document_id,
    action:       'ai_process',
    new_value:    { review_status, issues: updateData.validation_results.issues },
  })

  return { ok: true, review_status, issues: updateData.validation_results.issues }
}
