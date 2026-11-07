import { createClient } from '@supabase/supabase-js'
import { allowedClientIds, canOfficeWrite, READ_ONLY_ERROR } from './_lib/access.js'
import { processDocument } from './_lib/process.js'

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
  if (req.method !== 'POST')    return res.status(405).json({ error: 'פעולה לא נתמכת' })

  try {
    // Auth: verify caller is a workspace member
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'יש להתחבר מחדש' })
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return res.status(401).json({ error: 'החיבור פג תוקף. התחברו מחדש.' })

    const { document_id } = req.body
    if (!document_id) return res.status(400).json({ error: 'חסר מזהה מסמך' })

    // 1. Fetch document record
    const { data: doc, error: fetchErr } = await supabase
      .from('documents')
      .select('*')
      .eq('id', document_id)
      .single()

    if (fetchErr || !doc) return res.status(404).json({ error: 'המסמך לא נמצא' })

    // 1b. Authorisation: office staff of the document's workspace, or an
    //     end client linked to the document's client (user_clients).
    const { data: caller } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', user.id)
      .single()

    let allowed = false
    if (caller && ['workspace_owner', 'workspace_employee'].includes(caller.role)) {
      if (!canOfficeWrite(caller)) return res.status(403).json({ error: READ_ONLY_ERROR })
      allowed = !!caller.workspace_id && caller.workspace_id === doc.workspace_id
      if (allowed) {
        const ids = await allowedClientIds(supabase, user.id, caller)
        if (ids) allowed = !!doc.client_id && ids.has(doc.client_id)
      }
    } else if (caller?.role === 'end_client' && doc.client_id) {
      const { data: link } = await supabase
        .from('user_clients')
        .select('client_id')
        .eq('user_id', user.id)
        .eq('client_id', doc.client_id)
        .maybeSingle()
      allowed = !!link
    }
    if (!allowed) return res.status(403).json({ error: 'אין הרשאה למסמך הזה' })

    const result = await processDocument(supabase, doc)
    if (!result.ok) {
      return res.status(result.httpStatus || 500).json({ error: result.error, ...(result.detail ? { detail: result.detail } : {}) })
    }
    return res.status(200).json({ success: true, review_status: result.review_status, issues: result.issues })

  } catch (err) {
    console.error('Process document error:', err)
    return res.status(500).json({ error: 'שגיאה פנימית. נסו שוב בעוד רגע.' })
  }
}
