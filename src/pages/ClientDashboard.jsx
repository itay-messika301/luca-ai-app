import { useState, useEffect } from 'react'
import { useAuth } from '../lib/AuthContext'
import { supabase } from '../lib/supabase'
import { FileText, Clock, CheckCircle, AlertCircle, Upload, Eye, X, TrendingUp } from 'lucide-react'

export default function ClientDashboard() {
  const { user, profile } = useAuth()
  const [documents, setDocuments] = useState([])
  const [stats, setStats] = useState({ total: 0, processed: 0, pending: 0, processing: 0 })
  const [loading, setLoading] = useState(true)
  const [showUpload, setShowUpload] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [dragActive, setDragActive] = useState(false)

  useEffect(() => {
    fetchDocuments()
  }, [user])

  async function fetchDocuments() {
    if (!user) return
    setLoading(true)
    try {
      // Get client record linked to this user
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!client) {
        setLoading(false)
        return
      }

      const { data, error } = await supabase
        .from('documents')
        .select('*')
        .eq('client_id', client.id)
        .order('created_at', { ascending: false })

      if (!error && data) {
        setDocuments(data)
        setStats({
          total: data.length,
          processed: data.filter(d => d.status === 'processed').length,
          pending: data.filter(d => d.status === 'pending').length,
          processing: data.filter(d => d.status === 'processing').length,
        })
      }
    } catch (err) {
      console.error('Error fetching documents:', err)
    }
    setLoading(false)
  }

  async function handleUpload(files) {
    if (!files?.length || !user) return
    setUploading(true)
    try {
      const { data: client } = await supabase
        .from('clients')
        .select('id')
        .eq('user_id', user.id)
        .single()

      if (!client) {
        alert('לא נמצא חשבון לקוח מקושר')
        setUploading(false)
        return
      }

      for (const file of files) {
        const fileExt = file.name.split('.').pop().toLowerCase()
        const filePath = `${client.id}/${Date.now()}_${file.name}`

        const { error: uploadError } = await supabase.storage
          .from('documents')
          .upload(filePath, file)

        if (uploadError) {
          console.error('Upload error:', uploadError)
          continue
        }

        await supabase.from('documents').insert({
          client_id: client.id,
          file_name: file.name,
          file_path: filePath,
          file_type: fileExt,
          file_size: file.size,
          status: 'pending',
          uploaded_by: user.id,
        })
      }
      setShowUpload(false)
      fetchDocuments()
    } catch (err) {
      console.error('Upload error:', err)
    }
    setUploading(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    setDragActive(false)
    handleUpload(e.dataTransfer.files)
  }

  const statusConfig = {
    pending: { label: 'ממתין', color: 'bg-amber-100 text-amber-700', icon: Clock },
    processing: { label: 'בעיבוד', color: 'bg-blue-100 text-blue-700', icon: Clock },
    processed: { label: 'עובד', color: 'bg-green-100 text-green-700', icon: CheckCircle },
    error: { label: 'שגיאה', color: 'bg-red-100 text-red-700', icon: AlertCircle },
  }

  const docTypeLabels = {
    invoice: 'חשבונית',
    receipt: 'קבלה',
    tax_document: 'מסמך מס',
    bank_statement: 'דף בנק',
    other: 'אחר',
  }

  function formatDate(dateStr) {
    if (!dateStr) return '-'
    return new Date(dateStr).toLocaleDateString('he-IL')
  }

  function formatCurrency(amount, currency) {
    if (!amount) return '-'
    const symbols = { ILS: '₪', USD: '$', EUR: '€' }
    return `${symbols[currency] || ''}${Number(amount).toLocaleString()}`
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">טוען...</div>
      </div>
    )
  }

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            שלום, {profile?.full_name || 'לקוח'} 👋
          </h1>
          <p className="text-slate-500 mt-1">ברוך הבא לפורטל הלקוחות של Luca AI</p>
        </div>
        <button
          onClick={() => setShowUpload(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition shadow-sm"
        >
          <Upload size={16} />
          העלאת מסמך
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <FileText size={20} className="text-indigo-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.total}</p>
          <p className="text-sm text-slate-500">סה״כ מסמכים</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <CheckCircle size={20} className="text-green-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.processed}</p>
          <p className="text-sm text-slate-500">עובדו בהצלחה</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <Clock size={20} className="text-amber-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.pending}</p>
          <p className="text-sm text-slate-500">ממתינים לעיבוד</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <TrendingUp size={20} className="text-blue-500" />
          </div>
          <p className="text-2xl font-bold text-slate-900">{stats.processing}</p>
          <p className="text-sm text-slate-500">בעיבוד כעת</p>
        </div>
      </div>

      {/* Recent Documents */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between">
          <h2 className="font-semibold text-slate-900">המסמכים שלי</h2>
          <span className="text-xs text-slate-400">{documents.length} מסמכים</span>
        </div>

        {documents.length === 0 ? (
          <div className="p-12 text-center">
            <FileText size={40} className="mx-auto text-slate-300 mb-3" />
            <p className="text-slate-400 text-sm mb-4">עדיין לא הועלו מסמכים</p>
            <button
              onClick={() => setShowUpload(true)}
              className="text-indigo-600 text-sm font-medium hover:text-indigo-700"
            >
              העלה את המסמך הראשון שלך
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-100 text-slate-500">
                  <th className="text-right px-6 py-3 font-medium">שם קובץ</th>
                  <th className="text-right px-4 py-3 font-medium">סוג</th>
                  <th className="text-right px-4 py-3 font-medium">סטטוס</th>
                  <th className="text-right px-4 py-3 font-medium">סכום</th>
                  <th className="text-right px-4 py-3 font-medium">תאריך העלאה</th>
                  <th className="text-right px-4 py-3 font-medium">פעולות</th>
                </tr>
              </thead>
              <tbody>
                {documents.map(doc => {
                  const status = statusConfig[doc.status] || statusConfig.pending
                  const StatusIcon = status.icon
                  return (
                    <tr key={doc.id} className="border-b border-slate-50 hover:bg-slate-25 transition">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          <FileText size={16} className="text-slate-400 shrink-0" />
                          <span className="text-slate-900 truncate max-w-[200px]">{doc.file_name}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {docTypeLabels[doc.document_type] || doc.document_type || '-'}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-medium ${status.color}`}>
                          <StatusIcon size={12} />
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatCurrency(doc.total_amount, doc.currency)}
                      </td>
                      <td className="px-4 py-3 text-slate-500">{formatDate(doc.created_at)}</td>
                      <td className="px-4 py-3">
                        {doc.status === 'processed' && (
                          <button
                            onClick={() => setSelectedDoc(doc)}
                            className="text-indigo-600 hover:text-indigo-800 transition"
                            title="צפייה בפרטים"
                          >
                            <Eye size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Upload Modal */}
      {showUpload && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg text-slate-900">העלאת מסמך</h3>
              <button onClick={() => setShowUpload(false)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>
            <div
              className={`border-2 border-dashed rounded-xl p-8 text-center transition ${
                dragActive ? 'border-indigo-400 bg-indigo-50' : 'border-slate-200 hover:border-indigo-300'
              }`}
              onDragOver={(e) => { e.preventDefault(); setDragActive(true) }}
              onDragLeave={() => setDragActive(false)}
              onDrop={handleDrop}
            >
              <Upload size={32} className="mx-auto text-slate-400 mb-3" />
              <p className="text-slate-600 text-sm mb-2">
                גררו קבצים לכאן או{' '}
                <label className="text-indigo-600 cursor-pointer hover:text-indigo-700 font-medium">
                  בחרו מהמחשב
                  <input
                    type="file"
                    className="hidden"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.gif,.webp"
                    onChange={(e) => handleUpload(e.target.files)}
                    disabled={uploading}
                  />
                </label>
              </p>
              <p className="text-xs text-slate-400">PDF, JPG, PNG • עד 10MB</p>
            </div>
            {uploading && (
              <div className="mt-4 text-center">
                <div className="inline-block w-5 h-5 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-sm text-slate-500 mt-2">מעלה...</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Document Detail Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-lg p-6 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-6">
              <h3 className="font-semibold text-lg text-slate-900">פרטי מסמך</h3>
              <button onClick={() => setSelectedDoc(null)} className="text-slate-400 hover:text-slate-600">
                <X size={20} />
              </button>
            </div>

            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-slate-400 mb-1">שם קובץ</p>
                  <p className="text-sm font-medium text-slate-900">{selectedDoc.file_name}</p>
                </div>
                <div>
                  <p className="text-xs text-slate-400 mb-1">סוג מסמך</p>
                  <p className="text-sm font-medium text-slate-900">{docTypeLabels[selectedDoc.document_type] || '-'}</p>
                </div>
              </div>

              {selectedDoc.vendor_name && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">ספק</p>
                  <p className="text-sm font-medium text-slate-900">{selectedDoc.vendor_name}</p>
                </div>
              )}

              {selectedDoc.invoice_number && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <p className="text-xs text-slate-400 mb-1">מספר חשבונית</p>
                    <p className="text-sm font-medium text-slate-900">{selectedDoc.invoice_number}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400 mb-1">תאריך חשבונית</p>
                    <p className="text-sm font-medium text-slate-900">{formatDate(selectedDoc.invoice_date)}</p>
                  </div>
                </div>
              )}

              <div className="bg-slate-50 rounded-xl p-4">
                <p className="text-xs text-slate-400 mb-3 font-medium">סיכום כספי</p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <p className="text-xs text-slate-400">סכום לפני מע״מ</p>
                    <p className="text-sm font-semibold text-slate-900">{formatCurrency(selectedDoc.amount_before_vat, selectedDoc.currency)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-slate-400">מע״מ ({selectedDoc.vat_rate || 0}%)</p>
                    <p className="text-sm font-semibold text-slate-900">{formatCurrency(selectedDoc.vat_amount, selectedDoc.currency)}</p>
                  </div>
                  <div className="col-span-2 pt-2 border-t border-slate-200">
                    <p className="text-xs text-slate-400">סה״כ</p>
                    <p className="text-lg font-bold text-indigo-600">{formatCurrency(selectedDoc.total_amount, selectedDoc.currency)}</p>
                  </div>
                </div>
              </div>

              {selectedDoc.field_confidence?.overall && (
                <div>
                  <p className="text-xs text-slate-400 mb-1">רמת ביטחון AI</p>
                  <div className="w-full bg-slate-100 rounded-full h-2">
                    <div
                      className="bg-indigo-600 h-2 rounded-full transition-all"
                      style={{ width: `${Math.round(selectedDoc.field_confidence.overall * 100)}%` }}
                    ></div>
                  </div>
                  <p className="text-xs text-slate-500 mt-1">{Math.round(selectedDoc.field_confidence.overall * 100)}%</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
