import { useState, useEffect } from 'react'
import { supabase } from '../../lib/supabase'

function StatCard({ label, value, color = 'indigo', loading }) {
  const colors = {
    indigo: 'bg-indigo-50 text-indigo-700 border-indigo-100',
    green:  'bg-green-50  text-green-700  border-green-100',
    blue:   'bg-blue-50   text-blue-700   border-blue-100',
    purple: 'bg-purple-50 text-purple-700 border-purple-100',
  }
  return (
    <div className={`rounded-xl border p-4 ${colors[color]}`}>
      <p className="text-xs font-medium uppercase tracking-wide opacity-70">{label}</p>
      <p className="text-3xl font-bold mt-1">
        {loading ? <span className="animate-pulse">...</span> : value ?? '—'}
      </p>
    </div>
  )
}

function RoleBreakdown({ profiles }) {
  const ROLE_LABELS = {
    admin:            'מנהל מערכת',
    office_manager:   'מנהל משרד',
    office_employee:  'עובד',
    end_client:       'לקוח',
  }
  const counts = profiles.reduce((acc, p) => {
    acc[p.role] = (acc[p.role] || 0) + 1
    return acc
  }, {})

  return (
    <div className="mt-6">
      <h3 className="text-sm font-semibold text-gray-700 mb-3">פילוח לפי תפקיד</h3>
      <div className="space-y-2">
        {Object.entries(ROLE_LABELS).map(([role, label]) => (
          <div key={role} className="flex items-center justify-between text-sm">
            <span className="text-gray-600">{label}</span>
            <span className="font-semibold text-gray-900">{counts[role] || 0}</span>
          </div>
        ))}
      </div>
    </div>
  )
}

export default function StatsOverview() {
  const [stats,   setStats]   = useState({})
  const [profiles, setProfiles] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      supabase.from('profiles').select('*', { count: 'exact', head: false }),
      supabase.from('clients').select('*',   { count: 'exact', head: true }),
      supabase.from('documents').select('*', { count: 'exact', head: true }),
      supabase.from('profiles').select('*', { count: 'exact', head: true }).eq('role', 'admin'),
    ]).then(([profilesRes, clientsRes, docsRes, adminsRes]) => {
      setProfiles(profilesRes.data || [])
      setStats({
        users:     profilesRes.count ?? 0,
        clients:   clientsRes.count  ?? 0,
        documents: docsRes.count     ?? 0,
        admins:    adminsRes.count   ?? 0,
      })
      setLoading(false)
    })
  }, [])

  return (
    <div>
      <h2 className="text-lg font-semibold text-gray-800 mb-4">סקירה כללית</h2>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="משתמשים"  value={stats.users}     color="indigo" loading={loading} />
        <StatCard label="לקוחות"   value={stats.clients}   color="green"  loading={loading} />
        <StatCard label="מסמכים"   value={stats.documents} color="blue"   loading={loading} />
        <StatCard label="אדמינים"  value={stats.admins}    color="purple" loading={loading} />
      </div>
      {!loading && <RoleBreakdown profiles={profiles} />}
    </div>
  )
}
