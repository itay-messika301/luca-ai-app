import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { FileText, Clock, CheckCircle, AlertCircle, Loader2, Eye, X, Download } from 'lucide-react'

const STATUS = {
  pending:    { label: 'ממתין',  color: 'bg-amber-100 text-amber-700', icon: Clock },
  processing: { label: 'מעבד',   color: 'bg-blue-100 text-blue-700',   icon: Loader2 },
  processed:  { label: 'עובד',   color: 'bg-green-100 text-green-700',  icon: CheckCircle },
  error:      { label: 'שגיאה',  color: 'bg-red-100 text-red-700',     icon: AlertCircle },
}

export default function ClientDocuments() {
  const { user, profile } = useAuth()
  const [documents, setDocuments] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedDoc, setSelectedDoc] = useState(null)

  useEffect(() => {
    if (user) fetchDocuments()
  }, [user])

  async function fetchDocuments() {
    // Find client records linked to this user
    const { data: clientRows } = await supabase
      .from('clients')
      .select('id')
      .eq('owner_user_id', user.id)

    const clientIds = clientRows?.map(c => c.id) ?? []
    if (clientIds.length === 0) {
      setDocuments([])
      setLoading(false)
      return
    }

    const { data } = await supabase
      .from('documents')
      .select('*')
      .in('client_id', clientIds)
      .order('created_at', { ascending: false })

    setDocuments(data || [])
    setLoading(false)
  }

  function fmt(bytes) {
    if (!bytes) return '-'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="animate-spin text-indigo-500" size={28} />
      </div>
    )
  }

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">המסמכים שלי</h1>
        <p className="text-gray-500 mt-1 text-sm">{documents.length} מסמכים</p>
      </div>

      {documents.length === 0 ? (
        <div className="bg-white rounded-2xl border border-gray-200 p-12 text-center">
          <FileText size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-500 mb-1">אין מסמכים עדיין</p>
          <p className="text-gray-400 text-sm">מסמכים שהועלו עבורך יופיעו כאן</p>
        </div>
      ) : (
        <div className="space-y-3">
          {documents.map(doc => {
            const status = STATUS[doc.status] || STATUS.pending
            const StatusIcon = status.icon
            return (
              <div
                key={doc.id}
                onClick={() => setSelectedDoc(doc)}
                className="bg-white rounded-xl border border-gray-200 p-4 hover:shadow-md transition cursor-pointer"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center">
                      <FileText size={20} className="text-indigo-500" />
                    </div>
                    <div>
                      <p className="font-medium text-gray-900">{doc.file_name}</p>
                      <div className="flex items-center gap-3 mt-0.5">
                        <span className="text-xs text-gray-400">
                          {doc.created_at ? new Date(doc.created_at).toLocaleDateString('he-IL') : ''}
                        </span>
                        <span className="text-xs text-gray-400">{fmt(doc.file_size)}</span>
                        {doc.document_type && (
                          <span className="text-xs text-gray-400">{doc.document_type}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {doc.total_amount && (
                      <span className="text-sm font-semibold text-gray-700">
                        {doc.currency || '₪'}{Number(doc.total_amount).toLocaleString()}
                      </span>
                    )}
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                      <StatusIcon size={12} />
                      {status.label}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* Document Detail Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedDoc(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">פרטי מסמך</h2>
              <button onClick={() => setSelectedDoc(null)}>
                <X size={20} className="text-gray-400" />
              </button>
            </div>

            {/* Status badge */}
            {(() => {
              const s = STATUS[selectedDoc.status] || STATUS.pending
              const SIcon = s.icon
              return (
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium mb-4 ${s.color}`}>
                  <SIcon size={14} />
                  {s.label}
                </div>
              )
            })()}

            {/* AI Extracted Data */}
            {selectedDoc.status === 'processed' && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-700 mb-3">נתונים שחולצו</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selectedDoc.invoice_number && (
                    <div><span className="text-gray-500">מספר חשבונית:</span> <span className="font-medium">{selectedDoc.invoice_number}</span></div>
                  )}
                  {selectedDoc.invoice_date && (
                    <div><span className="text-gray-500">תאריך:</span> <span className="font-medium">{selectedDoc.invoice_date}</span></div>
                  )}
                  {selectedDoc.total_amount != null && (
                    <div className="col-span-2 bg-indigo-50 p-2 rounded">
                      <span className="text-gray-600">סה"כ: </span>
                      <span className="font-bold text-indigo-700 text-lg">
                        {Number(selectedDoc.total_amount).toLocaleString()} {selectedDoc.currency || '₪'}
                      </span>
                    </div>
                  )}
                  {selectedDoc.document_type && (
                    <div><span className="text-gray-500">סוג מסמך:</span> <span className="font-medium">{selectedDoc.document_type}</span></div>
                  )}
                </div>
              </div>
            )}

            {selectedDoc.status === 'pending' && (
              <div className="text-center py-6">
                <Clock size={32} className="mx-auto text-amber-500 mb-3" />
                <p className="text-gray-500">המסמך ממתין לעיבוד</p>
              </div>
            )}

            {selectedDoc.status === 'processing' && (
              <div className="text-center py-6">
                <Loader2 size={32} className="mx-auto text-indigo-500 animate-spin mb-3" />
                <p className="text-gray-500">המסמך בעיבוד...</p>
              </div>
            )}

            {/* File Info */}
            <div className="mt-4 pt-4 border-t">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">גודל: </span>{fmt(selectedDoc.file_size)}</div>
                <div><span className="text-gray-500">תאריך העלאה: </span>{selectedDoc.created_at ? new Date(selectedDoc.created_at).toLocaleDateString('he-IL') : '-'}</div>
                <div><span className="text-gray-500">הועלה ע"י: </span>{selectedDoc.uploaded_by_name || '-'}</div>
              </div>
              {selectedDoc.raw_file_url && (
                <a href={selectedDoc.raw_file_url} target="_blank" rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 mt-3 text-indigo-600 hover:text-indigo-700 text-sm">
                  <Eye size={14} /> צפייה בקובץ
                </a>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
