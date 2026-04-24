import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Plus, Search, User, Building2, Phone, Mail, ChevronRight } from 'lucide-react'

export default function Clients() {
  const { user, profile } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAdd, setShowAdd] = useState(false)
  const [saving, setSaving] = useState(false)
  const [form, setForm] = useState({
    name: '',
    vat_number: '',
  })

  useEffect(() => {
    fetchClients()
  }, [user])

  async function fetchClients() {
    if (!user) return
    setLoading(true)
    try {
      const { data, error } = await supabase
        .from('clients')
        .select('*')
        .order('created_at', { ascending: false })

      if (!error && data) {
        setClients(data)
      }
    } catch (err) {
      console.error('Error fetching clients:', err)
    }
    setLoading(false)
  }

  async function handleAddClient(e) {
    e.preventDefault()
    if (!form.name.trim()) return
    setSaving(true)
    try {
      const { error } = await supabase.from('clients').insert({
        name: form.name.trim(),
        vat_number: form.vat_number.trim() || null,
        accounting_firm_id: profile?.firm_id || null,
        accounting_firm_name: profile?.firm_name || null,
        owner_user_id: user.id,
      })

      if (error) {
        console.error('Insert error:', error)
        alert('שגיאה בהוספת לקוח: ' + error.message)
      } else {
        setForm({ name: '', vat_number: '' })
        setShowAdd(false)
        fetchClients()
      }
    } catch (err) {
      console.error('Error adding client:', err)
      alert('שגיאה בהוספת לקוח')
    }
    setSaving(false)
  }

  const filtered = clients.filter(c =>
    c.name?.toLowerCase().includes(search.toLowerCase()) ||
    c.vat_number?.toLowerCase().includes(search.toLowerCase())
  )

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <div className="text-gray-400">טוען...</div>
      </div>
    )
  }

  return (
    <div dir="rtl">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">לקוחות</h1>
          <p className="text-slate-500 mt-1">{clients.length} לקוחות במערכת</p>
        </div>
        <button
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 bg-indigo-600 text-white px-5 py-2.5 rounded-xl text-sm font-medium hover:bg-indigo-700 transition shadow-sm"
        >
          <Plus size={16} />
          הוסף לקוח
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          placeholder="חיפוש לפי שם חברה או ע.מ..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="w-full pr-10 pl-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
        />
      </div>

      {/* Clients List */}
      {filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-100 p-12 text-center shadow-sm">
          <User size={40} className="mx-auto text-slate-300 mb-3" />
          <p className="text-slate-400 text-sm mb-4">אין לקוחות עדיין</p>
          <button
            onClick={() => setShowAdd(true)}
            className="text-indigo-600 text-sm font-medium hover:text-indigo-700"
          >
            הוסף לקוח ראשון
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(client => (
            <div
              key={client.id}
              className="bg-white rounded-2xl border border-slate-100 p-5 shadow-sm hover:shadow-md transition"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center text-indigo-600">
                    <Building2 size={18} />
                  </div>
                  <div>
                    <h3 className="font-semibold text-slate-900">{client.name}</h3>
                    <div className="flex items-center gap-4 mt-1">
                      {client.vat_number && (
                        <span className="text-xs text-slate-500">ע.מ: {client.vat_number}</span>
                      )}
                      {client.assigned_accountant_name && (
                        <span className="text-xs text-slate-400">רו"ח: {client.assigned_accountant_name}</span>
                      )}
                    </div>
                  </div>
                </div>
                <div className="text-xs text-slate-400">
                  {client.created_at && new Date(client.created_at).toLocaleDateString('he-IL')}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Client Modal */}
      {showAdd && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md p-6">
            <h3 className="font-semibold text-lg text-slate-900 mb-6 text-center">הוספת לקוח חדש</h3>
            <form onSubmit={handleAddClient} className="space-y-4">
              <div>
                <label className="block text-sm text-slate-700 mb-1 text-right">שם חברה *</label>
                <input
                  type="text"
                  placeholder='לדוגמה: חברת ABC בע"מ'
                  value={form.name}
                  onChange={e => setForm({ ...form, name: e.target.value })}
                  required
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right"
                />
              </div>
              <div>
                <label className="block text-sm text-slate-700 mb-1 text-right">מספר ע.מ / ח.פ</label>
                <input
                  type="text"
                  placeholder="515123456"
                  value={form.vat_number}
                  onChange={e => setForm({ ...form, vat_number: e.target.value })}
                  className="w-full px-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 text-right"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAdd(false)}
                  className="flex-1 py-2.5 rounded-xl border border-slate-200 text-sm text-slate-600 hover:bg-slate-50 transition"
                >
                  ביטול
                </button>
                <button
                  type="submit"
                  disabled={saving || !form.name.trim()}
                  className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-medium hover:bg-indigo-700 transition disabled:opacity-50"
                >
                  {saving ? 'שומר...' : 'הוסף לקוח'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
