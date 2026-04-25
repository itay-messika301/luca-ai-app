import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

const ROLES = ['admin', 'office_manager', 'office_employee', 'end_client']
const ROLE_LABELS = {
  admin:           'מנהל מערכת',
  office_manager:  'מנהל משרד',
  office_employee: 'עובד',
  end_client:      'לקוח',
}
const ROLE_COLORS = {
  admin:           'bg-red-100 text-red-700',
  office_manager:  'bg-purple-100 text-purple-700'
  office_employee: 'bg-blue-100 text-blue-700',
  end_client:      'bg-gray-100 text-gray-700',
}

export default function UserManagement({ currentUser }) {
  const [profiles, setProfiles] = useState([])
  const [loading,  setLoading]  = useState(true)
  const [saving,   setSaving]   = useState(null)
  const [search,   setSearch]   = useState('')
  const [error,    setError]    = useState(null)

  useEffect(() => {
    supabase
      .from('profiles')
      .select('id, full_name, email, role, firm_id, created_at')
      .order('created_at', { ascending: false })
      .then(({ data, error: err }) => {
        if (err) setError(err.message)
        else setProfiles(data || [])
        setLoading(false)
      })
  }, [])

  async function handleRoleChange(profileId, newRole) {
    setSaving(profileId)
    const { error: updateError } = await supabase
      .from('profiles')
      .update({ role: newRole })
      .eq('id', profileId)

    if (updateError) {
      alert('שגיאה: ' + updateError.message)
    } else {
      setProfiles(prev =>
        prev.map(p => p.id === profileId ? { ...p, role: newRole } : p)
      )
    }
    setSaving(null)
  }

  const filtered = profiles.filter(p => {
    const q = search.toLowerCase()
    return (
      (p.full_name || '').toLowerCase().includes(q) ||
      (p.email     || '').toLowerCase().includes(q) ||
      (p.role      || '').toLowerCase().includes(q)
    )
  })

  if (loading) return <div className="text-gray-400 text-sm animate-pulse">טוען משתמשים...</div>
  if (error)   return <div className="text-red-600 text-sm">{error}</div>

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">ניהול משתמשים ({profiles.length})</h2>
        <input
          type="text"
          placeholder="חיפוש..."
          value={search}
          onChange={e => setSearch(e.target.value)}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
          dir="rtl"
        />
      </div>

      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">שם</th>
              <th className="px-4 py-3 font-medium">אימייל</th>
              <th className="px-4 py-3 font-medium">תפקיד נוכחי</th>
              <th className="px-4 py-3 font-medium">Firm ID</th>
              <th className="px-4 py-3 font-medium">שינוי תפקיד</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.map(p => (
              <tr key={p.id} className="hover:bg-gray-50 transition-colors">
                <td className="px-4 py-3 font-medium text-gray-900">{p.full_name || '—'}</td>
                <td className="px-4 py-3 text-gray-500">{p.email}</td>
                <td className="px-4 py-3">
                  <span className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${ROLE_COLORS[p.role] || 'bg-gray-100 text-gray-600'}`}>
                    {ROLE_LABELS[p.role] || p.role}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-xs text-gray-400">
                  {p.firm_id
                    ? p.firm_id.slice(0, 8) + '…'
                    : <span className="text-orange-500 font-semibold">NULL</span>
                  }
                </td>
                <td className="px-4 py-3">
                  <select
                    value={p.role}
                    onChange={e => handleRoleChange(p.id, e.target.value)}
                    disabled={saving === p.id || p.id === currentUser?.id}
                    className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                    dir="rtl"
                  >
                    {ROLES.map(r => (
                      <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                    ))}
                  </select>
                  {p.id === currentUser?.id && (
                    <span className="text-xs text-gray-400 mr-2">(אתה)</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
