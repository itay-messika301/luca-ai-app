import UploadModal from '@/components/UploadModal'
import ClientPicker from '@/components/ClientPicker'
import { REVIEW_HELP, PROC_STATUS } from '@/lib/statuses'
import { useState, useEffect, useCallback, useRef } from 'react'
import { toHebrewError } from '../lib/errors'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { useDebounce } from '@/utils/useDebounce'
import ProcessTabs from '@/components/layout/ProcessTabs'
import CopyLinkButton from '@/components/CopyLinkButton'
import DateRangeFilter, { presetRange, inDateRange } from '@/components/DateRangeFilter'
import {
  Upload, Search, FileText, CheckCircle, Clock, AlertCircle,
  AlertTriangle, XCircle, RefreshCw, X, Loader2, ChevronDown, Eye,
  Save, Trash2, Pencil
} from 'lucide-react'
import Modal, { useModalClose } from '@/components/Modal'

const REVIEW_STATUS = {
  ready:        { label: 'מוכן לייצוא',        icon: CheckCircle,  color: 'text-green-700 dark:text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  needs_review: { label: 'דורש בדיקה', icon: AlertTriangle, color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  blocked:      { label: 'חסום',        icon: XCircle,      color: 'text-red-700 dark:text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
}

export default function Documents() {
  const { profile, workspace } = useAuth()
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const [documents,  setDocuments]  = useState([])
  const [clients,    setClients]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const debouncedSearch = useDebounce(search, 200)
  const [filterReview,  setFilterReview]  = useState('')
  const [filterClient,  setFilterClient]  = useState('')
  const [dateRange,     setDateRange]     = useState(() => {
    const preset = searchParams.get('preset') || 'all'
    const from = searchParams.get('from') || null
    const to = searchParams.get('to') || null
    return preset === 'custom' ? { preset, from, to } : { preset, ...presetRange(preset) }
  })
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
      .select('id, business_name, registration_number')
      .eq('workspace_id', workspace.id)
      .is('archived_at', null)
      .order('business_name')
    setClients(data || [])
  }, [workspace?.id])

  // Refresh when documents change elsewhere (global upload, review, processing)
  useEffect(() => {
    const onChange = () => fetchDocuments()
    window.addEventListener('luca:docs-changed', onChange)
    return () => window.removeEventListener('luca:docs-changed', onChange)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [workspace?.id])

  useEffect(() => {
    fetchDocuments()
    fetchClients()
  }, [fetchDocuments, fetchClients])

  // Apply ?client= filter from URL once on mount / when param changes
  useEffect(() => {
    const c = searchParams.get('client')
    if (c) setFilterClient(c)
  }, [searchParams])

  // Open side-drawer when ?doc= is present and matches a loaded document
  useEffect(() => {
    const docId = searchParams.get('doc')
    if (!docId || documents.length === 0) return
    const target = documents.find(d => d.id === docId)
    if (target) setSelectedDoc(target)
  }, [searchParams, documents])

  // Open / close drawer with URL sync (so deep-links and Back/Forward work)
  function openDoc(doc) {
    setSelectedDoc(doc)
    const next = new URLSearchParams(searchParams)
    next.set('doc', doc.id)
    setSearchParams(next, { replace: true })
  }
  function closeDoc() {
    setSelectedDoc(null)
    const next = new URLSearchParams(searchParams)
    next.delete('doc')
    setSearchParams(next, { replace: true })
  }

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
            error:  toHebrewError(err, 'שגיאה בקריאה לשרת'),
            stage:  'fetch',
            issues: [toHebrewError(err, 'שגיאה בקריאה לשרת')],
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

  function onDateRangeChange(next) {
    setDateRange(next)
    const p = new URLSearchParams(searchParams)
    if (next.preset === 'all') { p.delete('preset'); p.delete('from'); p.delete('to') }
    else {
      p.set('preset', next.preset)
      if (next.from) p.set('from', next.from); else p.delete('from')
      if (next.to) p.set('to', next.to); else p.delete('to')
    }
    setSearchParams(p, { replace: true })
  }

  const filtered = documents.filter(d => {
    if (filterReview && d.review_status !== filterReview) return false
    if (filterClient && d.client_id !== filterClient) return false
    if (!inDateRange(d.created_at, dateRange.from, dateRange.to)) return false
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
    <div className="p-4 sm:p-6 w-full max-w-6xl" dir="rtl">
      <ProcessTabs />
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-6">
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

      {/* Filters — one clear panel */}
      <section aria-label="סינון מסמכים" className="mb-5 rounded-xl border border-slate-200 dark:border-white/10 bg-white dark:bg-white/[0.03] p-4 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="doc-search" className="block text-sm font-medium text-slate-700 dark:text-white/80 mb-1.5">חיפוש</label>
            <div className="relative">
              <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-white/40" />
              <input
                id="doc-search"
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="שם קובץ, ספק או מספר חשבונית"
                className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pr-9 pl-3 py-2.5 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 dark:placeholder:text-white/40 focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20"
              />
            </div>
          </div>
          <div>
            <label htmlFor="doc-client" className="block text-sm font-medium text-slate-700 dark:text-white/80 mb-1.5">לקוח</label>
            <ClientPicker
              id="doc-client"
              clients={clients}
              value={filterClient}
              onChange={v => setFilterClient(v || '')}
              allowEmpty
              placeholder="כל הלקוחות"
            />
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-white/80 mb-1.5">סטטוס</p>
          <div className="flex flex-wrap items-center gap-2">
            {Object.entries(REVIEW_STATUS).map(([key, info]) => {
              const Icon = info.icon
              const on = filterReview === key
              return (
                <button
                  key={key}
                  onClick={() => setFilterReview(on ? '' : key)}
                  aria-pressed={on}
                  title={REVIEW_HELP[key]}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium transition-all ${
                    on ? info.bg + ' ' + info.color + ' border-current ring-2 ring-current/20'
                       : 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {info.label} ({counts[key]})
                </button>
              )
            })}
          </div>
        </div>

        <div>
          <p className="text-sm font-medium text-slate-700 dark:text-white/80 mb-1.5">תאריך העלאה</p>
          <DateRangeFilter value={dateRange} onChange={onDateRangeChange} />
        </div>
      </section>

      {/* Active filters summary */}
      {(search || filterClient || filterReview || (dateRange.preset && dateRange.preset !== 'all')) && (
        <div className="mb-4 flex flex-wrap items-center gap-2 text-sm" aria-live="polite">
          <span className="text-slate-600 dark:text-white/70">מסננים פעילים:</span>
          {search && <FilterChip label={`חיפוש: "${search}"`} onClear={() => setSearch('')} />}
          {filterClient && <FilterChip label={`לקוח: ${clients.find(c => c.id === filterClient)?.business_name || ''}`} onClear={() => setFilterClient('')} />}
          {filterReview && <FilterChip label={`סטטוס: ${REVIEW_STATUS[filterReview]?.label}`} onClear={() => setFilterReview('')} />}
          {dateRange.preset && dateRange.preset !== 'all' && <FilterChip label="תאריך" onClear={() => onDateRangeChange({ preset: 'all', from: null, to: null })} />}
          <button
            onClick={() => { setSearch(''); setFilterClient(''); setFilterReview(''); onDateRangeChange({ preset: 'all', from: null, to: null }) }}
            className="text-blue-700 dark:text-blue-300 font-medium underline underline-offset-2"
          >
            נקה הכול
          </button>
          <span className="text-slate-500 dark:text-white/50">· מוצגים {filtered.length} מתוך {documents.length}</span>
        </div>
      )}

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
                onClick={() => openDoc(doc)}
              />
            ))}
          </div>

          {/* Bulk confirm dialog */}
          {bulkConfirm && (
            <Modal onClose={() => setBulkConfirm(null)} busy={bulkBusy} maxWidth="max-w-sm" z="z-50" padded={false} panelClassName="p-5">
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
            </Modal>
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
          onClose={closeDoc}
          onReprocess={() => { processDocument(selectedDoc.id); closeDoc() }}
          onGoToReview={() => { navigate('/review'); closeDoc() }}
          onGoToClient={() => { if (selectedDoc.client_id) navigate(`/clients/${selectedDoc.client_id}`) }}
          onUpdated={(updated) => {
            setSelectedDoc(prev => prev ? { ...prev, ...updated } : prev)
            setDocuments(prev => prev.map(d => d.id === updated.id ? { ...d, ...updated } : d))
          }}
          onDeleted={() => {
            setDocuments(prev => prev.filter(d => d.id !== selectedDoc.id))
            closeDoc()
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
          : 'bg-slate-50 dark:bg-white/[0.03] hover:bg-slate-100 dark:hover:bg-white/[0.06] border-slate-100 dark:border-white/[0.08]'
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
        <span title={REVIEW_HELP[doc.review_status]} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg border text-xs font-medium flex-shrink-0 ${reviewInfo.bg} ${reviewInfo.color}`}>
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

/* ───────────── Document Detail Panel ───────────── */
const DOC_TYPE_HE = {
  invoice:        'חשבונית',
  tax_invoice:    'חשבונית מס',
  receipt:        'קבלה',
  invoice_receipt:'חשבונית מס קבלה',
  credit_note:    'זיכוי',
  tax_document:   'מסמך מס',
  bank_statement: 'דף בנק',
  other:          'אחר',
}

const EDITABLE_FIELDS = [
  { key: 'document_type',              label: 'סוג מסמך',     type: 'doctype' },
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

function DocDetailPanel({ doc, profile, onClose, onReprocess, onGoToReview, onGoToClient, onUpdated, onDeleted }) {
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
      if (e || !data?.signedUrl) setPreviewErr(toHebrewError(e, 'שגיאה בטעינת התצוגה'))
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
      setError(toHebrewError(err, 'שגיאה בשמירה'))
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
      setError(toHebrewError(err, 'שגיאה במחיקה'))
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
    <Modal
      onClose={onClose}
      variant="drawer"
      z="z-50"
      busy={saving || deleting}
      dirty={editMode && JSON.stringify(draft) !== JSON.stringify(buildDraft(doc))}
      label={doc.file_name}
      confirmTitle="לצאת בלי לשמור את העריכה?"
      confirmBody="השינויים שעשית בשדות המסמך לא יישמרו."
      confirmStay="המשך לערוך"
    >
      <div className="relative bg-white dark:bg-[#111117] border-r border-slate-200 dark:border-white/10 shadow-2xl w-full max-w-5xl h-full flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-white/10 flex-shrink-0">
          <div className="min-w-0 ml-4 flex-1">
            <h2 className="text-slate-900 dark:text-white font-semibold truncate">{doc.file_name}</h2>
            {doc.clients?.business_name && doc.client_id && (
              <button
                onClick={onGoToClient}
                className="mt-0.5 text-xs text-blue-500 dark:text-blue-400 hover:text-blue-600 dark:hover:text-blue-300 hover:underline truncate max-w-full text-right"
                title="עבור לפרטי הלקוח"
              >
                {doc.clients.business_name} ←
              </button>
            )}
          </div>
          <div className="flex items-center gap-1 flex-shrink-0">
            <CopyLinkButton path={`/documents?doc=${doc.id}`} className="ml-2" title="העתק קישור למסמך" />
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
            <GuardedClose className="p-1.5 text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white transition-colors">
              <X className="w-5 h-5" />
            </GuardedClose>
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
                    <details className="mt-1">
                      <summary className="text-[10px] text-red-500/70 dark:text-red-300/60 cursor-pointer">פרטים טכניים (לתמיכה)</summary>
                      <pre dir="ltr" className="text-[10px] text-red-500/70 dark:text-red-300/60 bg-red-500/5 rounded p-2 mt-1 max-h-28 overflow-auto whitespace-pre-wrap break-all">{apiDetail}</pre>
                    </details>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Validation issues (filter out the duplicate api error) */}
          {issues.filter(i => i !== apiError).length > 0 && (
            <div className="space-y-1">
              {issues.filter(i => i !== apiError).map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-amber-600 dark:text-amber-200">
                  <AlertTriangle className="w-3 h-3 text-amber-500 dark:text-amber-400 flex-shrink-0 mt-0.5" />
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
                    {editMode && type === 'doctype' ? (
                      <select
                        value={draft[key] ?? ''}
                        onChange={e => setField(key, e.target.value)}
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      >
                        <option value="">—</option>
                        {Object.entries(DOC_TYPE_HE).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
                      </select>
                    ) : editMode ? (
                      <input
                        type={type === 'number' ? 'number' : type === 'date' ? 'date' : 'text'}
                        value={draft[key] ?? ''}
                        onChange={e => setField(key, e.target.value)}
                        step={type === 'number' ? 'any' : undefined}
                        className="w-full bg-slate-50 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-md px-2 py-1.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
                      />
                    ) : (
                      <p className="text-slate-700 dark:text-white/80 text-sm font-medium">
                        {type === 'doctype' ? (DOC_TYPE_HE[doc[key]] || doc[key] || '—') : fmt(doc[key], type)}
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
                      val >= 0.5 ? 'bg-amber-500/15 text-amber-600 dark:text-amber-400' :
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
    </Modal>
  )
}

function FilterChip({ label, onClear }) {
  return (
    <span className="inline-flex items-center gap-1.5 bg-blue-600/10 border border-blue-500/30 text-blue-800 dark:text-blue-200 rounded-full px-3 py-1">
      {label}
      <button onClick={onClear} aria-label={`הסרת מסנן ${label}`} className="hover:text-blue-950 dark:hover:text-white">
        <X className="w-3.5 h-3.5" />
      </button>
    </span>
  )
}

function GuardedClose({ className, children }) {
  const close = useModalClose()
  return <button type="button" onClick={close} aria-label="סגירה" className={className}>{children}</button>
}
