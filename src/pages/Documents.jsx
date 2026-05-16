import { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useDebounce } from '@/utils/useDebounce'
import {
  Upload, Search, FileText, CheckCircle, Clock, AlertCircle,
  AlertTriangle, XCircle, RefreshCw, X, Loader2, ChevronDown, Eye,
  Save, Trash2, Pencil
} from 'lucide-react'

const REVIEW_STATUS = {
  ready:        { label: 'מוכן',        icon: CheckCircle,  color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  needs_review: { label: 'נדרש בדיקה', icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  blocked:      { label: 'חסום',        icon: XCircle,      color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
}
const PROC_STATUS = {
  pending:    { label: 'ממתין',   color: 'text-slate-400 dark:text-white/40' },
  processing: { label: 'בעיבוד',  color: 'text-blue-400' },
  processed:  { label: 'עובד',    color: 'text-slate-500 dark:text-white/60' },
  error:      { label: 'שגיאה',   color: 'text-red-400' },
}

export default function Documents() {
  const { profile, workspace } = useAuth()
  const navigate = useNavigate()
  const [documents,  setDocuments]  = useState([])
  const [clients,    setClients]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const debouncedSearch = useDebounce(search, 200)
  const [filterReview,  setFilterReview]  = useState('')
  const [filterClient,  setFilterClient]  = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [processing, setProcessing] = useState({})
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [selectedIds, setSelectedIds] = useState(() => new Set())
  const [bulkBusy,   setBulkBusy]   = useState(false)
  const [bulkAssignOpen, setBulkAssignOpen] = useState(false)
  const [bulkConfirm, setBulkConfirm] = useState(null) // 'delete' | 'skip' | null
  const [toasts,     setToasts]     = useState([])
  const watchedIds = useRef(new Set()) // doc IDs whose processing we're watching for completion
  const isOwner = profile?.role === 'workspace_owner'

  const fetchDocuments = useCallback(async () => {
    if (!workspace?.id) return
    const { data } = await supabase
      .from('documents')
      .select('*, clients(business_name)')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
    setDocuments(data || [])
    setLoading(false)
  }, [workspace?.id])

  const fetchClients = useCallback(async () => {
    if (!workspace?.id) return
    const { data } = await supabase
      .from('clients')
      .select('id, business_name')
      .eq('workspace_id', workspace.id)
      .is('archived_at', null)
      .order('business_name')
    setClients(data || [])
  }, [workspace?.id])

  useEffect(() => {
    fetchDocuments()
    fetchClients()
  }, [fetchDocuments, fetchClients])

  // Realtime: watch for document status updates and show toast on completion
  useEffect(() => {
    if (!workspace?.id) return
    const channel = supabase
      .channel('docs-status-' + workspace.id)
      .on('postgres_changes', {
        event:  'UPDATE',
        schema: 'public',
        table:  'documents',
        filter: `workspace_id=eq.${workspace.id}`,
      }, ({ new: updated }) => {
        // Update the document row in local state (preserves joined clients data)
        setDocuments(prev => prev.map(d =>
          d.id === updated.id ? { ...d, ...updated } : d
        ))
        // If we were watching this doc and it now has a review_status, toast
        if (watchedIds.current.has(updated.id) && updated.review_status) {
          watchedIds.current.delete(updated.id)
          const info = REVIEW_STATUS[updated.review_status]
          const tid = Date.now() + Math.random()
          setToasts(prev => [...prev, {
            id:       tid,
            fileName: updated.file_name,
            status:   updated.review_status,
            label:    info?.label || updated.review_status,
            color:    info?.color || 'text-slate-400',
          }])
          setTimeout(() => setToasts(prev => prev.filter(t => t.id !== tid)), 6000)
        }
      })
      .subscribe()
    return () => { supabase.removeChannel(channel) }
  }, [workspace?.id])

  function addToastForId(documentId) {
    watchedIds.current.add(documentId)
  }

  async function processDocument(documentId) {
    watchedIds.current.add(documentId)
    setProcessing(p => ({ ...p, [documentId]: true }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const resp = await fetch('/api/process-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ document_id: documentId }),
      })

      // Always read the body so we can surface details
      let body = null
      try { body = await resp.json() } catch { /* non-JSON response */ }

      if (!resp.ok) {
        const errMsg = body?.error || `שגיאה ${resp.status}`
        const errDetail = body?.detail ? String(body.detail).slice(0, 600) : null
        console.error('process-document failed:', resp.status, body)
        // Persist the error reason so the user can see what went wrong in the detail panel
        await supabase.from('documents').update({
          status: 'error',
          validation_results: {
            error:    errMsg,
            detail:   errDetail,
            http:     resp.status,
            stage:    'api_call',
            issues:   [errMsg],
          },
        }).eq('id', documentId)
      }
      await fetchDocuments()
    } catch (err) {
      console.error('Process failed:', err)
      // Persist the network/JS error too
      try {
        await supabase.from('documents').update({
          status: 'error',
          validation_results: {
            error:  err.message || 'שגיאה בקריאה לשרת',
            stage:  'fetch',
            issues: [err.message || 'שגיאה בקריאה לשרת'],
          },
        }).eq('id', documentId)
        await fetchDocuments()
      } catch { /* ignore */ }
    } finally {
      setProcessing(p => ({ ...p, [documentId]: false }))
    }
  }

  function toggleSelect(id) {
    setSelectedIds(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  function toggleSelectAllVisible(ids) {
    setSelectedIds(prev => {
      const all = ids.every(id => prev.has(id))
      const next = new Set(prev)
      if (all) ids.forEach(id => next.delete(id))
      else     ids.forEach(id => next.add(id))
      return next
    })
  }

  function clearSelection() { setSelectedIds(new Set()) }

  async function deleteOne(id) {
    const doc = documents.find(d => d.id === id)
    if (doc?.file_path) {
      await supabase.storage.from('documents').remove([doc.file_path])
    }
    await supabase.from('documents').delete().eq('id', id)
    setDocuments(prev => prev.filter(d => d.id !== id))
    setSelectedIds(prev => { const n = new Set(prev); n.delete(id); return n })
  }

  async function bulkDelete() {
    setBulkBusy(true)
    try {
      const ids = Array.from(selectedIds)
      const paths = documents.filter(d => ids.includes(d.id) && d.file_path).map(d => d.file_path)
      if (paths.length) await supabase.storage.from('documents').remove(paths)
      await supabase.from('documents').delete().in('id', ids)
      setDocuments(prev => prev.filter(d => !selectedIds.has(d.id)))
      clearSelection()
    } finally {
      setBulkBusy(false); setBulkConfirm(null)
    }
  }

  async function bulkReprocess() {
    setBulkBusy(true)
    try {
      const ids = Array.from(selectedIds)
      for (const id of ids) await processDocument(id)
      clearSelection()
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkAssignClient(clientId) {
    setBulkBusy(true)
    try {
      const ids = Array.from(selectedIds)
      await supabase.from('documents').update({ client_id: clientId }).in('id', ids)
      await fetchDocuments()
      setBulkAssignOpen(false)
      clearSelection()
    } finally {
      setBulkBusy(false)
    }
  }

  async function bulkSkipReview() {
    if (!isOwner) return
    setBulkBusy(true)
    try {
      const ids = Array.from(selectedIds)
      await supabase.from('documents').update({
        review_status: 'ready',
        reviewed_by:   profile.id,
        reviewed_at:   new Date().toISOString(),
      }).in('id', ids)
      await fetchDocuments()
      clearSelection()
    } finally {
      setBulkBusy(false); setBulkConfirm(null)
    }
  }

  const filtered = documents.filter(d => {
    if (filterReview && d.review_status !== filterReview) return false
    if (filterClient && d.client_id !== filterClient) return false
    if (debouncedSearch) {
      const q = debouncedSearch.toLowerCase()
      const match =
        d.file_name?.toLowerCase().includes(q) ||
        d.clients?.business_name?.toLowerCase().includes(q) ||
        d.invoice_number?.toLowerCase().includes(q) ||
        d.vendor_name?.toLowerCase().includes(q)
      if (!match) return false
    }
    return true
  })

  // Summary counts
  const counts = {
    ready:        documents.filter(d => d.review_status === 'ready').length,
    needs_review: documents.filter(d => d.review_status === 'needs_review').length,
    blocked:      documents.filter(d => d.review_status === 'blocked').length,
  }

  return (
    <div className="p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-slate-900 dark:text-white text-2xl font-bold">מסמכים</h1>
          <p className="text-slate-400 dark:text-white/40 text-sm mt-0.5">{documents.length} מסמכים סה"כ</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
        >
          <Upload className="w-4 h-4" />
          העלאת מסמך
        </button>
      </div>

      {/* Status summary chips */}
      <div className="flex items-center gap-3 mb-5">
        {Object.entries(REVIEW_STATUS).map(([key, info]) => {
          const Icon = info.icon
          return (
            <button
              key={key}
              onClick={() => setFilterReview(filterReview === key ? '' : key)}
              className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
                filterReview === key ? info.bg + ' border-current' : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white/70'
              } ${filterReview === key ? info.color : ''}`}
            >
              <Icon className="w-3.5 h-3.5" />
              {info.label} ({counts[key]})
            </button>
          )
        })}
      </div>

      {/* Search + filter bar */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-white/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם קובץ, ספק, חשבונית..."
            className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pr-9 pl-3 py-2 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="relative">
          <select
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            className="appearance-none bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 pl-7 py-2 text-slate-500 dark:text-white/60 text-sm focus:outline-none cursor-pointer"
          >
            <option value="">כל הלקוחות</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
          </select>
          <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-white/30 pointer-events-none" />
        </div>
      </div>

      {/* Documents list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-10 h-10 text-slate-300 dark:text-white/15 mx-auto mb-3" />
          <p className="text-slate-400 dark:text-white/30 text-sm">אין מסמכים להצגה</p>
        </div>
      ) : (
        <>
          {/* Bulk action bar */}
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-2 mb-3 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-xl px-4 py-2.5">
              <span className="text-blue-700 dark:text-blue-300 text-sm font-medium">
                נבחרו {selectedIds.size} מסמכים
              </span>
              <div className="flex-1" />
              <button
                onClick={() => setBulkConfirm('delete')}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
              >
                <Trash2 className="w-3.5 h-3.5" />
                מחק
              </button>
              <button
                onClick={bulkReprocess}
                disabled={bulkBusy}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/15 disabled:opacity-50 text-slate-700 dark:text-white rounded-lg text-xs font-medium transition-colors"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${bulkBusy ? 'animate-spin' : ''}`} />
                עבד מחדש
              </button>
              <div className="relative">
                <button
                  onClick={() => setBulkAssignOpen(o => !o)}
                  disabled={bulkBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-200 dark:bg-white/10 hover:bg-slate-300 dark:hover:bg-white/15 disabled:opacity-50 text-slate-700 dark:text-white rounded-lg text-xs font-medium transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                  שייך ללקוח
                  <ChevronDown className="w-3 h-3" />
                </button>
                {bulkAssignOpen && (
                  <div className="absolute top-full left-0 mt-1 min-w-[200px] max-h-72 overflow-y-auto bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-lg shadow-xl z-20">
                    {clients.map(c => (
                      <button
                        key={c.id}
                        onClick={() => bulkAssignClient(c.id)}
                        className="block w-full text-right px-3 py-2 text-sm text-slate-700 dark:text-white/80 hover:bg-slate-100 dark:hover:bg-white/5"
                      >
                        {c.business_name}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {isOwner && (
                <button
                  onClick={() => setBulkConfirm('skip')}
                  disabled={bulkBusy}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-green-600 hover:bg-green-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
                >
                  <CheckCircle className="w-3.5 h-3.5" />
                  סמן כמאושר
                </button>
              )}
              <button
                onClick={clearSelection}
                className="text-slate-500 dark:text-white/40 hover:text-slate-700 dark:hover:text-white/70 mr-1"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          )}

          {/* Select-all toggle */}
          <div className="flex items-center gap-2 mb-2 px-1">
            <input
              type="checkbox"
              checked={filtered.length > 0 && filtered.every(d => selectedIds.has(d.id))}
              onChange={() => toggleSelectAllVisible(filtered.map(d => d.id))}
              className="w-4 h-4 accent-blue-600 cursor-pointer"
            />
            <span className="text-xs text-slate-500 dark:text-white/40">בחר הכל ({filtered.length})</span>
          </div>

          <div className="space-y-1.5">
            {filtered.map(doc => (
              <DocumentRow
                key={doc.id}
                doc={doc}
                processing={processing[doc.id]}
                selected={selectedIds.has(doc.id)}
                onToggleSelect={() => toggleSelect(doc.id)}
                onProcess={() => processDocument(doc.id)}
                onDelete={() => deleteOne(doc.id)}
                onClick={() => setSelectedDoc(doc)}
              />
            ))}
          </div>

          {/* Bulk confirm dialog */}
          {bulkConfirm && (
            <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" dir="rtl">
              <div className="bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-2xl p-5 w-full max-w-sm shadow-2xl">
                <h3 className="text-slate-900 dark:text-white font-bold text-base mb-2">
                  {bulkConfirm === 'delete' ? 'מחיקת מסמכים' : 'סימון כמאושר'}
                </h3>
                <p className="text-slate-500 dark:text-white/60 text-sm mb-4">
                  {bulkConfirm === 'delete'
                    ? `האם למחוק ${selectedIds.size} מסמכים? הפעולה אינה הפיכה.`
                    : `פעולה זו מדלגת על ביקורת ומסמנת ${selectedIds.size} מסמכים כמאושרים. להמשיך?`}
                </p>
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setBulkConfirm(null)}
                    className="px-3 py-1.5 text-slate-700 dark:text-white/70 text-sm hover:text-slate-900 dark:hover:text-white"
                  >
                    ביטול
                  </button>
                  <button
                    onClick={bulkConfirm === 'delete' ? bulkDelete : bulkSkipReview}
                    disabled={bulkBusy}
                    className={`px-3 py-1.5 rounded-lg text-sm font-medium text-white transition-colors ${
                      bulkConfirm === 'delete' ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'
                    } disabled:opacity-50`}
                  >
                    {bulkBusy ? '...' : (bulkConfirm === 'delete' ? 'מחק' : 'אשר')}
                  </button>
                </div>
              </div>
            </div>
          )}
        </>
      )}

      {/* Upload modal */}
      {showUpload && (
        <UploadModal
          workspace={workspace}
          profile={profile}
          clients={clients}
          onClose={() => setShowUpload(false)}
          onUploaded={(ids) => {
            fetchDocuments()
            ids.forEach(id => processDocument(id))
          }}
        />
      )}

      {/* Document detail panel */}
      {selectedDoc && (
        <DocDetailPanel
          doc={selectedDoc}
          profile={profile}
          onClose={() => setSelectedDoc(null)}
          onReprocess={() => { processDocument(selectedDoc.id); setSelectedDoc(null) }}
          onGoToReview={() => { navigate('/review'); setSelectedDoc(null) }}
          onUpdated={(updated) => {
            setSelectedDoc(prev => prev ? { ...prev, ...updated } : prev)
            setDocuments(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d))
          }}
          onDeleted={() => {
            setDocuments(prev => prev.filter(d => d.id !== selectedDoc.id))
            setSelectedDoc(null)
          }}
        />
      )}

      {/* Toast notifications */}
      {toasts.length > 0 && (
        <div className="fixed bottom-6 left-6 space-y-2 z-50" dir="rtl">
          {toasts.map(toast => (
            <div key={toast.id} className="flex items-center gap-3 bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-xl px-4 py-3 shadow-xl text-sm max-w-xs">
              <span className="text-slate-500 dark:text-white/40 truncate flex-1 min-w-0">{toast.fileName}</span>
              <span className={`font-medium flex-shrink-0 ${toast.color}`}>{toast.label}</span>
              {(toast.status === 'needs_review' || toast.status === 'blocked') && (
                <button
                  onClick={() => navigate('/review')}
                  className="text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 font-medium flex-shrink-0"
                >
                  בדוק ←
                </button>
              )}
              <button
                onClick={() => setToasts(prev => prev.filter(t => t.id !== toast.id))}
                className="text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/60 flex-shrink-0"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

/* ───────────── Document Row ───────────── */
function DocumentRow({ doc, processing, selected, onToggleSelect, onProcess, onDelete, onClick }) {
  const reviewInfo = REVIEW_STATUS[doc.review_status]
  const procInfo   = PROC_STATUS[doc.status] || PROC_STATUS.pending
  const ReviewIcon = reviewInfo?.icon
  const [confirmDelete, setConfirmDelete] = useState(false)

  return (
    <div
      className={`flex items-center gap-3 border rounded-xl px-4 py-3 cursor-pointer transition-all group ${
        selected
          ? 'bg-blue-50 dark:bg-blue-500/10 border-blue-300 dark:border-blue-500/40'
          : 'bg-slate-50 dark:bg-white/3 hover:bg-slate-100 dark:hover:bg-white/6 border-slate-100 dark:border-white/8'
      }`}
      onClick={onClick}
    >
      <input
        type="checkbox"
        checked={!!selected}
        onChange={() => {}}
        onClick={e => { e.stopPropagation(); onToggleSelect?.() }}
        className="w-4 h-4 accent-blue-600 cursor-pointer flex-shrink-0"
      />
      <FileText className="w-4 h-4 text-slate-400 dark:text-white/30 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="text-slate-700 dark:text-white/80 text-sm truncate">{doc.file_name}</p>
        <div className="flex items-center gap-3 mt-0.5">
          {doc.clients?.business_name && (
            <span className="text-slate-400 dark:text-white/30 text-xs truncate">{doc.clients.business_name}</span>
          )}
          {doc.vendor_name && (
            <span className="text-slate-400 dark:text-white/20 text-xs truncate">{doc.vendor_name}</span>
          )}
          {doc.invoice_number && (
            <span className="text-slate-400 dark:text-white/20 text-xs font-mono">#{doc.invoice_number}</span>
          )}
        </div>
      </div>

      {/* Amount */}
      {doc.total_amount && (
        <span className="text-slate-500 dark:text-white/60 text-sm font-medium flex-shrink-0">
          ₪{Number(doc.total_amount).toLocaleString('he-IL')}
        </span>
      )}

      {/* Review status badge */}
      {reviewInfo ? (
        <span className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium flex-shrink-0 ${reviewInfo.bg} ${reviewInfo.color}`}>
          <ReviewIcon className="w-3 h-3" />
          {reviewInfo.label}
        </span>
      ) : (
        <span className={`text-xs flex-shrink-0 ${procInfo.color}`}>
          {processing ? (
            <span className="flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> בעיבוד</span>
          ) : procInfo.label}
        </span>
      )}

      {/* Re-process button for errors */}
      {(doc.status === 'error' || doc.status === 'pending') && (
        <button
          onClick={e => { e.stopPropagation(); onProcess() }}
          disabled={processing}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 dark:text-white/30 hover:text-blue-400 transition-all"
          title="עיבוד AI"
        >
          <RefreshCw className={`w-4 h-4 ${processing ? 'animate-spin' : ''}`} />
        </button>
      )}

      {/* Inline delete */}
      <div className="relative flex-shrink-0">
        <button
          onClick={e => { e.stopPropagation(); setConfirmDelete(true) }}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 dark:text-white/30 hover:text-red-500 transition-all"
          title="מחק"
        >
          <Trash2 className="w-4 h-4" />
        </button>
        {confirmDelete && (
          <div
            onClick={e => e.stopPropagation()}
            className="absolute top-full left-0 mt-1 bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-xl p-3 shadow-2xl z-20 w-56"
          >
            <p className="text-slate-700 dark:text-white/80 text-xs mb-2.5">למחוק את המסמך הזה?</p>
            <div className="flex justify-end gap-1.5">
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(false) }}
                className="px-2.5 py-1 text-xs text-slate-600 dark:text-white/60 hover:text-slate-900 dark:hover:text-white"
              >
                ביטול
              </button>
              <button
                onClick={e => { e.stopPropagation(); setConfirmDelete(false); onDelete?.() }}
                className="px-2.5 py-1 bg-red-600 hover:bg-red-700 text-white rounded-md text-xs font-medium"
              >
                מחק
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Date */}
      <span className="text-slate-400 dark:text-white/20 text-xs flex-shrink-0">
        {doc.invoice_date || (doc.created_at && new Date(doc.created_at).toLocaleDateString('he-IL'))}
      </span>
    </div>
  )
}

/* ───────────── Upload Modal ───────────── */
function UploadModal({ workspace, profile, clients, onClose, onUploaded }) {
  const [clientId,      setClientId]      = useState('')
  const [files,         setFiles]         = useState([])
  const [uploading,     setUploading]     = useState(false)
  const [progress,      setProgress]      = useState(0)
  const [error,         setError]         = useState(null)
  const [dragging,      setDragging]      = useState(false)
  const [uploadResults, setUploadResults] = useState(null) // null = not yet attempted
  const inputRef = useRef()

  const MAX_FILES = 50

  function handleFiles(newFiles) {
    const valid = Array.from(newFiles)
      .filter(f => /\.(pdf|png|jpg|jpeg|webp)$/i.test(f.name))
      .slice(0, MAX_FILES)
    setFiles(prev => [...prev, ...valid].slice(0, MAX_FILES))
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!clientId) { setError('יש לבחור לקוח'); return }
    if (files.length === 0) { setError('יש לבחור לפחות קובץ אחד'); return }
    setUploading(true); setError(null)

    const insertedIds = []
    const results     = []

    for (let i = 0; i < files.length; i++) {
      const file     = files[i]
      // Supabase Storage keys must be ASCII / URL-safe — sanitize Hebrew & other
      // non-URL-safe characters in the storage path while keeping the original
      // file.name in the DB row for display.
      const dotIdx   = file.name.lastIndexOf('.')
      const baseName = dotIdx > 0 ? file.name.slice(0, dotIdx) : file.name
      const extName  = dotIdx > 0 ? file.name.slice(dotIdx + 1) : ''
      const safeBase = baseName.replace(/[^\w.-]+/g, '_').replace(/_+/g, '_').replace(/^_|_$/g, '') || 'file'
      const safeExt  = extName.replace(/[^\w]+/g, '').toLowerCase()
      const safeName = safeExt ? `${safeBase}.${safeExt}` : safeBase
      const filePath = `${workspace.id}/${Date.now()}_${i}_${safeName}`
      setProgress(Math.round((i / files.length) * 100))

      // 1. Storage upload
      const { error: storageErr } = await supabase.storage
        .from('documents').upload(filePath, file)

      if (storageErr) {
        results.push({ name: file.name, ok: false, error: storageErr.message })
        continue
      }

      // 2. DB insert
      const { data: inserted, error: insertErr } = await supabase
        .from('documents').insert({
          workspace_id:   workspace.id,
          client_id:      clientId,
          uploaded_by:    profile.id,
          file_name:      file.name,
          file_path:      filePath,
          file_size:      file.size,
          file_type:      file.name.split('.').pop().toLowerCase(),
          status:         'pending',
          source_channel: 'portal',
        }).select('id').single()

      if (insertErr || !inserted?.id) {
        results.push({ name: file.name, ok: false, error: insertErr?.message || 'שגיאה בשמירת הרשומה' })
        continue
      }

      insertedIds.push(inserted.id)
      results.push({ name: file.name, ok: true })
    }

    setProgress(100)
    setUploading(false)
    setUploadResults(results)

    if (insertedIds.length > 0) {
      onUploaded(insertedIds) // refreshes list + triggers AI — modal stays open for results
    }
  }

  // ── Results screen ──────────────────────────────────────────────
  if (uploadResults) {
    const successCount = uploadResults.filter(r => r.ok).length
    const failCount    = uploadResults.filter(r => !r.ok).length
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" dir="rtl">
        <div className="bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-slate-900 dark:text-white font-bold text-lg">תוצאות העלאה</h2>
            <button onClick={onClose} className="text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-2 mb-5 max-h-60 overflow-y-auto">
            {uploadResults.map((r, i) => (
              <div key={i} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg ${r.ok ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {r.ok
                  ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                  : <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                }
                <div className="min-w-0">
                  <p className="text-slate-700 dark:text-white/80 text-sm truncate">{r.name}</p>
                  {r.error && <p className="text-red-300/70 text-xs mt-0.5 break-words">{r.error}</p>}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-slate-400 dark:text-white/40 mb-4">
            {successCount > 0 && <span className="text-green-400">{successCount} הועלו בהצלחה</span>}
            {failCount    > 0 && <span className="text-red-400">{failCount} נכשלו</span>}
          </div>

          <button
            onClick={onClose}
            className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
          >
            סגור
          </button>
        </div>
      </div>
    )
  }

  // ── Upload form ─────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-slate-900 dark:text-white font-bold text-lg">העלאת מסמכים</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          {/* Client select */}
          <div>
            <label className="block text-slate-500 dark:text-white/50 text-xs mb-1.5">לקוח *</label>
            <div className="relative">
              <select
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                className="w-full appearance-none bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 pl-7 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
                required
              >
                <option value="">בחר לקוח</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
              </select>
              <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-white/30 pointer-events-none" />
            </div>
          </div>

          {/* Drop zone */}
          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragging ? 'border-blue-400 bg-blue-500/10' : 'border-white/15 hover:border-white/30'
            }`}
          >
            <Upload className="w-6 h-6 text-slate-400 dark:text-white/30 mx-auto mb-2" />
            <p className="text-slate-500 dark:text-white/50 text-sm">גרור קבצים לכאן, או לחץ לבחירה</p>
            <p className="text-slate-400 dark:text-white/25 text-xs mt-1">PDF, PNG, JPG, WEBP — עד {MAX_FILES} קבצים</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept=".pdf,.png,.jpg,.jpeg,.webp"
              className="hidden"
              onChange={e => handleFiles(e.target.files)}
            />
          </div>

          {/* File list */}
          {files.length > 0 && (
            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 max-h-36 overflow-y-auto space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-slate-500 dark:text-white/60 truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    className="text-slate-400 dark:text-white/30 hover:text-slate-500 dark:hover:text-white/60 ml-2 flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-slate-400 dark:text-white/40">
                <span>מעלה... ({Math.round(progress)}%)</span>
              </div>
              <div className="w-full bg-slate-200 dark:bg-white/10 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {error && <p className="text-red-400 text-sm">{error}</p>}

          <div className="flex gap-3">
            <button
              type="submit"
              disabled={uploading || files.length === 0}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              {uploading
                ? <><Loader2 className="w-4 h-4 animate-spin" /> מעלה...</>
                : `העלה ${files.length > 0 ? files.length + ' קבצים' : ''}`}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-white/70 rounded-lg text-sm transition-colors"
            >
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

/* ───────────── Document Detail Panel ───────────── */
const EDITABLE_FIELDS = [
  { key: 'document_type',              label: 'סוג מסמך',     type: 'text' },
  { key: 'vendor_name',                label: 'ספק',          type: 'text' },
  { key: 'invoice_number',             label: 'מס׳ חשבונית',  type: 'text' },
  { key: 'invoice_date',               label: 'תאריך',        type: 'date' },
  { key: 'vendor_registration_number', label: 'ח.פ ספק',      type: 'text' },
  { key: 'amount_before_vat',          label: 'לפני מע"מ',    type: 'number' },
  { key: 'vat_rate',                   label: 'אחוז מע"מ',    type: 'number' },
  { key: 'vat_amount',                 label: 'סכום מע"מ',    type: 'number' },
  { key: 'total_amount',               label: 'סה"כ',         type: 'number' },
  { key: 'withholding_tax',            label: 'ניכוי מס',     type: 'number' },
  { key: 'allocation_number',          label: 'מס׳ הקצאה',    type: 'text' },
  { key: 'currency',                   label: 'מטבע',         type: 'text' },
]

function DocDetailPanel({ doc, profile, onClose, onReprocess, onGoToReview, onUpdated, onDeleted }) {
  const reviewInfo  = REVIEW_STATUS[doc.review_status]
  const ReviewIcon  = reviewInfo?.icon
  const issues      = doc.validation_results?.issues || []
  const description = doc.validation_results?.description
  const apiError    = doc.validation_results?.error
  const apiDetail   = doc.validation_results?.detail
  const isError     = doc.status === 'error'
  // Show the fields card whenever any extracted field exists (even if status=error or the
  // doc was saved partially). Lets the user still see / edit whatever AI managed to pull.
  const hasAnyField = EDITABLE_FIELDS.some(f => doc[f.key] != null && doc[f.key] !== '')
  const isPdf       = (doc.file_type || '').toLowerCase() === 'pdf' || /\.pdf$/i.test(doc.file_name || '')

  const [editMode,      setEditMode]      = useState(false)
  const [draft,         setDraft]         = useState(() => buildDraft(doc))
  const [saving,        setSaving]        = useState(false)
  const [deleting,      setDeleting]      = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [error,         setError]         = useState(null)
  const [previewUrl,    setPreviewUrl]    = useState(null)
  const [previewErr,    setPreviewErr]    = useState(null)
  const [mobileTab,     setMobileTab]     = useState('fields') // 'preview' | 'fields'

  // Reset draft when a different doc is opened
  useEffect(() => {
    setDraft(buildDraft(doc))
    setEditMode(false)
    setConfirmDelete(false)
    setError(null)
  }, [doc.id])

  // Fetch a 1-hour signed URL for the file
  useEffect(() => {
    let cancelled = false
    setPreviewUrl(null)
    setPreviewErr(null)
    if (!doc.file_path) { setPreviewErr('אין קובץ מצורף'); return }
    supabase.storage.from('documents').createSignedUrl(doc.file_path, 3600).then(({ data, error: e }) => {
      if (cancelled) return
      if (e || !data?.signedUrl) setPreviewErr(e?.message || 'שגיאה בטעינת התצוגה')
      else                       setPreviewUrl(data.signedUrl)
    })
    return () => { cancelled = true }
  }, [doc.id, doc.file_path])

  function buildDraft(d) {
    const out = {}
    EDITABLE_FIELDS.forEach(f => { out[f.key] = d[f.key] ?? '' })
    return out
  }

  function setField(key, value) {
    setDraft(prev => ({ ...prev, [key]: value }))
  }

  async function handleSave() {
    setSaving(true); setError(null)
    try {
      const updates = {}
      const changes = []
      EDITABLE_FIELDS.forEach(f => {
        const oldVal = doc[f.key] ?? null
        let newVal   = draft[f.key]
        if (newVal === '' || newVal === undefined) newVal = null
        if (f.type === 'number' && newVal !== null) {
          const n = Number(newVal); newVal = Number.isFinite(n) ? n : null
        }
        // Compare loosely (handles number vs string)
        const same = (oldVal == null && newVal == null) ||
                     (oldVal != null && newVal != null && String(oldVal) === String(newVal))
        if (!same) {
          updates[f.key] = newVal
          changes.push({ field: f.key, old: oldVal, new: newVal })
        }
      })

      if (changes.length === 0) {
        setEditMode(false); setSaving(false); return
      }

      const { data: updated, error: upErr } = await supabase
        .from('documents')
        .update(updates)
        .eq('id', doc.id)
        .select()
        .single()
      if (upErr) throw upErr

      // Audit log (best-effort)
      try {
        await supabase.from('audit_log').insert(changes.map(c => ({
          workspace_id: doc.workspace_id,
          user_id:      profile?.id,
          entity_type:  'document',
          entity_id:    doc.id,
          action:       'edit_field',
          field:        c.field,
          old_value:    c.old != null ? String(c.old) : null,
          new_value:    c.new != null ? String(c.new) : null,
        })))
      } catch { /* audit_log optional */ }

      onUpdated?.(updated)
      setEditMode(false)
    } catch (err) {
      setError(err.message || 'שגיאה בשמירה')
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    setDeleting(true); setError(null)
    try {
      // Remove storage file (best-effort)
      if (doc.file_path) {
        await supabase.storage.from('documents').remove([doc.file_path])
      }
      const { error: delErr } = await supabase
        .from('documents')
        .delete()
        .eq('id', doc.id)
      if (delErr) throw delErr

      // Audit log (best-effort)
      try {
        await supabase.from('audit_log').insert({
          workspace_id: doc.workspace_id,
          user_id:      profile?.id,
          entity_type:  'document',
          entity_id:    doc.id,
          action:       'delete',
          old_value:    doc.file_name || null,
        })
      } catch { /* audit_log optional */ }

      onDeleted?.()
    } catch (err) {
      setError(err.message || 'שגיאה במחיקה')
      setDeleting(false)
    }
  }

  const fmt = (val, type) => {
    if (val == null || val === '') return '—'
    if (type === 'number') return `₪${Number(val).toLocaleString('he-IL')}`
    return String(val)
  }

  const previewPane = (
    <div className="flex-1 bg-slate-100 dark:bg-black/30 min-h-0 overflow-hidden flex items-center justify-center">
      {previewErr ? (
        <div className="text-center text-slate-400 dark:text-white/30 text-sm p-6">
          <AlertCircle className="w-8 h-8 mx-auto mb-2 opacity-40" />
          {previewErr}
        </div>
      ) : !previewUrl ? (
        <Loader2 className="w-6 h-6 text-slate-400 dark:text-white/30 animate-spin" />
      ) : isPdf ? (
        <iframe
          src={previewUrl}
          title={doc.file_name}
          className="w-full h-full border-0 bg-white"
        />
      ) : (
        <img
          src={previewUrl}
          alt={doc.file_name}
          className="max-w-full max-h-full object-contain"
        />
      )}
    </div>
  )

  return (
    <div className="fixed inset-0 bg-black/60 flex justify-end z-50" dir="rtl" onClick={onClose}>
      <div
        onClick={e => e.stopPropagation()}
        className="relative bg-white dark:bg-[#111117] border-r border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-5xl h-full flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10 flex-shrink-0">
          <h2 className="text-slate-900 dark:text-white font-semibold truncate ml-4">{doc.file_name}</h2>
          <div className="flex items-center gap-1 flex-shrink-0">
            {(doc.status === 'processed' || hasAnyField) && !editMode && (
              <button
                onClick={() => setEditMode(true)}
                className="p-1.5 text-slate-400 dark:text-white/40 hover:text-blue-500 dark:hover:text-blue-400 transition-colors"
                title="ערוך שדות"
              >
                <Pencil className="w-4 h-4" />
              </button>
            )}
            <button
              onClick={() => setConfirmDelete(true)}
              className="p-1.5 text-slate-400 dark:text-white/40 hover:text-red-500 dark:hover:text-red-400 transition-colors"
              title="מחק מסמך"
            >
              <Trash2 className="w-4 h-4" />
            </button>
            <button onClick={onClose} className="p-1.5 text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Mobile tabs */}
        <div className="flex md:hidden border-b border-slate-200 dark:border-white/10 flex-shrink-0">
          <button
            onClick={() => setMobileTab('preview')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === 'preview'
                ? 'text-blue-500 dark:text-blue-400 border-b-2 border-blue-500'
                : 'text-slate-500 dark:text-white/50'
            }`}
          >
            תצוגת המסמך
          </button>
          <button
            onClick={() => setMobileTab('fields')}
            className={`flex-1 py-2.5 text-sm font-medium transition-colors ${
              mobileTab === 'fields'
                ? 'text-blue-500 dark:text-blue-400 border-b-2 border-blue-500'
                : 'text-slate-500 dark:text-white/50'
            }`}
          >
            שדות
          </button>
        </div>

        {/* Body: split */}
        <div className="flex-1 flex flex-col md:flex-row min-h-0">
          {/* Preview pane (left in RTL = visually left side) */}
          <div className={`${mobileTab === 'preview' ? 'flex' : 'hidden'} md:flex md:flex-1 md:order-2 min-h-0`}>
            {previewPane}
          </div>

          {/* Fields pane */}
          <div className={`${mobileTab === 'fields' ? 'flex' : 'hidden'} md:flex md:order-1 md:w-[420px] md:flex-shrink-0 md:border-l border-slate-200 dark:border-white/10 flex-col min-h-0`}>
            <div className="overflow-y-auto p-5 space-y-5">
          {/* Review status */}
          {reviewInfo && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${reviewInfo.bg}`}>
              <ReviewIcon className={`w-4 h-4 ${reviewInfo.color}`} />
              <span className={`text-sm font-medium ${reviewInfo.color}`}>{reviewInfo.label}</span>
            </div>
          )}

          {/* API error reason (when processing failed) */}
          {isError && apiError && (
            <div className="space-y-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20">
              <div className="flex items-start gap-2 text-sm text-red-600 dark:text-red-400">
                <AlertCircle className="w-4 h-4 flex-shrink-0 mt-0.5" />
                <div className="space-y-1 min-w-0 flex-1">
                  <p className="font-medium">שגיאה בעיבוד המסמך</p>
                  <p className="text-xs text-red-500 dark:text-red-300/80 break-words">{apiError}</p>
                  {apiDetail && (
                    <pre className="text-[10px] text-red-500/70 dark:text-red-300/60 bg-red-500/5 rounded p-2 mt-2 max-h-28 overflow-auto whitespace-pre-wrap break-all">{apiDetail}</pre>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Validation issues (filter out the duplicate api error) */}
          {issues.filter(i => i !== apiError).length > 0 && (
            <div className="space-y-1">
              {issues.filter(i => i !== apiError).map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-yellow-600 dark:text-yellow-300/70">
                  <AlertTriangle className="w-3 h-3 text-yellow-500 dark:text-yellow-400 flex-shrink-0 mt-0.5" />
                  {issue}
                </div>
              ))}
            </div>
          )}

          {error && (
            <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-red-500/10 border border-red-500/20 text-red-500 dark:text-red-400 text-xs">
              <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-0.5" />
              {error}
            </div>
          )}

          {/* Extracted fields */}
          {(doc.status === 'processed' || hasAnyField) && (
            <>
              <div className="grid grid-cols-2 gap-3">
                {EDITABLE_FIELDS.map(({ key, label, type }) => (
                  <div key={key}>
                    <p className="text-slate-400 dark:text-white/30 text-xs mb-1">{label}</p>
                    {editMode ? (
                      <input
                        type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
                        value={draft[key] ?? ''}
                        onChange={e => setField(key, e.target.value)}
                        step={type === 'number' ? 'any' : undefined}
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    ) : (
                      <p className="text-slate-700 dark:text-white/80 text-sm font-medium">
                        {fmt(doc[key], type)}
                      </p>
                    )}
                  </div>
                ))}
              </div>
              {description && (
                <div>
                  <p className="text-slate-400 dark:text-white/30 text-xs mb-1">תיאור AI</p>
                  <p className="text-slate-500 dark:text-white/60 text-xs leading-relaxed">{description}</p>
                </div>
              )}
            </>
          )}

          {/* Confidence */}
          {doc.field_confidence && Object.keys(doc.field_confidence).length > 0 && (
            <div>
              <p className="text-slate-400 dark:text-white/30 text-xs mb-2">רמת ביטחון AI</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(doc.field_confidence).map(([key, val]) => (
                  <span
                    key={key}
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      val >= 0.8 ? 'bg-green-500/15 text-green-600 dark:text-green-400' :
                      val >= 0.5 ? 'bg-yellow-500/15 text-yellow-600 dark:text-yellow-400' :
                                   'bg-red-500/15 text-red-600 dark:text-red-400'
                    }`}
                  >
                    {key}: {Math.round(val * 100)}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Action buttons */}
          {editMode ? (
            <div className="flex gap-2">
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex-1 py-2 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                שמור שינויים
              </button>
              <button
                onClick={() => { setDraft(buildDraft(doc)); setEditMode(false); setError(null) }}
                disabled={saving}
                className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-white/70 rounded-lg text-sm transition-colors"
              >
                ביטול
              </button>
            </div>
          ) : (
            <>
              {(doc.review_status === 'needs_review' || doc.review_status === 'blocked') && (
                <button
                  onClick={onGoToReview}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <Eye className="w-4 h-4" />
                  פתח בתור האישורים
                </button>
              )}
              {(doc.status === 'error' || doc.status === 'pending') && (
                <button
                  onClick={onReprocess}
                  className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  <RefreshCw className="w-4 h-4" />
                  עיבוד מחדש
                </button>
              )}
            </>
          )}

          {/* File meta */}
          <div className="text-xs text-slate-400 dark:text-white/25 space-y-1 pt-3 border-t border-slate-200 dark:border-white/10">
            <p>הועלה: {doc.created_at && new Date(doc.created_at).toLocaleDateString('he-IL')}</p>
            {doc.file_size && <p>גודל: {(doc.file_size / 1024).toFixed(1)} KB</p>}
          </div>
            </div>
          </div>
        </div>

        {/* Delete confirmation overlay */}
        {confirmDelete && (
          <div className="absolute inset-0 bg-black/70 flex items-center justify-center p-5">
            <div className="bg-white dark:bg-[#1a1a22] border border-slate-200 dark:border-white/10 rounded-xl p-5 w-full max-w-sm">
              <div className="flex items-start gap-3 mb-4">
                <AlertTriangle className="w-5 h-5 text-red-500 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-slate-900 dark:text-white font-semibold text-sm">למחוק את המסמך?</p>
                  <p className="text-slate-500 dark:text-white/60 text-xs mt-1">{doc.file_name} — פעולה זו אינה ניתנת לביטול.</p>
                </div>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleDelete}
                  disabled={deleting}
                  className="flex-1 py-2 bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
                >
                  {deleting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Trash2 className="w-4 h-4" />}
                  מחק
                </button>
                <button
                  onClick={() => setConfirmDelete(false)}
                  disabled={deleting}
                  className="px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-white/70 rounded-lg text-sm transition-colors"
                >
                  ביטול
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
