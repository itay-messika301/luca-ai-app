import { Link, useLocation } from 'react-router-dom'
import { FileText, ClipboardCheck, Download } from 'lucide-react'
import { useAuth } from '@/lib/AuthContext'
import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

/**
 * Sub-tab navigation for the unified "תהליך מסמך" flow.
 * Shown at the top of /documents, /review, /export.
 * Visibility per-tab follows the same role rules as the routes themselves.
 */
const TABS = [
  { path: '/documents', label: 'מסמכים',          icon: FileText,        roles: ['workspace_owner', 'workspace_employee'] },
  { path: '/review',    label: 'ביקורת ואישורים', icon: ClipboardCheck,  roles: ['workspace_owner', 'workspace_employee'] },
  { path: '/export',    label: 'ייצוא',           icon: Download,        roles: ['workspace_owner', 'workspace_employee'] },
]

export default function ProcessTabs() {
  const location = useLocation()
  const { profile, workspace } = useAuth()
  const role = profile?.role
  const [reviewCount, setReviewCount] = useState(0)

  useEffect(() => {
    if (!workspace?.id) return
    let alive = true
    async function fetchCount() {
      const { count } = await supabase
        .from('documents')
        .select('id', { count: 'exact', head: true })
        .eq('workspace_id', workspace.id)
        .in('review_status', ['needs_review', 'blocked'])
      if (alive) setReviewCount(count || 0)
    }
    fetchCount()
    const channel = supabase
      .channel('process-tabs-' + workspace.id)
      .on('postgres_changes', {
        event: '*', schema: 'public', table: 'documents',
        filter: `workspace_id=eq.${workspace.id}`,
      }, fetchCount)
      .subscribe()
    return () => { alive = false; supabase.removeChannel(channel) }
  }, [workspace?.id])

  const visible = TABS.filter(t => t.roles.includes(role))

  return (
    <div className="flex items-center gap-1 mb-5 border-b border-slate-200 dark:border-white/10" dir="rtl">
      {visible.map(({ path, label, icon: Icon }) => {
        const active = location.pathname === path || location.pathname.startsWith(path + '/')
        return (
          <Link
            key={path}
            to={path}
            className={`relative flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors ${
              active
                ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                : 'border-transparent text-slate-500 dark:text-white/50 hover:text-slate-900 dark:hover:text-white/80'
            }`}
          >
            <Icon className="w-4 h-4" />
            <span>{label}</span>
            {path === '/review' && reviewCount > 0 && (
              <span className="bg-red-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full leading-none">
                {reviewCount > 99 ? '99+' : reviewCount}
              </span>
            )}
          </Link>
        )
      })}
    </div>
  )
}
