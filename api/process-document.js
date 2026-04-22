import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.VITE_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const openaiKey = process.env.OPENAI_API_KEY

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

    // 4. Convert file to base64 for OpenAI Vision API
    const buffer = Buffer.from(await fileData.arrayBuffer())
    const base64 = buffer.toString('base64')
    const mimeType = doc.file_type === 'pdf' ? 'application/pdf' : `image/${doc.file_type || 'png'}`

    // 5. Call OpenAI Vision API
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: EXTRACTION_PROMPT },
              {
                type: 'image_url',
                image_url: {
                  url: `data:${mimeType};base64,${base64}`,
                },
              },
            ],
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      }),
    })

    if (!openaiResponse.ok) {
      const errText = await openaiResponse.text()
      await supabase.from('documents').update({ status: 'error' }).eq('id', document_id)
      return res.status(500).json({ error: 'OpenAI API error: ' + errText })
    }

    const aiResult = await openaiResponse.json()
    const content = aiResult.choices?.[0]?.message?.content || '{}'

    // 6. Parse the AI response
    let extracted
    try {
      // Clean potential markdown code blocks
      const cleaned = content.replace(/```json?\n?/g, '').replace(/```/g, '').trim()
      extracted = JSON.parse(cleaned)
    } catch (parseErr) {
      await supabase.from('documents').update({ status: 'error' }).eq('id', document_id)
      return res.status(500).json({ error: 'Failed to parse AI response', raw: content })
    }

    // 7. Update the document with extracted data
    const { error: updateErr } = await supabase
      .from('documents')
      .update({
        status: 'processed',
        document_type: extracted.document_type || doc.document_type,
        invoice_number: extracted.invoice_number,
        invoice_date: extracted.invoice_date,
        amount_before_vat: extracted.amount_before_vat,
        vat_rate: extracted.vat_rate,
        vat_amount: extracted.vat_amount,
        total_amount: extracted.total_amount,
        currency: extracted.currency || 'ILS',
        allocation_number: extracted.allocation_number,
        field_confidence: extracted.confidence || {},
        validation_results: {
          ai_model: 'gpt-4o',
          processed_at: new Date().toISOString(),
          vendor_name: extracted.vendor_name,
          description: extracted.description,
        },
      })
      .eq('id', document_id)

    if (updateErr) {
      return res.status(500).json({ error: 'Failed to update document: ' + updateErr.message })
    }

    return res.status(200).json({
      success: true,
      document_id,
      extracted,
    })
  } catch (err) {
    console.error('Process document error:', err)
    return res.status(500).json({ error: err.message })
  }
}
