import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  CheckCircle, XCircle, AlertTriangle, ChevronLeft, ChevronRight,
  Edit2, Check, X, FileText, AlertCircle, Download
} from 'lucide-react'

const REVIEW_STATUS_INFO = {
  needs_review: { label: 'נדרש בדיקה', color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/30' },
  blocked:      { label: 'חסום',        color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/30' },
}

export default function ReviewQueue() {
  const { profile, workspace } = useAuth()
  const navigate = useNavigate()
  const [docs,          setDocs]          = useState([])
  const [loading,       setLoading]       = useState(true)
  const [selected,      setSelected]      = useState(null) // index in docs array
  const [filter,        setFilter]        = useState('all') // 'all' | 'needs_review' | 'blocked'
  const [approvalToast, setApprovalToast] = useState(null) // { fileName }

  const fetchDocs = useCallback(async () => {
    if (!workspace?.id) return
    setLoading(true)
    const q = supabase
      .from('documents')
      .select('*, clients(business_name)')
      .eq('workspace_id', workspace.id)
      .in('review_status', ['needs_review', 'blocked'])
      .order('created_at', { ascending: false })

    const { data } = await q
    setDocs(data || [])
    setLoading(false)
  }, [workspace?.id])

  useEffect(() => { fetchDocs() }, [fetchDocs])

  const filtered = filter === 'all' ? docs : docs.filter(d => d.review_status === filter)
  const currentDoc = selected !== null ? filtered[selected] : null

  function navigate(direction) {
    if (selected === null) return
    const next = selected + direction
    if (next >= 0 && next < filtered.length) setSelected(next)
  }

  async function onApprove(docId) {
    const doc = docs.find(d => d.id === docId)
    await updateStatus(docId, 'ready', 'approve', null)
    // Also mark approval_status = 'approved' for data integrity
    await supabase.from('documents').update({ approval_status: 'approved' }).eq('id', docId)
    setApprovalToast({ fileName: doc?.file_name || 'מסמך' })
    setTimeout(() => setApprovalToast(null), 8000)
  }

  async function onReject(docId, reason) {
    await updateStatus(docId, 'blocked', 'reject', reason)
  }

  async function updateStatus(docId, newStatus, action, note) {
    const doc = docs.find(d => d.id === docId)

    const { error } = await supabase
      .from('documents')
      .update({ review_status: newStatus, reviewed_by: profile.id, reviewed_at: new Date().toISOString(), review_notes: note })
      .eq('id', docId)

    if (error) return

    // Audit log
    await supabase.from('audit_log').insert({
      workspace_id: workspace.id,
      user_id:      profile.id,
      entity_type:  'document',
      entity_id:    docId,
      action,
      old_value:    { review_status: doc?.review_status },
      new_value:    { review_status: newStatus },
      note,
    })

    await fetchDocs()
    if (selected !== null && selected >= filtered.length - 1) {
      setSelected(Math.max(0, filtered.length - 2))
    }
  }

  const counts = {
    all:          docs.length,
    needs_review: docs.filter(d => d.review_status === 'needs_review').length,
    blocked:      docs.filter(d => d.review_status === 'blocked').length,
  }

  return (
    <div className="p-6 h-full flex flex-col" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 className="text-slate-900 dark:text-white text-2xl font-bold">תור אישורים</h1>
          <p className="text-slate-400 dark:text-white/40 text-sm mt-0.5">{counts.all} מסמכים ממתינים לאישור</p>
        </div>
        <div className="flex items-center gap-2">
          {[
            { key: 'all',          label: `הכל (${counts.all})` },
            { key: 'needs_review', label: `נדרש בדיקה (${counts.needs_review})` },
            { key: 'blocked',      label: `חסום (${counts.blocked})` },
          ].map(({ key, label }) => (
            <button
              key={key}
              onClick={() => { setFilter(key); setSelected(null) }}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                filter === key
                  ? 'bg-blue-600 text-slate-900 dark:text-white'
                  : 'bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/80'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <CheckCircle className="w-12 h-12 text-green-400/50 mx-auto mb-3" />
            {docs.length === 0 ? (
              <>
                <p className="text-slate-700 dark:text-white/70 text-base font-medium">✓ אין מסמכים הממתינים לבדיקה</p>
                <p className="text-slate-400 dark:text-white/40 text-sm mt-1">כל המסמכים מאושרים — כל הכבוד!</p>
              </>
            ) : (
              <p className="text-slate-400 dark:text-white/40 text-sm">אין תוצאות לפילטר הנוכחי</p>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left: document list */}
          <div className="w-80 flex flex-col gap-1.5 overflow-y-auto flex-shrink-0">
            {filtered.map((doc, i) => {
              const info = REVIEW_STATUS_INFO[doc.review_status]
              const StatusIcon = doc.review_status === 'blocked' ? XCircle : AlertTriangle
              return (
                <button
                  key={doc.id}
                  onClick={() => setSelected(i)}
                  className={`text-right w-full px-3 py-3 rounded-xl border transition-all ${
                    selected === i
                      ? 'bg-blue-600/20 border-blue-500/40 text-slate-900 dark:text-white'
                      : 'bg-slate-50 dark:bg-white/3 border-slate-100 dark:border-white/8 text-slate-600 dark:text-white/70 hover:bg-slate-100 dark:hover:bg-white/6'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-1">
                    <StatusIcon className={`w-3.5 h-3.5 flex-shrink-0 ${info?.color}`} />
                    <span className="text-xs truncate flex-1">{doc.file_name}</span>
                  </div>
                  <p className="text-slate-400 dark:text-white/30 text-xs truncate pr-5">
                    {doc.clients?.business_name || '—'}
                    {doc.total_amount && ` · ₪${Number(doc.total_amount).toLocaleString('he-IL')}`}
                  </p>
                </button>
              )
            })}
          </div>

          {/* Right: detail pane */}
          {currentDoc ? (
            <DocReviewPane
              key={currentDoc.id}
              doc={currentDoc}
              docIndex={selected}
              total={filtered.length}
              onNavigate={navigate}
              onApprove={onApprove}
              onReject={onReject}
              onFieldEdit={async (docId, field, oldVal, newVal, reason) => {
                await supabase.from('documents').update({ [field]: newVal }).eq('id', docId)
                await supabase.from('audit_log').insert({
                  workspace_id: workspace.id,
                  user_id:      profile.id,
                  entity_type:  'document',
                  entity_id:    docId,
                  action:       'edit_field',
                  old_value:    { [field]: oldVal },
                  new_value:    { [field]: newVal },
                  note:         reason,
                })
                fetchDocs()
              }}
            />
          ) : (
            <div className="flex-1 flex items-center justify-center text-slate-400 dark:text-white/25 text-sm">
              בחר מסמך מהרשימה לבדיקה
            </div>
          )}
        </div>
      )}

      {/* Post-approval toast */}
      {approvalToast && (
        <div className="fixed bottom-6 left-6 z-50 flex items-center gap-3 bg-white dark:bg-[#111117] border border-green-500/30 rounded-xl px-4 py-3 shadow-xl text-sm max-w-xs" dir="rtl">
          <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
          <span className="text-slate-500 dark:text-white/60 truncate flex-1 min-w-0">
            {approvalToast.fileName} — אושר ✓
          </span>
          <button
            onClick={() => navigate('/export')}
            className="flex items-center gap-1 text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 font-medium flex-shrink-0 transition-colors"
          >
            <Download className="w-3.5 h-3.5" />
            ייצוא
          </button>
          <button
            onClick={() => setApprovalToast(null)}
            className="text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60 flex-shrink-0"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ───────────── Doc Review Pane ───────────── */
function DocReviewPane({ doc, docIndex, total, onNavigate, onApprove, onReject, onFieldEdit }) {
  const [rejectReason,  setRejectReason]  = useState('')
  const [showReject,    setShowReject]    = useState(false)
  const [editingField,  setEditingField]  = useState(null) // { field, value, oldValue }
  const [editReason,    setEditReason]    = useState('')
  const [saving,        setSaving]        = useState(false)

  const issues = doc.validation_results?.issues || []

  async function submitFieldEdit() {
    if (!editingField || !editReason.trim()) return
    setSaving(true)
    await onFieldEdit(doc.id, editingField.field, editingField.oldValue, editingField.value, editReason)
    setEditingField(null)
    setEditReason('')
    setSaving(false)
  }

  const EDITABLE_FIELDS = [
    { key: 'invoice_number',            label: 'מספר חשבונית' },
    { key: 'invoice_date',              label: 'תאריך חשבונית', type: 'date' },
    { key: 'vendor_name',               label: 'שם ספק' },
    { key: 'vendor_registration_number',label: 'ח.פ ספק' },
    { key: 'amount_before_vat',         label: 'סכום לפני מע"מ', type: 'number' },
    { key: 'vat_amount',                label: 'מע"מ', type: 'number' },
    { key: 'total_amount',              label: 'סה"כ', type: 'number' },
    { key: 'withholding_tax',           label: 'ניכוי מס', type: 'number' },
    { key: 'allocation_number',         label: 'מספר הקצאה' },
  ]

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-slate-50 dark:bg-white/3 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
      {/* Pane header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-slate-200 dark:border-white/10 flex-shrink-0">
        <div className="flex items-center gap-3">
          {doc.review_status && REVIEW_STATUS_INFO[doc.review_status] && (
            <span className={`flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg border ${REVIEW_STATUS_INFO[doc.review_status].bg} ${REVIEW_STATUS_INFO[doc.review_status].color}`}>
              {REVIEW_STATUS_INFO[doc.review_status].label}
            </span>
          )}
          <span className="text-slate-400 dark:text-white/40 text-xs">{docIndex + 1} / {total}</span>
        </div>
        <div className="flex items-center gap-1">
          <button onClick={() => onNavigate(-1)} disabled={docIndex === 0} className="p-1.5 text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors">
            <ChevronRight className="w-4 h-4" />
          </button>
          <button onClick={() => onNavigate(1)} disabled={docIndex === total - 1} className="p-1.5 text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white disabled:opacity-30 transition-colors">
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-5 space-y-5">
        {/* Filename */}
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-slate-400 dark:text-white/30" />
          <span className="text-slate-600 dark:text-white/70 text-sm">{doc.file_name}</span>
        </div>

        {/* Validation issues */}
        {issues.length > 0 && (
          <div className="space-y-1.5">
            <p className="text-slate-400 dark:text-white/40 text-xs font-medium">בעיות שזוהו</p>
            {issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg px-3 py-2">
                <AlertCircle className="w-3.5 h-3.5 text-yellow-400 flex-shrink-0 mt-0.5" />
                <p className="text-yellow-300/80 text-xs">{issue}</p>
              </div>
            ))}
          </div>
        )}

        {/* Editable fields */}
        <div>
          <p className="text-slate-400 dark:text-white/40 text-xs font-medium mb-3">שדות שחולצו</p>
          <div className="space-y-2">
            {EDITABLE_FIELDS.map(({ key, label, type }) => {
              const value = doc[key]
              if (value === null || value === undefined) return null
              const isEditing = editingField?.field === key

              return (
                <div key={key} className="flex items-start justify-between gap-3 py-1.5 border-b border-slate-100 dark:border-white/5 last:border-0">
                  <span className="text-slate-400 dark:text-white/30 text-xs w-28 flex-shrink-0 pt-0.5">{label}</span>
                  {isEditing ? (
                    <div className="flex-1 space-y-1.5">
                      <input
                        type={type || 'text'}
                        value={editingField.value}
                        onChange={e => setEditingField(f => ({ ...f, value: e.target.value }))}
                        className="w-full bg-slate-100 dark:bg-white/5 border border-blue-500/50 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-xs focus:outline-none"
                      />
                      <input
                        value={editReason}
                        onChange={e => setEditReason(e.target.value)}
                        placeholder="סיבת השינוי (חובה)"
                        className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-2.5 py-1.5 text-slate-500 dark:text-white/60 text-xs focus:outline-none focus:border-blue-500"
                      />
                      <div className="flex gap-2">
                        <button
                          onClick={submitFieldEdit}
                          disabled={!editReason.trim() || saving}
                          className="flex items-center gap-1 px-2 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-slate-900 dark:text-white rounded text-xs"
                        >
                          <Check className="w-3 h-3" /> שמור
                        </button>
                        <button
                          onClick={() => { setEditingField(null); setEditReason('') }}
                          className="flex items-center gap-1 px-2 py-1 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/50 rounded text-xs"
                        >
                          <X className="w-3 h-3" /> ביטול
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="flex-1 flex items-center justify-between gap-2">
                      <span className="text-slate-600 dark:text-white/70 text-xs">
                        {type === 'number' ? `₪${Number(value).toLocaleString('he-IL')}` : value}
                      </span>
                      <button
                        onClick={() => setEditingField({ field: key, value: String(value), oldValue: value })}
                        className="p-0.5 text-slate-400 dark:text-white/20 hover:text-slate-500 dark:hover:text-white/60 transition-colors flex-shrink-0"
                      >
                        <Edit2 className="w-3 h-3" />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="p-4 border-t border-slate-200 dark:border-white/10 flex-shrink-0 space-y-2">
        {showReject ? (
          <div className="space-y-2">
            <input
              value={rejectReason}
              onChange={e => setRejectReason(e.target.value)}
              placeholder="סיבת הדחייה (חובה)"
              className="w-full bg-slate-100 dark:bg-white/5 border border-red-500/30 rounded-lg px-3 py-2 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-red-500"
            />
            <div className="flex gap-2">
              <button
                onClick={() => { if (rejectReason.trim()) { onReject(doc.id, rejectReason); setShowReject(false) } }}
                disabled={!rejectReason.trim()}
                className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-slate-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
              >
                אשר דחייה
              </button>
              <button
                onClick={() => setShowReject(false)}
                className="px-3 py-2 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/60 rounded-lg text-sm"
              >
                ביטול
              </button>
            </div>
          </div>
        ) : (
          <div className="flex gap-2">
            <button
              onClick={() => onApprove(doc.id)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-green-600 hover:bg-green-700 text-slate-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
            >
              <CheckCircle className="w-4 h-4" />
              אשר
            </button>
            <button
              onClick={() => setShowReject(true)}
              className="flex-1 flex items-center justify-center gap-2 py-2.5 bg-red-600/20 hover:bg-red-600/30 border border-red-500/30 text-red-400 rounded-lg text-sm font-medium transition-colors"
            >
              <XCircle className="w-4 h-4" />
              דחה
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
