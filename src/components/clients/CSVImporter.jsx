import { useState, useRef } from 'react'
import { Upload, FileText, X, AlertCircle, AlertTriangle, CheckCircle, ArrowLeft, ChevronDown } from 'lucide-react'
import {
  parseCSV, getAutoMapping, mapCSVRowWithMapping, validateCSVRow,
} from '@/utils/israeliValidation'

const REQUIRED_FIELDS = ['registration_number', 'business_name']

const FIELD_OPTIONS = [
  { value: '',                    label: '— התעלם —' },
  { value: 'registration_number', label: 'מספר ח.פ / ע.מ  *' },
  { value: 'business_name',       label: 'שם עסק  *' },
  { value: 'owner_name',          label: 'שם בעלים' },
  { value: 'reporting_cycle',     label: 'מחזור דיווח' },
]

export default function CSVImporter({ existingNumbers = new Set(), onImport, onClose }) {
  const [step,          setStep]          = useState('upload')   // 'upload' | 'map_columns' | 'preview'
  const [file,          setFile]          = useState(null)
  const [csvData,       setCsvData]       = useState(null)       // { headers, rows }
  const [columnMapping, setColumnMapping] = useState({})         // { csvHeader: appField | '' }
  const [preview,       setPreview]       = useState(null)       // { valid, invalid, total }
  const [mappingError,  setMappingError]  = useState(null)
  const [dragging,      setDragging]      = useState(false)
  const [importing,     setImporting]     = useState(false)
  const inputRef = useRef()

  // ── File handling ──────────────────────────────────────────────────────────
  function handleFile(f) {
    if (!f || !f.name.endsWith('.csv')) {
      alert('יש להעלות קובץ CSV בלבד')
      return
    }
    setFile(f)
    const reader = new FileReader()
    reader.onload = e => handleParsed(e.target.result)
    reader.readAsText(f, 'UTF-8')
  }

  function handleParsed(text) {
    const { headers, rows } = parseCSV(text)
    if (!headers.length || !rows.length) {
      alert('הקובץ ריק או אינו ניתן לקריאה')
      return
    }

    const autoMap = getAutoMapping(headers)
    setCsvData({ headers, rows })
    setColumnMapping(autoMap)

    // Check if all required fields are auto-mapped AND every header is recognized
    const mappedFields    = Object.values(autoMap)
    const requiredCovered = REQUIRED_FIELDS.every(f => mappedFields.includes(f))
    const allRecognized   = headers.every(h => autoMap[h])

    if (requiredCovered && allRecognized) {
      // Perfect match — skip mapping step
      processWithMapping(rows, autoMap)
    } else {
      setStep('map_columns')
    }
  }

  // ── Apply user-confirmed column mapping ────────────────────────────────────
  function handleApplyMapping() {
    const mappedFields = Object.values(columnMapping)
    const missing = REQUIRED_FIELDS.filter(f => !mappedFields.includes(f))
    if (missing.length > 0) {
      const labels = { registration_number: 'מספר ח.פ', business_name: 'שם עסק' }
      setMappingError(`שדות חובה חסרים: ${missing.map(f => labels[f]).join(', ')}`)
      return
    }
    setMappingError(null)
    processWithMapping(csvData.rows, columnMapping)
  }

  // ── Process rows with mapping → generate preview ────────────────────────────
  function processWithMapping(rows, mapping) {
    const valid   = []
    const invalid = []

    rows.forEach((row, i) => {
      const mapped = mapCSVRowWithMapping(row, mapping)
      const result = validateCSVRow(mapped, i, existingNumbers)
      if (result.errors.length > 0) {
        invalid.push({ ...result, rowIndex: i + 2 })
      } else {
        valid.push({ ...result, rowIndex: i + 2 })
      }
    })

    setPreview({ valid, invalid, total: rows.length })
    setStep('preview')
  }

  // ── Import ──────────────────────────────────────────────────────────────────
  async function doImport() {
    if (!preview?.valid.length) return
    setImporting(true)
    await onImport(preview.valid.map(r => r.data))
    setImporting(false)
  }

  // ── Template download ────────────────────────────────────────────────────────
  function downloadTemplate() {
    const content =
      'registration_number,business_name,owner_name,reporting_cycle\n' +
      '516153742,חברת דוגמה בעמ,ישראל ישראלי,monthly\n' +
      '511563614,עסק לדוגמה,,bimonthly\n'
    const blob = new Blob(['\ufeff' + content], { type: 'text/csv;charset=utf-8;' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = 'clients_template.csv'; a.click()
    URL.revokeObjectURL(url)
  }

  // ── Reset to upload step ─────────────────────────────────────────────────────
  function resetUpload() {
    setFile(null)
    setCsvData(null)
    setColumnMapping({})
    setPreview(null)
    setMappingError(null)
    setStep('upload')
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-2xl w-full max-w-2xl shadow-2xl max-h-[90vh] flex flex-col">

        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-200 dark:border-white/10 flex-shrink-0">
          <div className="flex items-center gap-3">
            {step !== 'upload' && (
              <button
                onClick={step === 'preview' ? () => setStep('map_columns') : resetUpload}
                className="text-slate-400 dark:text-white/40 hover:text-slate-700 dark:hover:text-white transition-colors"
              >
                <ArrowLeft className="w-4 h-4" />
              </button>
            )}
            <h2 className="text-slate-900 dark:text-white font-bold text-lg">
              {step === 'upload'      && 'ייבוא לקוחות מ-CSV'}
              {step === 'map_columns' && 'התאמת עמודות'}
              {step === 'preview'     && 'תצוגה מקדימה'}
            </h2>
          </div>
          <button onClick={onClose} className="text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Step indicator */}
        <div className="flex items-center gap-2 px-5 pt-4 flex-shrink-0">
          {['upload', 'map_columns', 'preview'].map((s, i) => {
            const stepIdx  = ['upload', 'map_columns', 'preview'].indexOf(step)
            const isDone   = i < stepIdx
            const isActive = s === step
            return (
              <div key={s} className="flex items-center gap-2">
                <div className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold transition-colors ${
                  isDone   ? 'bg-green-500 text-white'
                  : isActive ? 'bg-blue-500 text-white'
                  :            'bg-slate-200 dark:bg-white/10 text-slate-400 dark:text-white/30'
                }`}>
                  {isDone ? '✓' : i + 1}
                </div>
                {i < 2 && <div className={`h-px w-8 ${isDone ? 'bg-green-400' : 'bg-slate-200 dark:bg-white/10'}`} />}
              </div>
            )
          })}
          <span className="text-slate-400 dark:text-white/30 text-xs mr-2">
            {step === 'upload' ? 'העלאת קובץ' : step === 'map_columns' ? 'התאמת שדות' : 'אישור ויבוא'}
          </span>
        </div>

        {/* Body */}
        <div className="overflow-y-auto flex-1 p-5 space-y-4">

          {/* ── Step 1: Upload ── */}
          {step === 'upload' && (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setDragging(true) }}
                onDragLeave={() => setDragging(false)}
                onDrop={e => { e.preventDefault(); setDragging(false); handleFile(e.dataTransfer.files[0]) }}
                onClick={() => inputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center cursor-pointer transition-colors ${
                  dragging ? 'border-blue-400 bg-blue-500/10' : 'border-slate-300 dark:border-white/15 hover:border-blue-400 dark:hover:border-white/30'
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
                <p className="font-medium text-slate-500 dark:text-white/60 mb-2">שדות נדרשים:</p>
                <p><span className="text-slate-600 dark:text-white/70">registration_number</span> — מספר ח.פ (9 ספרות) *</p>
                <p><span className="text-slate-600 dark:text-white/70">business_name</span> — שם העסק *</p>
                <p><span className="text-slate-500 dark:text-white/50">owner_name</span> — שם הבעלים</p>
                <p><span className="text-slate-500 dark:text-white/50">reporting_cycle</span> — monthly / bimonthly</p>
                <p className="pt-1 text-slate-400 dark:text-white/30">המערכת תזהה אוטומטית שמות עמודות נפוצים. אם לא — תוכל למפות ידנית.</p>
              </div>
            </>
          )}

          {/* ── Step 2: Column Mapping ── */}
          {step === 'map_columns' && csvData && (
            <>
              <p className="text-slate-500 dark:text-white/60 text-sm">
                הקובץ <span className="text-slate-700 dark:text-white font-medium">{file?.name}</span> הכיל{' '}
                <span className="text-slate-700 dark:text-white font-medium">{csvData.headers.length}</span> עמודות.
                בחר לאיזה שדה כל עמודה מתאימה:
              </p>

              <div className="border border-slate-200 dark:border-white/10 rounded-xl overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50 dark:bg-white/5">
                    <tr>
                      <th className="text-right text-slate-400 dark:text-white/40 font-medium px-4 py-2.5 w-1/2">עמודה בקובץ</th>
                      <th className="text-right text-slate-400 dark:text-white/40 font-medium px-4 py-2.5 w-1/2">שדה במערכת</th>
                    </tr>
                  </thead>
                  <tbody>
                    {csvData.headers.map(header => {
                      const currentField = columnMapping[header] || ''
                      const isRequired   = REQUIRED_FIELDS.includes(currentField)
                      const isMissing    = !currentField

                      return (
                        <tr key={header} className={`border-t border-slate-100 dark:border-white/5 ${isMissing ? 'bg-amber-50 dark:bg-amber-500/5' : ''}`}>
                          <td className="px-4 py-2.5">
                            <span className="font-mono text-slate-600 dark:text-white/70 text-xs bg-slate-100 dark:bg-white/8 px-2 py-1 rounded">
                              {header}
                            </span>
                            {/* Show sample value */}
                            {csvData.rows[0]?.[header] && (
                              <span className="text-slate-400 dark:text-white/30 text-xs mr-2">
                                דוגמה: {String(csvData.rows[0][header]).slice(0, 20)}
                              </span>
                            )}
                          </td>
                          <td className="px-4 py-2.5">
                            <div className="relative">
                              <select
                                value={currentField}
                                onChange={e => {
                                  const newVal = e.target.value
                                  // Prevent two columns mapping to the same app field
                                  const newMapping = { ...columnMapping }
                                  if (newVal) {
                                    for (const k of Object.keys(newMapping)) {
                                      if (k !== header && newMapping[k] === newVal) newMapping[k] = ''
                                    }
                                  }
                                  newMapping[header] = newVal
                                  setColumnMapping(newMapping)
                                  setMappingError(null)
                                }}
                                className={`w-full appearance-none rounded-lg px-3 pl-7 py-2 text-sm focus:outline-none transition-colors text-slate-900 dark:text-white ${
                                  isRequired
                                    ? 'bg-green-50 dark:bg-green-500/10 border border-green-300 dark:border-green-500/30'
                                    : isMissing
                                    ? 'bg-amber-50 dark:bg-amber-500/10 border border-amber-300 dark:border-amber-500/30'
                                    : 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10'
                                }`}
                              >
                                {FIELD_OPTIONS.map(opt => (
                                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                                ))}
                              </select>
                              <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-white/30 pointer-events-none" />
                            </div>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>

              {/* Missing required fields summary */}
              {(() => {
                const mappedFields = Object.values(columnMapping)
                const missing = REQUIRED_FIELDS.filter(f => !mappedFields.includes(f))
                const labels = { registration_number: 'מספר ח.פ', business_name: 'שם עסק' }
                if (missing.length === 0) return null
                return (
                  <div className="flex items-start gap-2 bg-amber-500/10 border border-amber-500/20 rounded-xl px-4 py-3">
                    <AlertTriangle className="w-4 h-4 text-amber-400 flex-shrink-0 mt-0.5" />
                    <p className="text-amber-300 text-sm">
                      שדות חובה שעדיין לא מופו: <span className="font-medium">{missing.map(f => labels[f]).join(', ')}</span>
                    </p>
                  </div>
                )
              })()}

              {mappingError && (
                <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-xl px-4 py-3">
                  <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                  <p className="text-red-300 text-sm">{mappingError}</p>
                </div>
              )}
            </>
          )}

          {/* ── Step 3: Preview ── */}
          {step === 'preview' && preview && (
            <>
              {/* File info */}
              <div className="flex items-center gap-3 bg-slate-100 dark:bg-white/5 rounded-xl p-3">
                <FileText className="w-5 h-5 text-blue-400 flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-slate-700 dark:text-white/80 text-sm truncate">{file?.name}</p>
                  <p className="text-slate-400 dark:text-white/40 text-xs">{preview.total} שורות נמצאו</p>
                </div>
                <button
                  onClick={resetUpload}
                  className="text-slate-400 dark:text-white/30 hover:text-slate-500 dark:hover:text-white/60 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Summary counters */}
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

              {/* Data preview */}
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
                          <td className="px-3 py-2 text-slate-500 dark:text-white/50">
                            {r.data.reporting_cycle === 'monthly' ? 'חודשי' : 'דו-חודשי'}
                          </td>
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
        </div>

        {/* Footer */}
        <div className="flex gap-3 p-5 border-t border-slate-200 dark:border-white/10 flex-shrink-0">
          {step === 'map_columns' && (
            <button
              onClick={handleApplyMapping}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-slate-900 dark:text-white rounded-xl text-sm font-medium transition-colors"
            >
              המשך לתצוגה מקדימה ←
            </button>
          )}

          {step === 'preview' && preview?.valid.length > 0 && (
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
