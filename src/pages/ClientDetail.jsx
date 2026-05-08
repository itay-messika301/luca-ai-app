import { useState, useEffect } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import { validateRegistrationNumber } from '@/utils/israeliValidation'
import {
  ChevronRight, Building2, FileText, Edit2, Check, X,
  ChevronDown, Archive, RotateCcw, AlertCircle
} from 'lucide-react'

const CYCLE_LABELS    = { monthly: 'חודשי', bimonthly: 'דו-חודשי' }
const DOC_STATUS_LABELS = {
  pending:      { label: 'ממתין לעיבוד', color: 'text-slate-400 dark:text-white/40' },
  processing:   { label: 'בעיבוד',       color: 'text-blue-400' },
  ready:        { label: 'מוכן',          color: 'text-green-400' },
  needs_review: { label: 'נדרש בדיקה',   color: 'text-yellow-400' },
  blocked:      { label: 'חסום',          color: 'text-red-400' },
}

export default function ClientDetail() {
  const { id }     = useParams()
  const navigate   = useNavigate()
  const { profile, workspace } = useAuth()
  const canEdit    = ['workspace_owner', 'accountant'].includes(profile?.role)

  const [client,     setClient]     = useState(null)
  const [documents,  setDocuments]  = useState([])
  const [accountants,setAccountants]= useState([])
  const [loading,    setLoading]    = useState(true)
  const [editing,    setEditing]    = useState(false)
  const [form,       setForm]       = useState({})
  const [regError,   setRegError]   = useState(null)
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState(null)

  useEffect(() => {
    loadData()
  }, [id])

  async function loadData() {
    setLoading(true)
    const [clientRes, docsRes, acctRes] = await Promise.all([
      supabase
        .from('clients')
        .select('*, profiles!assigned_accountant_id(id, full_name)')
        .eq('id', id)
        .single(),
      supabase
        .from('documents')
        .select('id, file_name, status, review_status, total_amount, created_at')
        .eq('client_id', id)
        .order('created_at', { ascending: false })
        .limit(20),
      supabase
        .from('profiles')
        .select('id, full_name')
        .eq('workspace_id', workspace?.id)
        .in('role', ['accountant', 'workspace_owner'])
        .order('full_name'),
    ])
    if (clientRes.data) {
      setClient(clientRes.data)
      setForm({
        registration_number:    clientRes.data.registration_number || '',
        business_name:          clientRes.data.business_name || '',
        owner_name:             clientRes.data.owner_name || '',
        reporting_cycle:        clientRes.data.reporting_cycle || 'monthly',
        assigned_accountant_id: clientRes.data.assigned_accountant_id || '',
      })
    }
    setDocuments(docsRes.data || [])
    setAccountants(acctRes.data || [])
    setLoading(false)
  }

  function handleRegChange(val) {
    const clean = val.replace(/\D/g, '').slice(0, 9)
    setForm(f => ({ ...f, registration_number: clean }))
    if (clean.length === 9) {
      const { valid, message } = validateRegistrationNumber(clean)
      setRegError(valid ? null : message)
    } else {
      setRegError(null)
    }
  }

  async function saveEdits() {
    if (regError) return
    setSaving(true)
    setError(null)
    const { error: err } = await supabase
      .from('clients')
      .update({
        registration_number:    form.registration_number || null,
        business_name:          form.business_name.trim(),
        owner_name:             form.owner_name.trim() || null,
        reporting_cycle:        form.reporting_cycle,
        assigned_accountant_id: form.assigned_accountant_id || null,
        updated_at:             new Date().toISOString(),
      })
      .eq('id', id)
    setSaving(false)
    if (err) { setError(err.message); return }
    setEditing(false)
    loadData()
  }

  async function toggleArchive() {
    const newVal = client.archived_at ? null : new Date().toISOString()
    const { error: err } = await supabase
      .from('clients')
      .update({ archived_at: newVal })
      .eq('id', id)
    if (!err) loadData()
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
      </div>
    )
  }

  if (!client) {
    return (
      <div className="p-6 text-center" dir="rtl">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <p className="text-slate-500 dark:text-white/50">לקוח לא נמצא</p>
        <button onClick={() => navigate('/clients')} className="mt-3 text-blue-400 text-sm">
          חזור לרשימה
        </button>
      </div>
    )
  }

  return (
    <div className="p-6 max-w-4xl" dir="rtl">
      {/* Breadcrumb */}
      <button
        onClick={() => navigate('/clients')}
        className="flex items-center gap-1.5 text-slate-400 dark:text-white/40 hover:text-slate-600 dark:hover:text-white/70 text-sm mb-5 transition-colors"
      >
        <ChevronRight className="w-4 h-4" />
        לקוחות
      </button>

      {/* Header */}
      <div className="flex items-start justify-between mb-6">
        <div className="flex items-center gap-3">
          <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500/20 to-violet-500/20 flex items-center justify-center text-slate-900 dark:text-white text-lg font-bold">
            {(client.business_name || '?').charAt(0).toUpperCase()}
          </div>
          <div>
            <h1 className="text-slate-900 dark:text-white text-xl font-bold">{client.business_name}</h1>
            <p className="text-slate-400 dark:text-white/40 text-sm">
              {client.registration_number || 'ללא מספר ח.פ'}
              {client.archived_at && <span className="mr-2 text-amber-400">• ארכיון</span>}
            </p>
          </div>
        </div>

        {canEdit && (
          <div className="flex items-center gap-2">
            {editing ? (
              <>
                <button
                  onClick={saveEdits}
                  disabled={saving || !!regError}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-slate-900 dark:text-white rounded-lg text-xs font-medium transition-colors"
                >
                  <Check className="w-3.5 h-3.5" />
                  {saving ? 'שומר...' : 'שמור'}
                </button>
                <button
                  onClick={() => { setEditing(false); setRegError(null); setError(null) }}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-white/60 rounded-lg text-xs transition-colors"
                >
                  <X className="w-3.5 h-3.5" />
                  ביטול
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-white/60 hover:text-slate-900 dark:hover:text-white rounded-lg text-xs transition-colors"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  עריכה
                </button>
                <button
                  onClick={toggleArchive}
                  className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-500 dark:text-white/60 hover:text-amber-400 rounded-lg text-xs transition-colors"
                >
                  {client.archived_at
                    ? <><RotateCcw className="w-3.5 h-3.5" /> שחזר</>
                    : <><Archive className="w-3.5 h-3.5" /> ארכיון</>
                  }
                </button>
              </>
            )}
          </div>
        )}
      </div>

      {error && <p className="text-red-400 text-sm mb-4">{error}</p>}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        {/* Details card */}
        <div className="md:col-span-2 bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
          <h2 className="text-slate-900 dark:text-white font-semibold mb-4 text-sm">פרטי הלקוח</h2>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4">
            <Field label="מספר ח.פ / ע.מ" editing={editing}>
              {editing ? (
                <div>
                  <input
                    value={form.registration_number}
                    onChange={e => handleRegChange(e.target.value)}
                    className={`w-full bg-slate-100 dark:bg-white/5 border rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-sm font-mono focus:outline-none ${regError ? 'border-red-500' : 'border-white/15 focus:border-blue-500'}`}
                  />
                  {regError && <p className="text-red-400 text-xs mt-0.5">{regError}</p>}
                </div>
              ) : (
                <span className="font-mono">{client.registration_number || '—'}</span>
              )}
            </Field>

            <Field label="שם העסק" editing={editing}>
              {editing ? (
                <input
                  value={form.business_name}
                  onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))}
                  className="w-full bg-slate-100 dark:bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                />
              ) : client.business_name}
            </Field>

            <Field label="שם הבעלים" editing={editing}>
              {editing ? (
                <input
                  value={form.owner_name}
                  onChange={e => setForm(f => ({ ...f, owner_name: e.target.value }))}
                  className="w-full bg-slate-100 dark:bg-white/5 border border-white/15 rounded-lg px-2.5 py-1.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
                />
              ) : (client.owner_name || '—')}
            </Field>

            <Field label="מחזור דיווח" editing={editing}>
              {editing ? (
                <div className="relative">
                  <select
                    value={form.reporting_cycle}
                    onChange={e => setForm(f => ({ ...f, reporting_cycle: e.target.value }))}
                    className="w-full appearance-none bg-slate-100 dark:bg-white/5 border border-white/15 rounded-lg px-2.5 pl-7 py-1.5 text-slate-900 dark:text-white text-sm focus:outline-none cursor-pointer"
                  >
                    <option value="monthly">חודשי</option>
                    <option value="bimonthly">דו-חודשי</option>
                  </select>
                  <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 dark:text-white/30 pointer-events-none" />
                </div>
              ) : (CYCLE_LABELS[client.reporting_cycle] || '—')}
            </Field>

            <Field label="רואה חשבון משויך" editing={editing}>
              {editing ? (
                <div className="relative">
                  <select
                    value={form.assigned_accountant_id}
                    onChange={e => setForm(f => ({ ...f, assigned_accountant_id: e.target.value }))}
                    className="w-full appearance-none bg-slate-100 dark:bg-white/5 border border-white/15 rounded-lg px-2.5 pl-7 py-1.5 text-slate-900 dark:text-white text-sm focus:outline-none cursor-pointer"
                  >
                    <option value="">ללא שיוך</option>
                    {accountants.map(a => (
                      <option key={a.id} value={a.id}>{a.full_name}</option>
                    ))}
                  </select>
                  <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3 h-3 text-slate-400 dark:text-white/30 pointer-events-none" />
                </div>
              ) : (client.profiles?.full_name || '—')}
            </Field>

            <Field label="נוסף בתאריך">
              {new Date(client.created_at).toLocaleDateString('he-IL')}
            </Field>
          </div>
        </div>

        {/* Stats card */}
        <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5 space-y-4">
          <h2 className="text-slate-900 dark:text-white font-semibold text-sm">סטטיסטיקות</h2>
          <Stat label="סה״כ מסמכים" value={documents.length} />
          <Stat
            label="מוכנים"
            value={documents.filter(d => d.review_status === 'ready').length}
            color="text-green-400"
          />
          <Stat
            label="נדרש בדיקה"
            value={documents.filter(d => d.review_status === 'needs_review').length}
            color="text-yellow-400"
          />
          <Stat
            label="חסומים"
            value={documents.filter(d => d.review_status === 'blocked').length}
            color="text-red-400"
          />
        </div>
      </div>

      {/* Documents */}
      <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5">
        <h2 className="text-slate-900 dark:text-white font-semibold mb-4 text-sm">מסמכים אחרונים</h2>
        {documents.length === 0 ? (
          <div className="text-center py-8">
            <FileText className="w-8 h-8 text-slate-300 dark:text-white/15 mx-auto mb-2" />
            <p className="text-slate-400 dark:text-white/30 text-sm">אין מסמכים עדיין</p>
          </div>
        ) : (
          <div className="space-y-1.5">
            {documents.map(doc => {
              const statusInfo = DOC_STATUS_LABELS[doc.review_status] || DOC_STATUS_LABELS[doc.status] || { label: doc.review_status || doc.status, color: 'text-slate-400 dark:text-white/40' }
              return (
                <div key={doc.id} className="flex items-center justify-between py-2 px-3 rounded-lg bg-slate-50 dark:bg-white/3 hover:bg-slate-100 dark:hover:bg-white/5 transition-colors">
                  <div className="flex items-center gap-2.5">
                    <FileText className="w-4 h-4 text-slate-400 dark:text-white/30 flex-shrink-0" />
                    <span className="text-slate-600 dark:text-white/70 text-sm truncate max-w-xs">{doc.file_name || 'מסמך'}</span>
                  </div>
                  <div className="flex items-center gap-4 flex-shrink-0">
                    {doc.total_amount && (
                      <span className="text-slate-400 dark:text-white/40 text-xs">₪{Number(doc.total_amount).toLocaleString('he-IL')}</span>
                    )}
                    <span className={`text-xs ${statusInfo.color}`}>{statusInfo.label}</span>
                    <span className="text-slate-400 dark:text-white/20 text-xs">{new Date(doc.created_at).toLocaleDateString('he-IL')}</span>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}

function Field({ label, editing, children }) {
  return (
    <div>
      <p className="text-slate-400 dark:text-white/30 text-xs mb-1">{label}</p>
      <div className={`text-sm ${editing ? '' : 'text-slate-700 dark:text-white/80'}`}>{children}</div>
    </div>
  )
}

function Stat({ label, value, color = 'text-slate-700 dark:text-white/80' }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-slate-400 dark:text-white/40 text-xs">{label}</span>
      <span className={`font-bold text-sm ${color}`}>{value}</span>
    </div>
  )
}
