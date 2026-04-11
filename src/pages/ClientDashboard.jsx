import { useAuth } from '@/lib/AuthContext'

export default function ClientDashboard() {
  const { profile } = useAuth()

  return (
    <div>
      <h1 className="text-2xl font-bold text-slate-900 mb-2">
        שלום, {profile?.full_name || 'לקוח'} 👋
      </h1>
      <p className="text-slate-500 mb-8">ברוך הבא לפורטל הלקוחות של Luca AI</p>

      <div className="bg-white rounded-2xl border border-slate-100 p-8 shadow-sm text-center">
        <p className="text-slate-400 text-sm">המסמכים שלך יופיעו כאן בקרוב</p>
      </div>
    </div>
  )
}
