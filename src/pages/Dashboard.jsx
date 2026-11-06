import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Users, FileText, Clock, CheckCircle } from 'lucide-react'
import DateRangeFilter from '../components/DateRangeFilter'

export default function Dashboard() {
  const { profile, workspace } = useAuth()
  const navigate = useNavigate()
  const [stats, setStats] = useState({ clients: 0, documents: 0, pending: 0, ready: 0 })
  const [recentDocs, setRecentDocs] = useState([])
  const [loading, setLoading] = useState(true)
  const [dateRange, setDateRange] = useState({ preset: 'all', from: null, to: null })

  useEffect(() => { if (profile?.workspace_id) fetchStats() }, [profile?.workspace_id, dateRange.from, dateRange.to])

  async function fetchStats() {
    const wsId = profile.workspace_id
    let docsQuery = supabase.from('documents').select('id, review_status')
      .eq('workspace_id', wsId)
    let recentQuery = supabase.from('documents')
      .select('id, file_name, review_status, created_at, clients(business_name)')
      .eq('workspace_id', wsId)
    if (dateRange.from) { docsQuery = docsQuery.gte('created_at', dateRange.from); recentQuery = recentQuery.gte('created_at', dateRange.from) }
    if (dateRange.to)   { const end = dateRange.to + 'T23:59:59.999'; docsQuery = docsQuery.lte('created_at', end); recentQuery = recentQuery.lte('created_at', end) }

    const [clientsRes, docsRes, recentRes] = await Promise.all([
      supabase.from('clients').select('id', { count: 'exact', head: true })
        .eq('workspace_id', wsId).is('archived_at', null),
      docsQuery,
      recentQuery.order('created_at', { ascending: false }).limit(5),
    ])
    const allDocs = docsRes.data || []
    setStats({
      clients:   clientsRes.count  || 0,
      documents: allDocs.length,
      pending:   allDocs.filter(d => !d.review_status || d.review_status === 'needs_review').length,
      ready:     allDocs.filter(d =>  d.review_status === 'ready').length,
    })
    setRecentDocs(recentRes.data || [])
    setLoading(false)
  }

  const reviewConfig = {
    ready:        { label: 'מוכן',       color: 'bg-green-500/10 text-green-400 border border-green-500/20'   },
    needs_review: { label: 'נדרשת בדיקה', color: 'bg-amber-500/10 text-amber-400 border border-amber-500/20' },
    blocked:      { label: 'חסום',       color: 'bg-red-500/10 text-red-400 border border-red-500/20'         },
  }

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
          שלום, {profile?.full_name?.split(' ')[0] || 'משתמש'} 👋
        </h1>
        <p className="text-slate-400 dark:text-white/40 mt-1">
          {workspace?.name || 'ברוך הבא לפורטל Luca AI'}
        </p>
      </div>

      <div className="mb-5">
        <DateRangeFilter value={dateRange} onChange={setDateRange} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'לקוחות',         value: stats.clients,   icon: Users,       color: 'text-indigo-400', bg: 'bg-indigo-500/10', to: '/clients'  },
          { label: 'מסמכים',         value: stats.documents, icon: FileText,    color: 'text-blue-400',   bg: 'bg-blue-500/10',   to: '/documents' },
          { label: 'ממתינים לבדיקה', value: stats.pending,   icon: Clock,       color: 'text-amber-400', bg: 'bg-amber-500/10',  to: '/review'   },
          { label: 'מוכנים לייצוא',  value: stats.ready,     icon: CheckCircle, color: 'text-green-400',  bg: 'bg-green-500/10',  to: '/export'   },
        ].map((stat) => (
          <button
            key={stat.label}
            onClick={() => navigate(stat.to)}
            className="text-right bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10 p-5 hover:border-blue-400 dark:hover:border-blue-500/50 hover:shadow-md dark:hover:bg-white/[0.07] transition-all cursor-pointer focus:outline-none focus:ring-2 focus:ring-blue-500/40"
            title={`עבור אל ${stat.label}`}
          >
            <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
              <stat.icon size={20} className={stat.color} />
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white">{loading ? '-' : stat.value}</p>
            <p className="text-sm text-slate-400 dark:text-white/40 mt-0.5">{stat.label}</p>
          </button>
        ))}
      </div>

      <div className="bg-slate-100 dark:bg-white/5 rounded-xl border border-slate-200 dark:border-white/10">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-white/10">
          <h2 className="font-semibold text-slate-900 dark:text-white">מסמכים אחרונים</h2>
        </div>
        {loading ? (
          <div className="text-center py-10 text-slate-400 dark:text-white/30 text-sm">טוען...</div>
        ) : recentDocs.length === 0 ? (
          <div className="text-center py-10 text-slate-400 dark:text-white/30 text-sm">לא הועלו מסמכים עד כה</div>
        ) : (
          recentDocs.map((doc, i) => {
            const s = reviewConfig[doc.review_status]
            return (
              <div
                key={doc.id}
                onClick={() => navigate(`/documents?doc=${doc.id}`)}
                className={`flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-slate-200/40 dark:hover:bg-white/[0.04] transition-colors ${i !== 0 ? 'border-t border-slate-100 dark:border-white/5' : ''}`}
              >
                <div className="flex items-center gap-3">
                  <FileText size={16} className="text-slate-400 dark:text-white/30 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-slate-700 dark:text-white/80">{doc.file_name}</p>
                    <p className="text-xs text-slate-400 dark:text-white/40">{doc.clients?.business_name}</p>
                  </div>
                </div>
                {s ? (
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
                ) : (
                  <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-blue-500/10 text-blue-400 border border-blue-500/20">ממתין לעיבוד</span>
                )}
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
