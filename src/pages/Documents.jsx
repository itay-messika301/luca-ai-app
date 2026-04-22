import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Upload, Search, FileText, CheckCircle, Clock, AlertCircle } from 'lucide-react'

const STATUS = {
  pending: { label: 'ממתין', color: 'bg-yellow-100 text-yellow-700' },
  processing: { label: 'בעיבוד', color: 'bg-blue-100 text-blue-700' },
  processed: { label: 'עובד', color: 'bg-green-100 text-green-700' },
  error: { label: 'שגיאה', color: 'bg-red-100 text-red-700' },
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

  useEffect(() => { fetchDocuments(); fetchClients() }, [])

  async function fetchDocuments() {
    setLoading(true)
    const { data } = await supabase.from('documents').select('*, clients(company_name)').order('created_at', { ascending: false })
    setDocuments(data || [])
    setLoading(false)
  }

  async function fetchClients() {
    const { data } = await supabase.from('clients').select('id, company_name').order('company_name')
    setClients(data || [])
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!selectedFile) { setError('נא לבחור קובץ'); return }
    if (!uploadData.client_id) { setError('נא לבחור לקוח'); return }
    setUploading(true); setError('')
    const filePath = `documents/${Date.now()}_${selectedFile.name}`
    const { error: storageErr } = await supabase.storage.from('documents').upload(filePath, selectedFile)
    if (storageErr) { setError('שגיאה בהעלאה: ' + storageErr.message); setUploading(false); return }
    const { data: urlData } = supabase.storage.from('documents').getPublicUrl(filePath)
    const client = clients.find(c => c.id === uploadData.client_id)
    const { error: dbErr } = await supabase.from('documents').insert({
      client_id: uploadData.client_id, client_name: client?.company_name,
      accounting_firm_id: profile.firm_id, uploaded_by_user_id: profile.id,
      uploaded_by_name: profile.full_name, file_name: selectedFile.name,
      file_url: urlData.publicUrl, file_path: filePath, file_size: selectedFile.size,
      file_type: selectedFile.name.split('.').pop(), document_type: uploadData.document_type || null,
      notes: uploadData.notes || null, status: 'pending',
    })
    if (dbErr) { setError('שגיאה: ' + dbErr.message) }
    else { setShowModal(false); setUploadData({ client_id: '', document_type: '', notes: '' }); setSelectedFile(null); fetchDocuments() }
    setUploading(false)
  }

  const filtered = documents.filter(d => {
    const s = d.file_name?.toLowerCase().includes(search.toLowerCase()) || d.clients?.company_name?.toLowerCase().includes(search.toLowerCase())
    return s && (!filterStatus || d.status === filterStatus) && (!filterClient || d.client_id === filterClient)
  })

  const fmt = b => !b ? '' : b < 1024 ? b+' B' : b < 1048576 ? (b/1024).toFixed(1)+' KB' : (b/1048576).toFixed(1)+' MB'
  const fmtDate = d => d ? new Date(d).toLocaleDateString('he-IL') : ''

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">מסמכים</h1>
          <p className="text-gray-500 text-sm mt-1">{documents.length} מסמכים במערכת</p>
        </div>
        <button onClick={() => setShowModal(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition">
          <Upload size={18} /> העלה מסמך
        </button>
      </div>
      <div className="flex gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input type="text" placeholder="חיפוש מסמך..." value={search} onChange={e => setSearch(e.target.value)}
            className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
        </div>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none text-sm">
          <option value="">כל הסטטוסים</option>
          <option value="pending">ממתין</option><option value="processed">עובד</option><option value="error">שגיאה</option>
        </select>
        <select value={filterClient} onChange={e => setFilterClient(e.target.value)}
          className="border border-gray-200 rounded-lg px-3 py-2 bg-white focus:outline-none text-sm">
          <option value="">כל הלקוחות</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
        </select>
      </div>
      {loading ? <div className="text-center py-20 text-gray-400">טוען...</div>
      : filtered.length === 0 ? (
        <div className="text-center py-20"><FileText size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400">{search || filterStatus || filterClient ? 'לא נמצאו תוצאות' : 'אין מסמכים עדיין'}</p></div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {filtered.map((doc, i) => {
            const s = STATUS[doc.status] || STATUS.pending
            return (
              <div key={doc.id} className={`flex items-center justify-between px-5 py-4 hover:bg-gray-50 ${i !== 0 ? 'border-t border-gray-100' : ''}`}>
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-lg bg-indigo-50 flex items-center justify-center"><FileText size={20} className="text-indigo-500" /></div>
                  <div>
                    <p className="font-medium text-gray-900">{doc.file_name}</p>
                    <p className="text-sm text-gray-500">{doc.clients?.company_name} · {fmtDate(doc.created_at)}</p>
                  </div>
                </div>
                <div className="flex items-center gap-4 text-sm">
                  {doc.document_type && <span className="text-gray-400">{doc.document_type}</span>}
                  {doc.file_size > 0 && <span className="text-gray-400">{fmt(doc.file_size)}</span>}
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${s.color}`}>{s.label}</span>
                  {doc.file_url && <a href={doc.file_url} target="_blank" rel="noreferrer" className="text-indigo-600 hover:underline text-xs">הורד</a>}
                </div>
              </div>
            )
          })}
        </div>
      )}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <h2 className="text-xl font-bold text-gray-900 mb-5">העלאת מסמך</h2>
            <form onSubmit={handleUpload} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">לקוח *</label>
                <select required value={uploadData.client_id} onChange={e => setUploadData({...uploadData, client_id: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">בחר לקוח...</option>
                  {clients.map(c => <option key={c.id} value={c.id}>{c.company_name}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">סוג מסמך</label>
                <select value={uploadData.document_type} onChange={e => setUploadData({...uploadData, document_type: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">בחר...</option>
                  <option>חשבונית</option><option>קבלה</option><option>תלוש שכר</option><option>דוח בנקאי</option><option>הסכם</option><option>אחר</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">קובץ *</label>
                <input type="file" accept=".pdf,.jpg,.jpeg,.png,.xlsx,.doc,.docx" onChange={e => setSelectedFile(e.target.files[0])}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
                {selectedFile && <p className="text-xs text-gray-500 mt-1">{selectedFile.name} ({fmt(selectedFile.size)})</p>}
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={uploading} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {uploading ? 'מעלה...' : 'העלה'}
                </button>
                <button type="button" onClick={() => { setShowModal(false); setSelectedFile(null); setError('') }}
                  className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-50">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
