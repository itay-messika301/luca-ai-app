import { useState, useEffect, useRef } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import {
  FileText, Clock, CheckCircle, AlertCircle, Upload,
  X, Info, ChevronDown
} from 'lucide-react'

const STATUS_CONFIG = {
  pending:      { label: 'התקבל',     color: 'text-slate-500 dark:text-white/50',   bg: 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'          },
  processing:   { label: 'בעיבוד',    color: 'text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20'   },
  processed:    { label: 'מוכן',       color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  ready:        { label: 'מוכן',       color: 'text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  needs_review: { label: 'בבדיקה',    color: 'text-yellow-400', bg: 'bg-yellow-500/10 border-yellow-500/20' },
  blocked:      { label: 'נדרש מידע', color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20'     },
  error:        { label: 'שגיאה',      color: 'text-red-400',    bg: 'bg-red-500/10 border-red-500/20'     },
}

const DOC_TYPE_LABELS = {
  invoice:        'חשבונית',
  receipt:        'קבלה',
  credit_note:    'זיכוי',
  tax_document:   'מסמך מס',
  bank_statement: 'דף בנק',
  other:          'אחר',
}

export default function ClientDashboard() {
  const { user, profile } = useAuth()
  const [documents,   setDocuments]   = useState([])
  const [loading,     setLoading]     = useState(true)
  const [clientId,    setClientId]    = useState(null)
  const [showUpload,  setShowUpload]  = useState(false)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [dragActive,  setDragActive]  = useState(false)
  const [uploading,   setUploading]   = useState(false)
  const [uploadedFiles, setUploadedFiles] = useState([])
  const inputRef = useRef()

  useEffect(() => { if (user) fetchData() }, [user])

  async function fetchData() {
    setLoading(true)
    // Find the client record linked to this user
    const { data: client } = await supabase
      .from('clients')
      .select('id, business_name')
      .eq('owner_user_id', user.id)
      .maybeSingle()

    if (client) {
      setClientId(client.id)
      const { data: docs } = await supabase
        .from('documents')
        .select('id, file_name, document_type, status, review_status, total_amount, currency, invoice_number, invoice_date, vendor_name, created_at, validation_results')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })
      setDocuments(docs || [])
    }
    setLoading(false)
  }

  async function handleUpload(files) {
    if (!files?.length || !clientId) return
    const list = Array.from(files)
    setUploading(true)

    const results = []
    for (const file of list) {
      const ext      = file.name.split('.').pop().toLowerCase()
      const filePath = `${clientId}/${Date.now()}_${file.name}`

      const { error: upErr } = await supabase.storage.from('documents').upload(filePath, file)
      if (upErr) { results.push({ name: file.name, ok: false, error: upErr.message }); continue }

      const { data: doc } = await supabase.from('documents').insert({
        client_id:     clientId,
        workspace_id:  (await supabase.from('clients').select('workspace_id').eq('id', clientId).single()).data?.workspace_id,
        file_name:     file.name,
        file_path:     filePath,
        file_type:     ext,
        file_size:     file.size,
        status:        'pending',
        review_status: 'pending',
        uploaded_by:   user.id,
      }).select('id').single()

      if (doc?.id) {
        // Trigger AI processing
        const { data: { session } } = await supabase.auth.getSession()
        fetch('/api/process-document', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
          body:    JSON.stringify({ document_id: doc.id }),
        }).catch(() => {}) // fire-and-forget
      }

      results.push({ name: file.name, ok: true })
    }

    setUploadedFiles(results)
    setUploading(false)
    fetchData()
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragActive(false)
    handleUpload(e.dataTransfer.files)
  }

  function getDocStatus(doc) {
    const key = doc.review_status && doc.review_status !== 'pending'
      ? doc.review_status
      : doc.status
    return STATUS_CONFIG[key] || STATUS_CONFIG.pending
  }

  const counts = {
    total:      documents.length,
    ready:      documents.filter(d => ['ready','processed'].includes(d.review_status || d.status)).length,
    in_progress: documents.filter(d => ['pending','processing'].includes(d.status)).length,
    attention:  documents.filter(d => ['needs_review','blocked'].includes(d.review_status)).length,
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl" dir="rtl">
      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div>
          <h1 className="text-slate-900 dark:text-white text-2xl font-bold">
            שלום, {profile?.full_name || 'לקוח'}
          </h1>
          <p className="text-slate-400 dark:text-white/40 text-sm mt-0.5">פורטל הלקוח שלך ב-Luca AI</p>
        </div>
        <button
          onClick={() => { setShowUpload(true); setUploadedFiles([]) }}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-slate-900 dark:text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Upload className="w-4 h-4" />
          העלאת מסמך
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="סה״כ מסמכים"   value={counts.total}       color="text-slate-700 dark:text-white/80" />
        <StatCard label="מוכנים"          value={counts.ready}       color="text-green-400" />
        <StatCard label="בעיבוד"          value={counts.in_progress} color="text-blue-400" />
        <StatCard label="דורשים תשומת לב" value={counts.attention}   color="text-yellow-400" />
      </div>

      {/* Attention banner */}
      {counts.attention > 0 && (
        <div className="flex items-center gap-3 bg-yellow-500/10 border border-yellow-500/20 rounded-xl px-4 py-3 mb-5">
          <AlertCircle className="w-4 h-4 text-yellow-400 flex-shrink-0" />
          <p className="text-yellow-300 text-sm">
            {counts.attention} מסמך דורש{counts.attention > 1 ? 'ים' : ''} תשומת לב מצד המשרד
          </p>
        </div>
      )}

      {/* Documents list */}
      <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-white/10 flex items-center justify-between">
          <h2 className="text-slate-900 dark:text-white font-semibold text-sm">המסמכים שלי</h2>
          <span className="text-slate-400 dark:text-white/30 text-xs">{documents.length} מסמכים</span>
        </div>

        {documents.length === 0 ? (
          <div className="text-center py-16">
            <FileText className="w-10 h-10 text-slate-300 dark:text-white/15 mx-auto mb-3" />
            <p className="text-slate-400 dark:text-white/30 text-sm">עדיין לא הועלו מסמכים</p>
            <button
              onClick={() => { setShowUpload(true); setUploadedFiles([]) }}
              className="mt-2 text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              העלה את המסמך הראשון שלך
            </button>
          </div>
        ) : (
          <div className="divide-y divide-white/5">
            {documents.map(doc => {
              const st = getDocStatus(doc)
              return (
                <div
                  key={doc.id}
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-white/3 transition-colors cursor-pointer"
                  onClick={() => setSelectedDoc(doc)}
                >
                  <FileText className="w-4 h-4 text-slate-400 dark:text-white/30 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="text-slate-700 dark:text-white/80 text-sm truncate">{doc.file_name || 'מסמך'}</p>
                    <p className="text-slate-400 dark:text-white/30 text-xs mt-0.5">
                      {DOC_TYPE_LABELS[doc.document_type] || ''}
                      {doc.vendor_name && ` · ${doc.vendor_name}`}
                      {doc.invoice_number && ` · ${doc.invoice_number}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3 flex-shrink-0">
                    {doc.total_amount && (
                      <span className="text-slate-500 dark:text-white/50 text-xs font-mono">
                        ₪{Number(doc.total_amount).toLocaleString('he-IL')}
                      </span>
                    )}
                    <span className={`text-xs px-2.5 py-1 rounded-full border ${st.bg} ${st.color}`}>
                      {st.label}
                    </span>
                    <span className="text-slate-400 dark:text-white/20 text-xs">
                      {new Date(doc.created_at).toLocaleDateString('he-IL')}
                    </span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Upload modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-slate-900 dark:text-white font-bold text-lg">העלאת מסמך</h3>
              <button onClick={() => setShowUpload(false)} className="text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            {uploadedFiles.length === 0 ? (
              <div
                onDragOver={e => { e.preventDefault(); setDragActive(true) }}
                onDragLeave={() => setDragActive(false)}
                onDrop={handleDrop}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragActive ? 'border-blue-400 bg-blue-500/10' : 'border-white/15 hover:border-white/30'
                }`}
              >
                <Upload className="w-8 h-8 text-slate-400 dark:text-white/30 mx-auto mb-3" />
                {uploading ? (
                  <p className="text-slate-500 dark:text-white/60 text-sm">מעלה...</p>
                ) : (
                  <>
                    <p className="text-slate-500 dark:text-white/60 text-sm">גרור קבצים לכאן, או לחץ לבחירה</p>
                    <p className="text-slate-400 dark:text-white/30 text-xs mt-1">PDF, JPG, PNG · עד 10MB לקובץ</p>
                  </>
                )}
                <input
                  ref={inputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png"
                  className="hidden"
                  onChange={e => handleUpload(e.target.files)}
                  disabled={uploading}
                />
              </div>
            ) : (
              <div className="space-y-2">
                <p className="text-slate-500 dark:text-white/60 text-sm mb-3">תוצאות העלאה:</p>
                {uploadedFiles.map((f, i) => (
                  <div key={i} className={`flex items-center gap-3 px-3 py-2 rounded-lg ${
                    f.ok ? 'bg-green-500/10' : 'bg-red-500/10'
                  }`}>
                    {f.ok
                      ? <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0" />
                      : <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0" />
                    }
                    <span className="text-slate-600 dark:text-white/70 text-sm truncate">{f.name}</span>
                  </div>
                ))}
                <button
                  onClick={() => setShowUpload(false)}
                  className="w-full mt-3 py-2.5 bg-blue-600 hover:bg-blue-700 text-slate-900 dark:text-white rounded-lg text-sm font-medium transition-colors"
                >
                  סגור
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document detail modal */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" dir="rtl">
          <div className="bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-slate-900 dark:text-white font-bold text-lg">פרטי מסמך</h3>
              <button onClick={() => setSelectedDoc(null)} className="text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <DetailField label="שם קובץ"     value={selectedDoc.file_name} span />
                <DetailField label="סוג מסמך"    value={DOC_TYPE_LABELS[selectedDoc.document_type] || '—'} />
                <DetailField label="ספק"          value={selectedDoc.vendor_name || '—'} />
                {selectedDoc.invoice_number && (
                  <DetailField label="מספר חשבונית" value={selectedDoc.invoice_number} />
                )}
                {selectedDoc.invoice_date && (
                  <DetailField label="תאריך"        value={new Date(selectedDoc.invoice_date).toLocaleDateString('he-IL')} />
                )}
              </div>

              {/* Financial summary */}
              <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-4">
                <p className="text-slate-400 dark:text-white/40 text-xs font-medium mb-3">סיכום כספי</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-slate-400 dark:text-white/30 text-xs">לפני מע"מ</p>
                    <p className="text-slate-700 dark:text-white/80 text-sm font-mono">
                      {selectedDoc.amount_before_vat != null
                        ? `₪${Number(selectedDoc.amount_before_vat).toLocaleString('he-IL')}`
                        : '—'}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-400 dark:text-white/30 text-xs">מע"מ</p>
                    <p className="text-slate-700 dark:text-white/80 text-sm font-mono">
                      {selectedDoc.vat_amount != null
                        ? `₪${Number(selectedDoc.vat_amount).toLocaleString('he-IL')}`
                        : '—'}
                    </p>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-slate-200 dark:border-white/10">
                    <p className="text-slate-400 dark:text-white/30 text-xs">סה"כ</p>
                    <p className="text-slate-900 dark:text-white font-bold text-lg font-mono">
                      {selectedDoc.total_amount != null
                        ? `₪${Number(selectedDoc.total_amount).toLocaleString('he-IL')}`
                        : '—'}
                    </p>
                  </div>
                </div>
              </div>

              {/* Status */}
              {(() => {
                const st = getDocStatus(selectedDoc)
                return (
                  <div className={`flex items-center gap-2 px-3 py-2.5 rounded-xl border ${st.bg}`}>
                    <span className={`text-xs font-medium ${st.color}`}>{st.label}</span>
                    {['needs_review', 'blocked'].includes(selectedDoc.review_status) && (
                      <span className="text-slate-400 dark:text-white/40 text-xs">— פנה למשרד לבירור</span>
                    )}
                  </div>
                )
              })()}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function StatCard({ label, value, color }) {
  return (
    <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-4">
      <p className={`text-2xl font-bold ${color}`}>{value}</p>
      <p className="text-slate-400 dark:text-white/40 text-xs mt-1">{label}</p>
    </div>
  )
}

function DetailField({ label, value, span = false }) {
  return (
    <div className={span ? 'col-span-2' : ''}>
      <p className="text-slate-400 dark:text-white/30 text-xs mb-0.5">{label}</p>
      <p className="text-slate-700 dark:text-white/80 text-sm truncate">{value}</p>
    </div>
  )
}

// used in status display inside modal
function getDocStatus(doc) {
  const key = doc.review_status && doc.review_status !== 'pending'
    ? doc.review_status
    : doc.status
  return STATUS_CONFIG[key] || STATUS_CONFIG.pending
}
