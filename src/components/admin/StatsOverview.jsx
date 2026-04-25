import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabaseClient'

function StatCard({ icon, label, value, color, sub }) {
  const colors = {
    blue:   'bg-blue-50 border-blue-200 text-blue-700',
    green:  'bg-green-50 border-green-200 text-green-700',
    purple: 'bg-purple-50 border-purple-200 text-purple-700',
    orange: 'bg-orange-50 border-orange-200 text-orange-700',
  }
  return (
    <div className={`border rounded-xl p-5 ${colors[color] || colors.blue}`}>
      <div className="text-3xl mb-2">{icon}</div>
      <div className="text-3xl font-bold">{value ?? '...'}</div>
      <div className="text-sm font-medium mt-1">{label}</div>
      {sub && <div className="text-xs opacity-70 mt-1">{sub}</div>}
    </div>
  )
}

function RoleBreakdown() {
  const [breakdown, setBreakdown] = useState([])
  const ROLE_LABELS = {
    admin:           { label: 'אדמין',       color: 'bg-red-100 text-red-700' },
    office_manager:  { label: 'מנהל משרד',   color: 'bg-blue-100 text-blue-700' },
    office_employee: { label: 'עובד משרד',   color: 'bg-green-100 text-green-700' },
    end_client:      { label: 'לקוח קצה',    color: 'bg-gray-100 text-gray-700' },
  }
  useEffect(() => {
    supabase.from('profiles').select('role').then(({ data }) => {
      if (!data) return
      const counts = {}
      data.forEach(({ role }) => { counts[role] = (counts[role] || 0) + 1 })
      setBreakdown(Object.entries(counts).map(([role, count]) => ({ role, count })))
    })
  }, [])
  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-gray-600 mb-3">פירוט לפי תפקיד</h3>
      <div className="flex flex-wrap gap-2">
        {breakdown.map(({ role, count }) => {
          const meta = ROLE_LABELS[role] || { label: role, color: 'bg-gray-100 text-gray-700' }
          return (
            <span key={role} className={`px-3 py-1 rounded-full text-sm font-medium ${meta.color}`}>
              {meta.label}: {count}
            </span>
          )
        })}
      </div>
    </div>
  )
}

export default function StatsOverview() {
  const [stats, setStats] = useState({ users: null, clients: null, documents: null, admins: null })
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState(null)

  useEffect(() => {
    async function load() {
      try {
        const [u, c, d, a] = await Promise.all([
          supabase.from('profiles').select('id', { count: 'exact', head: true }),
          supabase.from('clients').select('id', { count: 'exact', head: true }),
          supabase.from('documents').select('id', { count: 'exact', head: true }),
          supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin'),
        ])
        if (u.error) throw u.error
        setStats({ users: u.count, clients: c.count, documents: d.count, admins: a.count })
      } catch (e) { setError(e.message) }
      finally { setLoading(false) }
    }
    load()
  }, [])

  if (error) return <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700 text-sm">❌ {error}</div>

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">סטטיסטיקות מערכת</h2>
      {loading ? <div className="text-gray-400 text-sm animate-pulse">טוען...</div> : (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <StatCard icon="👤" label="סה״כ משתמשים"  value={stats.users}     color="blue"   />
            <StatCard icon="🏢" label="סה״כ לקוחות"   value={stats.clients}   color="green"  />
            <StatCard icon="📄" label="סה״כ מסמכים"   value={stats.documents} color="purple" />
            <StatCard icon="🛡️" label="אדמינים"       value={stats.admins}    color="orange" />
          </div>
          <RoleBreakdown />
        </>
      )}
    </div>
  )
}
