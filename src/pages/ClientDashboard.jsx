import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { openUpload } from '../components/UploadModal'
import Modal, { ModalHeader } from '../components/Modal'
import { displayName } from '../components/Avatar'
import {
  FileText, AlertCircle, Upload, Info
} from 'lucide-react'

const STATUS_CONFIG = {
  pending:      { label: 'התקבל',     color: 'text-slate-500 dark:text-white/50',   bg: 'bg-slate-100 dark:bg-white/5 border-slate-200 dark:border-white/10'          },
  processing:   { label: 'בעיבוד',    color: 'text-blue-700 dark:text-blue-400',   bg: 'bg-blue-500/10 border-blue-500/20'   },
  processed:    { label: 'מוכן',       color: 'text-green-700 dark:text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  ready:        { label: 'מוכן',       color: 'text-green-700 dark:text-green-400',  bg: 'bg-green-500/10 border-green-500/20' },
  needs_review: { label: 'בבדיקה',    color: 'text-amber-700 dark:text-amber-400', bg: 'bg-amber-500/10 border-amber-500/20' },
  blocked:      { label: 'נדרש מידע', color: 'text-red-700 dark:text-red-400',    bg: 'bg-red-500/10 border-red-500/20'     },
  error:        { label: 'שגיאה',      color: 'text-red-700 dark:text-red-400',    bg: 'bg-red-500/10 border-red-500/20'     },
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
  const [selectedDoc, setSelectedDoc] = useState(null)

  const [clients,     setClients]     = useState([])
  const client = clients.find(c => c.id === clientId) || null

  useEffect(() => { if (user) fetchData() }, [user])
  useEffect(() => { if (clientId) fetchDocuments(clientId) }, [clientId])

  // Old /client/upload links still open the upload dialog
  useEffect(() => {
    if (window.location.pathname === '/client/upload' && clientId) openUpload({ clientId })
  }, [clientId])

  // Refresh after an upload from the shared dialog
  useEffect(() => {
    const onChange = () => { if (clientId) fetchDocuments(clientId, { quiet: true }) }
    window.addEventListener('luca:docs-changed', onChange)
    return () => window.removeEventListener('luca:docs-changed', onChange)
  }, [clientId])

  async function fetchData() {
    setLoading(true)
    // Businesses linked to this user (RLS returns only linked clients via user_clients)
    const { data: linked } = await supabase
      .from('clients')
      .select('id, business_name, workspace_id')
      .is('archived_at', null)
      .order('business_name')

    const list = linked || []
    setClients(list)
    if (list.length) {
      setClientId(prev => (prev && list.some(c => c.id === prev)) ? prev : list[0].id)
    } else {
      setLoading(false)
    }
  }

  async function fetchDocuments(id, { quiet = false } = {}) {
    if (!quiet) setLoading(true)
    const { data: docs } = await supabase
      .from('documents')
      .select('id, file_name, document_type, status, review_status, total_amount, amount_before_vat, vat_amount, currency, invoice_number, invoice_date, vendor_name, created_at, validation_results')
      .eq('client_id', id)
      .order('created_at', { ascending: false })
    setDocuments(docs || [])
    setLoading(false)
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

  if (!client) {
    return (
      <div className="p-4 sm:p-6 max-w-xl" dir="rtl">
        <div className="bg-amber-50 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/20 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 text-amber-600 dark:text-amber-400 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-slate-900 dark:text-white font-semibold">החשבון עדיין לא שויך לעסק</p>
              <p className="text-slate-600 dark:text-white/60 text-sm mt-1">
                כדי להעלות מסמכים, המשרד צריך לשייך את כתובת המייל שלך ({user?.email}) לעסק שלך.
                אפשר לפנות למשרד ולבקש הזמנה.
              </p>
            </div>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="p-4 sm:p-6 max-w-5xl" dir="rtl">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-3 mb-6">
        <div>
          <h1 className="text-slate-900 dark:text-white text-2xl font-bold">
            שלום, {displayName(profile, 'לקוח')}
          </h1>
          {clients.length > 1 ? (
            <select
              value={clientId || ''}
              onChange={e => setClientId(e.target.value)}
              className="mt-1 text-sm bg-transparent border border-slate-200 dark:border-white/10 rounded-lg px-2 py-1 text-slate-700 dark:text-white/80"
              aria-label="בחירת עסק"
            >
              {clients.map(c => <option key={c.id} value={c.id}>{c.business_name}</option>)}
            </select>
          ) : (
            <p className="text-slate-400 dark:text-white/40 text-sm mt-0.5">{client.business_name}</p>
          )}
        </div>
        <button
          onClick={() => openUpload({ clientId })}
          className="flex items-center gap-2 px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-sm font-medium transition-colors"
        >
          <Upload className="w-4 h-4" />
          העלאת מסמך
        </button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="סה״כ מסמכים"   value={counts.total}       color="text-slate-700 dark:text-white/80" />
        <StatCard label="מוכנים"          value={counts.ready}       color="text-green-700 dark:text-green-400" />
        <StatCard label="בעיבוד"          value={counts.in_progress} color="text-blue-700 dark:text-blue-400" />
        <StatCard label="דורשים תשומת לב" value={counts.attention}   color="text-amber-700 dark:text-amber-400" />
      </div>

      {/* Attention banner */}
      {counts.attention > 0 && (
        <div className="flex items-center gap-3 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3 mb-5">
          <AlertCircle className="w-4 h-4 text-amber-700 dark:text-amber-400 flex-shrink-0" />
          <p className="text-amber-700 dark:text-amber-300 text-sm">
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
              onClick={() => openUpload({ clientId })}
              className="mt-2 text-blue-700 dark:text-blue-400 hover:text-blue-300 text-sm transition-colors"
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
                  className="flex items-center gap-3 px-4 py-3.5 hover:bg-slate-50 dark:hover:bg-white/[0.03] transition-colors cursor-pointer"
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
                    {doc.total_amount != null && (
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

      {/* Document detail modal */}
      {selectedDoc && (
        <Modal onClose={() => setSelectedDoc(null)} labelledBy="client-doc-title">
            <ModalHeader id="client-doc-title" title="פרטי מסמך" />

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
        </Modal>
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
