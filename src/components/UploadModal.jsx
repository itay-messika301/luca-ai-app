import { useState, useRef, useEffect } from 'react'
import { X, Upload, CheckCircle, AlertCircle, Loader2 } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { toHebrewError } from '@/lib/errors'
import { safeStorageName, fileExtension, validateUploadFile } from '@/lib/files'
import ClientPicker from '@/components/ClientPicker'

const MAX_FILES = 50

// Fire-and-forget AI processing for freshly uploaded documents
export async function startProcessing(ids) {
  const { data: { session } } = await supabase.auth.getSession()
  ids.forEach(id => {
    fetch('/api/process-document', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session?.access_token}` },
      body:    JSON.stringify({ document_id: id }),
    })
      .catch(() => {})
      .finally(() => window.dispatchEvent(new Event('luca:docs-changed')))
  })
}

/**
 * Office upload dialog — usable from anywhere.
 * Props:
 *  - initialClientId: pre-select a client (e.g. when opened from a client page)
 *  - clients:         optional list; loaded automatically when omitted
 *  - onUploaded(ids): optional; default starts AI processing + refreshes lists
 */
export default function UploadModal({ initialClientId = '', clients: clientsProp, onClose, onUploaded }) {
  const { workspace, profile } = useAuth()
  const [clients,       setClients]       = useState(clientsProp || [])
  const [clientId,      setClientId]      = useState(initialClientId || '')
  const [files,         setFiles]         = useState([])
  const [uploading,     setUploading]     = useState(false)
  const [progress,      setProgress]      = useState(0)
  const [error,         setError]         = useState(null)
  const [dragging,      setDragging]      = useState(false)
  const [uploadResults, setUploadResults] = useState(null)
  const inputRef = useRef()

  useEffect(() => {
    if (clientsProp || !workspace?.id) return
    supabase.from('clients')
      .select('id, business_name, registration_number')
      .eq('workspace_id', workspace.id)
      .is('archived_at', null)
      .order('business_name')
      .then(({ data }) => setClients(data || []))
  }, [clientsProp, workspace?.id])

  // Esc closes
  useEffect(() => {
    const onKey = e => { if (e.key === 'Escape' && !uploading) onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [uploading, onClose])

  function handleFiles(newFiles) {
    const list = Array.from(newFiles)
    const rejected = list.filter(f => validateUploadFile(f))
    if (rejected.length) setError(`${rejected.length} קבצים לא נוספו (סוג לא נתמך או מעל 10MB)`)
    const valid = list.filter(f => !validateUploadFile(f))
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
      const filePath = `${workspace.id}/${clientId}/${Date.now()}_${i}_${safeStorageName(file.name)}`
      setProgress(Math.round((i / files.length) * 100))

      const { error: storageErr } = await supabase.storage.from('documents').upload(filePath, file)
      if (storageErr) {
        results.push({ name: file.name, ok: false, error: toHebrewError(storageErr, 'ההעלאה נכשלה') })
        continue
      }

      const { data: inserted, error: insertErr } = await supabase
        .from('documents').insert({
          workspace_id:   workspace.id,
          client_id:      clientId,
          uploaded_by:    profile.id,
          file_name:      file.name,
          file_path:      filePath,
          file_size:      file.size,
          file_type:      fileExtension(file.name),
          status:         'pending',
          source_channel: 'portal',
        }).select('id').single()

      if (insertErr || !inserted?.id) {
        await supabase.storage.from('documents').remove([filePath])
        results.push({ name: file.name, ok: false, error: toHebrewError(insertErr, 'שגיאה בשמירת הרשומה') })
        continue
      }

      insertedIds.push(inserted.id)
      results.push({ name: file.name, ok: true })
    }

    setProgress(100)
    setUploading(false)
    setUploadResults(results)

    if (insertedIds.length > 0) {
      if (onUploaded) onUploaded(insertedIds)
      else startProcessing(insertedIds)
      window.dispatchEvent(new Event('luca:docs-changed'))
    }
  }

  const clientName = clients.find(c => c.id === clientId)?.business_name

  // ── Results ─────────────────────────────────────────────────────
  if (uploadResults) {
    const successCount = uploadResults.filter(r => r.ok).length
    const failCount    = uploadResults.filter(r => !r.ok).length
    return (
      <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" dir="rtl" role="dialog" aria-modal="true" aria-label="תוצאות העלאה">
        <div className="bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-slate-900 dark:text-white font-bold text-lg">תוצאות העלאה</h2>
            <button onClick={onClose} aria-label="סגירה" className="text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white">
              <X className="w-5 h-5" />
            </button>
          </div>
          {clientName && <p className="text-slate-500 dark:text-white/60 text-sm mb-3">לקוח: <b className="text-slate-800 dark:text-white">{clientName}</b></p>}
          <div className="space-y-2 mb-5 max-h-60 overflow-y-auto">
            {uploadResults.map((r, i) => (
              <div key={i} className={`flex items-start gap-2.5 px-3 py-2 rounded-lg ${r.ok ? 'bg-green-500/10' : 'bg-red-500/10'}`}>
                {r.ok
                  ? <CheckCircle className="w-4 h-4 text-green-700 dark:text-green-400 flex-shrink-0 mt-0.5" />
                  : <AlertCircle className="w-4 h-4 text-red-700 dark:text-red-400 flex-shrink-0 mt-0.5" />}
                <div className="min-w-0">
                  <p className="text-slate-700 dark:text-white/80 text-sm truncate">{r.name}</p>
                  {r.error && <p className="text-red-700 dark:text-red-300 text-xs mt-0.5 break-words">{r.error}</p>}
                </div>
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between text-sm mb-4">
            {successCount > 0 && <span className="text-green-700 dark:text-green-400">{successCount} הועלו בהצלחה — העיבוד מתחיל אוטומטית</span>}
            {failCount    > 0 && <span className="text-red-700 dark:text-red-400">{failCount} נכשלו</span>}
          </div>
          <button onClick={onClose} className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium">
            סגור
          </button>
        </div>
      </div>
    )
  }

  // ── Form ────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[60] p-4" dir="rtl" role="dialog" aria-modal="true" aria-labelledby="upload-title">
      <div className="bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <div className="flex items-center justify-between mb-5">
          <h2 id="upload-title" className="text-slate-900 dark:text-white font-bold text-lg">העלאת מסמכים</h2>
          <button onClick={onClose} aria-label="סגירה" className="text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white">
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleUpload} className="space-y-4">
          <div>
            <label htmlFor="upload-client" className="block text-slate-600 dark:text-white/60 text-sm mb-1.5">לקוח *</label>
            <ClientPicker id="upload-client" clients={clients} value={clientId} onChange={v => { setClientId(v || ''); setError(null) }} autoFocus={!initialClientId} />
          </div>

          <div
            onDragOver={e => { e.preventDefault(); setDragging(true) }}
            onDragLeave={() => setDragging(false)}
            onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
            onClick={() => inputRef.current?.click()}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
            className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-colors ${
              dragging ? 'border-blue-400 bg-blue-500/10' : 'border-slate-300 dark:border-white/15 hover:border-slate-400 dark:hover:border-white/30'
            }`}
          >
            <Upload className="w-6 h-6 text-slate-400 dark:text-white/40 mx-auto mb-2" />
            <p className="text-slate-600 dark:text-white/60 text-sm">גררו קבצים לכאן, או לחצו לבחירה</p>
            <p className="text-slate-400 dark:text-white/40 text-xs mt-1">PDF, PNG, JPG, WEBP · עד 10MB לקובץ · עד {MAX_FILES} קבצים</p>
            <input ref={inputRef} type="file" multiple accept=".pdf,.png,.jpg,.jpeg,.webp" className="hidden" onChange={e => handleFiles(e.target.files)} />
          </div>

          {files.length > 0 && (
            <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-3 max-h-36 overflow-y-auto space-y-1">
              {files.map((f, i) => (
                <div key={i} className="flex items-center justify-between text-sm">
                  <span className="text-slate-600 dark:text-white/70 truncate">{f.name}</span>
                  <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))} aria-label={`הסרת ${f.name}`}
                    className="text-slate-400 dark:text-white/40 hover:text-slate-700 dark:hover:text-white ml-2 flex-shrink-0">
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}

          {uploading && (
            <div className="space-y-1" aria-live="polite">
              <span className="text-xs text-slate-500 dark:text-white/50">מעלה... ({Math.round(progress)}%)</span>
              <div className="w-full bg-slate-200 dark:bg-white/10 rounded-full h-1.5">
                <div className="bg-blue-500 h-1.5 rounded-full transition-all" style={{ width: `${progress}%` }} />
              </div>
            </div>
          )}

          {error && <p className="text-red-700 dark:text-red-400 text-sm" role="alert">{error}</p>}

          <div className="flex gap-3">
            <button type="submit" disabled={uploading || files.length === 0 || !clientId}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium flex items-center justify-center gap-2">
              {uploading ? <><Loader2 className="w-4 h-4 animate-spin" /> מעלה...</> : `העלה ${files.length > 0 ? files.length + ' קבצים' : ''}`}
            </button>
            <button type="button" onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-700 dark:text-white/80 rounded-lg text-sm">
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}

// Open the global upload dialog from anywhere: openUpload({ clientId })
export function openUpload(detail = {}) {
  window.dispatchEvent(new CustomEvent('luca:open-upload', { detail }))
}
