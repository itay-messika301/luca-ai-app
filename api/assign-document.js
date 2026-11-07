// Assign documents to a client (used for "unassigned" email-intake documents
// and for the bulk "assign to client" action).
//
// POST { document_ids: uuid[], client_id: uuid }
//   - caller must be office staff of the same workspace with write access
//     (read-only staff from migration 015 are refused);
//   - restricted staff may only assign to, and from, clients they can see;
//   - the file is moved to {workspace_id}/{client_id}/... so the client's
//     contacts and assigned staff can open it (storage RLS is folder-based).
// Returns { assigned: [{ id, status }], failed: [{ id, error }] }.
// The UI then starts AI processing for documents still 'pending'.

import { createClient } from '@supabase/supabase-js'
import { allowedClientIds, canOfficeWrite, READ_ONLY_ERROR } from './_lib/access.js'

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
)

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'פעולה לא נתמכת' })

  try {
    const token = req.headers.authorization?.replace('Bearer ', '')
    if (!token) return res.status(401).json({ error: 'יש להתחבר מחדש' })
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token)
    if (authErr || !user) return res.status(401).json({ error: 'החיבור פג תוקף. התחברו מחדש.' })

    const { document_ids, client_id } = req.body || {}
    const ids = Array.isArray(document_ids) ? document_ids.filter(id => UUID.test(String(id))) : []
    if (!ids.length || ids.length > 500) return res.status(400).json({ error: 'לא נבחרו מסמכים' })
    if (!UUID.test(String(client_id || ''))) return res.status(400).json({ error: 'יש לבחור לקוח' })

    const { data: caller } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    if (!caller || !['workspace_owner', 'workspace_employee'].includes(caller.role) || !caller.workspace_id) {
      return res.status(403).json({ error: 'אין הרשאה' })
    }
    if (!canOfficeWrite(caller)) return res.status(403).json({ error: READ_ONLY_ERROR })

    const { data: client } = await supabase
      .from('clients').select('id, workspace_id').eq('id', client_id).maybeSingle()
    if (!client || client.workspace_id !== caller.workspace_id) {
      return res.status(404).json({ error: 'הלקוח לא נמצא' })
    }

    const allowed = await allowedClientIds(supabase, user.id, caller) // null = all clients
    if (allowed && !allowed.has(client_id)) return res.status(403).json({ error: 'אין לך גישה ללקוח הזה' })

    const { data: docs, error: docsErr } = await supabase
      .from('documents')
      .select('id, workspace_id, client_id, file_path, status')
      .in('id', ids)
      .eq('workspace_id', caller.workspace_id)
    if (docsErr) throw docsErr

    const assigned = []
    const failed   = ids.filter(id => !docs.some(d => d.id === id)).map(id => ({ id, error: 'המסמך לא נמצא' }))

    for (const doc of docs) {
      // Restricted staff can't see unassigned documents, nor other clients' documents.
      if (allowed && (!doc.client_id || !allowed.has(doc.client_id))) {
        failed.push({ id: doc.id, error: 'אין הרשאה למסמך הזה' })
        continue
      }

      // Move the file under the new client's folder: {ws}/{client}/{name}
      let newPath = doc.file_path
      const parts = String(doc.file_path || '').split('/')
      if (parts.length >= 3 && parts[0] === doc.workspace_id && parts[1] !== client_id) {
        newPath = [parts[0], client_id, ...parts.slice(2)].join('/')
        const { error: mvErr } = await supabase.storage.from('documents').move(doc.file_path, newPath)
        if (mvErr) {
          console.error('[assign-document] move failed', doc.id, mvErr.message)
          failed.push({ id: doc.id, error: 'העברת הקובץ נכשלה' })
          continue
        }
      }

      const { error: upErr } = await supabase
        .from('documents')
        .update({ client_id, file_path: newPath, updated_at: new Date().toISOString() })
        .eq('id', doc.id)
      if (upErr) {
        // Put the file back so the row and storage stay in sync
        if (newPath !== doc.file_path) await supabase.storage.from('documents').move(newPath, doc.file_path)
        failed.push({ id: doc.id, error: 'השיוך נכשל' })
        continue
      }

      await supabase.from('audit_log').insert({
        workspace_id: doc.workspace_id,
        user_id:      user.id,
        entity_type:  'document',
        entity_id:    doc.id,
        action:       'assign_client',
        old_value:    { client_id: doc.client_id },
        new_value:    { client_id },
      })

      assigned.push({ id: doc.id, status: doc.status })
    }

    return res.status(200).json({ assigned, failed })
  } catch (err) {
    console.error('assign-document error:', err)
    return res.status(500).json({ error: 'שגיאה פנימית. נסו שוב בעוד רגע.' })
  }
}
