import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'
import { useAuth } from '@/lib/AuthContext'
import {
  UserPlus, Mail, Phone, Briefcase, Edit2, Trash2, Check, X,
  Send, CheckCircle2, Clock,
} from 'lucide-react'

const POSITION_LABELS = {
  owner:      'בעלים',
  cfo:        'סמנכ"ל כספים',
  accountant: 'הנהח"ש',
  employee:   'עובד',
  other:      'אחר',
}

const POSITION_OPTIONS = Object.entries(POSITION_LABELS).map(([k, v]) => ({ value: k, label: v }))

export default function ClientContacts({ clientId }) {
  const { profile } = useAuth()
  const canEdit = ['workspace_owner', 'accountant'].includes(profile?.role)

  const [contacts,    setContacts]    = useState([])
  const [loading,     setLoading]     = useState(true)
  const [error,       setError]       = useState(null)
  const [showAddForm, setShowAddForm] = useState(false)
  const [editingId,   setEditingId]   = useState(null)
  const [inviting,    setInviting]    = useState(null)  // contact id being invited
  const [toast,       setToast]       = useState(null)

  useEffect(() => {
    if (!clientId) return
    load()
  }, [clientId])

  async function load() {
    setLoading(true)
    const { data, error: err } = await supabase
      .from('client_contacts')
      .select('*')
      .eq('client_id', clientId)
      .order('created_at', { ascending: false })

    if (err) setError(err.message)
    setContacts(data || [])
    setLoading(false)
  }

  async function handleSave(values, contactId = null) {
    const payload = {
      client_id: clientId,
      full_name: values.full_name.trim(),
      email:     values.email?.trim() || null,
      phone:     values.phone?.trim() || null,
      position:  values.position || null,
    }
    const { error: err } = contactId
      ? await supabase.from('client_contacts').update(payload).eq('id', contactId)
      : await supabase.from('client_contacts').insert(payload)

    if (err) {
      setToast({ type: 'error', text: err.message })
      return false
    }
    setToast({ type: 'success', text: contactId ? 'איש הקשר עודכן' : 'איש הקשר נוסף' })
    setTimeout(() => setToast(null), 4000)
    await load()
    return true
  }

  async function handleDelete(contactId) {
    if (!confirm('להסיר את איש הקשר?')) return
    const { error: err } = await supabase
      .from('client_contacts')
      .delete()
      .eq('id', contactId)
    if (err) { setToast({ type: 'error', text: err.message }); return }
    setToast({ type: 'success', text: 'איש הקשר הוסר' })
    setTimeout(() => setToast(null), 3000)
    load()
  }

  async function handleInvite(contact) {
    if (!contact.email) {
      setToast({ type: 'error', text: 'נדרש מייל כדי להזמין' })
      return
    }
    setInviting(contact.id)
    try {
      const { data: { session } } = await supabase.auth.getSession()
      const res = await fetch('/api/invite-contact', {
        method:  'POST',
        headers: {
          'Content-Type':  'application/json',
          Authorization:   `Bearer ${session?.access_token || ''}`,
        },
        body: JSON.stringify({ contact_id: contact.id }),
      })
      const body = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(body.error || 'שגיאה בשליחת ההזמנה')

      setToast({ type: 'success', text: `הזמנה נשלחה ל-${contact.email}` })
      setTimeout(() => setToast(null), 5000)
      load()
    } catch (err) {
      setToast({ type: 'error', text: err.message })
      setTimeout(() => setToast(null), 6000)
    } finally {
      setInviting(null)
    }
  }

  const inviteStatusOf = (c) => {
    if (c.accepted_at) return { label: 'מחובר', color: 'text-green-400', Icon: CheckCircle2 }
    if (c.invited_at)  return { label: 'הזמנה נשלחה', color: 'text-blue-400', Icon: Clock }
    return null
  }

  return (
    <div className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-xl p-5 mt-6" dir="rtl">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-slate-900 dark:text-white font-semibold text-sm">אנשי קשר</h2>
        {canEdit && !showAddForm && (
          <button
            onClick={() => setShowAddForm(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded-lg text-xs font-medium transition-colors"
          >
            <UserPlus className="w-3.5 h-3.5" />
            הוסף איש קשר
          </button>
        )}
      </div>

      {/* Add form */}
      {showAddForm && (
        <ContactForm
          onCancel={() => setShowAddForm(false)}
          onSubmit={async (vals) => {
            const ok = await handleSave(vals)
            if (ok) setShowAddForm(false)
          }}
        />
      )}

      {loading ? (
        <div className="flex justify-center py-6">
          <div className="w-5 h-5 border-2 border-blue-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : contacts.length === 0 && !showAddForm ? (
        <div className="text-center py-8">
          <UserPlus className="w-8 h-8 text-slate-300 dark:text-white/15 mx-auto mb-2" />
          <p className="text-slate-400 dark:text-white/30 text-sm">אין אנשי קשר עדיין</p>
        </div>
      ) : (
        <div className="space-y-2 mt-3">
          {contacts.map(c => {
            const isEditing = editingId === c.id
            const status    = inviteStatusOf(c)

            return isEditing ? (
              <ContactForm
                key={c.id}
                initial={c}
                onCancel={() => setEditingId(null)}
                onSubmit={async (vals) => {
                  const ok = await handleSave(vals, c.id)
                  if (ok) setEditingId(null)
                }}
              />
            ) : (
              <div
                key={c.id}
                className="bg-slate-50 dark:bg-white/3 border border-slate-100 dark:border-white/5 rounded-lg p-3 flex items-start justify-between gap-3"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-slate-900 dark:text-white text-sm font-medium truncate">{c.full_name}</p>
                    {c.position && (
                      <span className="text-slate-400 dark:text-white/40 text-xs">· {POSITION_LABELS[c.position] || c.position}</span>
                    )}
                    {status && (
                      <span className={`flex items-center gap-1 text-xs ${status.color}`}>
                        <status.Icon className="w-3 h-3" />
                        {status.label}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-3 mt-1 flex-wrap text-xs text-slate-400 dark:text-white/40">
                    {c.email && (
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        <span className="truncate">{c.email}</span>
                      </span>
                    )}
                    {c.phone && (
                      <span className="flex items-center gap-1">
                        <Phone className="w-3 h-3" />
                        {c.phone}
                      </span>
                    )}
                  </div>
                </div>

                {canEdit && (
                  <div className="flex items-center gap-1 flex-shrink-0">
                    {!c.accepted_at && c.email && (
                      <button
                        onClick={() => handleInvite(c)}
                        disabled={inviting === c.id}
                        className="flex items-center gap-1 px-2 py-1 bg-blue-600/10 hover:bg-blue-600/20 disabled:opacity-50 text-blue-400 rounded text-xs transition-colors"
                        title={c.invited_at ? 'שלח הזמנה מחדש' : 'הזמן ללוקה'}
                      >
                        <Send className="w-3 h-3" />
                        {inviting === c.id ? 'שולח...' : (c.invited_at ? 'שלח שוב' : 'הזמן')}
                      </button>
                    )}
                    <button
                      onClick={() => setEditingId(c.id)}
                      className="p-1.5 text-slate-400 dark:text-white/30 hover:text-slate-700 dark:hover:text-white/70 transition-colors"
                      title="ערוך"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleDelete(c.id)}
                      className="p-1.5 text-slate-400 dark:text-white/30 hover:text-red-400 transition-colors"
                      title="הסר"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}

      {error && <p className="text-red-400 text-xs mt-3">{error}</p>}

      {toast && (
        <div
          className={`fixed bottom-6 left-6 z-50 flex items-center gap-2 px-4 py-2.5 rounded-lg text-sm shadow-xl border ${
            toast.type === 'success'
              ? 'bg-green-500/10 border-green-500/30 text-green-300'
              : 'bg-red-500/10 border-red-500/30 text-red-300'
          }`}
        >
          {toast.text}
          <button onClick={() => setToast(null)} className="opacity-60 hover:opacity-100">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  )
}

/* ───────────── Form (add / edit) ───────────── */
function ContactForm({ initial, onSubmit, onCancel }) {
  const [vals, setVals] = useState({
    full_name: initial?.full_name || '',
    email:     initial?.email     || '',
    phone:     initial?.phone     || '',
    position:  initial?.position  || '',
  })
  const [saving, setSaving] = useState(false)

  const canSubmit = vals.full_name.trim().length > 0

  async function handle(e) {
    e.preventDefault()
    if (!canSubmit) return
    setSaving(true)
    await onSubmit(vals)
    setSaving(false)
  }

  return (
    <form
      onSubmit={handle}
      className="bg-slate-50 dark:bg-white/3 border border-blue-500/30 rounded-lg p-3 mb-3 grid grid-cols-1 md:grid-cols-2 gap-2"
    >
      <input
        placeholder="שם מלא *"
        value={vals.full_name}
        onChange={e => setVals(v => ({ ...v, full_name: e.target.value }))}
        className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
        autoFocus
      />
      <input
        type="email"
        placeholder="מייל"
        value={vals.email}
        onChange={e => setVals(v => ({ ...v, email: e.target.value }))}
        className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
        dir="ltr"
      />
      <input
        type="tel"
        placeholder="טלפון"
        value={vals.phone}
        onChange={e => setVals(v => ({ ...v, phone: e.target.value }))}
        className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
        dir="ltr"
      />
      <select
        value={vals.position}
        onChange={e => setVals(v => ({ ...v, position: e.target.value }))}
        className="bg-slate-100 dark:bg-white/5 border border-slate-200 dark:border-white/10 rounded-lg px-3 py-1.5 text-slate-900 dark:text-white text-sm focus:outline-none focus:border-blue-500"
      >
        <option value="">תפקיד</option>
        {POSITION_OPTIONS.map(o => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>

      <div className="md:col-span-2 flex items-center justify-end gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex items-center gap-1 px-3 py-1.5 bg-slate-100 dark:bg-white/5 text-slate-500 dark:text-white/60 rounded-lg text-xs transition-colors"
        >
          <X className="w-3 h-3" />
          ביטול
        </button>
        <button
          type="submit"
          disabled={!canSubmit || saving}
          className="flex items-center gap-1 px-3 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-lg text-xs font-medium transition-colors"
        >
          <Check className="w-3 h-3" />
          {saving ? 'שומר...' : 'שמור'}
        </button>
      </div>
    </form>
  )
}
