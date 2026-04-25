import { useState, useEffect } from 'react'
import { supabase } from '../lib/supabaseClient'
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
  const [activeTab, setActiveTab] = useState('overview')
  const [currentUser, setCurrentUser] = useState(null)

  useEffect(() => {
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (user) {
        supabase.from('profiles').select('*').eq('id', user.id).single()
          .then(({ data }) => setCurrentUser(data))
      }
    })
  }, [])

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">🛠️ פאנל אדמין</h1>
        <p className="text-gray-500 text-sm mt-1">ניהול מלא של המערכת — משתמשים, משרד, לקוחות</p>
        {currentUser?.accounting_firm_id == null && (
          <div className="mt-3 bg-yellow-50 border border-yellow-300 rounded-lg p-3 flex items-center gap-2 text-yellow-800 text-sm">
            ⚠️ <span>חסר <strong>firm_id</strong> לפרופיל שלך. עבור ל-
              <button onClick={() => setActiveTab('firm')} className="underline font-medium">הגדרות משרד</button>
            </span>
          </div>
        )}
      </div>
      <div className="border-b border-gray-200 mb-6">
        <nav className="flex gap-1">
          {TABS.map((tab) => (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={`px-4 py-2 text-sm font-medium rounded-t-md transition-colors ${
                activeTab === tab.id
                  ? 'bg-white border border-b-white border-gray-200 text-blue-600 -mb-px'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}>
              {tab.label}
            </button>
          ))}
        </nav>
      </div>
      <div>
        {activeTab === 'overview'   && <StatsOverview />}
        {activeTab === 'users'      && <UserManagement currentUser={currentUser} />}
        {activeTab === 'firm'       && <FirmSetup currentUser={currentUser} onUpdate={setCurrentUser} />}
        {activeTab === 'assignment' && <ClientAssignment />}
      </div>
    </div>
  )
}
