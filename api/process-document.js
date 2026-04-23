import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const anthropicKey = process.env.ANTHROPIC_API_KEY

const supabase = createClient(supabaseUrl, supabaseServiceKey)

const EXTRACTION_PROMPT = `You are an expert accounting document analyzer. Analyze this document image and extract the following fields.
Return ONLY a valid JSON object with these exact keys:
{
  "document_type": "invoice" | "receipt" | "tax_document" | "bank_statement" | "other",
  "invoice_number": "string or null",
  "invoice_date": "YYYY-MM-DD or null",
  "vendor_name": "string or null",
  "amount_before_vat": number or null,
  "vat_rate": number or null (as percentage, e.g. 17),
  "vat_amount": number or null,
  "total_amount": number or null,
  "currency": "ILS" | "USD" | "EUR" | null,
  "allocation_number": "string or null",
  "description": "brief description of the document",
  "confidence": {
    "invoice_number": 0.0-1.0,
    "invoice_date": 0.0-1.0,
    "amounts": 0.0-1.0,
    "overall": 0.0-1.0
  }
}

Important: Return ONLY the JSON, no markdown, no code blocks, no extra text.`

export default async function handler(req, res) {
  // CORS headers
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')

  if (req.method === 'OPTIONS') {
    return res.status(200).end()
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    const { document_id } = req.body
    if (!document_id) {
      return res.status(400).json({ error: 'document_id is required' })
    }

    // 1. Fetch the document record
    const { data: doc, error: fetchErr } = await supabase
      .from('documents')
      .select('*')
      .eq('id', document_id)
      .single()

    if (fetchErr || !doc) {
      return res.status(404).json({ error: 'Document not found' })
    }

    // 2. Update status to processing
    await supabase
      .from('documents')
      .update({ status: 'processing' })
      .eq('id', document_id)

    // 3. Download the file from storage
    const { data: fileData, error: downloadErr } = await supabase
      .storage
      .from('documents')
      .download(doc.file_path)

    if (downloadErr) {
      await supabase.from('documents').update({ status: 'error' }).eq('id', document_id)
      return res.status(500).json({ error: 'Failed to download file: ' + downloadErr.message })
    }

    // 4. Convert file to base64 for Anthropic Vision API
    const buffer = Buffer.from(await fileData.arrayBuffer())
    const base64 = buffer.toString('base64')
    const mimeType = doc.file_type === 'pdf' ? 'application/pdf' : `image/${doc.file_type || 'png'}`

    // 5. Call Anthropic Claude Vision API
    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': anthropicKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2048,
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'image',
                source: {
                  type: 'base64',
                  media_type: mimeType,
                  data: base64,
                },
              },
              {
                type: 'text',
                text: EXTRACTION_PROMPT,
              },
            ],
          },
        ],
      }),
    })

    if (!anthropicResponse.ok) {
      const errBody = await anthropicResponse.text()
      console.error('Anthropic API error:', errBody)
      await supabase.from('documents').update({ status: 'error' }).eq('id', document_id)
      return res.status(500).json({ error: 'AI processing failed' })
    }

    const aiResult = await anthropicResponse.json()
    const responseText = aiResult.content?.[0]?.text || ''

    // 6. Parse the AI response
    let extracted
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/)
      extracted = JSON.parse(jsonMatch ? jsonMatch[0] : responseText)
    } catch (parseErr) {
      console.error('Failed to parse AI response:', responseText)
      await supabase.from('documents').update({ status: 'error' }).eq('id', document_id)
      return res.status(500).json({ error: 'Failed to parse AI response' })
    }

    // 7. Update document with extracted data
    const updateData = {
      status: 'processed',
      document_type: extracted.document_type || doc.document_type,
      invoice_number: extracted.invoice_number,
      invoice_date: extracted.invoice_date,
      vendor_name: extracted.vendor_name,
      amount_before_vat: extracted.amount_before_vat,
      vat_rate: extracted.vat_rate,
      vat_amount: extracted.vat_amount,
      total_amount: extracted.total_amount,
      currency: extracted.currency,
      allocation_number: extracted.allocation_number,
      field_confidence: extracted.confidence || {},
      validation_results: { description: extracted.description },
    }

    const { error: updateErr } = await supabase
      .from('documents')
      .update(updateData)
      .eq('id', document_id)

    if (updateErr) {
      console.error('Failed to update document:', updateErr)
      return res.status(500).json({ error: 'Failed to save results' })
    }

    return res.status(200).json({ success: true, data: updateData })

  } catch (err) {
    console.error('Process document error:', err)
    return res.status(500).json({ error: 'Internal server error: ' + err.message })
  }
}
