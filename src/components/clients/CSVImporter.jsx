import { useState, useRef } from 'react'
import { Upload, FileText, X, AlertCircle, AlertTriangle, CheckCircle } from 'lucide-react'
import { parseCSV, mapCSVRow, validateCSVRow } from '@/utils/israeliValidation'

export default function CSVImporter({ existingNumbers = new Set(), onImport, onClose }) {
  const [file,     setFile]     = useState(null)
  const [preview,  setPreview]  = useState(null) // { valid, invalid, warnings }
  const [dragging, setDragging] = useState(false)
  const [importing, setImporting] = useState(false)
  const inputRef = useRef()

  function handleFile(f) {
    if (!f || !f.name.endsWith('.csv')) {
      alert('יש להעלות קובץ CSV בלבד')
      return
    }
    setFile(f)
    const reader = new FileReader()
    reader.onload = e => processCSV(e.target.result)
    reader.readAsText(f, 'UTF-8')
  }

  function processCSV(text) {
    const { rows } = parseCSV(text)
    const valid    = []
    const invalid  = []

    rows.forEach((row, i) => {
      const mapped = mapCSVRow(row)
      const result = validateCSVRow(mapped, i, existingNumbers)
      if (result.errors.length > 0) {
        invalid.push({ ...result, rowIndex: i + 2 }) // 1-based + header row
      } else {
        valid.push({ ...result, rowIndex: i + 2 })
      }
    })

    setPreview({ valid, invalid, total: rows.length })
  }

  async function doImport() {
    if (!preview?.valid.length) return
    setImporting(true)
    await onImport(preview.valid.map(r => r.data))
    setImporting(false)
  }

  function downloadTemplate() {
    const content = 'registration_number,business_name,owner_name,reporting_cycle\n' +
      '516153742,חברת דוגמה בעמ,ישראל ישראלי,monthly\n' +
      '511563614,עסק לדוגמה,,bimonthly\n'
    const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'clients_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-white/10 flex-shrink-0">
          <h2 className="text-slate-900 dark:text-white font-bold text-lg">ייבוא לקוחות מ-CSV</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto flex-1 p-5 space-y-4">
          {!file ? (
            <>
              {/* Drop zone */}
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragging ? 'border-blue-400 bg-blue-500/10' : 'border-white/15 hover:border-white/30'
                }`}
              >
                <Upload className="w-8 h-8 text-slate-400 dark:text-white/30 mx-auto mb-3" />
                <p className="text-slate-500 dark:text-white/60 text-sm">גרור קובץ CSV לכאן, או לחץ לבחירה</p>
                <p className="text-slate-400 dark:text-white/30 text-xs mt-1">תמיכה בקובץ CSV עד 5MB</p>
                <input
                  ref={inputRef}
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={e => handleFile(e.target.files[0])}
                />
              </div>

              <button
                onClick={downloadTemplate}
                className="flex items-center gap-2 text-blue-400 hover:text-blue-300 text-sm transition-colors"
              >
                <FileText className="w-4 h-4" />
                הורד תבנית CSV
              </button>

              <div className="bg-slate-100 dark:bg-white/5 rounded-xl p-4 text-xs text-slate-400 dark:text-white/40 space-y-1">
                <p className="font-medium text-slate-500 dark:text-white/60 mb-2">עמודות נדרשות:</p>
                <p><span className="text-slate-600 dark:text-white/70">registration_number</span> — מספר ח.פ (9 ספרות)</p>
                <p><span className="text-slate-600 dark:text-white/70">business_name</span> — שם העסק</p>
                <p><span className="text-slate-500 dark:text-white/50">owner_name</span> — שם הבעלים (אופציונלי)</p>
                <p><span className="text-slate-500 dark:text-white/50">reporting_cycle</span> — monthly / bimonthly (אופציונלי)</p>
              </div>
            </>
          ) : (
            <>
              {/* File info */}
              <div className="flex items-center gap-3 bg-slate-100 dark:bg-white/5 rounded-xl p-3">
                <FileText className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-700 dark:text-white/80 text-sm truncate">{file.name}</p>
                  <p className="text-slate-400 dark:text-white/40 text-xs">{preview?.total} שורות נמצאו</p>
                </div>
                <button
                  onClick={() => { setFile(null); setPreview(null) }}
                  className="text-slate-400 dark:text-white/30 hover:text-slate-500 dark:hover:text-white/60 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {preview && (
                <>
                  {/* Summary */}
                  <div className="grid grid-cols-3 gap-3">
                    <div className="bg-green-500/10 border border-green-500/20 rounded-xl p-3 text-center">
                      <CheckCircle className="w-5 h-5 text-green-400 mx-auto mb-1" />
                      <p className="text-green-400 font-bold text-lg">{preview.valid.length}</p>
                      <p className="text-slate-500 dark:text-white/50 text-xs">תקינות</p>
                    </div>
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 text-center">
                      <AlertTriangle className="w-5 h-5 text-yellow-400 mx-auto mb-1" />
                      <p className="text-yellow-400 font-bold text-lg">
                        {preview.valid.filter(r => r.warnings.length > 0).length}
                      </p>
                      <p className="text-slate-500 dark:text-white/50 text-xs">עם אזהרות</p>
                    </div>
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 text-center">
                      <AlertCircle className="w-5 h-5 text-red-400 mx-auto mb-1" />
                      <p className="text-red-400 font-bold text-lg">{preview.invalid.length}</p>
                      <p className="text-slate-500 dark:text-white/50 text-xs">שגויות (מדולגות)</p>
                    </div>
                  </div>

                  {/* Warnings */}
                  {preview.valid.some(r => r.warnings.length > 0) && (
                    <div className="bg-yellow-500/10 border border-yellow-500/20 rounded-xl p-3 space-y-1">
                      <p className="text-yellow-400 text-xs font-medium mb-1">אזהרות (השורות עדיין תיובאנה):</p>
                      {preview.valid.filter(r => r.warnings.length > 0).flatMap(r => r.warnings).map((w, i) => (
                        <p key={i} className="text-yellow-300/70 text-xs">{w}</p>
                      ))}
                    </div>
                  )}

                  {/* Errors */}
                  {preview.invalid.length > 0 && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 space-y-1 max-h-32 overflow-y-auto">
                      <p className="text-red-400 text-xs font-medium mb-1">שגיאות (שורות אלו לא יובאו):</p>
                      {preview.invalid.flatMap(r => r.errors).map((err, i) => (
                        <p key={i} className="text-red-300/70 text-xs">{err}</p>
                      ))}
                    </div>
                  )}

                  {/* Preview table */}
                  {preview.valid.length > 0 && (
                    <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-100 dark:bg-white/5">
                          <tr>
                            <th className="text-right text-slate-500 dark:text-white/50 px-3 py-2 font-medium">מספר ח.פ</th>
                            <th className="text-right text-slate-500 dark:text-white/50 px-3 py-2 font-medium">שם העסק</th>
                            <th className="text-right text-slate-500 dark:text-white/50 px-3 py-2 font-medium">בעלים</th>
                            <th className="text-right text-slate-500 dark:text-white/50 px-3 py-2 font-medium">דיווח</th>
                          </tr>
                        </thead>
                        <tbody>
                          {preview.valid.slice(0, 5).map((r, i) => (
                            <tr key={i} className="border-t border-slate-100 dark:border-white/5">
                              <td className="px-3 py-2 text-slate-600 dark:text-white/70 font-mono">{r.data.registration_number}</td>
                              <td className="px-3 py-2 text-slate-700 dark:text-white/80">{r.data.business_name}</td>
                              <td className="px-3 py-2 text-slate-500 dark:text-white/50">{r.data.owner_name || '—'}</td>
                              <td className="px-3 py-2 text-slate-500 dark:text-white/50">{r.data.reporting_cycle === 'monthly' ? 'חודשי' : 'דו-חודשי'}</td>
                            </tr>
                          ))}
                          {preview.valid.length > 5 && (
                            <tr className="border-t border-slate-100 dark:border-white/5">
                              <td colSpan={4} className="px-3 py-2 text-slate-400 dark:text-white/30 text-center">
                                +{preview.valid.length - 5} שורות נוספות
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-slate-200 dark:border-white/10 flex-shrink-0">
          {preview?.valid.length > 0 && (
            <button
              onClick={doImport}
              disabled={importing}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-slate-900 dark:text-white rounded-xl text-sm font-medium transition-colors"
            >
              {importing ? 'מייבא...' : `ייבא ${preview.valid.length} לקוחות`}
            </button>
          )}
          <button
            onClick={onClose}
            className="px-5 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-white/70 rounded-xl text-sm transition-colors"
          >
            ביטול
          </button>
        </div>
      </div>
    </div>
  )
}
