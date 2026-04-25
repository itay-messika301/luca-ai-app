import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Upload, Search, FileText, CheckCircle, Clock, AlertCircle, Eye, RefreshCw, X, Loader2 } from 'lucide-react'

const STATUS = {
  pending: { label: 'ממתין', color: 'bg-yellow-100 text-yellow-700', icon: Clock },
  processing: { label: 'מעבד', color: 'bg-blue-100 text-blue-700', icon: Loader2 },
  processed: { label: 'עובד', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  error: { label: 'שגיאה', color: 'bg-red-100 text-red-700', icon: AlertCircle },
}

export default function Documents() {
  const { profile } = useAuth()
  const [documents, setDocuments] = useState([])
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [filterStatus, setFilterStatus] = useState('')
  const [filterClient, setFilterClient] = useState('')
  const [showModal, setShowModal] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [uploadData, setUploadData] = useState({ client_id: '', document_type: '', notes: '' })
  const [selectedFile, setSelectedFile] = useState(null)
  const [error, setError] = useState('')
  const [selectedDoc, setSelectedDoc] = useState(null)
  const [processing, setProcessing] = useState({})

  useEffect(() => { fetchDocuments(); fetchClients() }, [])

  async function fetchDocuments() {
    const firmId = profile?.firm_id
    let q = supabase.from('documents').select('*').order('created_at', { ascending: false })
    if (firmId) {
      const { data: fc } = await supabase.from('clients').select('id').eq('accounting_firm_id', firmId)
      const ids = fc?.map(c => c.id) ?? []
      if (ids.length === 0) { setDocuments([]); setLoading(false); return }
      q = q.in('client_id', ids)
    }
    const { data } = await q
    setDocuments(data || [])
    setLoading(false)
  }

  async function fetchClients() {
    let q = supabase.from('clients').select('id, name')
    if (profile?.firm_id) {
      q = q.eq('accounting_firm_id', profile.firm_id)
    }
    const { data } = await q
    setClients(data || [])
  }

  async function processDocument(documentId) {
    setProcessing(prev => ({ ...prev, [documentId]: true }))
    try {
      const res = await fetch('/api/process-document', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ document_id: documentId })
      })
      if (!res.ok) {
        console.error('Processing error:', await res.json())
      }
      await fetchDocuments()
    } catch (err) {
      console.error('Process failed:', err)
    } finally {
      setProcessing(prev => ({ ...prev, [documentId]: false }))
    }
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!selectedFile) { setError('יש לבחור קובץ'); return }
    if (!uploadData.client_id) { setError('יש לבחור לקוח'); return }
    setUploading(true); setError('')
    const filePath = `documents/${Date.now()}_${selectedFile.name}`
    const { error: storageErr } = await supabase.storage.from('documents').upload(filePath, selectedFile)
    if (storageErr) { setError('שגיאה בהעלאה: ' + storageErr.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)
    const client = clients.find(c => c.id === uploadData.client_id)
    const { data: inserted, error: dbErr } = await supabase.from('documents').insert({
      client_id: uploadData.client_id, client_name: client?.name,
      accounting_firm_id: profile.firm_id, uploaded_by_user_id: profile.id,
      uploaded_by_name: profile.full_name, file_name: selectedFile.name,
      file_path: filePath, file_size: selectedFile.size,
      raw_file_url: urlData.publicUrl, file_type: selectedFile.name.split('.').pop(),
      document_type: uploadData.document_type || null,
      cpa_notes: uploadData.notes || null, status: 'pending',
    }).select().single()
    if (dbErr) { setError('שגיאה: ' + dbErr.message) }
    else {
      setShowModal(false); setUploadData({ client_id: '', document_type: '', notes: '' })
      setSelectedFile(null); setUploading(false)
      await fetchDocuments()
      // Trigger AI processing
      processDocument(inserted.id)
    }
    setUploading(false)
  }

  function fmt(bytes) {
    if (!bytes) return '-'
    if (bytes < 1024) return bytes + ' B'
    if (bytes < 1048576) return (bytes / 1024).toFixed(1) + ' KB'
    return (bytes / 1048576).toFixed(1) + ' MB'
  }

  const filtered = documents.filter(d => {
    if (filterStatus && d.status !== filterStatus) return false
    if (filterClient && d.client_id !== filterClient) return false
    if (search && !d.file_name?.toLowerCase().includes(search.toLowerCase()) &&
        !d.client_name?.toLowerCase().includes(search.toLowerCase()) &&
        !d.invoice_number?.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  if (loading) return <div className="p-8 text-center text-gray-400">טוען...</div>

  return (
    <div className="p-6 max-w-7xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">מסמכים</h1>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition">
          <Upload size={18} /> העלאת מסמך
        </button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute right-3 top-2.5 text-gray-400" size={18} />
          <input type="text" placeholder="חיפוש לפי שם קובץ, לקוח או מספר חשבונית..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="pending">ממתין</option>
          <option value="processing">מעבד</option>
          <option value="processed">עובד</option>
          <option value="error">שגיאה</option>
        </select>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)} className="border rounded-lg px-3 py-2 text-sm">
          <option value="">כל הלקוחות</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </div>

      {/* Documents Table */}
      <div className="bg-white rounded-xl shadow-sm border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600">
            <tr>
              <th className="text-right px-4 py-3 font-medium">שם קובץ</th>
              <th className="text-right px-4 py-3 font-medium">לקוח</th>
              <th className="text-right px-4 py-3 font-medium">סוג</th>
              <th className="text-right px-4 py-3 font-medium">סטטוס</th>
              <th className="text-right px-4 py-3 font-medium">סכום</th>
              <th className="text-right px-4 py-3 font-medium">תאריך</th>
              <th className="text-right px-4 py-3 font-medium">פעולות</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {filtered.length === 0 ? (
              <tr><td colSpan="7" className="text-center py-12 text-gray-400">
                <FileText className="mx-auto mb-2 text-gray-300" size={40} />
                אין מסמכים להצגה
              </td></tr>
            ) : filtered.map(doc => {
              const status = STATUS[doc.status] || STATUS.pending
              const StatusIcon = status.icon
              return (
                <tr key={doc.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => setSelectedDoc(doc)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <FileText size={16} className="text-gray-400" />
                      <span className="font-medium text-gray-700 truncate max-w-[200px]">{doc.file_name}</span>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-gray-600">{doc.client_name || '-'}</td>
                  <td className="px-4 py-3 text-gray-600">{doc.document_type || '-'}</td>
                  <td className="px-4 py-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${status.color}`}>
                      {processing[doc.id] ? <Loader2 size={12} className="animate-spin" /> : <StatusIcon size={12} />}
                      {processing[doc.id] ? 'מעבד...' : status.label}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-gray-700 font-medium">
                    {doc.total_amount ? `${doc.currency || '₪'}${Number(doc.total_amount).toLocaleString()}` : '-'}
                  </td>
                  <td className="px-4 py-3 text-gray-500 text-xs">
                    {doc.invoice_date || (doc.created_at ? new Date(doc.created_at).toLocaleDateString('he-IL') : '-')}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <button onClick={(e) => { e.stopPropagation(); setSelectedDoc(doc) }} className="p-1 hover:bg-gray-100 rounded" title="צפייה">
                        <Eye size={16} className="text-gray-500" />
                      </button>
                      {(doc.status === 'pending' || doc.status === 'error') && (
                        <button onClick={(e) => { e.stopPropagation(); processDocument(doc.id) }} className="p-1 hover:bg-gray-100 rounded" title="עיבוד AI">
                          <RefreshCw size={16} className={`text-indigo-500 ${processing[doc.id] ? 'animate-spin' : ''}`} />
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Upload Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setShowModal(false)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-md mx-4" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">העלאת מסמך</h2>
              <button onClick={() => setShowModal(false)}><X size={20} className="text-gray-400" /></button>
            </div>
            {error && <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg mb-4">{error}</div>}
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">לקוח *</label>
                <select value={uploadData.client_id} onChange={e => setUploadData({...uploadData, client_id: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none">
                  <option value="">בחר לקוח</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">סוג מסמך</label>
                <select value={uploadData.document_type} onChange={e => setUploadData({...uploadData, document_type: e.target.value})}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none">
                  <option value="">זיהוי אוטומטי (AI)</option>
                  <option value="invoice">חשבונית</option>
                  <option value="receipt">קבלה</option>
                  <option value="tax_document">מסמך מס</option>
                  <option value="bank_statement">דף חשבון</option>
                  <option value="other">אחר</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">קובץ *</label>
                <input type="file" accept=".pdf,.png,.jpg,.jpeg,.webp" onChange={e => setSelectedFile(e.target.files[0])}
                  className="w-full text-sm border rounded-lg px-3 py-2 file:mr-2 file:rounded file:border-0 file:bg-indigo-50 file:px-3 file:py-1 file:text-indigo-600 file:text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">הערות</label>
                <textarea value={uploadData.notes} onChange={e => setUploadData({...uploadData, notes: e.target.value})}
                  rows="2" className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 outline-none" placeholder="הערות (אופציונלי)" />
              </div>
              <button type="submit" disabled={uploading}
                className="w-full bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50 flex items-center justify-center gap-2">
                {uploading ? <><Loader2 size={16} className="animate-spin" /> מעלה...</> : <><Upload size={16} /> העלאה</>}
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Document Detail Modal */}
      {selectedDoc && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => setSelectedDoc(null)}>
          <div className="bg-white rounded-xl p-6 w-full max-w-lg mx-4 max-h-[80vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-gray-800">פרטי מסמך</h2>
              <button onClick={() => setSelectedDoc(null)}><X size={20} className="text-gray-400" /></button>
            </div>

            {/* Status */}
            {(() => {
              const status = STATUS[selectedDoc.status] || STATUS.pending
              const StatusIcon = status.icon
              return (
                <div className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium mb-4 ${status.color}`}>
                  <StatusIcon size={14} /> {status.label}
                </div>
              )
            })()}

            {/* AI Extracted Data */}
            {selectedDoc.status === 'processed' && (
              <div className="mb-4">
                <h3 className="font-semibold text-gray-700 mb-3">נתונים שחולצו (AI)</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {selectedDoc.invoice_number && (
                    <div><span className="text-gray-500">מספר חשבונית:</span> <span className="font-medium">{selectedDoc.invoice_number}</span></div>
                  )}
                  {selectedDoc.invoice_date && (
                    <div><span className="text-gray-500">תאריך:</span> <span className="font-medium">{selectedDoc.invoice_date}</span></div>
                  )}
                  {selectedDoc.amount_before_vat != null && (
                    <div><span className="text-gray-500">סכום לפני מע"מ:</span> <span className="font-medium">{Number(selectedDoc.amount_before_vat).toLocaleString()} {selectedDoc.currency || '₪'}</span></div>
                  )}
                  {selectedDoc.vat_amount != null && (
                    <div><span className="text-gray-500">מע"מ ({selectedDoc.vat_rate || 17}%):</span> <span className="font-medium">{Number(selectedDoc.vat_amount).toLocaleString()} {selectedDoc.currency || '₪'}</span></div>
                  )}
                  {selectedDoc.total_amount != null && (
                    <div className="col-span-2 bg-indigo-50 p-2 rounded">
                      <span className="text-gray-600">סה"כ:</span> <span className="font-bold text-indigo-700 text-lg">{Number(selectedDoc.total_amount).toLocaleString()} {selectedDoc.currency || '₪'}</span>
                    </div>
                  )}
                  {selectedDoc.document_type && (
                    <div><span className="text-gray-500">סוג מסמך:</span> <span className="font-medium">{selectedDoc.document_type}</span></div>
                  )}
                  {selectedDoc.allocation_number && (
                    <div><span className="text-gray-500">מספר הקצאה:</span> <span className="font-medium">{selectedDoc.allocation_number}</span></div>
                  )}
                </div>
                {/* Confidence Scores */}
                {selectedDoc.field_confidence && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-gray-500 mb-2">רמת ביטחון AI:</p>
                    <div className="flex flex-wrap gap-2">
                      {Object.entries(selectedDoc.field_confidence).map(([key, val]) => (
                        <span key={key} className={`text-xs px-2 py-1 rounded ${val >= 0.8 ? 'bg-green-100 text-green-700' : val >= 0.5 ? 'bg-yellow-100 text-yellow-700' : 'bg-red-100 text-red-700'}`}>
                          {key}: {Math.round(val * 100)}%
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {selectedDoc.validation_results?.description && (
                  <div className="bg-blue-50 p-3 rounded-lg mt-4">
                    <div className="text-xs text-blue-600 mb-1">תיאור</div>
                    <div className="text-sm text-blue-800">{selectedDoc.validation_results.description}</div>
                  </div>
                )}
              </div>
            )}

            {selectedDoc.status === 'processing' && (
              <div className="text-center py-8">
                <Loader2 size={32} className="mx-auto text-indigo-500 animate-spin mb-3" />
                <p className="text-gray-500">המסמך בעיבוד AI...</p>
              </div>
            )}

            {selectedDoc.status === 'pending' && (
              <div className="text-center py-8">
                <Clock size={32} className="mx-auto text-yellow-500 mb-3" />
                <p className="text-gray-500 mb-4">ממתין לעיבוד</p>
                <button onClick={() => processDocument(selectedDoc.id)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm">
                  עיבוד עכשיו
                </button>
              </div>
            )}

            {selectedDoc.status === 'error' && (
              <div className="text-center py-8">
                <AlertCircle size={32} className="mx-auto text-red-500 mb-3" />
                <p className="text-gray-500 mb-4">שגיאה בעיבוד המסמך</p>
                <button onClick={() => processDocument(selectedDoc.id)} className="bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 text-sm">
                  נסה שוב
                </button>
              </div>
            )}

            {/* File Info */}
            <div className="mt-6 pt-4 border-t">
              <h3 className="font-semibold text-gray-700 mb-3">פרטי קובץ</h3>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div><span className="text-gray-500">לקוח: </span>{selectedDoc.client_name || '-'}</div>
                <div><span className="text-gray-500">הועלה ע"י: </span>{selectedDoc.uploaded_by_name || '-'}</div>
                <div><span className="text-gray-500">גודל: </span>{fmt(selectedDoc.file_size)}</div>
                <div><span className="text-gray-500">תאריך העלאה: </span>{selectedDoc.created_at ? new Date(selectedDoc.created_at).toLocaleDateString('he-IL') : '-'}</div>
              </div>
              {selectedDoc.file_url && (
                <a href={selectedDoc.file_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 mt-3 text-indigo-600 hover:text-indigo-700 text-sm">
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
