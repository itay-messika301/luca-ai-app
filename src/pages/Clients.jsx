import { useState, useEffect, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import CSVImporter from '@/components/clients/CSVImporter'
import { validateRegistrationNumber } from '@/utils/israeliValidation'
import { useDebounce } from '@/utils/useDebounce'
import {
  Plus, Search, Building2, ChevronLeft, Upload, Archive,
  RotateCcw, ChevronDown, UserCircle
} from 'lucide-react'

const CYCLE_LABELS = { monthly: 'חודשי', bimonthly: 'דו-חודשי' }

export default function Clients() {
  const { profile, workspace } = useAuth()
  const navigate               = useNavigate()
  const isOwnerOrEmployee      = ['workspace_owner', 'workspace_employee'].includes(profile?.role)

  const [clients,      setClients]      = useState([])
  const [accountants,  setAccountants]  = useState([])
  const [loading,      setLoading]      = useState(true)
  const [search,       setSearch]       = useState('')
  const debouncedSearch                  = useDebounce(search, 200)
  const [showArchived, setShowArchived] = useState(false)
  const [showAdd,      setShowAdd]      = useState(false)
  const [showCSV,      setShowCSV]      = useState(false)

  const fetchClients = useCallback(async () => {
    if (!workspace?.id) return
    setLoading(true)
    const { data } = await supabase
      .from('clients')
      .select('*, profiles!assigned_accountant_id(full_name)')
      .eq('workspace_id', workspace.id)
      .order('business_name')
    setClients(data || [])
    setLoading(false)
  }, [workspace?.id])

  const fetchAccountants = useCallback(async () => {
    if (!workspace?.id) return
    const { data } = await supabase
      .from('profiles')
      .select('id, full_name')
      .eq('workspace_id', workspace.id)
      .in('role', ['workspace_employee', 'workspace_owner'])
      .order('full_name')
    setAccountants(data || [])
  }, [workspace?.id])

  useEffect(() => {
    fetchClients()
    fetchAccountants()
  }, [fetchClients, fetchAccountants])

  async function handleArchive(clientId, archive) {
    const { error } = await supabase
      .from('clients')
      .update({ archived_at: archive ? new Date().toISOString() : null })
      .eq('id', clientId)
    if (!error) fetchClients()
  }

  async function handleCSVImport(rows) {
    if (!workspace?.id) return
    const toInsert = rows.map(r => ({ ...r, workspace_id: workspace.id }))
    const { error } = await supabase.from('clients').upsert(toInsert, {
      onConflict: 'workspace_id,registration_number',
      ignoreDuplicates: false,
    })
    if (!error) {
      setShowCSV(false)
      fetchClients()
    } else {
      alert('שגיאה בייבוא: ' + error.message)
    }
  }

  const existingNumbers = new Set(clients.map(c => c.registration_number).filter(Boolean))
  const existingOwners  = Array.from(
    new Set(clients.map(c => c.owner_name?.trim()).filter(Boolean))
  ).sort((a, b) => a.localeCompare(b, 'he'))

  const filtered = clients.filter(c => {
    const archived = !!c.archived_at
    if (archived !== showArchived) return false
    if (!debouncedSearch) return true
    const q = debouncedSearch.toLowerCase()
    return (
      c.business_name?.toLowerCase().includes(q) ||
      c.registration_number?.includes(q) ||
      c.owner_name?.toLowerCase().includes(q)
    )
  })

  return (
    <div className="p-6" dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-slate-900 dark:text-white text-2xl font-bold">לקוחות</h1>
          <p className="text-slate-400 dark:text-white/40 text-sm mt-0.5">
            {clients.filter(c => !c.archived_at).length} לקוחות פעילים
          </p>
        </div>
        {isOwnerOrEmployee && (
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowCSV(true)}
              className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 border border-slate-200 dark:border-white/10 text-slate-600 dark:text-white/70 hover:text-slate-900 dark:hover:text-white rounded-lg text-sm transition-all"
            >
              <Upload className="w-4 h-4" />
              ייבוא CSV
            </button>
            <button
              onClick={() => setShowAdd(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-sm font-medium transition-colors"
            >
              <Plus className="w-4 h-4" />
              לקוח חדש
            </button>
          </div>
        )}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 mb-5">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 dark:text-white/30" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="חיפוש לפי שם, ח.פ..."
            className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg pr-9 pl-3 py-2 text-slate-900 dark:text-white text-sm placeholder:text-slate-400 dark:placeholder:text-white/30 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
        <button
          onClick={() => setShowArchived(!showArchived)}
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-all ${
            showArchived
              ? 'bg-amber-500/20 border border-amber-500/30 text-amber-400'
              : 'bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 text-slate-500 dark:text-white/50 hover:text-slate-700 dark:hover:text-white/80'
          }`}
        >
          <Archive className="w-4 h-4" />
          ארכיון
        </button>
      </div>

      {/* List */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="w-6 h-6 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16">
          <Building2 className="w-10 h-10 text-slate-300 dark:text-white/15 mx-auto mb-3" />
          <p className="text-slate-400 dark:text-white/30 text-sm">
            {showArchived ? 'אין לקוחות בארכיון' : 'אין לקוחות עדיין'}
          </p>
          {!showArchived && isOwnerOrEmployee && (
            <button
              onClick={() => setShowAdd(true)}
              className="mt-3 text-blue-400 hover:text-blue-300 text-sm transition-colors"
            >
              הוסף לקוח ראשון
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map(client => (
            <ClientRow
              key={client.id}
              client={client}
              showArchived={showArchived}
              onArchive={handleArchive}
              onClick={() => navigate(`/clients/${client.id}`)}
              canEdit={isOwnerOrEmployee}
            />
          ))}
        </div>
      )}

      {showAdd && (
        <AddClientModal
          workspace={workspace}
          accountants={accountants}
          existingOwners={existingOwners}
          onClose={() => setShowAdd(false)}
          onSaved={() => { setShowAdd(false); fetchClients() }}
        />
      )}

      {showCSV && (
        <CSVImporter
          existingNumbers={existingNumbers}
          onImport={handleCSVImport}
          onClose={() => setShowCSV(false)}
        />
      )}
    </div>
  )
}

function ClientRow({ client, showArchived, onArchive, onClick, canEdit }) {
  const initials = (client.business_name || '?').charAt(0).toUpperCase()
  return (
    <div
      className="flex items-center gap-4 bg-slate-50 dark:bg-white/3 hover:bg-slate-100 dark:hover:bg-white/6 border border-slate-100 dark:border-white/8 rounded-xl px-4 py-3.5 cursor-pointer transition-all group"
      onClick={onClick}
    >
      <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-blue-500/20 to-violet-500/20 flex items-center justify-center text-slate-500 dark:text-white/60 text-sm font-bold flex-shrink-0">
        {initials}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-slate-900 dark:text-white/90 text-sm font-medium truncate">{client.business_name}</p>
          {client.archived_at && (
            <span className="text-xs bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full flex-shrink-0">ארכיון</span>
          )}
        </div>
        <div className="flex items-center gap-3 mt-0.5">
          {client.registration_number && (
            <span className="text-slate-400 dark:text-white/30 text-xs font-mono">{client.registration_number}</span>
          )}
          {client.owner_name && (
            <span className="text-slate-400 dark:text-white/30 text-xs">{client.owner_name}</span>
          )}
          <span className="text-slate-400 dark:text-white/20 text-xs">{CYCLE_LABELS[client.reporting_cycle] || 'חודשי'}</span>
        </div>
      </div>
      {client.profiles?.full_name && (
        <div className="hidden md:flex items-center gap-1.5 text-slate-400 dark:text-white/30 text-xs flex-shrink-0">
          <UserCircle className="w-3.5 h-3.5" />
          {client.profiles.full_name}
        </div>
      )}
      {canEdit && (
        <button
          onClick={e => { e.stopPropagation(); onArchive(client.id, !showArchived) }}
          className="opacity-0 group-hover:opacity-100 p-1.5 text-slate-400 dark:text-white/30 hover:text-slate-600 dark:hover:text-white/70 transition-all"
          title={showArchived ? 'שחזר לקוח' : 'העבר לארכיון'}
        >
          {showArchived ? <RotateCcw className="w-4 h-4" /> : <Archive className="w-4 h-4" />}
        </button>
      )}
      <ChevronLeft className="w-4 h-4 text-slate-400 dark:text-white/20 group-hover:text-slate-400 dark:group-hover:text-white/40 transition-colors flex-shrink-0" />
    </div>
  )
}

function AddClientModal({ workspace, accountants, existingOwners = [], onClose, onSaved }) {
  const [form, setForm] = useState({
    registration_number: '',
    business_name:       '',
    owner_name:          '',
    reporting_cycle:     'monthly',
    assigned_accountant_id: '',
  })
  const [regError,    setRegError]    = useState(null)
  const [saving,      setSaving]      = useState(false)
  const [error,       setError]       = useState(null)
  const [ownerOpen,   setOwnerOpen]   = useState(false)

  const ownerQuery       = form.owner_name.trim().toLowerCase()
  const ownerSuggestions = existingOwners.filter(o =>
    !ownerQuery || o.toLowerCase().includes(ownerQuery)
  ).slice(0, 8)
  const isNewOwner = ownerQuery && !existingOwners.some(o => o.toLowerCase() === ownerQuery)

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

  async function submit(e) {
    e.preventDefault()
    if (form.registration_number.length === 9) {
      const { valid, message } = validateRegistrationNumber(form.registration_number)
      if (!valid) { setRegError(message); return }
    }
    setSaving(true)
    setError(null)
    const { error: err } = await supabase.from('clients').insert({
      workspace_id:           workspace.id,
      registration_number:    form.registration_number || null,
      business_name:          form.business_name.trim(),
      owner_name:             form.owner_name.trim() || null,
      reporting_cycle:        form.reporting_cycle,
      assigned_accountant_id: form.assigned_accountant_id || null,
    })
    setSaving(false)
    if (err) setError(err.message)
    else onSaved()
  }

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4" dir="rtl">
      <div className="bg-white dark:bg-[#111117] border border-slate-200 dark:border-white/10 rounded-2xl p-6 w-full max-w-md shadow-2xl">
        <h2 className="text-slate-900 dark:text-white font-bold text-lg mb-5">הוספת לקוח חדש</h2>
        <form onSubmit={submit} className="space-y-4">
          <div>
            <label className="block text-slate-500 dark:text-white/50 text-xs mb-1.5">מספר ח.פ / ע.מ (9 ספרות)</label>
            <input
              value={form.registration_number}
              onChange={e => handleRegChange(e.target.value)}
              placeholder="516153742"
              className={`w-full bg-slate-100 dark:bg-white/5 border rounded-lg px-3 py-2.5 text-slate-900 dark:text-white text-sm font-mono focus:outline-none transition-colors ${
                regError ? 'border-red-500' : 'border-slate-200 dark:border-white/10 focus:border-blue-500'
              }`}
            />
            {regError && <p className="text-red-400 text-xs mt-1">{regError}</p>}
          </div>
          <div>
            <label className="block text-slate-500 dark:text-white/50 text-xs mb-1.5">שם העסק *</label>
            <input
              value={form.business_name}
              onChange={e => setForm(f => ({ ...f, business_name: e.target.value }))}
              required
              placeholder='חברת ABC בע"מ'
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
          </div>
          <div className="relative">
            <label className="block text-slate-500 dark:text-white/50 text-xs mb-1.5">שם הבעלים</label>
            <input
              value={form.owner_name}
              onChange={e => { setForm(f => ({ ...f, owner_name: e.target.value })); setOwnerOpen(true) }}
              onFocus={() => setOwnerOpen(true)}
              onBlur={() => setTimeout(() => setOwnerOpen(false), 150)}
              placeholder="ישראל ישראלי"
              autoComplete="off"
              className="w-full bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500 transition-colors"
            />
            {ownerOpen && (ownerSuggestions.length > 0 || isNewOwner) && (
              <div className="absolute z-10 left-0 right-0 mt-1 max-h-56 overflow-y-auto bg-white dark:bg-[#1a1a22] border border-slate-200 dark:border-white/10 rounded-lg shadow-xl">
                {ownerSuggestions.map(o => (
                  <button
                    key={o}
                    type="button"
                    onMouseDown={e => { e.preventDefault(); setForm(f => ({ ...f, owner_name: o })); setOwnerOpen(false) }}
                    className="block w-full text-right px-3 py-2 text-sm text-slate-900 dark:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-colors"
                  >
                    {o}
                  </button>
                ))}
                {isNewOwner && (
                  <button
                    type="button"
                    onMouseDown={e => { e.preventDefault(); setOwnerOpen(false) }}
                    className="block w-full text-right px-3 py-2 text-sm text-blue-500 dark:text-blue-400 border-t border-slate-100 dark:border-white/5 hover:bg-slate-50 dark:hover:bg-white/5 transition-colors"
                  >
                    + צור בעלים חדש: "{form.owner_name.trim()}"
                  </button>
                )}
              </div>
            )}
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-slate-500 dark:text-white/50 text-xs mb-1.5">מחזור דיווח</label>
              <div className="relative">
                <select
                  value={form.reporting_cycle}
                  onChange={e => setForm(f => ({ ...f, reporting_cycle: e.target.value }))}
                  className="w-full appearance-none bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 pl-7 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none cursor-pointer"
                >
                  <option value="monthly">חודשי</option>
                  <option value="bimonthly">דו-חודשי</option>
                </select>
                <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-white/30 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-slate-500 dark:text-white/50 text-xs mb-1.5">רואה חשבון</label>
              <div className="relative">
                <select
                  value={form.assigned_accountant_id}
                  onChange={e => setForm(f => ({ ...f, assigned_accountant_id: e.target.value }))}
                  className="w-full appearance-none bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 pl-7 py-2.5 text-slate-900 dark:text-white text-sm focus:outline-none cursor-pointer"
                >
                  <option value="">ללא שיוך</option>
                  {accountants.map(a => (
                    <option key={a.id} value={a.id}>{a.full_name}</option>
                  ))}
                </select>
                <ChevronDown className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 dark:text-white/30 pointer-events-none" />
              </div>
            </div>
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
          <div className="flex gap-3 pt-1">
            <button
              type="submit"
              disabled={saving || !form.business_name.trim() || !!regError}
              className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-sm font-medium transition-colors"
            >
              {saving ? 'שומר...' : 'הוסף לקוח'}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10 text-slate-600 dark:text-white/70 rounded-lg text-sm transition-colors"
            >
              ביטול
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
