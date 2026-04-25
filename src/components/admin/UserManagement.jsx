import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'

const ROLES = ['admin', 'office_manager', 'office_employee', 'end_client']
const ROLE_LABELS = { admin: 'אדמין', office_manager: 'מנהל משרד', office_employee: 'עובד משרד', end_client: 'לקוח קצה' }
const ROLE_COLORS = { admin: 'bg-red-100 text-red-700', office_manager: 'bg-blue-100 text-blue-700', office_employee: 'bg-green-100 text-green-700', end_client: 'bg-gray-100 text-gray-700' }

export default function UserManagement({ currentUser }) {
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)
  const [saving, setSaving] = useState(null)
  const [search, setSearch] = useState('')

  useEffect(() => {
    supabase.from('profiles').select('*').order('created_at', { ascending: false })
      .then(({ data, error }) => { if (error) setError(error.message); else setProfiles(data || []); setLoading(false) })
  }, [])

  async function handleRoleChange(id, newRole) {
    setSaving(id)
    const { error } = await supabase.from('profiles').update({ role: newRole }).eq('id', id)
    if (error) alert('❌ ' + error.message)
    else setProfiles(p => p.map(x => x.id === id ? { ...x, role: newRole } : x))
    setSaving(null)
  }

  const filtered = profiles.filter(p => {
    const q = search.toLowerCase()
    return (p.full_name||'').toLowerCase().includes(q) || (p.email||'').toLowerCase().includes(q) || (p.role||'').includes(q)
  })

  if (loading) return <div className="text-gray-400 text-sm animate-pulse">טוען...</div>
  if (error)   return <div className="text-red-600 text-sm">❌ {error}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">ניהול משתמשים ({profiles.length})</h2>
        <input type="text" placeholder="חיפוש..." value={search} onChange={e => setSearch(e.target.value)} dir="rtl"
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-blue-500" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">שם</th>
              <th className="px-4 py-3 font-medium">אימייל</th>
              <th className="px-4 py-3 font-medium">תפקיד</th>
              <th className="px-4 py-3 font-medium">שינוי תפקיד</th>
              <th className="px-4 py-3 font-medium">Firm ID</th>
              <th className="px-4 py-3 font-medium">נוצר</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">לא נמצאו משתמשים</td></tr>}
            {filtered.map(p => (
              <tr key={p.id} className={`hover:bg-gray-50 ${p.id === currentUser?.id ? 'bg-blue-50' : ''}`}>
                <td className="px-4 py-3 font-medium text-gray-900">{p.full_name || '—'}{p.id === currentUser?.id && <span className="mr-1 text-xs text-blue-500">(אתה)</span>}</td>
                <td className="px-4 py-3 text-gray-600 text-left">{p.email || '—'}</td>
                <td className="px-4 py-3"><span className={`px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[p.role]||'bg-gray-100'}`}>{ROLE_LABELS[p.role]||p.role}</span></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <select value={p.role||''} disabled={saving===p.id||p.id===currentUser?.id}
                      onChange={e => handleRoleChange(p.id, e.target.value)} dir="rtl"
                      className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none disabled:opacity-50">
                      {ROLES.map(r => <option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
                    </select>
                    {saving===p.id && <span className="text-xs text-blue-500 animate-pulse">שומר...</span>}
                  </div>
                </td>
                <td className="px-4 py-3 text-xs text-gray-400 font-mono">
                  {p.accounting_firm_id ? p.accounting_firm_id.slice(0,8)+'...' : <span className="text-orange-500">NULL ⚠️</span>}
                </td>
                <td className="px-4 py-3 text-xs text-gray-400">{p.created_at ? new Date(p.created_at).toLocaleDateString('he-IL') : '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400 mt-2">* לא ניתן לשנות את התפקיד שלך בעצמך.</p>
    </div>
  )
}
