import { Link, useLocation } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { LayoutDashboard, Users, FileText, Settings, LogOut, Upload, ClipboardCheck, Download, Sun, Moon } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { useTheme } from '@/lib/ThemeContext'
import { supabase } from '@/lib/supabase'

const ROLE_LABELS = {
  workspace_owner: 'בעל משרד',
  accountant:      'רואה חשבון',
  reviewer:        'מאשר',
  end_client:      'לקוח',
}

const officeNav = [
  {
    path:  '/dashboard',
    label: 'לוח בקרה',
    icon:  LayoutDashboard,
    roles: ['workspace_owner', 'accountant', 'reviewer'],
  },
  {
    path:  '/clients',
    label: 'לקוחות',
    icon:  Users,
    roles: ['workspace_owner', 'accountant'],
  },
  {
    path:  '/documents',
    label: 'מסמכים',
    icon:  FileText,
    roles: ['workspace_owner', 'accountant', 'reviewer'],
  },
  {
    path:  '/review',
    label: 'ביקורת ואישורים',
    icon:  ClipboardCheck,
    roles: ['workspace_owner', 'accountant', 'reviewer'],
  },
  {
    path:  '/export',
    label: 'ייצוא',
    icon:  Download,
    roles: ['workspace_owner', 'accountant'],
  },
  {
    path:  '/settings',
    label: 'הגדרות',
    icon:  Settings,
    roles: ['workspace_owner'],
  },
]

const clientNav = [
  { path: '/client',           label: 'הבית שלי',     icon: LayoutDashboard },
  { path: '/client/documents', label: 'המסמכים שלי',  icon: FileText },
  { path: '/client/upload',    label: 'העלאת מסמך',   icon: Upload },
]

export default function Sidebar({ isClient = false }) {
  const location = useLocation()
  const { profile, workspace, signOut } = useAuth()
  const { theme, toggle } = useTheme()
  const role = profile?.role
  const [reviewCount, setReviewCount] = useState(0)

  // Fetch and subscribe to pending review count
  useEffect(() => {
    if (!workspace?.id || isClient) return

    async function fetchCount() {
      const { count } = await supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspace.id)
        .in('review_status', ['needs_review', 'blocked'])
      setReviewCount(count || 0)
    }

    fetchCount()

    const channel = supabase
      .channel('sidebar-review-' + workspace.id)
      .on('postgres_changes', {
        event:  '*',
        schema: 'public',
        table:  'documents',
        filter: `workspace_id=eq.${workspace.id}`,
      }, fetchCount)
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [workspace?.id, isClient])

  const navItems = isClient
    ? clientNav
    : officeNav.filter(item => item.roles.includes(role))

  return (
    <aside className="fixed right-0 top-0 h-full w-60 bg-slate-50 dark:bg-[#0A0A0F] flex flex-col z-40 border-l border-slate-200 dark:border-white/5">
      {/* Logo + workspace name */}
      <div className="px-6 pt-8 pb-6 border-b border-slate-200 dark:border-white/5">
        <div className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-blue-500 to-violet-600 flex items-center justify-center text-white font-bold text-sm flex-shrink-0">
            L
          </div>
          <div className="min-w-0">
            <p className="text-slate-900 dark:text-white font-bold text-base truncate leading-tight">Luca AI</p>
            {workspace?.name && (
              <p className="text-slate-400 dark:text-white/40 text-xs truncate mt-0.5">{workspace.name}</p>
            )}
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav className="flex-1 px-3 py-4 space-y-0.5 overflow-y-auto">
        {navItems.map(({ path, label, icon: Icon }) => {
          const active = location.pathname === path || location.pathname.startsWith(path + '/')
          return (
            <Link
              key={path}
              to={path}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all ${
                active
                  ? 'bg-slate-200 dark:bg-white/10 text-slate-900 dark:text-white'
                  : 'text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5'
              }`}
            >
              <Icon className={`w-4 h-4 flex-shrink-0 ${active ? 'text-blue-500 dark:text-blue-400' : 'text-current'}`} />
              <span className="flex-1 text-right">{label}</span>
              {path === '/review' && reviewCount > 0 && (
                <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none flex-shrink-0">
                  {reviewCount > 99 ? '99+' : reviewCount}
                </span>
              )}
            </Link>
          )
        })}
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t border-slate-200 dark:border-white/5 space-y-3">
        <div className="flex items-center gap-2.5 px-2">
          <div className="w-7 h-7 rounded-full bg-gradient-to-br from-violet-500 to-purple-600 flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
            {(profile?.full_name || '?').charAt(0)}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-slate-700 dark:text-white/80 text-xs font-medium truncate">{profile?.full_name || '—'}</p>
            <p className="text-slate-400 dark:text-white/30 text-xs">{ROLE_LABELS[role] || role}</p>
          </div>
        </div>

        {/* Theme toggle */}
        <button
          onClick={toggle}
          className="flex items-center gap-2 w-full px-2 py-2 rounded-lg text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all text-xs font-medium"
        >
          {theme === 'dark' ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
          {theme === 'dark' ? 'מצב בהיר' : 'מצב כהה'}
        </button>

        <button
          onClick={signOut}
          className="flex items-center gap-2 w-full px-2 py-2 rounded-lg text-slate-400 dark:text-white/40 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 transition-all text-xs font-medium"
        >
          <LogOut className="w-3.5 h-3.5" />
          התנתק
        </button>
      </div>
    </aside>
  )
}
