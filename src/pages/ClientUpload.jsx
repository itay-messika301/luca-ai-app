import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Upload, FileText, CheckCircle, Loader2, X, AlertCircle } from 'lucide-react'

export default function ClientUpload() {
  const { user, profile } = useAuth()
  const [clientId, setClientId] = useState(null)
  const [selectedFile, setSelectedFile] = useState(null)
  const [notes, setNotes] = useState('')
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  useEffect(() => {
    if (user) findClientId()
  }, [user])

  async function findClientId() {
    const { data } = await supabase
      .from('clients')
      .select('id')
      .eq('owner_user_id', user.id)
      .limit(1)
      .single()

    if (data) setClientId(data.id)
  }

  function handleDrag(e) {
    e.preventDefault()
    e.stopPropagation()
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true)
    else if (e.type === 'dragleave') setDragActive(false)
  }

  function handleDrop(e) {
    e.preventDefault()
    e.stopPropagation()
    setDragActive(false)
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setSelectedFile(e.dataTransfer.files[0])
      setError('')
      setSuccess(false)
    }
  }

  async function handleUpload(e) {
    e.preventDefault()
    if (!selectedFile) { setError('יש לבחור קובץ'); return }
    if (!clientId) { setError('לא נמצא חשבון לקוח מקושר'); return }

    setUploading(true)
    setError('')
    setSuccess(false)

    try {
      const filePath = `documents/${Date.now()}_${selectedFile.name}`

      const { error: storageErr } = await supabase.storage
        .from('documents')
        .upload(filePath, selectedFile)

      if (storageErr) throw new Error('שגיאה בהעלאה: ' + storageErr.message)

      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(filePath)

      const { error: dbErr } = await supabase.from('documents').insert({
        client_id: clientId,
        client_name: profile?.full_name,
        uploaded_by_user_id: user.id,
        uploaded_by_name: profile?.full_name,
        file_name: selectedFile.name,
        file_path: filePath,
        file_size: selectedFile.size,
        raw_file_url: urlData.publicUrl,
        file_type: selectedFile.name.split('.').pop(),
        cpa_notes: notes || null,
        status: 'pending',
      })

      if (dbErr) throw new Error('שגיאה בשמירה: ' + dbErr.message)

      setSuccess(true)
      setSelectedFile(null)
      setNotes('')
    } catch (err) {
      setError(err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="p-6 max-w-2xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">העלאת מסמך</h1>
        <p className="text-gray-500 mt-1 text-sm">העלה חשבוניות, קבלות או מסמכים אחרים</p>
      </div>

      {!clientId && (
        <div className="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-6 flex items-start gap-3">
          <AlertCircle size={20} className="text-amber-600 mt-0.5 shrink-0" />
          <div className="text-sm text-amber-800">
            <p className="font-medium">חשבון הלקוח שלך טרם קושר</p>
            <p className="mt-0.5">פנה למשרד רואה החשבון שלך כדי לקשר את חשבונך.</p>
          </div>
        </div>
      )}

      {success && (
        <div className="bg-green-50 border border-green-200 rounded-xl p-4 mb-6 flex items-center gap-3">
          <CheckCircle size={20} className="text-green-600" />
          <div className="text-sm text-green-800">
            <p className="font-medium">המסמך הועלה בהצלחה!</p>
            <p className="mt-0.5">המסמך נשלח לעיבוד. תוכל לצפות בסטטוס בדף "המסמכים שלי".</p>
          </div>
        </div>
      )}

      <form onSubmit={handleUpload} className="bg-white rounded-2xl border border-gray-200 p-6 space-y-6">
        {/* Drag & Drop Area */}
        <div
          onDragEnter={handleDrag}
          onDragOver={handleDrag}
          onDragLeave={handleDrag}
          onDrop={handleDrop}
          className={`border-2 border-dashed rounded-xl p-8 text-center transition-colors ${
            dragActive ? 'border-indigo-500 bg-indigo-50' : 'border-gray-300 bg-gray-50'
          }`}
        >
          {selectedFile ? (
            <div className="flex items-center justify-center gap-3">
              <FileText size={24} className="text-indigo-500" />
              <div className="text-right">
                <p className="font-medium text-gray-900">{selectedFile.name}</p>
                <p className="text-xs text-gray-500">
                  {(selectedFile.size / 1024).toFixed(1)} KB
                </p>
              </div>
              <button type="button" onClick={() => setSelectedFile(null)} className="p-1 hover:bg-gray-200 rounded">
                <X size={16} className="text-gray-400" />
              </button>
            </div>
          ) : (
            <>
              <Upload size={32} className="mx-auto text-gray-400 mb-3" />
              <p className="text-gray-600 font-medium mb-1">גרור קובץ לכאן</p>
              <p className="text-gray-400 text-sm mb-3">או</p>
              <label className="inline-block bg-indigo-600 text-white px-4 py-2 rounded-lg text-sm font-medium cursor-pointer hover:bg-indigo-700 transition">
                בחר קובץ
                <input
                  type="file"
                  accept=".pdf,.png,.jpg,.jpeg,.webp"
                  onChange={e => { setSelectedFile(e.target.files[0]); setError(''); setSuccess(false) }}
                  className="hidden"
                />
              </label>
              <p className="text-xs text-gray-400 mt-3">PDF, PNG, JPG (עד 10MB)</p>
            </>
          )}
        </div>

        {/* Notes */}
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-1">הערות (אופציונלי)</label>
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows="3"
            className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-indigo-200 focus:border-indigo-400 outline-none"
            placeholder="הוסף הערה או תיאור..."
          />
        </div>

        {error && (
          <div className="bg-red-50 text-red-600 text-sm p-3 rounded-lg">{error}</div>
        )}

        <button
          type="submit"
          disabled={uploading || !selectedFile || !clientId}
          className="w-full bg-indigo-600 text-white py-3 rounded-xl font-medium hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 transition"
        >
          {uploading ? (
            <><Loader2 size={18} className="animate-spin" /> מעלה...</>
          ) : (
            <><Upload size={18} /> העלאת מסמך</>
          )}
        </button>
      </form>
    </div>
  )
}
