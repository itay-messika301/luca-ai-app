import { useAuth } from '@/lib/AuthContext'

export default function Dashboard() {
  const { profile } = useAuth()

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        שלום, {profile?.full_name || 'משתמש'} 👋
      </h1>
      <p className="text-slate-500 mb-8">ברוך הבא ללוח הבקרה של Luca AI</p>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {[
          { label: 'מסמכים ממתינים', value: '—', color: 'bg-blue-50 text-blue-700' },
          { label: 'לקוחות פעילים', value: '—', color: 'bg-violet-50 text-violet-700' },
          { label: 'מסמכים החודש', value: '—', color: 'bg-emerald-50 text-emerald-700' },
        ].map(card => (
          <div key={card.label} className="bg-white rounded-2xl border border-slate-100 p-6 shadow-sm">
            <p className="text-sm text-slate-500 mb-1">{card.label}</p>
            <p className={`text-3xl font-bold ${card.color} inline-block px-3 py-1 rounded-lg`}>{card.value}</p>
          </div>
        ))}
      </div>
    </div>
  )
}
