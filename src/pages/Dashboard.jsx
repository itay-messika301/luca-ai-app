import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import { useAuth } from '../lib/AuthContext'
import { Users, FileText, Clock, CheckCircle } from 'lucide-react'

export default function Dashboard() {
  const { profile } = useAuth()
  const [stats, setStats] = useState({ clients: 0, documents: 0, pending: 0, processed: 0 })
  const [recentDocs, setRecentDocs] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => { if (profile !== undefined) fetchStats() }, [profile])

  async function fetchStats() {
    const firmId = profile?.accounting_firm_id

    // For office users: filter by their firm. For admin (no firmId): show all.
    let clientIds = null
    if (firmId) {
      const { data } = await supabase.from('clients').select('id').eq('accounting_firm_id', firmId)
      clientIds = data?.map(c => c.id) ?? []
    }

    let clientsQ = supabase.from('clients').select('id', { count: 'exact', head: true })
    let docsQ    = supabase.from('documents').select('id, status')
    let recentQ  = supabase.from('documents')
      .select('id, file_name, status, created_at, clients(name)')
      .order('created_at', { ascending: false }).limit(5)

    if (firmId) {
      clientsQ = clientsQ.eq('accounting_firm_id', firmId)
      const safeIds = clientIds.length > 0 ? clientIds : ['00000000-0000-0000-0000-000000000000']
      docsQ   = docsQ.in('client_id', safeIds)
      recentQ = recentQ.in('client_id', safeIds)
    }

    const [clientsRes, docsRes, recentRes] = await Promise.all([clientsQ, docsQ, recentQ])
    const allDocs = docsRes.data || []
    setStats({
      clients:   clientsRes.count || 0,
      documents: allDocs.length,
      pending:   allDocs.filter(d => d.status === 'pending').length,
      processed: allDocs.filter(d => d.status === 'processed').length,
    })
    setRecentDocs(recentRes.data || [])
    setLoading(false)
  }

  const statusConfig = {
    pending:    { label: 'ממתין',  color: 'bg-yellow-100 text-yellow-700' },
    processing: { label: 'בעיבוד', color: 'bg-blue-100 text-blue-700'   },
    processed:  { label: 'עובד',   color: 'bg-green-100 text-green-700'  },
    error:      { label: 'שגיאה',  color: 'bg-red-100 text-red-700'      },
  }

  return (
    <div className="p-6 max-w-5xl mx-auto" dir="rtl">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">שלום, {profile?.full_name?.split(' ')[0] || 'משתמש'} 👋</h1>
        <p className="text-gray-500 mt-1">ברוך הבא לפורטל Luca AI</p>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {[
          { label: 'לקוחות',         value: stats.clients,   icon: Users,        color: 'text-indigo-600', bg: 'bg-indigo-50'  },
          { label: 'מסמכים',         value: stats.documents, icon: FileText,     color: 'text-blue-600',   bg: 'bg-blue-50'    },
          { label: 'ממתינים לעיבוד', value: stats.pending,   icon: Clock,        color: 'text-yellow-600', bg: 'bg-yellow-50'  },
          { label: 'עובדו בהצלחה',   value: stats.processed, icon: CheckCircle,  color: 'text-green-600',  bg: 'bg-green-50'   },
        ].map((stat) => (
          <div key={stat.label} className="bg-white rounded-xl border border-gray-200 p-5">
            <div className={`w-10 h-10 rounded-lg ${stat.bg} flex items-center justify-center mb-3`}>
              <stat.icon size={20} className={stat.color} />
            </div>
            <p className="text-2xl font-bold text-gray-900">{loading ? '-' : stat.value}</p>
            <p className="text-sm text-gray-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>
      <div className="bg-white rounded-xl border border-gray-200">
        <div className="px-5 py-4 border-b border-gray-100">
          <h2 className="font-semibold text-gray-900">מסמכים אחרונים</h2>
        </div>
        {loading ? (
          <div className="text-center py-10 text-gray-400 text-sm">טוען...</div>
        ) : recentDocs.length === 0 ? (
          <div className="text-center py-10 text-gray-400 text-sm">לא הועלו מסמכים עד כה</div>
        ) : (
          recentDocs.map((doc, i) => {
            const s = statusConfig[doc.status] || statusConfig.pending
            return (
              <div key={doc.id} className={`flex items-center justify-between px-5 py-3 ${i !== 0 ? 'border-t border-gray-50' : ''}`}>
                <div className="flex items-center gap-3">
                  <FileText size={16} className="text-gray-400 shrink-0" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{doc.file_name}</p>
                    <p className="text-xs text-gray-400">{doc.clients?.name}</p>
                  </div>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${s.color}`}>{s.label}</span>
              </div>
            )
          })
        )}
      </div>
    </div>
  )
}
