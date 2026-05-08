import { useState, useEffect, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Upload, Search, FileText, CheckCircle, Clock, AlertCircle,
  AlertTriangle, XCircle, RefreshCw, X, Loader2, ChevronDown, Eye
} from 'lucide-react'

const REVIEW_STATUS = {
  ready:        { label: 'מוכן',        icon: CheckCircle,  color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  needs_review: { label: 'נדרש בדיקה', icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  blocked:      { label: 'חסום',        icon: XCircle,      color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20' },
}
const PROC_STATUS = {
  pending:    { label: 'ממתין',   color: 'text-white/40' },
  processing: { label: 'בעיבוד',  color: 'text-blue-400' },
  processed:  { label: 'עובד',    color: 'text-white/60' },
  error:      { label: 'שגיאה',   color: 'text-red-400' },
}

export default function Documents() {
  const { profile, workspace } = useAuth()
  const [documents,  setDocuments]  = useState([])
  const [clients,    setClients]    = useState([])
  const [loading,    setLoading]    = useState(true)
  const [search,     setSearch]     = useState('')
  const [filterReview,  setFilterReview]  = useState('')
  const [filterClient,  setFilterClient]  = useState('')
  const [showUpload, setShowUpload] = useState(false)
  const [processing, setProcessing] = useState({})
  const [selectedDoc, setSelectedDoc] = useState(null)

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

  async function processDocument(documentId) {
    setProcessing(p => ({ ...p, [documentId]: true }))
    try {
      const { data: { session } } = await supabase.auth.getSession()
      await fetch('/api/process-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session?.access_token}` },
        body: JSON.stringify({ document_id: documentId }),
      })
      await fetchDocuments()
    } catch (err) {
      console.error('Process failed:', err)
    } finally {
      setProcessing(p => ({ ...p, [documentId]: false }))
    }
  }

  const filtered = documents.filter(d => {
    if (filterReview && d.review_status !== filterReview) return false
    if (filterClient && d.client_id !== filterClient) return false
    if (search) {
      const q = search.toLowerCase()
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
          <h1 className="text-white text-2xl font-bold">מסמכים</h1>
          <p className="text-white/40 text-sm mt-0.5">{documents.length} מסמכים סה"כ</p>
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
                filterReview === key ? info.bg + ' border-current' : 'bg-white/5 border-white/10 text-white/40 hover:text-white/70'
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
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם קובץ, ספק, חשבונית..."
            className="w-full bg-white/5 border border-white/10 rounded-lg pr-9 pl-3 py-2 text-white text-sm placeholder:text-white/30 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <div className="relative">
          <select
            value={filterClient}
            onChange={e => setFilterClient(e.target.value)}
            className="appearance-none bg-white/5 border border-white/10 rounded-lg px-3 pl-7 py-2 text-white/60 text-sm focus:outline-none cursor-pointer"
          >
            <option value="">כל הלקוחות</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
          </select>
          <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
        </div>
      </div>

      {/* Documents list */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-10 h-10 text-white/15 mx-auto mb-3" />
          <p className="text-white/30 text-sm">אין מסמכים להצגה</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {filtered.map(doc => (
            <DocumentRow
              key={doc.id}
              doc={doc}
              processing={processing[doc.id]}
              onProcess={() => processDocument(doc.id)}
              onClick={() => setSelectedDoc(doc)}
            />
          ))}
        </div>
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
          onClose={() => setSelectedDoc(null)}
          onReprocess={() => { processDocument(selectedDoc.id); setSelectedDoc(null) }}
        />
      )}
    </div>
  )
}

/* ───────────── Document Row ───────────── */
function DocumentRow({ doc, processing, onProcess, onClick }) {
  const reviewInfo = REVIEW_STATUS[doc.review_status]
  const procInfo   = PROC_STATUS[doc.status] || PROC_STATUS.pending
  const ReviewIcon = reviewInfo?.icon

  return (
    <div
      className="flex items-center gap-3 bg-white/3 hover:bg-white/6 border border-white/8 rounded-xl px-4 py-3 cursor-pointer transition-all group"
      onClick={onClick}
    >
      <FileText className="w-4 h-4 text-white/30 flex-shrink-0" />

      <div className="flex-1 min-w-0">
        <p className="text-white/80 text-sm truncate">{doc.file_name}</p>
        <div className="flex items-center gap-3 mt-0.5">
          {doc.clients?.business_name && (
            <span className="text-white/30 text-xs truncate">{doc.clients.business_name}</span>
          )}
          {doc.vendor_name && (
            <span className="text-white/20 text-xs truncate">{doc.vendor_name}</span>
          )}
          {doc.invoice_number && (
            <span className="text-white/20 text-xs font-mono">#{doc.invoice_number}</span>
          )}
        </div>
      </div>

      {/* Amount */}
      {doc.total_amount && (
        <span className="text-white/60 text-sm font-medium flex-shrink-0">
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
          className="opacity-0 group-hover:opacity-100 p-1.5 text-white/30 hover:text-blue-400 transition-all"
          title="עיבוד AI"
        >
          <RefreshCw className={`w-4 h-4 ${processing ? 'animate-spin' : ''}`} />
        </button>
      )}

      {/* Date */}
      <span className="text-white/20 text-xs flex-shrink-0">
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
      const filePath = `${workspace.id}/${Date.now()}_${file.name}`
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
        <div className="bg-[#111117] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-white font-bold text-lg">תוצאות העלאה</h2>
            <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
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
                  <p className="text-white/80 text-sm truncate">{r.name}</p>
                  {r.error && <p className="text-red-300/70 text-xs mt-0.5 break-words">{r.error}</p>}
                </div>
              </div>
            ))}
          </div>

          <div className="flex items-center justify-between text-xs text-white/40 mb-4">
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
      <div className="bg-[#111117] border border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 className="text-white font-bold text-lg">העלאת מסמכים</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          {/* Client select */}
          <div>
            <label className="block text-white/50 text-xs mb-1.5">לקוח *</label>
            <div className="relative">
              <select
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                className="w-full appearance-none bg-white/5 border border-white/10 rounded-lg px-3 pl-7 py-2.5 text-white text-sm focus:outline-none focus:border-blue-500 cursor-pointer"
                required
              >
                <option value="">בחר לקוח</option>
                {clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
              </select>
              <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
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
            <Upload className="w-6 h-6 text-white/30 mx-auto mb-2" />
            <p className="text-white/50 text-sm">גרור קבצים לכאן, או לחץ לבחירה</p>
            <p className="text-white/25 text-xs mt-1">PDF, PNG, JPG, WEBP — עד {MAX_FILES} קבצים</p>
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
            <div className="bg-white/5 rounded-xl p-3 max-h-36 overflow-y-auto space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-xs">
                  <span className="text-white/60 truncate">{f.name}</span>
                  <button
                    type="button"
                    onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    className="text-white/30 hover:text-white/60 ml-2 flex-shrink-0"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploading && (
            <div className="space-y-1">
              <div className="flex justify-between text-xs text-white/40">
                <span>מעלה... ({Math.round(progress)}%)</span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-1.5">
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
              className="px-4 py-2.5 bg-white/5 hover:bg-white/10 text-white/70 rounded-lg text-sm transition-colors"
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
function DocDetailPanel({ doc, onClose, onReprocess }) {
  const reviewInfo = REVIEW_STATUS[doc.review_status]
  const ReviewIcon = reviewInfo?.icon
  const issues     = doc.validation_results?.issues || []

  return (
    <div className="fixed inset-0 bg-black/60 flex items-end sm:items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-[#111117] border border-white/10 rounded-2xl w-full max-w-lg shadow-2xl max-h-[85vh] overflow-y-auto">
        <div className="flex items-center justify-between p-5 border-b border-white/10 sticky top-0 bg-[#111117]">
          <h2 className="text-white font-semibold truncate ml-4">{doc.file_name}</h2>
          <button onClick={onClose} className="text-white/40 hover:text-white transition-colors flex-shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Review status */}
          {reviewInfo && (
            <div className={`flex items-center gap-2 px-3 py-2 rounded-lg border ${reviewInfo.bg}`}>
              <ReviewIcon className={`w-4 h-4 ${reviewInfo.color}`} />
              <span className={`text-sm font-medium ${reviewInfo.color}`}>{reviewInfo.label}</span>
            </div>
          )}

          {/* Validation issues */}
          {issues.length > 0 && (
            <div className="space-y-1">
              {issues.map((issue, i) => (
                <div key={i} className="flex items-start gap-2 text-xs text-yellow-300/70">
                  <AlertTriangle className="w-3 h-3 text-yellow-400 flex-shrink-0 mt-0.5" />
                  {issue}
                </div>
              ))}
            </div>
          )}

          {/* Extracted fields */}
          {doc.status === 'processed' && (
            <div className="grid grid-cols-2 gap-3">
              {[
                ['ספק',          doc.vendor_name],
                ['מס׳ חשבונית',  doc.invoice_number],
                ['תאריך',        doc.invoice_date],
                ['ח.פ ספק',      doc.vendor_registration_number],
                ['לפני מע"מ',    doc.amount_before_vat != null && `₪${Number(doc.amount_before_vat).toLocaleString('he-IL')}`],
                [`מע"מ (${doc.vat_rate || 18}%)`, doc.vat_amount != null && `₪${Number(doc.vat_amount).toLocaleString('he-IL')}`],
                ['סה"כ',         doc.total_amount != null && `₪${Number(doc.total_amount).toLocaleString('he-IL')}`],
                ['ניכוי מס',     doc.withholding_tax != null && `₪${Number(doc.withholding_tax).toLocaleString('he-IL')}`],
                ['מס׳ הקצאה',    doc.allocation_number],
                ['מטבע',         doc.currency],
              ].filter(([, v]) => v).map(([label, value]) => (
                <div key={label}>
                  <p className="text-white/30 text-xs">{label}</p>
                  <p className="text-white/80 text-sm font-medium">{value}</p>
                </div>
              ))}
            </div>
          )}

          {/* Confidence */}
          {doc.field_confidence && Object.keys(doc.field_confidence).length > 0 && (
            <div>
              <p className="text-white/30 text-xs mb-2">רמת ביטחון AI</p>
              <div className="flex flex-wrap gap-1.5">
                {Object.entries(doc.field_confidence).map(([key, val]) => (
                  <span
                    key={key}
                    className={`text-xs px-2 py-0.5 rounded-full ${
                      val >= 0.8 ? 'bg-green-500/15 text-green-400' :
                      val >= 0.5 ? 'bg-yellow-500/15 text-yellow-400' :
                                   'bg-red-500/15 text-red-400'
                    }`}
                  >
                    {key}: {Math.round(val * 100)}%
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Re-process */}
          {(doc.status === 'error' || doc.status === 'pending') && (
            <button
              onClick={onReprocess}
              className="w-full py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              עיבוד מחדש
            </button>
          )}

          {/* File meta */}
          <div className="text-xs text-white/25 space-y-1 pt-3 border-t border-white/10">
            <p>הועלה: {doc.created_at && new Date(doc.created_at).toLocaleDateString('he-IL')}</p>
            {doc.file_size && <p>גודל: {(doc.file_size / 1024).toFixed(1)} KB</p>}
          </div>
        </div>
      </div>
    </div>
  )
}
