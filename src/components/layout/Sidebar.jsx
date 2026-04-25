import { Link, useLocation } from 'react-router-dom'
import { useAuth } from '../../lib/AuthContext'
import { LayoutDashboard, Users, FileText, LogOut, Building2, Shield } from 'lucide-react'

export default function Sidebar() {
  const { profile, signOut } = useAuth()
  const location = useLocation()

  const roleLabels = {
    admin: 'מנהל מערכת',
    office_manager: 'מנהל משרד',
    office_employee: 'עובד',
    end_client: 'לקוח',
  }

  const officeLinks = [
    { to: '/dashboard', icon: LayoutDashboard, label: 'דשבורד' },
    { to: '/clients', icon: Users, label: 'לקוחות' },
    { to: '/documents', icon: FileText, label: 'מסמכים' },
  ]

  const clientLinks = [
    { to: '/client', icon: LayoutDashboard, label: 'דשבורד' },
    { to: '/client/documents', icon: FileText, label: 'המסמכים שלי' },
  ]

  const links = profile?.role === 'end_client' ? clientLinks : officeLinks

  return (
    <aside className="w-60 shrink-0 bg-white border-l border-gray-200 flex flex-col h-screen sticky top-0" dir="rtl">
      <div className="px-5 py-5 border-b border-gray-100">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 bg-indigo-600 rounded-lg flex items-center justify-center text-white font-bold text-sm">L</div>
          <span className="font-bold text-gray-900 text-lg">Luca AI</span>
        </div>
        {profile?.firm_name && (
          <p className="text-xs text-gray-400 mt-1 flex items-center gap-1">
            <Building2 size={11} />{profile.firm_name}
          </p>
        )}
      </div>
      <nav className="flex-1 px-3 py-4 space-y-0.5">
        {links.map(({ to, icon: Icon, label }) => {
          const active = location.pathname === to
          return (
            <Link key={to} to={to} className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
              active ? 'bg-indigo-50 text-indigo-700 font-medium' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}>
              <Icon size={18} />{label}
            </Link>
          )
        })}
        {profile?.role === 'admin' && (
          <Link
            to="/admin"
            className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition ${
              location.pathname.startsWith('/admin')
                ? 'bg-indigo-50 text-indigo-700 font-medium'
                : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Shield size={18} />פאנל אדמין
          </Link>
        )}
      </nav>
      <div className="px-3 pb-4 border-t border-gray-100 pt-3">
        <div className="px-3 py-2 mb-1">
          <p className="text-sm font-medium text-gray-900 truncate">{profile?.full_name}</p>
          <p className="text-xs text-gray-400">{roleLabels[profile?.role]}</p>
        </div>
        <button onClick={signOut} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-500 hover:bg-red-50 hover:text-red-600 transition">
          <LogOut size={18} />התנתק
        </button>
      </div>
    </aside>
  )
}
