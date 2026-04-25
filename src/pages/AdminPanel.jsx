import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabase'
import StatsOverview from '../components/admin/StatsOverview'
import UserManagement from '../components/admin/UserManagement'
import FirmSetup from '../components/admin/FirmSetup'
import ClientAssignment from '../components/admin/ClientAssignment'

const TABS = [
  { id: 'overview',   label: '📊 Overview'     },
  { id: 'users',      label: '👥 משתמשים'       },
  { id: 'firm',       label: '🏢 הגדרות משרד'   },
  { id: 'assignment', label: '🔗 שיוך לקוחות'   },
]

export default function AdminPanel() {
  const [activeTab,   setActiveTab]   = useState('overview')
  const [currentUser, setCurrentUser] = useState(null)
  const [loading,     setLoading]     = useState(true)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setLoading(false); return }
      supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()
        .then(({ data }) => {
          setCurrentUser(data)
          setLoading(false)
        })
    })
  }, [])

  if (loading) return (
    <div className="flex items-center justify-center h-64 text-gray-400 text-sm animate-pulse">
      טוען פאנל אדמין...
    </div>
  )

  if (!currentUser || currentUser.role !== 'admin') return (
    <div className="p-6 text-red-600 text-sm">אין הרשאת גישה לפאנל זה.</div>
  )

  return (
    <div className="p-6 max-w-6xl mx-auto" dir="rtl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">פאנל ניהול</h1>
        <p className="text-sm text-gray-500 mt-1">ניהול משתמשים, משרד ולקוחות</p>
      </div>

      {currentUser.firm_id == null && (
        <div className="mb-5 bg-yellow-50 border border-yellow-300 rounded-xl p-4 flex items-start gap-3 text-sm text-yellow-800">
          <span className="text-xl">⚠️</span>
          <div>
            <p className="font-semibold">ה-firm_id שלך ריק!</p>
            <p className="mt-0.5">עבור לטאב <strong>הגדרות משרד</strong> כדי להגדיר ולתקן את הנתון הזה.</p>
          </div>
        </div>
      )}

      <div className="flex gap-1 bg-gray-100 p-1 rounded-xl mb-6 w-fit">
        {TABS.map(tab => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm rounded-lg font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-white text-gray-900 shadow-sm'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="bg-white rounded-2xl border border-gray-200 shadow-sm p-6">
        {activeTab === 'overview'    && <StatsOverview />}
        {activeTab === 'users'       && <UserManagement currentUser={currentUser} />}
        {activeTab === 'firm'        && <FirmSetup currentUser={currentUser} onSaved={setCurrentUser} />}
        {activeTab === 'assignment'  && <ClientAssignment />}
      </div>
    </div>
  )
}
