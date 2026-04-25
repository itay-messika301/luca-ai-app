// src/components/admin/ClientAssignment.jsx
// שיוך לקוחות לרואי חשבון
import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'

export default function ClientAssignment() {
  const [clients,     setClients]     = useState([])
  const [accountants, setAccountants] = useState([])   // office_employee + office_manager
  const [loading,     setLoading]     = useState(true)
  const [saving,      setSaving]      = useState(null)  // client id being updated
  const [error,       setError]       = useState(null)
  const [filter,      setFilter]      = useState('all') // 'all' | 'unassigned'
  const [search,      setSearch]      = useState('')

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)
    const [clientsRes, accountantsRes] = await Promise.all([
      supabase
        .from('clients')
        .select('id, name, vat_number, assigned_accountant_id, assigned_accountant_name, accounting_firm_id')
        .order('name', { ascending: true }),

      supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .in('role', ['office_employee', 'office_manager'])
        .order('full_name', { ascending: true }),
    ])

    if (clientsRes.error)     setError(clientsRes.error.message)
    if (accountantsRes.error) setError(accountantsRes.error.message)

    setClients(clientsRes.data || [])
    setAccountants(accountantsRes.data || [])
    setLoading(false)
  }

  async function handleAssign(clientId, accountantId) {
    setSaving(clientId)

    let updateData = {}
    if (accountantId === '') {
      // ביטול שיוך
      updateData = { assigned_accountant_id: null, assigned_accountant_name: null }
    } else {
      const acc = accountants.find(a => a.id === accountantId)
      updateData = {
        assigned_accountant_id:   accountantId,
        assigned_accountant_name: acc?.full_name || acc?.email || '',
      }
    }

    const { error: updateError } = await supabase
      .from('clients')
      .update(updateData)
      .eq('id', clientId)

    if (updateError) {
      alert('שגיאה בשמירה: ' + updateError.message)
    } else {
      setClients(prev =>
        prev.map(c =>
          c.id === clientId
            ? { ...c, ...updateData }
            : c
        )
      )
    }
    setSaving(null)
  }

  // סינון
  const filtered = clients.filter(c => {
    const q = search.toLowerCase()
    const matchSearch =
      (c.name || '').toLowerCase().includes(q) ||
      (c.vat_number || '').toLowerCase().includes(q) ||
      (c.assigned_accountant_name || '').toLowerCase().includes(q)

    const matchFilter =
      filter === 'all' ||
      (filter === 'unassigned' && !c.assigned_accountant_id)

    return matchSearch && matchFilter
  })

  const unassignedCount = clients.filter(c => !c.assigned_accountant_id).length

  if (loading) return <div className="text-gray-400 text-sm animate-pulse">טוען לקוחות...</div>
  if (error)   return <div className="text-red-600 text-sm">{error}</div>

  return (
    <div>
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <div>
          <h2 className="text-lg font-semibold text-gray-800">שיוך לקוחות לרואי חשבון</h2>
          {unassignedCount > 0 && (
            <p className="text-sm text-orange-600 mt-0.5">
              {unassignedCount} לקוחות ללא שיוך
            </p>
          )}
        </div>

        <div className="flex gap-2 flex-wrap">
          {/* Filter */}
          <div className="flex rounded-lg border border-gray-200 overflow-hidden text-sm">
            <button
              onClick={() => setFilter('all')}
              className={`px-3 py-1.5 transition-colors ${filter === 'all' ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              כל הלקוחות ({clients.length})
            </button>
            <button
              onClick={() => setFilter('unassigned')}
              className={`px-3 py-1.5 transition-colors ${filter === 'unassigned' ? 'bg-orange-500 text-white' : 'bg-white text-gray-600 hover:bg-gray-50'}`}
            >
              ללא שיוך ({unassignedCount})
            </button>
          </div>

          {/* Search */}
          <input
            type="text"
            placeholder="חיפוש לקוח..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm w-48 focus:outline-none focus:ring-2 focus:ring-blue-500"
            dir="rtl"
          />
        </div>
      </div>

      {/* אזהרה אם אין רואי חשבון */}
      {accountants.length === 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4 text-sm text-yellow-700">
          אין משתמשים בתפקיד <strong>office_employee</strong> או <strong>office_manager</strong>.
          עבור לטאב "משתמשים" כדי לשנות תפקידים.
        </div>
      )}

      {/* טבלה */}
      <div className="overflow-x-auto rounded-xl border border-gray-200 shadow-sm">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 text-gray-600 text-right">
            <tr>
              <th className="px-4 py-3 font-medium">שם לקוח</th>
              <th className="px-4 py-3 font-medium">ח.פ / מספר עוסק</th>
              <th className="px-4 py-3 font-medium">רואה חשבון משויך</th>
              <th className="px-4 py-3 font-medium">שינוי שיוך</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {filtered.length === 0 && (
              <tr>
                <td colSpan={4} className="px-4 py-8 text-center text-gray-400">
                  {filter === 'unassigned' ? 'כל הלקוחות משויכים' : 'לא נמצאו לקוחות'}
                </td>
              </tr>
            )}
            {filtered.map(client => (
              <tr key={client.id} className="hover:bg-gray-50 transition-colors">
                {/* שם */}
                <td className="px-4 py-3 font-medium text-gray-900">
                  {client.name}
                </td>

                {/* ח.פ */}
                <td className="px-4 py-3 text-gray-500 font-mono text-xs">
                  {client.vat_number || '—'}
                </td>

                {/* שויך ל */}
                <td className="px-4 py-3">
                  {client.assigned_accountant_id ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-green-100 text-green-700 rounded-full text-xs font-medium">
                      {client.assigned_accountant_name || client.assigned_accountant_id.slice(0,8)}
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-100 text-orange-700 rounded-full text-xs font-medium">
                      לא משויך
                    </span>
                  )}
                </td>

                {/* שינוי שיוך */}
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <select
                      value={client.assigned_accountant_id || ''}
                      onChange={e => handleAssign(client.id, e.target.value)}
                      disabled={saving === client.id || accountants.length === 0}
                      className="border border-gray-300 rounded px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50 max-w-[180px]"
                      dir="rtl"
                    >
                      <option value="">— ללא שיוך —</option>
                      {accountants.map(acc => (
                        <option key={acc.id} value={acc.id}>
                          {acc.full_name || acc.email}
                          {acc.role === 'office_manager' ? ' (מנהל)' : ''}
                        </option>
                      ))}
                    </select>
                    {saving === client.id && (
                      <span className="text-xs text-blue-500 animate-pulse">שומר...</span>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-gray-400 mt-2">
        * שינוי שיוך מתעדכן מיידית ב-DB. ה-assigned_accountant_name נשמר אוטומטית.
      </p>
    </div>
  )
}
