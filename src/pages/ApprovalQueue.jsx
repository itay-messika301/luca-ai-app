import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  CheckCircle, XCircle, Clock, AlertCircle,
  ChevronLeft, ChevronRight, FileText, Loader2,
  ArrowUpCircle
} from 'lucide-react'

const STATUS_CONFIG = {
  pending:   { label: 'ממתין',    color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  approved:  { label: 'אושר',     color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20'  },
  rejected:  { label: 'נדחה',     color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20'      },
  escalated: { label: 'הוסלם',    color: 'text-violet-400', bg: 'bg-violet-500/10 border-violet-500/20'},
  cancelled: { label: 'בוטל',     color: 'text-slate-400 dark:text-white/30',   bg: 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'           },
}

export default function ApprovalQueue() {
  const { workspace, profile } = useAuth()
  const isOwner = profile?.role === 'workspace_owner'

  const [requests,    setRequests]    = useState([])
  const [selected,    setSelected]    = useState(null)
  const [loading,     setLoading]     = useState(true)
  const [filterStatus, setFilterStatus] = useState('pending')

  const fetchRequests = useCallback(async () => {
    if (!workspace?.id) return
    setLoading(true)

    let query = supabase
      .from('approval_requests')
      .select(`
        *,
        documents(
          id, file_name, vendor_name, invoice_number, invoice_date, total_amount,
          review_status, validation_results, clients(business_name)
        ),
        profiles!assigned_to(full_name)
      `)
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })

    if (filterStatus !== 'all') {
      query = query.eq('status', filterStatus)
    }

    // Non-owners only see requests assigned to them
    if (!isOwner) {
      query = query.eq('assigned_to', profile?.id)
    }

    const { data } = await query.limit(50)
    setRequests(data || [])
    setLoading(false)
  }, [workspace?.id, filterStatus, isOwner, profile?.id])

  useEffect(() => {
    fetchRequests()
  }, [fetchRequests])

  async function handleAction(requestId, action, comment) {
    const now    = new Date().toISOString()
    const request = requests.find(r => r.id === requestId)

    const newStatus = action === 'approve' ? 'approved'
                    : action === 'reject'  ? 'rejected'
                    : 'escalated'

    // Update the approval_request
    await supabase.from('approval_requests').update({
      status:      newStatus,
      comment,
      actioned_at: now,
    }).eq('id', requestId)

    // Update the document approval_status
    if (request?.documents?.id) {
      const docApprovalStatus = newStatus === 'approved' ? 'approved'
                              : newStatus === 'rejected' ? 'rejected'
                              : 'pending'

      await supabase.from('documents').update({
        approval_status: docApprovalStatus,
        // if approved and doc was ready, keep it ready; if rejected, block it
        ...(newStatus === 'rejected' ? { review_status: 'blocked' } : {}),
      }).eq('id', request.documents.id)
    }

    // Audit log
    await supabase.from('audit_log').insert({
      workspace_id: workspace.id,
      entity_type:  'approval_request',
      entity_id:    requestId,
      action:       `approval_${newStatus}`,
      new_value:    { comment, actioned_by: profile?.id },
    })

    setSelected(null)
    fetchRequests()
  }

  const counts = {
    pending:  requests.filter(r => r.status === 'pending').length,
    approved: requests.filter(r => r.status === 'approved').length,
    rejected: requests.filter(r => r.status === 'rejected').length,
  }

  return (
    <div className="flex h-full" dir="rtl">
      {/* Left: request list */}
      <div className="w-80 flex-shrink-0 border-l border-slate-200 dark:border-white/10 flex flex-col">
        {/* Header + filters */}
        <div className="p-4 border-b border-slate-200 dark:border-white/10">
          <h1 className="text-slate-900 dark:text-white font-bold text-lg">תור אישורים</h1>
          <p className="text-slate-400 dark:text-white/40 text-xs mt-0.5">מסמכים הממתינים לאישורך</p>

          <div className="flex gap-1.5 mt-3">
            {[
              { key: 'pending',  label: `ממתינים (${counts.pending})` },
              { key: 'approved', label: 'אושרו' },
              { key: 'rejected', label: 'נדחו'  },
              { key: 'all',      label: 'הכל'   },
            ].map(f => (
              <button
                key={f.key}
                onClick={() => setFilterStatus(f.key)}
                className={`px-2.5 py-1 rounded-md text-xs font-medium transition-all ${
                  filterStatus === f.key
                    ? 'bg-blue-600 text-white'
                    : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/50 hover:text-slate-600 dark:hover:text-white/70'
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Request list */}
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 text-blue-400 animate-spin" />
            </div>
          ) : requests.length === 0 ? (
            <div className="text-center py-12 px-4">
              <CheckCircle className="w-8 h-8 text-slate-300 dark:text-white/15 mx-auto mb-2" />
              <p className="text-slate-400 dark:text-white/30 text-sm">אין בקשות אישור</p>
            </div>
          ) : (
            requests.map(req => {
              const cfg = STATUS_CONFIG[req.status] || STATUS_CONFIG.pending
              const doc = req.documents
              return (
                <button
                  key={req.id}
                  onClick={() => setSelected(req)}
                  className={`w-full text-right p-4 border-b border-slate-100 dark:border-white/5 transition-colors hover:bg-slate-100 dark:hover:bg-white/5 ${
                    selected?.id === req.id ? 'bg-slate-100 dark:bg-white/8' : ''
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <span className="text-slate-700 dark:text-white/80 text-sm font-medium truncate flex-1">
                      {doc?.vendor_name || doc?.file_name || 'מסמך'}
                    </span>
                    <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${cfg.bg} ${cfg.color}`}>
                      {cfg.label}
                    </span>
                  </div>
                  {doc?.total_amount && (
                    <p className="text-slate-500 dark:text-white/50 text-xs font-mono">
                      ₪{Number(doc.total_amount).toLocaleString('he-IL')}
                    </p>
                  )}
                  <p className="text-slate-400 dark:text-white/25 text-xs mt-0.5">
                    {new Date(req.created_at).toLocaleDateString('he-IL')}
                    {req.profiles?.full_name && ` · ${req.profiles.full_name}`}
                  </p>
                </button>
              )
            })
          )}
        </div>
      </div>

      {/* Right: detail pane */}
      <div className="flex-1 overflow-y-auto">
        {selected
          ? <ApprovalDetail request={selected} onAction={handleAction} isOwner={isOwner} />
          : (
            <div className="flex flex-col items-center justify-center h-full text-center px-8">
              <FileText className="w-12 h-12 text-white/10 mb-3" />
              <p className="text-slate-400 dark:text-white/30 text-sm">בחר בקשת אישור מהרשימה</p>
            </div>
          )
        }
      </div>
    </div>
  )
}

function ApprovalDetail({ request, onAction, isOwner }) {
  const [action,  setAction]  = useState(null)   // 'approve' | 'reject' | 'escalate'
  const [comment, setComment] = useState('')
  const [saving,  setSaving]  = useState(false)
  const [error,   setError]   = useState(null)

  const doc     = request.documents
  const isPending = request.status === 'pending'

  async function submit() {
    if (!action) return
    if ((action === 'reject' || action === 'escalate') && !comment.trim()) {
      setError('נדרש הסבר')
      return
    }
    setSaving(true)
    setError(null)
    await onAction(request.id, action, comment.trim())
    setSaving(false)
  }

  return (
    <div className="p-6 max-w-2xl">
      {/* Title */}
      <div className="mb-5">
        <h2 className="text-slate-900 dark:text-white font-bold text-lg">{doc?.vendor_name || doc?.file_name || 'מסמך'}</h2>
        <p className="text-slate-400 dark:text-white/40 text-sm mt-0.5">
          {doc?.clients?.business_name && `${doc.clients.business_name} · `}
          {doc?.invoice_date && new Date(doc.invoice_date).toLocaleDateString('he-IL')}
        </p>
      </div>

      {/* Document summary */}
      <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 mb-4 grid grid-cols-2 gap-4 text-sm">
        <Field label="מספר חשבונית" value={doc?.invoice_number || '—'} />
        <Field label="סה״כ"          value={doc?.total_amount != null ? `₪${Number(doc.total_amount).toLocaleString('he-IL')}` : '—'} />
        <Field label="סטטוס ביקורת" value={doc?.review_status || '—'} />
        <Field label="בקשה נוצרה"   value={new Date(request.created_at).toLocaleDateString('he-IL')} />
      </div>

      {/* Validation issues */}
      {doc?.validation_results?.issues?.length > 0 && (
        <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-4 mb-4">
          <p className="text-yellow-400 text-xs font-medium mb-2 flex items-center gap-1.5">
            <AlertCircle className="w-3.5 h-3.5" />
            בעיות ביקורת
          </p>
          {doc.validation_results.issues.map((issue, i) => (
            <p key={i} className="text-yellow-300/70 text-xs">{issue}</p>
          ))}
        </div>
      )}

      {/* Previous comment */}
      {request.comment && (
        <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4 mb-4">
          <p className="text-slate-400 dark:text-white/40 text-xs mb-1">הערה</p>
          <p className="text-slate-600 dark:text-white/70 text-sm">{request.comment}</p>
        </div>
      )}

      {/* Actions */}
      {isPending && (
        <div className="space-y-4">
          {/* Action selection */}
          <div className="flex gap-2">
            <ActionBtn
              active={action === 'approve'}
              onClick={() => { setAction('approve'); setError(null) }}
              icon={<CheckCircle className="w-4 h-4" />}
              label="אשר"
              color="green"
            />
            <ActionBtn
              active={action === 'reject'}
              onClick={() => { setAction('reject'); setError(null) }}
              icon={<XCircle className="w-4 h-4" />}
              label="דחה"
              color="red"
            />
            {isOwner && (
              <ActionBtn
                active={action === 'escalate'}
                onClick={() => { setAction('escalate'); setError(null) }}
                icon={<ArrowUpCircle className="w-4 h-4" />}
                label="הסלם"
                color="violet"
              />
            )}
          </div>

          {action && (
            <>
              <div>
                <label className="text-slate-400 dark:text-white/40 text-xs mb-1 block">
                  {action === 'approve' ? 'הערה (אופציונלי)' : 'סיבה (חובה)'}
                </label>
                <textarea
                  value={comment}
                  onChange={e => setComment(e.target.value)}
                  rows={3}
                  placeholder={action === 'approve' ? 'הוסף הערה...' : 'הסבר את ההחלטה...'}
                  className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm resize-none focus:outline-none focus:border-blue-500 transition-colors"
                />
                {error && <p className="text-red-400 text-xs mt-1">{error}</p>}
              </div>

              <button
                onClick={submit}
                disabled={saving}
                className={`w-full py-2.5 rounded-lg text-slate-900 dark:text-white text-sm font-medium transition-colors disabled:opacity-50 ${
                  action === 'approve' ? 'bg-green-600 hover:bg-green-700'
                  : action === 'reject'  ? 'bg-red-600 hover:bg-red-700'
                  : 'bg-violet-600 hover:bg-violet-700'
                }`}
              >
                {saving ? (
                  <Loader2 className="w-4 h-4 animate-spin mx-auto" />
                ) : (
                  action === 'approve' ? 'אשר מסמך'
                  : action === 'reject' ? 'דחה מסמך'
                  : 'הסלם לבעל משרד'
                )}
              </button>
            </>
          )}
        </div>
      )}

      {!isPending && (
        <div className={`flex items-center gap-2 px-4 py-3 rounded-xl border ${STATUS_CONFIG[request.status]?.bg}`}>
          {request.status === 'approved' && <CheckCircle className="w-4 h-4 text-green-400" />}
          {request.status === 'rejected' && <XCircle    className="w-4 h-4 text-red-400"   />}
          <div>
            <p className={`text-sm font-medium ${STATUS_CONFIG[request.status]?.color}`}>
              {STATUS_CONFIG[request.status]?.label}
            </p>
            {request.comment && <p className="text-slate-500 dark:text-white/50 text-xs mt-0.5">{request.comment}</p>}
            {request.actioned_at && (
              <p className="text-slate-400 dark:text-white/30 text-xs">
                {new Date(request.actioned_at).toLocaleString('he-IL')}
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  )
}

function ActionBtn({ active, onClick, icon, label, color }) {
  const colors = {
    green:  active ? 'bg-green-600 text-white'  : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/60 hover:text-green-400',
    red:    active ? 'bg-red-600 text-white'    : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/60 hover:text-red-400',
    violet: active ? 'bg-violet-600 text-white' : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/60 hover:text-violet-400',
  }
  return (
    <button
      onClick={onClick}
      className={`flex-1 flex items-center justify-center gap-2 py-2.5 rounded-lg text-sm font-medium transition-colors border border-slate-200 dark:border-white/10 ${colors[color]}`}
    >
      {icon}
      {label}
    </button>
  )
}

function Field({ label, value }) {
  return (
    <div>
      <p className="text-slate-400 dark:text-white/30 text-xs mb-0.5">{label}</p>
      <p className="text-slate-700 dark:text-white/80 text-sm">{value}</p>
    </div>
  )
}
