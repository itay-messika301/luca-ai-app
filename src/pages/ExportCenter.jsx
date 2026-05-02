import { useState, useEffect, useCallback } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  Download, Filter, CheckSquare, Square, AlertCircle,
  FileSpreadsheet, Package, ChevronDown, Calendar,
  CheckCircle, Loader2
} from 'lucide-react'

const ERP_OPTIONS = [
  { value: 'excel',         label: 'Excel (XLSX)',         icon: FileSpreadsheet },
  { value: 'hashavshevet',  label: 'חשבשבת (CSV)',         icon: Package },
  { value: 'priority',      label: 'Priority (REST API)',  icon: Package },
]

const STATUS_COLORS = {
  ready:        'text-green-400',
  needs_review: 'text-yellow-400',
  blocked:      'text-red-400',
}

export default function ExportCenter() {
  const { workspace, profile } = useAuth()
  const canExport = ['workspace_owner', 'accountant'].includes(profile?.role)

  const [clients,       setClients]       = useState([])
  const [documents,     setDocuments]     = useState([])
  const [selected,      setSelected]      = useState(new Set())
  const [clientId,      setClientId]      = useState('')
  const [periodFrom,    setPeriodFrom]    = useState('')
  const [periodTo,      setPeriodTo]      = useState('')
  const [erpTarget,     setErpTarget]     = useState('excel')
  const [loading,       setLoading]       = useState(false)
  const [exporting,     setExporting]     = useState(false)
  const [exportHistory, setExportHistory] = useState([])
  const [confirmed,     setConfirmed]     = useState(false)
  const [error,         setError]         = useState(null)
  const [successMsg,    setSuccessMsg]    = useState(null)

  useEffect(() => {
    if (!workspace?.id) return
    supabase
      .from('clients')
      .select('id, business_name')
      .eq('workspace_id', workspace.id)
      .is('archived_at', null)
      .order('business_name')
      .then(({ data }) => setClients(data || []))

    loadExportHistory()
  }, [workspace?.id])

  async function loadExportHistory() {
    const { data } = await supabase
      .from('exports')
      .select('*, profiles(full_name), clients(business_name)')
      .eq('workspace_id', workspace.id)
      .order('created_at', { ascending: false })
      .limit(10)
    setExportHistory(data || [])
  }

  const fetchDocuments = useCallback(async () => {
    if (!workspace?.id) return
    setLoading(true)
    setSelected(new Set())
    setConfirmed(false)

    let query = supabase
      .from('documents')
      .select('id, file_name, client_id, vendor_name, invoice_number, invoice_date, amount_before_vat, vat_amount, total_amount, withholding_tax, allocation_number, review_status, exported_at, clients(business_name)')
      .eq('workspace_id', workspace.id)
      .eq('review_status', 'ready')
      .is('exported_at', null)          // not yet exported
      .order('invoice_date', { ascending: false })

    if (clientId)   query = query.eq('client_id', clientId)
    if (periodFrom) query = query.gte('invoice_date', periodFrom)
    if (periodTo)   query = query.lte('invoice_date', periodTo)

    const { data } = await query.limit(200)
    setDocuments(data || [])
    // auto-select all
    setSelected(new Set((data || []).map(d => d.id)))
    setLoading(false)
  }, [workspace?.id, clientId, periodFrom, periodTo])

  useEffect(() => {
    fetchDocuments()
  }, [fetchDocuments])

  function toggleAll() {
    if (selected.size === documents.length) {
      setSelected(new Set())
    } else {
      setSelected(new Set(documents.map(d => d.id)))
    }
  }

  function toggleOne(id) {
    const s = new Set(selected)
    if (s.has(id)) s.delete(id)
    else s.add(id)
    setSelected(s)
    setConfirmed(false)
  }

  const selectedDocs  = documents.filter(d => selected.has(d.id))
  const totalSelected = selectedDocs.reduce((sum, d) => sum + (Number(d.total_amount) || 0), 0)

  async function doExport() {
    if (!confirmed || selected.size === 0) return
    setExporting(true)
    setError(null)
    setSuccessMsg(null)

    try {
      const { data: { session } } = await supabase.auth.getSession()
      const token = session?.access_token

      const res = await fetch(`/api/export-${erpTarget}`, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body:    JSON.stringify({
          workspace_id: workspace.id,
          document_ids: [...selected],
          client_id:    clientId || null,
          period_from:  periodFrom || null,
          period_to:    periodTo   || null,
        }),
      })

      if (!res.ok) {
        const json = await res.json().catch(() => ({}))
        throw new Error(json.error || `Export failed (${res.status})`)
      }

      if (erpTarget === 'excel' || erpTarget === 'hashavshevet') {
        const blob = await res.blob()
        const ext  = erpTarget === 'excel' ? 'xlsx' : 'csv'
        const url  = URL.createObjectURL(blob)
        const a    = document.createElement('a')
        a.href     = url
        a.download = `export_${new Date().toISOString().slice(0,10)}.${ext}`
        a.click()
        URL.revokeObjectURL(url)
      } else {
        // Priority API response
        const json = await res.json()
        setSuccessMsg(`הועבר ל-Priority: ${json.success_count || 0} מסמכים`)
      }

      await fetchDocuments()
      await loadExportHistory()
      setConfirmed(false)
      if (erpTarget !== 'priority') setSuccessMsg(`יוצאו ${selected.size} מסמכים בהצלחה`)
    } catch (err) {
      setError(err.message)
    } finally {
      setExporting(false)
    }
  }

  return (
    <div className="p-6 max-w-6xl" dir="rtl">
      <div className="mb-6">
        <h1 className="text-white text-2xl font-bold">מרכז ייצוא</h1>
        <p className="text-white/40 text-sm mt-0.5">ייצוא מסמכים מאושרים ל-ERP / אקסל</p>
      </div>

      {/* Filters */}
      <div className="bg-white/5 border border-white/10 rounded-xl p-4 mb-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {/* Client filter */}
          <div>
            <label className="text-white/40 text-xs mb-1 block">לקוח</label>
            <div className="relative">
              <select
                value={clientId}
                onChange={e => setClientId(e.target.value)}
                className="w-full appearance-none bg-white/5 border border-white/10 rounded-lg px-3 pl-7 py-2 text-white text-sm focus:outline-none cursor-pointer"
              >
                <option value="">כל הלקוחות</option>
                {clients.map(c => (
                  <option key={c.id} value={c.id}>{c.business_name}</option>
                ))}
              </select>
              <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
            </div>
          </div>

          {/* Period from */}
          <div>
            <label className="text-white/40 text-xs mb-1 block">מתאריך</label>
            <div className="relative">
              <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
              <input
                type="date"
                value={periodFrom}
                onChange={e => setPeriodFrom(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg pr-8 pl-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* Period to */}
          <div>
            <label className="text-white/40 text-xs mb-1 block">עד תאריך</label>
            <div className="relative">
              <Calendar className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
              <input
                type="date"
                value={periodTo}
                onChange={e => setPeriodTo(e.target.value)}
                className="w-full bg-white/5 border border-white/10 rounded-lg pr-8 pl-3 py-2 text-white text-sm focus:outline-none focus:border-blue-500"
              />
            </div>
          </div>

          {/* ERP target */}
          <div>
            <label className="text-white/40 text-xs mb-1 block">פורמט</label>
            <div className="relative">
              <select
                value={erpTarget}
                onChange={e => setErpTarget(e.target.value)}
                className="w-full appearance-none bg-white/5 border border-white/10 rounded-lg px-3 pl-7 py-2 text-white text-sm focus:outline-none cursor-pointer"
              >
                {ERP_OPTIONS.map(o => (
                  <option key={o.value} value={o.value}>{o.label}</option>
                ))}
              </select>
              <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-white/30 pointer-events-none" />
            </div>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Document list */}
        <div className="lg:col-span-2 bg-white/5 border border-white/10 rounded-xl overflow-hidden">
          {/* Table header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-white/10 bg-white/3">
            <button onClick={toggleAll} className="text-white/40 hover:text-white/70 transition-colors">
              {selected.size === documents.length && documents.length > 0
                ? <CheckSquare className="w-4 h-4 text-blue-400" />
                : <Square className="w-4 h-4" />
              }
            </button>
            <span className="text-white/50 text-xs flex-1">
              {loading ? 'טוען...' : `${documents.length} מסמכים מוכנים לייצוא`}
            </span>
            {selected.size > 0 && (
              <span className="text-blue-400 text-xs font-medium">{selected.size} נבחרו</span>
            )}
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="w-6 h-6 text-blue-400 animate-spin" />
            </div>
          ) : documents.length === 0 ? (
            <div className="text-center py-16">
              <CheckCircle className="w-10 h-10 text-white/15 mx-auto mb-3" />
              <p className="text-white/30 text-sm">אין מסמכים מוכנים לייצוא</p>
              <p className="text-white/20 text-xs mt-1">כל המסמכים המאושרים כבר יוצאו</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-white/3 border-b border-white/8">
                  <tr>
                    <th className="w-8 px-4 py-2" />
                    <th className="text-right text-white/40 font-medium px-3 py-2">מסמך</th>
                    <th className="text-right text-white/40 font-medium px-3 py-2">ספק</th>
                    <th className="text-right text-white/40 font-medium px-3 py-2">תאריך</th>
                    <th className="text-right text-white/40 font-medium px-3 py-2">לפני מע"מ</th>
                    <th className="text-right text-white/40 font-medium px-3 py-2">מע"מ</th>
                    <th className="text-right text-white/40 font-medium px-3 py-2">סה"כ</th>
                  </tr>
                </thead>
                <tbody>
                  {documents.map(doc => (
                    <tr
                      key={doc.id}
                      onClick={() => toggleOne(doc.id)}
                      className={`border-t border-white/5 cursor-pointer transition-colors ${
                        selected.has(doc.id) ? 'bg-blue-500/5' : 'hover:bg-white/3'
                      }`}
                    >
                      <td className="px-4 py-2.5 text-center">
                        {selected.has(doc.id)
                          ? <CheckSquare className="w-3.5 h-3.5 text-blue-400" />
                          : <Square className="w-3.5 h-3.5 text-white/20" />
                        }
                      </td>
                      <td className="px-3 py-2.5">
                        <p className="text-white/80 truncate max-w-[140px]">{doc.file_name || 'מסמך'}</p>
                        {doc.invoice_number && (
                          <p className="text-white/30 font-mono mt-0.5">{doc.invoice_number}</p>
                        )}
                      </td>
                      <td className="px-3 py-2.5 text-white/60 max-w-[120px] truncate">
                        {doc.vendor_name || doc.clients?.business_name || '—'}
                      </td>
                      <td className="px-3 py-2.5 text-white/50 whitespace-nowrap">
                        {doc.invoice_date
                          ? new Date(doc.invoice_date).toLocaleDateString('he-IL')
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-white/60 text-left font-mono">
                        {doc.amount_before_vat != null
                          ? `₪${Number(doc.amount_before_vat).toLocaleString('he-IL')}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-white/60 text-left font-mono">
                        {doc.vat_amount != null
                          ? `₪${Number(doc.vat_amount).toLocaleString('he-IL')}`
                          : '—'}
                      </td>
                      <td className="px-3 py-2.5 text-white font-medium text-left font-mono">
                        {doc.total_amount != null
                          ? `₪${Number(doc.total_amount).toLocaleString('he-IL')}`
                          : '—'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Export panel */}
        <div className="space-y-4">
          {/* Summary card */}
          <div className="bg-white/5 border border-white/10 rounded-xl p-4">
            <h3 className="text-white font-semibold text-sm mb-4">סיכום ייצוא</h3>

            <div className="space-y-2.5 mb-4">
              <SummaryRow label="מסמכים נבחרו" value={selected.size} />
              <SummaryRow
                label="סה״כ לייצוא"
                value={`₪${totalSelected.toLocaleString('he-IL')}`}
                bold
              />
              <SummaryRow
                label="פורמט"
                value={ERP_OPTIONS.find(o => o.value === erpTarget)?.label || erpTarget}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 bg-red-500/10 border border-red-500/20 rounded-lg p-3 mb-3">
                <AlertCircle className="w-4 h-4 text-red-400 flex-shrink-0 mt-0.5" />
                <p className="text-red-300 text-xs">{error}</p>
              </div>
            )}
            {successMsg && (
              <div className="flex items-start gap-2 bg-green-500/10 border border-green-500/20 rounded-lg p-3 mb-3">
                <CheckCircle className="w-4 h-4 text-green-400 flex-shrink-0 mt-0.5" />
                <p className="text-green-300 text-xs">{successMsg}</p>
              </div>
            )}

            {selected.size > 0 && canExport && (
              <>
                {/* Mandatory confirmation checkbox */}
                <label className="flex items-start gap-2.5 cursor-pointer mb-3">
                  <button
                    onClick={() => setConfirmed(c => !c)}
                    className="mt-0.5 flex-shrink-0 text-white/40 hover:text-blue-400 transition-colors"
                  >
                    {confirmed
                      ? <CheckSquare className="w-4 h-4 text-blue-400" />
                      : <Square className="w-4 h-4" />
                    }
                  </button>
                  <span className="text-white/50 text-xs leading-snug">
                    אני מאשר שבדקתי את המסמכים ומאשר את הייצוא ({selected.size} מסמכים,{' '}
                    ₪{totalSelected.toLocaleString('he-IL')})
                  </span>
                </label>

                <button
                  onClick={doExport}
                  disabled={!confirmed || exporting}
                  className="w-full flex items-center justify-center gap-2 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm font-medium transition-colors"
                >
                  {exporting
                    ? <><Loader2 className="w-4 h-4 animate-spin" /> מייצא...</>
                    : <><Download className="w-4 h-4" /> אשר ויצא</>
                  }
                </button>
              </>
            )}

            {selected.size === 0 && !loading && (
              <p className="text-white/30 text-xs text-center">
                בחר מסמכים לייצוא
              </p>
            )}
          </div>

          {/* Export history */}
          {exportHistory.length > 0 && (
            <div className="bg-white/5 border border-white/10 rounded-xl p-4">
              <h3 className="text-white/70 font-semibold text-xs mb-3">ייצואים אחרונים</h3>
              <div className="space-y-2">
                {exportHistory.map(exp => (
                  <div key={exp.id} className="flex items-center justify-between">
                    <div>
                      <p className="text-white/60 text-xs">
                        {exp.clients?.business_name || 'כל הלקוחות'} — {exp.erp_target}
                      </p>
                      <p className="text-white/30 text-xs">
                        {new Date(exp.created_at).toLocaleDateString('he-IL')}{' '}
                        · {exp.profiles?.full_name}
                      </p>
                    </div>
                    <span className="text-white/50 text-xs font-mono">{exp.document_count} מסמכים</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function SummaryRow({ label, value, bold = false }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-white/40 text-xs">{label}</span>
      <span className={`text-xs font-mono ${bold ? 'text-white font-bold text-sm' : 'text-white/70'}`}>
        {value}
      </span>
    </div>
  )
}
