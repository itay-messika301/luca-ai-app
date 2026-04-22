import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Plus, Search, Building2, Phone, ChevronRight } from 'lucide-react'

export default function Clients() {
  const { profile, isAdmin, isOfficeManager } = useAuth()
  const [clients, setClients] = useState([])
  const [loading, setLoading] = useState(true)
  const [search, setSearch] = useState('')
  const [showAddModal, setShowAddModal] = useState(false)
  const [newClient, setNewClient] = useState({ company_name: '', owner_user_email: '', contact_phone: '', business_type: '', notes: '' })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => { fetchClients() }, [])

  async function fetchClients() {
    setLoading(true)
    const { data } = await supabase.from('clients').select('*').order('created_at', { ascending: false })
    setClients(data || [])
    setLoading(false)
  }

  async function handleAddClient(e) {
    e.preventDefault()
    setSaving(true)
    setError('')
    const { error } = await supabase.from('clients').insert({
      ...newClient,
      accounting_firm_id: profile.firm_id,
      accounting_firm_name: profile.firm_name,
      assigned_accountant_id: profile.id,
      assigned_accountant_name: profile.full_name,
    })
    if (error) { setError('שגיאה: ' + error.message) }
    else {
      setShowAddModal(false)
      setNewClient({ company_name: '', owner_user_email: '', contact_phone: '', business_type: '', notes: '' })
      fetchClients()
    }
    setSaving(false)
  }

  const filtered = clients.filter(c =>
    c.company_name?.toLowerCase().includes(search.toLowerCase()) ||
    c.owner_user_email?.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">לקוחות</h1>
          <p className="text-gray-500 text-sm mt-1">{clients.length} לקוחות במערכת</p>
        </div>
        {(isAdmin() || isOfficeManager()) && (
          <button onClick={() => setShowAddModal(true)} className="flex items-center gap-2 bg-indigo-600 text-white px-4 py-2 rounded-lg hover:bg-indigo-700 transition">
            <Plus size={18} /> הוסף לקוח
          </button>
        )}
      </div>
      <div className="relative mb-4">
        <Search size={18} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400" />
        <input type="text" placeholder="חיפוש לפי שם חברה או אימייל..." value={search} onChange={e => setSearch(e.target.value)}
          className="w-full pr-10 pl-4 py-2.5 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white" />
      </div>
      {loading ? (
        <div className="text-center py-20 text-gray-400">טוען...</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <Building2 size={48} className="mx-auto text-gray-300 mb-3" />
          <p className="text-gray-400">{search ? 'לא נמצאו תוצאות' : 'אין לקוחות עדיין'}</p>
        </div>
      ) : (
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {filtered.map((client, i) => (
            <div key={client.id} className={`flex items-center justify-between px-5 py-4 hover:bg-gray-50 transition ${i !== 0 ? 'border-t border-gray-100' : ''}`}>
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-indigo-100 flex items-center justify-center">
                  <Building2 size={20} className="text-indigo-600" />
                </div>
                <div>
                  <p className="font-medium text-gray-900">{client.company_name}</p>
                  <p className="text-sm text-gray-500">{client.owner_user_email}</p>
                </div>
              </div>
              <div className="flex items-center gap-4 text-sm text-gray-500">
                {client.business_type && <span className="bg-gray-100 px-2 py-1 rounded">{client.business_type}</span>}
                {client.contact_phone && <span className="flex items-center gap-1"><Phone size={14}/>{client.contact_phone}</span>}
                <ChevronRight size={18} className="text-gray-300" />
              </div>
            </div>
          ))}
        </div>
      )}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl w-full max-w-md p-6" dir="rtl">
            <h2 className="text-xl font-bold text-gray-900 mb-5">הוספת לקוח חדש</h2>
            <form onSubmit={handleAddClient} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">שם חברה *</label>
                <input required value={newClient.company_name} onChange={e => setNewClient({...newClient, company_name: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="לדוגמה: חברת ABC" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">אימייל לקוח</label>
                <input type="email" value={newClient.owner_user_email} onChange={e => setNewClient({...newClient, owner_user_email: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="client@company.com" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">טלפון</label>
                <input value={newClient.contact_phone} onChange={e => setNewClient({...newClient, contact_phone: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="050-0000000" />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">סוג עסק</label>
                <select value={newClient.business_type} onChange={e => setNewClient({...newClient, business_type: e.target.value})}
                  className="w-full border border-gray-200 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-indigo-500 bg-white">
                  <option value="">בחר...</option>
                  <option value="עוסק מורשה">עוסק מורשה</option>
                  <option value="עוסק פטור">עוסק פטור</option>
                  <option value="חברה בעגל">חברה בעגל</option>
                  <option value="שותפות">שותפות</option>
                  <option value="עמותה">עמותה</option>
                </select>
              </div>
              {error && <p className="text-red-500 text-sm">{error}</p>}
              <div className="flex gap-3 pt-2">
                <button type="submit" disabled={saving} className="flex-1 bg-indigo-600 text-white py-2 rounded-lg hover:bg-indigo-700 disabled:opacity-50">
                  {saving ? 'שומר...' : 'הוסף לקוח'}
                </button>
                <button type="button" onClick={() => setShowAddModal(false)} className="flex-1 border border-gray-200 text-gray-700 py-2 rounded-lg hover:bg-gray-50">ביטול</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
